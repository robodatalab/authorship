import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
    StoryGenerationShown,
    StoryGenerationStageJob,
} from "../../extension/vscode_runtime/story_generation";
import { executedCommands, files, shownMessages } from "./vscode";
import {
    closeTheStoryEditor,
    forgetWhatTheEditorDid,
    openStory,
    sentToThePage,
    STORY_FILE,
} from "./commands/open_story";

const NEVER_GENERATED = `<!-- cell: markdown id="c1" -->

She saw the door.
`;

const LEFT_OFF_AT_THE_CONCEPTS = `<!-- cell: markdown id="c1" -->

She saw the door.

<!-- cell: GeneratedDocumentCheckpoint id="g1" -->

stage: concept titles: True
stage: concepts: False
stage: plots: False
stage: mesh: False
stage: scenes: False
stage: choices: False
stage: validity: False
`;

const GENERATED_TO_THE_END = `<!-- cell: markdown id="c1" -->

She saw the door.

<!-- cell: GeneratedDocumentCheckpoint id="g1" -->

stage: concept titles: True
stage: concepts: True
stage: plots: True
stage: mesh: True
stage: scenes: True
stage: choices: True
stage: validity: True
`;

const THE_STORY_REVIEWED = `<!-- cell: markdown id="c1" -->

She saw the door at last.

<!-- cell: GeneratedDocumentCheckpoint id="g1" -->

stage: concept titles: True
stage: concepts: False
stage: plots: False
stage: mesh: False
stage: scenes: False
stage: choices: False
stage: validity: False
`;

const STAGES_LEFT_OFF_AT_THE_CONCEPTS = [
    { name: "concept titles", done: true },
    { name: "concepts", done: false },
    { name: "plots", done: false },
    { name: "mesh", done: false },
    { name: "scenes", done: false },
    { name: "choices", done: false },
    { name: "validity", done: false },
];

const DESCRIBES_THE_CONCEPTS: StoryGenerationStageJob = {
    running: true,
    error: null,
    progress: {
        steps: [{ doing: "concepts", done: 0, of: 1, state: "running", steps: [] }],
    },
    asked: null,
};

const ASKS_FOR_A_REVIEW_OF_THE_CONCEPTS: StoryGenerationStageJob = {
    running: false,
    error: null,
    progress: {
        steps: [{ doing: "concepts", done: 1, of: 1, state: "done", steps: [] }],
    },
    asked: {
        stage: "concepts",
        story: THE_STORY_REVIEWED,
        shown: { kind: "cells", cellKind: "salient-concept" },
    },
};

const STOPPED_IN_THE_CONCEPTS: StoryGenerationStageJob = {
    running: false,
    error: null,
    progress: {
        steps: [{ doing: "concepts", done: 0, of: 1, state: "done", steps: [] }],
    },
    asked: null,
};

const NO_STAGE_RUNS = {
    ok: false,
    status: 404,
    json: () => Promise.resolve({ detail: "No story generation" }),
};

beforeEach(forgetWhatTheEditorDid);
afterEach(() => vi.unstubAllGlobals());

describe("StoryGenerationWorkflow.runTheNextStage — runs the first stage not done", () => {
    it.each([
        ["never generated", NEVER_GENERATED, "concept titles"],
        ["left off at the concepts", LEFT_OFF_AT_THE_CONCEPTS, "concepts"],
    ])(
        "on a story %s, runs %s on the story as the editor has it",
        async (_, story, stageRun) => {
            const fetched = vi
                .fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ id: STORY_FILE }),
                })
                .mockResolvedValueOnce(NO_STAGE_RUNS);
            vi.stubGlobal("fetch", fetched);
            const session = openStory(story);

            await session.storyGenerationWorkflow.runTheNextStage();

            const [startedAt, started] = fetched.mock.calls[0];
            expect(startedAt).toContain("/generate/story");
            expect(JSON.parse(started.body)).toEqual({
                path: STORY_FILE,
                story,
                stage: stageRun,
            });
        },
    );

    it("runs nothing on a story generated to the end", async () => {
        const fetched = vi.fn();
        vi.stubGlobal("fetch", fetched);
        const session = openStory(GENERATED_TO_THE_END);

        await session.storyGenerationWorkflow.runTheNextStage();

        expect(fetched).not.toHaveBeenCalled();
        expect(session.theStoryGeneration).toBeNull();
    });

    it("follows the stage, and shows what it asks once it is done", async () => {
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ id: STORY_FILE }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(DESCRIBES_THE_CONCEPTS),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(DESCRIBES_THE_CONCEPTS),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve(ASKS_FOR_A_REVIEW_OF_THE_CONCEPTS),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve(ASKS_FOR_A_REVIEW_OF_THE_CONCEPTS),
                }),
        );
        const session = openStory(LEFT_OFF_AT_THE_CONCEPTS);

        await session.storyGenerationWorkflow.runTheNextStage();

        expect(sentToThePage).toContainEqual({
            type: "storyGeneration",
            storyGeneration: {
                ...DESCRIBES_THE_CONCEPTS,
                stages: STAGES_LEFT_OFF_AT_THE_CONCEPTS,
            },
        });
        expect(session.theStoryGeneration).toEqual({
            ...ASKS_FOR_A_REVIEW_OF_THE_CONCEPTS,
            stages: STAGES_LEFT_OFF_AT_THE_CONCEPTS,
        });
        expect(session.document.text).toBe(THE_STORY_REVIEWED);
    });

    it("says so when the stage cannot be started", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockRejectedValueOnce(new Error("connection refused")),
        );
        const session = openStory(NEVER_GENERATED);

        await session.storyGenerationWorkflow.runTheNextStage();

        expect(shownMessages).toEqual([
            "Cannot generate the story — is the server running? (connection refused)",
        ]);
    });
});

describe("StoryGenerationWorkflow.accept — the author accepts what a stage leaves", () => {
    it("saves the story with the stage done, and runs the next stage on it", async () => {
        const fetched = vi
            .fn()
            .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ id: STORY_FILE }),
            })
            .mockResolvedValueOnce(NO_STAGE_RUNS);
        vi.stubGlobal("fetch", fetched);
        const session = openStory(THE_STORY_REVIEWED);
        session.showTheStoryGeneration({
            ...ASKS_FOR_A_REVIEW_OF_THE_CONCEPTS,
            stages: STAGES_LEFT_OFF_AT_THE_CONCEPTS,
        });

        await session.storyGenerationWorkflow.accept();

        const [droppedAt, dropped] = fetched.mock.calls[0];
        const [, started] = fetched.mock.calls[1];
        expect(droppedAt).toContain("/jobs/cancel");
        expect(JSON.parse(dropped.body)).toEqual({ path: STORY_FILE });
        expect(files.get(STORY_FILE)).toBe(`<!-- cell: markdown id="c1" -->

She saw the door at last.

<!-- cell: GeneratedDocumentCheckpoint id="g1" -->

stage: concept titles: True
stage: concepts: True
stage: plots: False
stage: mesh: False
stage: scenes: False
stage: choices: False
stage: validity: False
`);
        expect(JSON.parse(started.body).stage).toBe("plots");
    });
});

describe("StoryGenerationWorkflow.stop — the author stops at what a stage leaves", () => {
    it("drops what the stage asks, and takes the story back as its file has it", async () => {
        files.set(STORY_FILE, LEFT_OFF_AT_THE_CONCEPTS);
        const fetched = vi
            .fn()
            .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
            .mockResolvedValueOnce(NO_STAGE_RUNS);
        vi.stubGlobal("fetch", fetched);
        const session = openStory(THE_STORY_REVIEWED);

        await session.storyGenerationWorkflow.stop();

        const [droppedAt] = fetched.mock.calls[0];
        expect(droppedAt).toContain("/jobs/cancel");
        expect(session.document.text).toBe(LEFT_OFF_AT_THE_CONCEPTS);
        expect(session.theStoryGeneration).toEqual({
            running: false,
            error: null,
            progress: { steps: [] },
            stages: STAGES_LEFT_OFF_AT_THE_CONCEPTS,
            asked: null,
        });
    });
});

describe("StoryGenerationWorkflow.showWhereItStands — the generation of a story opened", () => {
    it("asks the server about the stage running on the story's file", async () => {
        const fetched = vi.fn().mockResolvedValueOnce(NO_STAGE_RUNS);
        vi.stubGlobal("fetch", fetched);
        const session = openStory(LEFT_OFF_AT_THE_CONCEPTS);

        await session.storyGenerationWorkflow.showWhereItStands();

        const [askedAt] = fetched.mock.calls[0];
        expect(askedAt).toContain(
            "/generate/story/status?id=%2Fstories%2Fstory.author",
        );
    });

    it("shows the stage it left off at, with no stage running, for the author to resume", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(NO_STAGE_RUNS));
        const session = openStory(LEFT_OFF_AT_THE_CONCEPTS);

        await session.storyGenerationWorkflow.showWhereItStands();

        expect(session.theStoryGeneration).toEqual({
            running: false,
            error: null,
            progress: { steps: [] },
            stages: STAGES_LEFT_OFF_AT_THE_CONCEPTS,
            asked: null,
        });
    });

    it("shows the stage it left off at while the server cannot be reached", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockRejectedValueOnce(new Error("connection refused")),
        );
        const session = openStory(LEFT_OFF_AT_THE_CONCEPTS);

        await session.storyGenerationWorkflow.showWhereItStands();

        expect(session.theStoryGeneration?.stages).toEqual(
            STAGES_LEFT_OFF_AT_THE_CONCEPTS,
        );
    });

    it.each([
        ["never generated", NEVER_GENERATED],
        ["generated to the end", GENERATED_TO_THE_END],
    ])("shows nothing for a story %s", async (_, story) => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(NO_STAGE_RUNS));
        const session = openStory(story);

        await session.storyGenerationWorkflow.showWhereItStands();

        expect(session.theStoryGeneration).toBeNull();
    });

    it("brings back the story a stage done asks the author to review", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(ASKS_FOR_A_REVIEW_OF_THE_CONCEPTS),
            }),
        );
        const session = openStory(LEFT_OFF_AT_THE_CONCEPTS);

        await session.storyGenerationWorkflow.showWhereItStands();

        expect(session.document.text).toBe(THE_STORY_REVIEWED);
        expect(session.theStoryGeneration).toEqual({
            ...ASKS_FOR_A_REVIEW_OF_THE_CONCEPTS,
            stages: STAGES_LEFT_OFF_AT_THE_CONCEPTS,
        });
    });

    it.each<{ shown: StoryGenerationShown; commandsExecuted: string[] }>([
        {
            shown: {
                kind: "command",
                cellKind: "salient-concept",
                commandName: "insertCell",
            },
            commandsExecuted: ["authorship.manuscript.focus"],
        },
        {
            shown: { kind: "cells", cellKind: "plot" },
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
                            ...ASKS_FOR_A_REVIEW_OF_THE_CONCEPTS,
                            asked: {
                                stage: "concepts",
                                story: THE_STORY_REVIEWED,
                                shown,
                            },
                        }),
                }),
            );
            const session = openStory(LEFT_OFF_AT_THE_CONCEPTS);

            await session.storyGenerationWorkflow.showWhereItStands();

            expect(executedCommands).toEqual(commandsExecuted);
        },
    );

    it("follows a stage still running on the story's file until it stops", async () => {
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(DESCRIBES_THE_CONCEPTS),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(DESCRIBES_THE_CONCEPTS),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(STOPPED_IN_THE_CONCEPTS),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(STOPPED_IN_THE_CONCEPTS),
                }),
        );
        const session = openStory(LEFT_OFF_AT_THE_CONCEPTS);

        await session.storyGenerationWorkflow.showWhereItStands();

        expect(sentToThePage).toContainEqual({
            type: "storyGeneration",
            storyGeneration: {
                ...DESCRIBES_THE_CONCEPTS,
                stages: STAGES_LEFT_OFF_AT_THE_CONCEPTS,
            },
        });
        expect(session.theStoryGeneration?.asked).toBeNull();
    });

    it("stops following once the story's editor is closed, without a word", async () => {
        const fetched = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(DESCRIBES_THE_CONCEPTS),
            })
            .mockImplementationOnce(() => {
                closeTheStoryEditor();
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve(DESCRIBES_THE_CONCEPTS),
                });
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(ASKS_FOR_A_REVIEW_OF_THE_CONCEPTS),
            });
        vi.stubGlobal("fetch", fetched);
        const session = openStory(LEFT_OFF_AT_THE_CONCEPTS);

        await session.storyGenerationWorkflow.showWhereItStands();

        expect(fetched).toHaveBeenCalledTimes(3);
        expect(shownMessages).toEqual([]);
        expect(executedCommands).toEqual([]);
    });
});
