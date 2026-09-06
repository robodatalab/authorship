import * as vscode from "vscode";

export const PROVIDER = "gemini";
const PROVIDER_LABEL = "Google Gemini";

const SECRET = "gemini.apiKey";

const SESSION = "gemini-api-key";

const STUDIO = "https://aistudio.google.com/apikey";

const CHECK_TIMEOUT_MS = 20_000;

export function styleFixEnabled(): boolean {
    return vscode.workspace
        .getConfiguration("authorship")
        .get<boolean>("experimental.useGeminiForStyleCorrection", false);
}

export const STYLE_FIX_SETTING =
    "authorship.experimental.useGeminiForStyleCorrection";

export function configuredModel(): string | undefined {
    const named = vscode.workspace
        .getConfiguration("authorship")
        .get<string>("gemini.model");
    return named?.trim() || undefined;
}

export class GeminiAccount
    implements vscode.AuthenticationProvider, vscode.Disposable
{
    private readonly changed =
        new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();

    readonly onDidChangeSessions = this.changed.event;

    private readonly registration: vscode.Disposable;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly port: number,
    ) {
        this.registration =
            vscode.authentication.registerAuthenticationProvider(
                PROVIDER,
                PROVIDER_LABEL,
                this,
                { supportsMultipleAccounts: false },
            );
        this.advertise();
    }

    private advertise(): void {
        void Promise.resolve(
            vscode.authentication.getSession(PROVIDER, []),
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
        const key = await this.context.secrets.get(SECRET);
        return key ? [sessionFor(key)] : [];
    }

    async createSession(): Promise<vscode.AuthenticationSession> {
        const key = await this.askForKey();
        if (!key) {
            throw new Error("Signing in to Gemini was cancelled.");
        }
        await this.context.secrets.store(SECRET, key);
        const session = sessionFor(key);
        this.changed.fire({ added: [session], removed: [], changed: [] });
        return session;
    }

    async removeSession(): Promise<void> {
        const key = await this.context.secrets.get(SECRET);
        await this.context.secrets.delete(SECRET);
        if (key) {
            this.changed.fire({
                added: [],
                removed: [sessionFor(key)],
                changed: [],
            });
        }
    }

    async require(): Promise<string | undefined> {
        try {
            const session = await vscode.authentication.getSession(
                PROVIDER,
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
            await vscode.authentication.getSession(PROVIDER, [], {
                forceNewSession: true,
            });
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
        const key = await this.require();
        if (!key) {
            return;
        }
        const offered = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "Asking Gemini which models your key can use…",
            },
            () => this.listModels(key),
        );
        if (!offered) {
            return;
        }

        const current = configuredModel();
        const items: (vscode.QuickPickItem & { model?: string })[] = [
            {
                label: "Use the model Authorship ships with",
                description: current ? undefined : "current",
                model: undefined,
            },
            ...offered.map((one) => ({
                label: one.model,
                description: one.model === current ? "current" : one.label,
                detail: one.detail,
                model: one.model,
            })),
        ];

        const picked = await vscode.window.showQuickPick(items, {
            title: "Choose Gemini Model",
            placeHolder:
                "Newest first. This is what will correct your chapters.",
            matchOnDetail: true,
        });
        if (!picked) {
            return;
        }
        await vscode.workspace
            .getConfiguration("authorship")
            .update(
                "gemini.model",
                picked.model ?? "",
                vscode.ConfigurationTarget.Global,
            );
        void vscode.window.showInformationMessage(
            picked.model
                ? `Fixing style and grammar will use ${picked.model}.`
                : "Fixing style and grammar will use the model Authorship ships with.",
        );
    }

    private async listModels(
        key: string,
    ): Promise<{ model: string; label: string; detail: string }[] | undefined> {
        try {
            const response = await fetch(
                `http://127.0.0.1:${this.port}/gemini/models`,
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ key }),
                    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
                },
            );
            if (!response.ok) {
                const said = (await response.json()) as { detail?: string };
                throw new Error(said.detail ?? response.statusText);
            }
            const body = (await response.json()) as {
                models: { model: string; label: string; detail: string }[];
            };
            return body.models;
        } catch (err: unknown) {
            const said = (err as { message?: unknown } | null)?.message;
            void vscode.window.showErrorMessage(
                `Could not ask Gemini which models are available: ${typeof said === "string" ? said : String(err)}`,
            );
            return undefined;
        }
    }

    private async askForKey(): Promise<string | undefined> {
        const asked = await vscode.window.showInputBox({
            title: "Sign in to Gemini",
            prompt: `Paste an API key from Google AI Studio (${STUDIO}). It is kept in this machine's keychain.`,
            placeHolder: "AIza…",
            password: true,
            ignoreFocusOut: true,
            validateInput: (raw) =>
                raw.trim() ? null : "Paste a key, or press Escape to leave it.",
        });
        if (asked === undefined) {
            void this.offerTheStudio();
            return undefined;
        }

        const key = asked.trim();
        const refused = await this.refusal(key);
        if (!refused) {
            return key;
        }
        const again = await vscode.window.showErrorMessage(
            `Gemini would not take that key: ${refused}`,
            "Try again",
        );
        return again === "Try again" ? this.askForKey() : undefined;
    }

    private async refusal(key: string): Promise<string | undefined> {
        try {
            const response = await fetch(
                `http://127.0.0.1:${this.port}/auth/gemini`,
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ key, model: configuredModel() }),
                    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
                },
            );
            if (!response.ok) {
                return undefined;
            }
            const body = (await response.json()) as {
                ok: boolean;
                detail?: string;
            };
            return body.ok
                ? undefined
                : (body.detail ?? "the key was not accepted");
        } catch {
            return undefined;
        }
    }

    private async offerTheStudio(): Promise<void> {
        const shown = await vscode.window.showInformationMessage(
            "Fixing style and grammar runs on Google Gemini, with your own API key.",
            "Get a key",
        );
        if (shown === "Get a key") {
            await vscode.env.openExternal(vscode.Uri.parse(STUDIO));
        }
    }

    dispose(): void {
        this.registration.dispose();
        this.changed.dispose();
    }
}

function sessionFor(key: string): vscode.AuthenticationSession {
    return {
        id: SESSION,
        accessToken: key,
        account: { id: SESSION, label: `API key …${key.slice(-4)}` },
        scopes: [],
    };
}
