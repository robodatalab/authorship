import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthorFileEditorProvider } from "../../extension/vscode_runtime/author_file_editor_provider";
import type { AuthorFileEditorSession } from "../../extension/vscode_runtime/author_file_editor_session";
import { Uri, files } from "./vscode";

const DOCUMENT_PATH = "/stories/expat_pet.author";

interface OpenEditor {
    session: AuthorFileEditorSession;
    save(): Promise<void>;
    theAuthorAsksFor(commandName: string): void;
    theAuthorTypes(markdown: string): void;
}

async function openEditor(text: string): Promise<OpenEditor> {
    files.clear();
    files.set(DOCUMENT_PATH, text);

    const provider = new AuthorFileEditorProvider({
        extensionUri: Uri.file("/extension"),
    } as never);
    const session = await provider.openCustomDocument(
        Uri.file(DOCUMENT_PATH) as never,
        {} as never,
    );
    let receiveFromThePage: (message: unknown) => void = () => undefined;
    provider.resolveCustomEditor(session, {
        webview: {
            options: {},
            html: "",
            cspSource: "vscode-resource:",
            asWebviewUri: (uri: unknown) => uri,
            postMessage: () => Promise.resolve(true),
            onDidReceiveMessage: (listener: (message: unknown) => void) => {
                receiveFromThePage = listener;
                return { dispose: () => undefined };
            },
        },
        onDidDispose: () => ({ dispose: () => undefined }),
    } as never);

    return {
        session,
        save: () => provider.saveCustomDocument(session),
        theAuthorAsksFor: (commandName: string) =>
            receiveFromThePage({
                type: "invoke",
                commandName,
                commandArguments: {},
            }),
        theAuthorTypes: (markdown: string) =>
            receiveFromThePage({ type: "typed", cellId: "c1", markdown }),
    };
}

function theModelServerNeverAnswers(): void {
    vi.stubGlobal("fetch", () => new Promise(() => undefined));
}

let editor: OpenEditor;

beforeEach(async () => {
    theModelServerNeverAnswers();
    editor = await openEditor(
        '<!-- cell: markdown id="c1" -->\n\nThe lantern\n',
    );
});

afterEach(() => vi.unstubAllGlobals());

describe("a command still waiting for the model server", () => {
    it("leaves the author free to go on writing", async () => {
        editor.theAuthorAsksFor("checkProse");

        editor.theAuthorTypes("The lantern burned");
        await Promise.resolve();

        expect(editor.session.document.text).toContain("The lantern burned");
    });

    it("leaves the author free to save", async () => {
        editor.theAuthorAsksFor("checkProse");
        editor.theAuthorTypes("The lantern burned");

        await editor.save();

        expect(files.get(DOCUMENT_PATH)).toContain("The lantern burned");
    });
});
