import * as vscode from "vscode";

import { fetchFromServer } from "../server/fetch";

export const GEMINI_AUTHENTICATION_PROVIDER = "gemini";
const GEMINI_ACCOUNTS_MENU_LABEL = "Google Gemini";

const API_KEY_IN_THE_KEYCHAIN = "gemini.apiKey";

const SIGNED_IN_SESSION_ID = "gemini-api-key";

const GOOGLE_AI_STUDIO_URL = "https://aistudio.google.com/apikey";

const MILLISECONDS_BEFORE_ASKING_GEMINI_TIMES_OUT = 20_000;

export function styleFixEnabled(): boolean {
    return vscode.workspace
        .getConfiguration("authorship")
        .get<boolean>("experimental.useGeminiForStyleCorrection", false);
}

export function configuredModel(): string | undefined {
    const modelInSettings = vscode.workspace
        .getConfiguration("authorship")
        .get<string>("gemini.model");
    return modelInSettings?.trim() || undefined;
}

let signedInAccount: GeminiAccount | undefined;

export function openGeminiAccount(
    context: vscode.ExtensionContext,
): GeminiAccount {
    signedInAccount = new GeminiAccount(context);
    return signedInAccount;
}

export function geminiAccount(): GeminiAccount | undefined {
    return signedInAccount;
}

export class GeminiAccount
    implements vscode.AuthenticationProvider, vscode.Disposable
{
    private readonly sessionsChanged =
        new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();

    readonly onDidChangeSessions = this.sessionsChanged.event;

    private readonly providerRegistration: vscode.Disposable;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.providerRegistration =
            vscode.authentication.registerAuthenticationProvider(
                GEMINI_AUTHENTICATION_PROVIDER,
                GEMINI_ACCOUNTS_MENU_LABEL,
                this,
                { supportsMultipleAccounts: false },
            );
        this.showInTheAccountsMenu();
    }

    private showInTheAccountsMenu(): void {
        void Promise.resolve(
            vscode.authentication.getSession(
                GEMINI_AUTHENTICATION_PROVIDER,
                [],
            ),
        ).then(undefined, () => undefined);
    }

    get commands(): Record<string, () => void> {
        return {
            signIn: () => void this.signIn(),
            signOut: () => void this.signOut(),
            chooseModel: () => void this.chooseModel(),
        };
    }

    async getSessions(): Promise<vscode.AuthenticationSession[]> {
        const apiKey = await this.context.secrets.get(API_KEY_IN_THE_KEYCHAIN);
        return apiKey ? [sessionForApiKey(apiKey)] : [];
    }

    async createSession(): Promise<vscode.AuthenticationSession> {
        const apiKey = await this.askForAnApiKey();
        if (!apiKey) {
            throw new Error("Signing in to Gemini was cancelled.");
        }
        await this.context.secrets.store(API_KEY_IN_THE_KEYCHAIN, apiKey);
        const session = sessionForApiKey(apiKey);
        this.sessionsChanged.fire({
            added: [session],
            removed: [],
            changed: [],
        });
        return session;
    }

    async removeSession(): Promise<void> {
        const apiKey = await this.context.secrets.get(API_KEY_IN_THE_KEYCHAIN);
        await this.context.secrets.delete(API_KEY_IN_THE_KEYCHAIN);
        if (apiKey) {
            this.sessionsChanged.fire({
                added: [],
                removed: [sessionForApiKey(apiKey)],
                changed: [],
            });
        }
    }

    async require(): Promise<string | undefined> {
        try {
            const session = await vscode.authentication.getSession(
                GEMINI_AUTHENTICATION_PROVIDER,
                [],
                {
                    createIfNone: true,
                },
            );
            return session?.accessToken;
        } catch {
            return undefined;
        }
    }

    async forget(): Promise<void> {
        await this.removeSession();
    }

    private async signIn(): Promise<void> {
        try {
            await vscode.authentication.getSession(
                GEMINI_AUTHENTICATION_PROVIDER,
                [],
                { forceNewSession: true },
            );
            void vscode.window.showInformationMessage("Signed in to Gemini.");
        } catch {}
    }

    private async signOut(): Promise<void> {
        if ((await this.getSessions()).length === 0) {
            void vscode.window.showInformationMessage(
                "There is no Gemini key to forget.",
            );
            return;
        }
        await this.removeSession();
        void vscode.window.showInformationMessage(
            "Signed out of Gemini. The key has been forgotten.",
        );
    }

    private async chooseModel(): Promise<void> {
        const apiKey = await this.require();
        if (!apiKey) {
            return;
        }
        const modelsOnOffer = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "Asking Gemini which models your key can use…",
            },
            () => this.modelsThisKeyCanUse(apiKey),
        );
        if (!modelsOnOffer) {
            return;
        }

        const modelInSettings = configuredModel();
        const choices: (vscode.QuickPickItem & { model?: string })[] = [
            {
                label: "Use the model Authorship ships with",
                description: modelInSettings ? undefined : "current",
                model: undefined,
            },
            ...modelsOnOffer.map((onOffer) => ({
                label: onOffer.model,
                description:
                    onOffer.model === modelInSettings
                        ? "current"
                        : onOffer.label,
                detail: onOffer.detail,
                model: onOffer.model,
            })),
        ];

        const chosen = await vscode.window.showQuickPick(choices, {
            title: "Choose Gemini Model",
            placeHolder:
                "Newest first. This is what will correct your chapters.",
            matchOnDetail: true,
        });
        if (!chosen) {
            return;
        }
        await vscode.workspace
            .getConfiguration("authorship")
            .update(
                "gemini.model",
                chosen.model ?? "",
                vscode.ConfigurationTarget.Global,
            );
        void vscode.window.showInformationMessage(
            chosen.model
                ? `Fixing style and grammar will use ${chosen.model}.`
                : "Fixing style and grammar will use the model Authorship ships with.",
        );
    }

    private async modelsThisKeyCanUse(
        apiKey: string,
    ): Promise<{ model: string; label: string; detail: string }[] | undefined> {
        try {
            const answered = await fetchFromServer<{
                models: { model: string; label: string; detail: string }[];
            }>(
                "/gemini/models",
                { key: apiKey },
                MILLISECONDS_BEFORE_ASKING_GEMINI_TIMES_OUT,
            );
            return answered.models;
        } catch (failure: unknown) {
            const message = (failure as { message?: unknown } | null)?.message;
            void vscode.window.showErrorMessage(
                `Could not ask Gemini which models are available: ${typeof message === "string" ? message : String(failure)}`,
            );
            return undefined;
        }
    }

    private async askForAnApiKey(): Promise<string | undefined> {
        const typedIn = await vscode.window.showInputBox({
            title: "Sign in to Gemini",
            prompt: `Paste an API key from Google AI Studio (${GOOGLE_AI_STUDIO_URL}). It is kept in this machine's keychain.`,
            placeHolder: "AIza…",
            password: true,
            ignoreFocusOut: true,
            validateInput: (typed) =>
                typed.trim()
                    ? null
                    : "Paste a key, or press Escape to leave it.",
        });
        if (typedIn === undefined) {
            void this.offerGoogleAiStudio();
            return undefined;
        }

        const apiKey = typedIn.trim();
        const refusal = await this.whyGeminiRefusedTheKey(apiKey);
        if (!refusal) {
            return apiKey;
        }
        const answer = await vscode.window.showErrorMessage(
            `Gemini would not take that key: ${refusal}`,
            "Try again",
        );
        return answer === "Try again" ? this.askForAnApiKey() : undefined;
    }

    private async whyGeminiRefusedTheKey(
        apiKey: string,
    ): Promise<string | undefined> {
        try {
            const answered = await fetchFromServer<{
                ok: boolean;
                detail?: string;
            }>(
                "/auth/gemini",
                { key: apiKey, model: configuredModel() },
                MILLISECONDS_BEFORE_ASKING_GEMINI_TIMES_OUT,
            );
            return answered.ok
                ? undefined
                : (answered.detail ?? "the key was not accepted");
        } catch {
            return undefined;
        }
    }

    private async offerGoogleAiStudio(): Promise<void> {
        const answer = await vscode.window.showInformationMessage(
            "Fixing style and grammar runs on Google Gemini, with your own API key.",
            "Get a key",
        );
        if (answer === "Get a key") {
            await vscode.env.openExternal(
                vscode.Uri.parse(GOOGLE_AI_STUDIO_URL),
            );
        }
    }

    dispose(): void {
        if (signedInAccount === this) {
            signedInAccount = undefined;
        }
        this.providerRegistration.dispose();
        this.sessionsChanged.dispose();
    }
}

function sessionForApiKey(apiKey: string): vscode.AuthenticationSession {
    return {
        id: SIGNED_IN_SESSION_ID,
        accessToken: apiKey,
        account: {
            id: SIGNED_IN_SESSION_ID,
            label: `API key …${apiKey.slice(-4)}`,
        },
        scopes: [],
    };
}
