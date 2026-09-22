import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IdentifyStoryPlotsCommand } from "../../../extension/vscode_runtime/commands/identify_story_plots";
import { openGeminiAccount } from "../../../extension/vscode_runtime/gemini/account";
import {
    dialogs,
    geminiKeyInTheKeychain,
    settings,
    shownMessages,
} from "../vscode";
import {
    forgetWhatTheEditorDid,
    sentToThePage,
    storyOfThreeCells,
    STORY_FILE,
} from "./open_story";

const THE_DOOR = {
    cellId: "c2",
    startCharacterOffsetInCell: 0,
    endCharacterOffsetInCell: 17,
    wordsInTheCell: "She saw the door.",
    isVisible: true,
    storyPlotIndices: [0],
};

const THE_QUEST = { title: "The quest", summary: "Someone goes looking." };

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

function signInToGemini(): void {
    geminiKeyInTheKeychain.key = "AIza-the-authors-own";
    dialogs.answerToTheWarning = "Send to Gemini";
    openGeminiAccount(THE_MACHINES_KEYCHAIN as never);
}

function geminiAnswers(job: Record<string, unknown>): {
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
                              storyPlots: [],
                              paragraphsInStoryPlots: [],
                              ...job,
                          }
                        : { id: "job-1" },
                ),
        });
    });
    return asked;
}

beforeEach(forgetWhatTheEditorDid);
afterEach(() => vi.unstubAllGlobals());

describe("IdentifyStoryPlotsCommand — finds the plots the story weaves", () => {
    it("sends the document with the key and hands the page what came back", async () => {
        signInToGemini();
        settings.set("authorship.gemini.model", "gemini-flash");
        const asked = geminiAnswers({
            storyPlots: [THE_QUEST],
            paragraphsInStoryPlots: [THE_DOOR],
        });
        const session = storyOfThreeCells();

        await new IdentifyStoryPlotsCommand().invoke(session);

        expect(asked[0].url).toContain("/analyze/plots");
        expect(asked[0].body).toEqual({
            path: STORY_FILE,
            text: session.document.text,
            key: "AIza-the-authors-own",
            model: "gemini-flash",
        });
        expect(asked[1].url).toContain("/analyze/plots/status?id=job-1");
        expect(sentToThePage).toEqual([
            {
                type: "storyPlots",
                storyPlotsAreShown: false,
                storyPlots: [THE_QUEST],
                paragraphsInStoryPlots: [THE_DOOR],
            },
        ]);
    });

    it("sends nothing when the author says no to the warning", async () => {
        signInToGemini();
        dialogs.answerToTheWarning = undefined;
        const asked = geminiAnswers({});

        await new IdentifyStoryPlotsCommand().invoke(storyOfThreeCells());

        expect(asked).toEqual([]);
        expect(shownMessages[0]).toContain("Send the prose of");
    });

    it("asks the author to sign in again when Gemini would not take the key", async () => {
        signInToGemini();
        geminiAnswers({ error: "Gemini refused the key.", unauthorized: true });

        await new IdentifyStoryPlotsCommand().invoke(storyOfThreeCells());

        expect(shownMessages.at(-1)).toBe(
            "Gemini would not take the key Authorship had. Sign in again to identify the plots.",
        );
    });
});
