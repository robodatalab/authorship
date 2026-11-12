import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    GenerateStoryCommand,
    showWhereTheStoryGenerationStands,
} from "../../../extension/vscode_runtime/commands/generate_story";
import type { StoryGenerationShown } from "../../../extension/vscode_runtime/story_generation";
import { executedCommands } from "../vscode";
import {
    forgetWhatTheEditorDid,
    openStory,
    sentToThePage,
    STORY_FILE,
} from "./open_story";

const THE_STORY = `
<!-- cell: markdown id="c1" -->

She saw the door.
`;

const THE_STORY_WITH_A_PLOT = `<!-- cell: markdown id="c1" -->

She saw the door.

<!-- cell: plot title="The door" id="p1" -->

She finds the door.
`;

const LEFT_OFF_AT_THE_CONCEPTS = {
    running: false,
    cancelled: false,
    error: null,
    progress: { steps: [] },
    stages: [
        { name: "concept titles", done: true },
        { name: "concepts", done: false },
        { name: "plots", done: false },
    ],
    asked: null,
};

const GENERATED_TO_THE_END = {
    running: false,
    cancelled: false,
    error: null,
    progress: { steps: [] },
    stages: [
        { name: "concept titles", done: true },
        { name: "concepts", done: true },
        { name: "plots", done: true },
    ],
    asked: null,
};

const NEVER_GENERATED = {
    running: false,
    cancelled: false,
    error: null,
    progress: { steps: [] },
    stages: [],
    asked: null,
};

beforeEach(forgetWhatTheEditorDid);
afterEach(() => vi.unstubAllGlobals());

describe("GenerateStoryCommand — runs the generation on the story's file", () => {
    it("starts it on the file and shows what it asks in the main menu until it ends", async () => {
        const asksForTheConcepts = {
            running: true,
            error: null,
            progress: { steps: [{ doing: "concept titles", done: 0, of: 0 }] },
            asked: {
                number: 1,
                story: THE_STORY_WITH_A_PLOT,
                shown: {
                    kind: "command",
                    cellKind: "salient-concept",
                    commandName: "addStoryAnnotation",
                },
            },
        };
        const fetched = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ id: STORY_FILE }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(asksForTheConcepts),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(GENERATED_TO_THE_END),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(GENERATED_TO_THE_END),
            });
        vi.stubGlobal("fetch", fetched);
        const session = openStory(THE_STORY);

        await new GenerateStoryCommand().invoke(session);

        const [startedAt, started] = fetched.mock.calls[0];
        const [polledAt] = fetched.mock.calls[1];
        expect(startedAt).toContain("/generate/story");
        expect(JSON.parse(started.body)).toEqual({ path: STORY_FILE });
        expect(polledAt).toContain(
            "/generate/story/status?id=%2Fstories%2Fstory.author",
        );
        expect(sentToThePage).toContainEqual({
            type: "storyGeneration",
            storyGeneration: asksForTheConcepts,
        });
        expect(sentToThePage).toContainEqual({
            type: "storyGeneration",
            storyGeneration: null,
        });
        expect(session.theStoryGeneration).toBeNull();
    });
});

describe("GenerateStoryCommand — brings the part of authorship a stage worked in into view", () => {
    it.each<{ shown: StoryGenerationShown; commandsExecuted: string[] }>([
        {
            shown: {
                kind: "command",
                cellKind: "salient-concept",
                commandName: "addStoryAnnotation",
            },
            commandsExecuted: ["authorship.manuscript.focus"],
        },
        {
            shown: { kind: "tab", cellKind: "plot" },
            commandsExecuted: ["authorship.manuscript.focus"],
        },
        {
            shown: { kind: "editor" },
            commandsExecuted: [],
        },
    ])(
        "opens the Authorship panel only on a part of its own: $shown.kind",
        async ({ shown, commandsExecuted }) => {
            const fetched = vi
                .fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ id: STORY_FILE }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            running: true,
                            error: null,
                            progress: {
                                steps: [{ doing: "plots", done: 3, of: 3 }],
                            },
                            asked: {
                                number: 1,
                                story: THE_STORY_WITH_A_PLOT,
                                shown,
                            },
                        }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(GENERATED_TO_THE_END),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(GENERATED_TO_THE_END),
                });
            vi.stubGlobal("fetch", fetched);
            const session = openStory(THE_STORY);

            await new GenerateStoryCommand().invoke(session);

            expect(executedCommands).toEqual(commandsExecuted);
        },
    );
});


describe("GenerateStoryCommand — leaves the generation where it stopped", () => {
    it("shows the stage it left off at once it stops, for the author to resume", async () => {
        const fetched = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ id: STORY_FILE }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(LEFT_OFF_AT_THE_CONCEPTS),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(LEFT_OFF_AT_THE_CONCEPTS),
            });
        vi.stubGlobal("fetch", fetched);
        const session = openStory(THE_STORY);

        await new GenerateStoryCommand().invoke(session);

        expect(session.theStoryGeneration).toEqual(LEFT_OFF_AT_THE_CONCEPTS);
        expect(sentToThePage).toContainEqual({
            type: "storyGeneration",
            storyGeneration: LEFT_OFF_AT_THE_CONCEPTS,
        });
    });
});

describe("showWhereTheStoryGenerationStands — the generation of a story opened", () => {
    it("asks the server where the generation of the story's file stands", async () => {
        const fetched = vi.fn().mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(LEFT_OFF_AT_THE_CONCEPTS),
        });
        vi.stubGlobal("fetch", fetched);
        const session = openStory(THE_STORY);

        await showWhereTheStoryGenerationStands(session);

        const [askedAt] = fetched.mock.calls[0];
        expect(askedAt).toContain(
            "/generate/story/status?id=%2Fstories%2Fstory.author",
        );
    });

    it("shows the stage it left off at, for the author to resume", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(LEFT_OFF_AT_THE_CONCEPTS),
            }),
        );
        const session = openStory(THE_STORY);

        await showWhereTheStoryGenerationStands(session);

        expect(session.theStoryGeneration).toEqual(LEFT_OFF_AT_THE_CONCEPTS);
    });

    it.each([
        ["never generated", NEVER_GENERATED],
        ["generated to the end", GENERATED_TO_THE_END],
    ])("shows nothing for a story %s", async (_, storyGeneration) => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(storyGeneration),
            }),
        );
        const session = openStory(THE_STORY);

        await showWhereTheStoryGenerationStands(session);

        expect(session.theStoryGeneration).toBeNull();
    });

    it("shows nothing while the server cannot be reached", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockRejectedValueOnce(new Error("connection refused")),
        );
        const session = openStory(THE_STORY);

        await showWhereTheStoryGenerationStands(session);

        expect(session.theStoryGeneration).toBeNull();
    });

    it("follows a generation still running on the story's file until it stops", async () => {
        const writesThePlots = {
            running: true,
            cancelled: false,
            error: null,
            progress: { steps: [{ doing: "plots", done: 3, of: 15 }] },
            stages: [
                { name: "concept titles", done: true },
                { name: "concepts", done: true },
                { name: "plots", done: false },
            ],
            asked: null,
        };
        const leftOffAtThePlots = {
            running: false,
            cancelled: false,
            error: null,
            progress: { steps: [] },
            stages: [
                { name: "concept titles", done: true },
                { name: "concepts", done: true },
                { name: "plots", done: false },
            ],
            asked: null,
        };
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(writesThePlots),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(writesThePlots),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(leftOffAtThePlots),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(leftOffAtThePlots),
                }),
        );
        const session = openStory(THE_STORY);

        await showWhereTheStoryGenerationStands(session);

        expect(sentToThePage).toContainEqual({
            type: "storyGeneration",
            storyGeneration: writesThePlots,
        });
        expect(session.theStoryGeneration).toEqual(leftOffAtThePlots);
    });
});
