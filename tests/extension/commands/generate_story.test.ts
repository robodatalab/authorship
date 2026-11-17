import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    GenerateStoryCommand,
    showWhereTheStoryGenerationStands,
} from "../../../extension/vscode_runtime/commands/generate_story";
import type { StoryGenerationShown } from "../../../extension/vscode_runtime/story_generation";
import { executedCommands, shownMessages } from "../vscode";
import {
    closeTheStoryEditor,
    forgetWhatTheEditorDid,
    openStory,
    sentToThePage,
    STORY_FILE,
} from "./open_story";

const THE_STORY = `
<!-- cell: markdown id="c1" -->

She saw the door.
`;

const THE_STORY_REVIEWED = `<!-- cell: markdown id="c1" -->

She saw the door at last.
`;

const WRITES_THE_PLOTS = {
    running: true,
    cancelled: false,
    error: null,
    progress: {
        steps: [{ doing: "plots", done: 3, of: 15, state: "running", steps: [] }],
    },
    stages: [
        { name: "concept titles", done: true },
        { name: "concepts", done: true },
        { name: "plots", done: false },
    ],
    asked: null,
};

const ASKS_FOR_A_REVIEW_OF_THE_PLOTS = {
    running: false,
    cancelled: false,
    error: null,
    progress: {
        steps: [{ doing: "plots", done: 15, of: 15, state: "done", steps: [] }],
    },
    stages: [
        { name: "concept titles", done: true },
        { name: "concepts", done: true },
        { name: "plots", done: false },
    ],
    asked: {
        number: 3,
        story: THE_STORY_REVIEWED,
        shown: { kind: "tab", cellKind: "plot" },
    },
};

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

describe("GenerateStoryCommand — runs the next stage of the generation on the story's file", () => {
    it("starts it on the file, follows it, and shows what it asks once it is done", async () => {
        const fetched = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ id: STORY_FILE }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(WRITES_THE_PLOTS),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(WRITES_THE_PLOTS),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(ASKS_FOR_A_REVIEW_OF_THE_PLOTS),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(ASKS_FOR_A_REVIEW_OF_THE_PLOTS),
            });
        vi.stubGlobal("fetch", fetched);
        const session = openStory(THE_STORY);

        await new GenerateStoryCommand().invoke(session);

        const [startedAt, started] = fetched.mock.calls[0];
        const [askedAt] = fetched.mock.calls[1];
        expect(startedAt).toContain("/generate/story");
        expect(JSON.parse(started.body)).toEqual({ path: STORY_FILE });
        expect(askedAt).toContain(
            "/generate/story/status?id=%2Fstories%2Fstory.author",
        );
        expect(sentToThePage).toContainEqual({
            type: "storyGeneration",
            storyGeneration: WRITES_THE_PLOTS,
        });
        expect(session.theStoryGeneration).toEqual(
            ASKS_FOR_A_REVIEW_OF_THE_PLOTS,
        );
        expect(session.document.text).toBe(THE_STORY_REVIEWED);
    });

    it("shows the stage it left off at, if it stops before it is done", async () => {
        const fetched = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ id: STORY_FILE }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(WRITES_THE_PLOTS),
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
    });
});

describe("showWhereTheStoryGenerationStands — brings the part of authorship a stage worked in into view", () => {
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
            vi.stubGlobal(
                "fetch",
                vi.fn().mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            ...ASKS_FOR_A_REVIEW_OF_THE_PLOTS,
                            asked: {
                                number: 3,
                                story: THE_STORY_REVIEWED,
                                shown,
                            },
                        }),
                }),
            );
            const session = openStory(THE_STORY);

            await showWhereTheStoryGenerationStands(session);

            expect(executedCommands).toEqual(commandsExecuted);
        },
    );
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

    it("brings back the story a stage asks the author to review", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(ASKS_FOR_A_REVIEW_OF_THE_PLOTS),
            }),
        );
        const session = openStory(THE_STORY);

        await showWhereTheStoryGenerationStands(session);

        expect(session.theStoryGeneration).toEqual(
            ASKS_FOR_A_REVIEW_OF_THE_PLOTS,
        );
        expect(session.document.text).toBe(THE_STORY_REVIEWED);
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

    it("follows a stage still running on the story's file until it stops", async () => {
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(WRITES_THE_PLOTS),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(WRITES_THE_PLOTS),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(LEFT_OFF_AT_THE_CONCEPTS),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(LEFT_OFF_AT_THE_CONCEPTS),
                }),
        );
        const session = openStory(THE_STORY);

        await showWhereTheStoryGenerationStands(session);

        expect(sentToThePage).toContainEqual({
            type: "storyGeneration",
            storyGeneration: WRITES_THE_PLOTS,
        });
        expect(session.theStoryGeneration).toEqual(LEFT_OFF_AT_THE_CONCEPTS);
    });

    it("stops following once the story's editor is closed, without a word", async () => {
        const fetched = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(WRITES_THE_PLOTS),
            })
            .mockImplementationOnce(() => {
                closeTheStoryEditor();
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve(WRITES_THE_PLOTS),
                });
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(ASKS_FOR_A_REVIEW_OF_THE_PLOTS),
            });
        vi.stubGlobal("fetch", fetched);
        const session = openStory(THE_STORY);

        await showWhereTheStoryGenerationStands(session);

        expect(fetched).toHaveBeenCalledTimes(3);
        expect(shownMessages).toEqual([]);
        expect(executedCommands).toEqual([]);
    });
});
