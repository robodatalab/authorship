import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IdentifyStoryPlotsCommand } from "../../../extension/vscode_runtime/commands/identify_story_plots";
import { shownMessages } from "../vscode";
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

const THE_QUEST = {
    title: "The quest",
    characters: ["Bob"],
    origin: "Bob loses his ring",
    goal: "Bob finds his ring",
    keyEvents: [],
};

const NOTHING_READ_YET: unknown[] = [];

const A_SECOND_PASS = [
    { passes: 0, doing: "chapters", done: 24, of: 24 },
    { passes: 2, doing: "paragraphs", done: 120, of: 400 },
];

function serverAnswers(...jobs: Record<string, unknown>[]): {
    url: string;
    body: unknown;
}[] {
    const asked: { url: string; body: unknown }[] = [];
    const answers = [...jobs];
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
                              progress: NOTHING_READ_YET,
                              ...(answers.length > 1
                                  ? answers.shift()
                                  : answers[0]),
                          }
                        : { id: "job-1" },
                ),
        });
    });
    return asked;
}

function progressSentToThePage(): unknown[] {
    return sentToThePage.map(
        (sent) => (sent as { storyPlotsProgress: unknown }).storyPlotsProgress,
    );
}

beforeEach(forgetWhatTheEditorDid);
afterEach(() => vi.unstubAllGlobals());

describe("IdentifyStoryPlotsCommand — finds the plots the story weaves", () => {
    it("sends the document with the key and hands the page what came back", async () => {
        const asked = serverAnswers({
            storyPlots: [THE_QUEST],
            paragraphsInStoryPlots: [THE_DOOR],
        });
        const session = storyOfThreeCells();

        await new IdentifyStoryPlotsCommand().invoke(session);

        expect(asked[0].url).toContain("/analyze/plots");
        expect(asked[0].body).toEqual({
            path: STORY_FILE,
            text: session.document.text,
        });
        expect(asked[1].url).toContain("/analyze/plots/status?id=job-1");
        expect(sentToThePage).toEqual([
            {
                type: "storyPlots",
                storyPlotsAreShown: false,
                storyPlots: [],
                storyPlotsProgress: NOTHING_READ_YET,
                paragraphsInStoryPlots: [],
            },
            {
                type: "storyPlots",
                storyPlotsAreShown: false,
                storyPlots: [THE_QUEST],
                storyPlotsProgress: NOTHING_READ_YET,
                paragraphsInStoryPlots: [THE_DOOR],
            },
            {
                type: "storyPlots",
                storyPlotsAreShown: false,
                storyPlots: [THE_QUEST],
                storyPlotsProgress: null,
                paragraphsInStoryPlots: [THE_DOOR],
            },
        ]);
    });

    it("says how far the passes have got while it runs", async () => {
        serverAnswers(
            {
                running: true,
                progress: A_SECOND_PASS,
                storyPlots: [THE_QUEST],
                paragraphsInStoryPlots: [THE_DOOR],
            },
            { storyPlots: [THE_QUEST], paragraphsInStoryPlots: [THE_DOOR] },
        );

        await new IdentifyStoryPlotsCommand().invoke(storyOfThreeCells());

        expect(progressSentToThePage()).toContainEqual(A_SECOND_PASS);
        expect(progressSentToThePage().at(-1)).toBeNull();
    });

    it("says why it could not identify the plots", async () => {
        serverAnswers({ error: "the model is not serving" });

        await new IdentifyStoryPlotsCommand().invoke(storyOfThreeCells());

        expect(shownMessages.at(-1)).toContain("Cannot identify the plots");
        expect(progressSentToThePage().at(-1)).toBeNull();
    });
});
