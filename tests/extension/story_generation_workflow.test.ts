import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StoryGenerationStageJob } from "../../extension/vscode_runtime/story_generation";
import {
    executedCommands,
    files,
    keptInTheWorkspace,
    shownMessages,
} from "./vscode";
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
stage: cast: False
stage: characters: False
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
stage: cast: True
stage: characters: True
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
stage: cast: False
stage: characters: False
stage: plots: False
stage: mesh: False
stage: scenes: False
stage: choices: False
stage: validity: False
`;

const THE_STORY_AWAITING_REVIEW = `<!-- cell: markdown id="c1" -->

She saw the door at last.

<!-- cell: GeneratedDocumentCheckpoint id="g1" -->

stage: concept titles: True
stage: concepts: Review
stage: cast: False
stage: characters: False
stage: plots: False
stage: mesh: False
stage: scenes: False
stage: choices: False
stage: validity: False
`;

const THE_REVIEW_KEPT_FOR_THE_STORY = "storyGenerationReview:/stories/story.author";

const THE_REVIEW_OF_THE_CONCEPTS_KEPT = {
    shown: { kind: "cells", cellKind: "salient-concept" },
    storyBeforeTheStage: LEFT_OFF_AT_THE_CONCEPTS,
};

const STAGES_LEFT_OFF_AT_THE_CONCEPTS = [
    { name: "concept titles", done: true },
    { name: "concepts", done: false },
    { name: "cast", done: false },
    { name: "characters", done: false },
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
        steps: [{ doing: "concepts", done: 0, of: 1, seconds: 0, secondsPerItem: null, state: "running", steps: [] }],
    },
    asked: null,
};

const ASKS_FOR_A_REVIEW_OF_THE_CONCEPTS: StoryGenerationStageJob = {
    running: false,
    error: null,
    progress: {
        steps: [{ doing: "concepts", done: 1, of: 1, seconds: 0, secondsPerItem: null, state: "done", steps: [] }],
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
        steps: [{ doing: "concepts", done: 0, of: 1, seconds: 0, secondsPerItem: null, state: "done", steps: [] }],
    },
    asked: null,
};

const REVIEWS_THE_CONCEPTS = {
    running: false,
    error: null,
    progress: { steps: [] },
    stages: [
        { name: "concept titles", done: true },
        { name: "concepts", done: false },
        { name: "cast", done: false },
        { name: "characters", done: false },
        { name: "plots", done: false },
        { name: "mesh", done: false },
        { name: "scenes", done: false },
        { name: "choices", done: false },
        { name: "validity", done: false },
    ],
    asked: {
        stage: "concepts",
        story: THE_STORY_AWAITING_REVIEW,
        shown: { kind: "cells", cellKind: "salient-concept" },
    },
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

    it("follows the stage, and once it is done, saves the story it leaves to its file, awaiting review", async () => {
        files.set(STORY_FILE, LEFT_OFF_AT_THE_CONCEPTS);
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
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({}),
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
        expect([
            files.get(STORY_FILE),
            session.document.text,
            session.theStoryGeneration,
        ]).toEqual([
            THE_STORY_AWAITING_REVIEW,
            THE_STORY_AWAITING_REVIEW,
            REVIEWS_THE_CONCEPTS,
        ]);
    });

    it("runs nothing on a story awaiting review, and shows the review", async () => {
        const fetched = vi.fn();
        vi.stubGlobal("fetch", fetched);
        keptInTheWorkspace.set(
            THE_REVIEW_KEPT_FOR_THE_STORY,
            THE_REVIEW_OF_THE_CONCEPTS_KEPT,
        );
        const session = openStory(THE_STORY_AWAITING_REVIEW);

        await session.storyGenerationWorkflow.runTheNextStage();

        expect(fetched).not.toHaveBeenCalled();
        expect(session.theStoryGeneration).toEqual(REVIEWS_THE_CONCEPTS);
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
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ id: STORY_FILE }),
            })
            .mockResolvedValueOnce(NO_STAGE_RUNS);
        vi.stubGlobal("fetch", fetched);
        keptInTheWorkspace.set(
            THE_REVIEW_KEPT_FOR_THE_STORY,
            THE_REVIEW_OF_THE_CONCEPTS_KEPT,
        );
        const session = openStory(THE_STORY_AWAITING_REVIEW);

        await session.storyGenerationWorkflow.accept();

        const [, started] = fetched.mock.calls[0];
        expect(keptInTheWorkspace.size).toBe(0);
        expect(files.get(STORY_FILE)).toBe(`<!-- cell: markdown id="c1" -->

She saw the door at last.

<!-- cell: GeneratedDocumentCheckpoint id="g1" -->

stage: concept titles: True
stage: concepts: True
stage: cast: False
stage: characters: False
stage: plots: False
stage: mesh: False
stage: scenes: False
stage: choices: False
stage: validity: False
`);
        expect(JSON.parse(started.body).stage).toBe("cast");
    });
});

describe("StoryGenerationWorkflow.reject — the author rejects what a stage leaves", () => {
    it("saves the story as it was before the stage, and shows where it left off", async () => {
        files.set(STORY_FILE, THE_STORY_AWAITING_REVIEW);
        keptInTheWorkspace.set(
            THE_REVIEW_KEPT_FOR_THE_STORY,
            THE_REVIEW_OF_THE_CONCEPTS_KEPT,
        );
        const session = openStory(THE_STORY_AWAITING_REVIEW);

        await session.storyGenerationWorkflow.reject();

        expect([
            files.get(STORY_FILE),
            session.document.text,
            keptInTheWorkspace.size,
        ]).toEqual([LEFT_OFF_AT_THE_CONCEPTS, LEFT_OFF_AT_THE_CONCEPTS, 0]);
        expect(session.theStoryGeneration).toEqual({
            running: false,
            error: null,
            progress: { steps: [] },
            stages: STAGES_LEFT_OFF_AT_THE_CONCEPTS,
            asked: null,
        });
    });

    it("says so, and keeps the story, when the workspace does not keep the story as it was before the stage", async () => {
        files.set(STORY_FILE, THE_STORY_AWAITING_REVIEW);
        const session = openStory(THE_STORY_AWAITING_REVIEW);

        await session.storyGenerationWorkflow.reject();

        expect(files.get(STORY_FILE)).toBe(THE_STORY_AWAITING_REVIEW);
        expect(shownMessages).toEqual([
            "The story as it was before this stage is not kept in this workspace: accept it, or quit the generation.",
        ]);
    });
});

describe("StoryGenerationWorkflow.restart — the author has a stage run again", () => {
    it("saves the story as it was before the stage, and runs the stage again on it", async () => {
        files.set(STORY_FILE, THE_STORY_AWAITING_REVIEW);
        const fetched = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ id: STORY_FILE }),
            })
            .mockResolvedValueOnce(NO_STAGE_RUNS);
        vi.stubGlobal("fetch", fetched);
        keptInTheWorkspace.set(
            THE_REVIEW_KEPT_FOR_THE_STORY,
            THE_REVIEW_OF_THE_CONCEPTS_KEPT,
        );
        const session = openStory(THE_STORY_AWAITING_REVIEW);

        await session.storyGenerationWorkflow.restart();

        const [startedAt, started] = fetched.mock.calls[0];
        expect([startedAt, JSON.parse(started.body), files.get(STORY_FILE), keptInTheWorkspace.size]).toEqual([
            expect.stringContaining("/generate/story"),
            { path: STORY_FILE, story: LEFT_OFF_AT_THE_CONCEPTS, stage: "concepts" },
            LEFT_OFF_AT_THE_CONCEPTS,
            0,
        ]);
    });

    it("runs nothing, and says so, when the workspace does not keep the story as it was before the stage", async () => {
        const fetched = vi.fn();
        vi.stubGlobal("fetch", fetched);
        const session = openStory(THE_STORY_AWAITING_REVIEW);

        await session.storyGenerationWorkflow.restart();

        expect(fetched).not.toHaveBeenCalled();
        expect(shownMessages).toEqual([
            "The story as it was before this stage is not kept in this workspace: accept it, or quit the generation.",
        ]);
    });
});

describe("StoryGenerationWorkflow.quit — the author quits the generation altogether", () => {
    it("drops the stage awaiting review, and saves the story as it was before it, without the record of the stages", async () => {
        files.set(STORY_FILE, THE_STORY_AWAITING_REVIEW);
        const fetched = vi
            .fn()
            .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
        vi.stubGlobal("fetch", fetched);
        keptInTheWorkspace.set(
            THE_REVIEW_KEPT_FOR_THE_STORY,
            THE_REVIEW_OF_THE_CONCEPTS_KEPT,
        );
        const session = openStory(THE_STORY_AWAITING_REVIEW);

        await session.storyGenerationWorkflow.quit();

        const [droppedAt] = fetched.mock.calls[0];
        expect([
            droppedAt,
            files.get(STORY_FILE),
            session.theStoryGeneration,
            keptInTheWorkspace.size,
        ]).toEqual([
            expect.stringContaining("/jobs/cancel"),
            NEVER_GENERATED,
            null,
            0,
        ]);
    });

    it("saves the story as the editor has it, without the record of the stages, once the generation has left off", async () => {
        files.set(STORY_FILE, NEVER_GENERATED);
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) }),
        );
        const session = openStory(THE_STORY_REVIEWED);

        await session.storyGenerationWorkflow.quit();

        expect([files.get(STORY_FILE), session.theStoryGeneration]).toEqual([
            '<!-- cell: markdown id="c1" -->\n\nShe saw the door at last.\n',
            null,
        ]);
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

    it("saves the story a stage done leaves to its file, awaiting review, and drops the stage", async () => {
        files.set(STORY_FILE, LEFT_OFF_AT_THE_CONCEPTS);
        const fetched = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(ASKS_FOR_A_REVIEW_OF_THE_CONCEPTS),
            })
            .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
        vi.stubGlobal("fetch", fetched);
        const session = openStory(LEFT_OFF_AT_THE_CONCEPTS);

        await session.storyGenerationWorkflow.showWhereItStands();

        const [droppedAt] = fetched.mock.calls[1];
        expect([
            droppedAt,
            files.get(STORY_FILE),
            session.document.text,
            session.theStoryGeneration,
        ]).toEqual([
            expect.stringContaining("/jobs/cancel"),
            THE_STORY_AWAITING_REVIEW,
            THE_STORY_AWAITING_REVIEW,
            REVIEWS_THE_CONCEPTS,
        ]);
    });

    it("keeps the story as it was before a stage done, for the author to reject the stage", async () => {
        files.set(STORY_FILE, LEFT_OFF_AT_THE_CONCEPTS);
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve(ASKS_FOR_A_REVIEW_OF_THE_CONCEPTS),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({}),
                }),
        );
        const session = openStory(LEFT_OFF_AT_THE_CONCEPTS);

        await session.storyGenerationWorkflow.showWhereItStands();

        expect([...keptInTheWorkspace]).toEqual([
            [THE_REVIEW_KEPT_FOR_THE_STORY, THE_REVIEW_OF_THE_CONCEPTS_KEPT],
        ]);
    });

    it("brings back the review the story's file awaits, with no stage running", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(NO_STAGE_RUNS));
        keptInTheWorkspace.set(
            THE_REVIEW_KEPT_FOR_THE_STORY,
            THE_REVIEW_OF_THE_CONCEPTS_KEPT,
        );
        const session = openStory(THE_STORY_AWAITING_REVIEW);

        await session.storyGenerationWorkflow.showWhereItStands();

        expect(session.theStoryGeneration).toEqual(REVIEWS_THE_CONCEPTS);
    });

    it("brings back the review in the editor when the workspace keeps nothing of it", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(NO_STAGE_RUNS));
        const session = openStory(THE_STORY_AWAITING_REVIEW);

        await session.storyGenerationWorkflow.showWhereItStands();

        expect(session.theStoryGeneration?.asked).toEqual({
            stage: "concepts",
            story: THE_STORY_AWAITING_REVIEW,
            shown: { kind: "editor" },
        });
    });

    it("leaves the review the story's file awaits alone while the server still holds what the stage left", async () => {
        files.set(STORY_FILE, THE_STORY_AWAITING_REVIEW);
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(ASKS_FOR_A_REVIEW_OF_THE_CONCEPTS),
            }),
        );
        keptInTheWorkspace.set(
            THE_REVIEW_KEPT_FOR_THE_STORY,
            THE_REVIEW_OF_THE_CONCEPTS_KEPT,
        );
        const session = openStory(THE_STORY_AWAITING_REVIEW);

        await session.storyGenerationWorkflow.showWhereItStands();

        expect([
            files.get(STORY_FILE),
            session.document.text,
            [...keptInTheWorkspace],
        ]).toEqual([
            THE_STORY_AWAITING_REVIEW,
            THE_STORY_AWAITING_REVIEW,
            [[THE_REVIEW_KEPT_FOR_THE_STORY, THE_REVIEW_OF_THE_CONCEPTS_KEPT]],
        ]);
    });

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
