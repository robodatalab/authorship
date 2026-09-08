import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { authorDocumentCommandCards } from "../../../extension/vscode_runtime/commands/author_document_commands";
import { FixStyleCommand } from "../../../extension/vscode_runtime/commands/fix_style";
import { openGeminiAccount } from "../../../extension/vscode_runtime/gemini/account";
import {
    dialogs,
    geminiKeyInTheKeychain,
    settings,
    shownMessages,
} from "../vscode";
import { forgetWhatTheEditorDid, openStory, STORY_FILE } from "./open_story";

const STYLE_FIX_SETTING = "authorship.experimental.useGeminiForStyleCorrection";

const A_STORY_OF_TWO_CHAPTERS = `
<!-- cell: chapter title="One" id="ch1" -->

<!-- cell: markdown id="c1" -->

She saw the door.

<!-- cell: chapter title="Two" id="ch2" -->

<!-- cell: markdown id="c2" -->

He heard the bell.
`;

const THE_MACHINES_KEYCHAIN = {
    secrets: {
        get: () => Promise.resolve(geminiKeyInTheKeychain.key),
        store: (_named: string, key: string) => {
            geminiKeyInTheKeychain.key = key;
            return Promise.resolve();
        },
        delete: () => {
            geminiKeyInTheKeychain.key = undefined;
            return Promise.resolve();
        },
    },
};

function turnTheExperimentOn(): void {
    settings.set(STYLE_FIX_SETTING, true);
    geminiKeyInTheKeychain.key = "AIza-the-authors-own";
    dialogs.answerToTheWarning = "Send to Gemini";
    openGeminiAccount(THE_MACHINES_KEYCHAIN as never);
}

function geminiAnswers(pass: Record<string, unknown>): {
    url: string;
    body: unknown;
}[] {
    const asked: { url: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", (url: string, sent?: { body: string }) => {
        asked.push({ url, body: sent?.body && JSON.parse(sent.body) });
        return Promise.resolve({
            ok: true,
            json: () =>
                Promise.resolve(
                    url.includes("status")
                        ? {
                              running: false,
                              error: null,
                              unauthorized: false,
                              noQuota: false,
                              leftAlone: [],
                              sections: [],
                              ...pass,
                          }
                        : { id: STORY_FILE },
                ),
        });
    });
    return asked;
}

beforeEach(forgetWhatTheEditorDid);
afterEach(() => vi.unstubAllGlobals());

describe("FixStyleCommand — the experiment the author has to turn on", () => {
    it("puts no sparkle in the main menu while it is off", () => {
        expect(
            authorDocumentCommandCards().map((card) => card.commandName),
        ).not.toContain("fixStyle");
    });

    it("puts the sparkle there once it is on", () => {
        settings.set(STYLE_FIX_SETTING, true);
        expect(
            authorDocumentCommandCards().find(
                (card) => card.commandName === "fixStyle",
            )?.iconClassName,
        ).toBe("codicon codicon-sparkle");
    });

    it("sends nothing while it is off", async () => {
        const asked = geminiAnswers({});
        await new FixStyleCommand().invoke(openStory(A_STORY_OF_TWO_CHAPTERS));
        expect(asked).toEqual([]);
    });

    it("sends nothing when the author says no to the warning", async () => {
        turnTheExperimentOn();
        dialogs.answerToTheWarning = undefined;
        const asked = geminiAnswers({});

        await new FixStyleCommand().invoke(openStory(A_STORY_OF_TWO_CHAPTERS));

        expect(asked).toEqual([]);
        expect(shownMessages[0]).toContain("Send the chapters of");
    });
});

describe("FixStyleCommand — the pass over the whole manuscript", () => {
    it("sends the document with the key and puts each corrected section in the cell it came from", async () => {
        turnTheExperimentOn();
        settings.set("authorship.gemini.model", "gemini-flash");
        const asked = geminiAnswers({
            sections: [
                { cellId: "c1", source: "She opened the door." },
                { cellId: "c2", source: "The bell rang." },
            ],
        });

        const document = openStory(A_STORY_OF_TWO_CHAPTERS);
        await new FixStyleCommand().invoke(document);

        expect(asked[0].url).toContain("/fix/style");
        expect(asked[0].body).toEqual({
            path: STORY_FILE,
            key: "AIza-the-authors-own",
            model: "gemini-flash",
        });
        expect(asked[1].url).toContain(
            `/fix/style/status?id=${encodeURIComponent(STORY_FILE)}`,
        );
        expect(document.cellWithId("c1")?.source).toBe("She opened the door.");
        expect(document.cellWithId("c2")?.source).toBe("The bell rang.");
    });

    it("names the chapters it left as the author wrote them", async () => {
        turnTheExperimentOn();
        geminiAnswers({
            sections: [{ cellId: "c2", source: "The bell rang." }],
            leftAlone: [{ chapter: "One", why: "it came back mid-sentence" }],
        });

        const document = openStory(A_STORY_OF_TWO_CHAPTERS);
        await new FixStyleCommand().invoke(document);

        expect(document.cellWithId("c1")?.source).toBe("She saw the door.");
        expect(shownMessages.at(-1)).toBe(
            "One chapter was left as you wrote it: “One” — it came back mid-sentence",
        );
    });

    it("asks the author to sign in again when Gemini would not take the key", async () => {
        turnTheExperimentOn();
        geminiAnswers({ error: "Gemini refused the key.", unauthorized: true });

        await new FixStyleCommand().invoke(openStory(A_STORY_OF_TWO_CHAPTERS));

        expect(shownMessages.at(-1)).toContain(
            "Gemini would not take the key Authorship had.",
        );
    });
});
