import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewTheSuggestionCommand } from "../../../extension/vscode_runtime/commands/review_the_suggestion";
import type { StoryGenerationStageJob } from "../../../extension/vscode_runtime/story_generation/story_generation";
import { executedCommands, files, shownMessages } from "../vscode";
import {
    closeTheStoryEditor,
    forgetWhatTheEditorDid,
    openStory,
    sentToThePage,
    STORY_FILE,
} from "../commands/open_story";

const NEVER_GENERATED = `<!-- cell: markdown id="c1" -->

She saw the door.
`;

const LEFT_OFF_AT_THE_CONCEPTS = `<!-- cell: markdown id="c1" -->

She saw the door.

<!-- cell: GeneratedDocumentCheckpoint id="g1" -->

stage: concept titles: True
stage: concepts: False
stage: cast: False
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
stage: plots: False
stage: mesh: False
stage: scenes: False
stage: choices: False
stage: validity: False

<!-- cell: salient-concept id="k1" title="Motherhood" -->

A mother's care.
`;

const THE_STORY_AWAITING_REVIEW = `<!-- cell: markdown id="c1" -->

She saw the door.

<!-- suggestion: id="c1" -->
<!-- change: text from="16" removed="" written=" at last" -->

<!-- cell: salient-concept id="k1" -->

<!-- suggestion: id="k1" -->
<!-- change: header kind="salient-concept" after-title="Motherhood" -->
<!-- change: text from="0" removed="" written="A mother's care." -->

<!-- cell: GeneratedDocumentCheckpoint id="g1" -->

stage: concept titles: True
stage: concepts: Review
stage: cast: False
stage: plots: False
stage: mesh: False
stage: scenes: False
stage: choices: False
stage: validity: False
proposed by the stage: k1
`;

const THE_STORY_ACCEPTED = `<!-- cell: markdown id="c1" -->

She saw the door at last.

<!-- cell: GeneratedDocumentCheckpoint id="g1" -->

stage: concept titles: True
stage: concepts: True
stage: cast: Review
stage: plots: False
stage: mesh: False
stage: scenes: False
stage: choices: False
stage: validity: False
`;

const STAGES_LEFT_OFF_AT_THE_CONCEPTS = [
    { name: "concept titles", done: true },
    { name: "concepts", done: false },
    { name: "cast", done: false },
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
    story: null,
};

const ASKS_FOR_A_REVIEW_OF_THE_CONCEPTS: StoryGenerationStageJob = {
    running: false,
    error: null,
    progress: {
        steps: [{ doing: "concepts", done: 1, of: 1, seconds: 0, secondsPerItem: null, state: "done", steps: [] }],
    },
    story: THE_STORY_REVIEWED,
};

const STOPPED_IN_THE_CONCEPTS: StoryGenerationStageJob = {
    running: false,
    error: null,
    progress: {
        steps: [{ doing: "concepts", done: 0, of: 1, seconds: 0, secondsPerItem: null, state: "done", steps: [] }],
    },
    story: null,
};

const REVIEWS_THE_CONCEPTS = {
    running: false,
    progress: { steps: [] },
    stages: [
        { name: "concept titles", done: true },
        { name: "concepts", done: false },
        { name: "cast", done: false },
        { name: "plots", done: false },
        { name: "mesh", done: false },
        { name: "scenes", done: false },
        { name: "choices", done: false },
        { name: "validity", done: false },
    ],
    asked: {
        stage: "concepts",
        shown: { kind: "cells", cellKind: "salient-concept" },
    },
};

const NO_STAGE_RUNS = {
    ok: false,
    status: 404,
    json: () => Promise.resolve({ detail: "No story generation" }),
};

beforeEach(forgetWhatTheEditorDid);
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("StoryGenerationWorkflow.runTheNextStage — runs the first stage not done", () => {
    it.each([
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

    it("has the author add the concepts on a story never generated, without asking the server", async () => {
        const fetched = vi.fn();
        vi.stubGlobal("fetch", fetched);
        const session = openStory(NEVER_GENERATED);

        await session.storyGenerationWorkflow.runTheNextStage();

        expect([fetched.mock.calls.length, session.theStoryGeneration?.asked]).toEqual([
            0,
            {
                stage: "concept titles",
                shown: { kind: "command", cellKind: "salient-concept", commandName: "insertCell" },
            },
        ]);
    });

    it("runs nothing on a story generated to the end", async () => {
        const fetched = vi.fn();
        vi.stubGlobal("fetch", fetched);
        const session = openStory(GENERATED_TO_THE_END);

        await session.storyGenerationWorkflow.runTheNextStage();

        expect(fetched).not.toHaveBeenCalled();
        expect(session.theStoryGeneration).toBeNull();
    });

    it("follows the stage, and once it is done, saves what it changed to the story's file as suggestions, awaiting review", async () => {
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
                running: true,
                progress: DESCRIBES_THE_CONCEPTS.progress,
                stages: STAGES_LEFT_OFF_AT_THE_CONCEPTS,
                asked: null,
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
        const session = openStory(LEFT_OFF_AT_THE_CONCEPTS);

        await session.storyGenerationWorkflow.runTheNextStage();

        expect(shownMessages).toEqual([
            "Cannot generate the story — is the server running? (connection refused)",
        ]);
    });
});

describe("StoryGenerationWorkflow.accept — the author continues past a stage", () => {
    it("waits while any suggestion of the stage is left", async () => {
        const fetched = vi.fn();
        vi.stubGlobal("fetch", fetched);
        const session = openStory(THE_STORY_AWAITING_REVIEW);

        await session.storyGenerationWorkflow.accept();

        expect([fetched.mock.calls.length, session.document.serialize()]).toEqual([0, THE_STORY_AWAITING_REVIEW]);
    });

    it("saves the story with the stage done once no suggestion is left, and has the author cast the characters, without asking the server", async () => {
        const fetched = vi.fn();
        vi.stubGlobal("fetch", fetched);
        const session = openStory(`<!-- cell: markdown id="c1" -->

She saw the door at last.

<!-- cell: GeneratedDocumentCheckpoint id="g1" -->

stage: concept titles: True
stage: concepts: Review
stage: cast: False
stage: plots: False
stage: mesh: False
stage: scenes: False
stage: choices: False
stage: validity: False
`);

        await session.storyGenerationWorkflow.accept();

        expect([files.get(STORY_FILE), fetched.mock.calls.length]).toEqual([THE_STORY_ACCEPTED, 0]);
    });
});

describe("StoryGenerationWorkflow.accept — the author continues past the cast stage", () => {
    const THE_CAST_AWAITING_REVIEW = `<!-- cell: salient-concept id="k1" title="Motherhood" -->

A mother's care.

<!-- cell: character id="v1" title="Varn" concepts="k1" -->

A captain.

<!-- cell: character id="d1" title="Dax" -->

A thief.

<!-- cell: GeneratedDocumentCheckpoint id="g1" -->

stage: concept titles: True
stage: concepts: True
stage: cast: Review
stage: plots: False
stage: mesh: False
stage: scenes: False
stage: choices: False
stage: validity: False
`;

    it("flags as an error every character the author tied to no concept, and stays at the cast stage", async () => {
        const fetched = vi.fn();
        vi.stubGlobal("fetch", fetched);
        const session = openStory(THE_CAST_AWAITING_REVIEW);

        await session.storyGenerationWorkflow.accept();

        expect([shownMessages, fetched.mock.calls.length, session.document.serialize()]).toEqual([
            ["Tie every character to the concepts it supports before continuing: Dax supports none."],
            0,
            THE_CAST_AWAITING_REVIEW,
        ]);
    });

    it("flags as an error a cast with no characters, and stays at the cast stage", async () => {
        const fetched = vi.fn();
        vi.stubGlobal("fetch", fetched);
        const noCast = `<!-- cell: salient-concept id="k1" title="Motherhood" -->

A mother's care.

<!-- cell: GeneratedDocumentCheckpoint id="g1" -->

stage: concept titles: True
stage: concepts: True
stage: cast: Review
`;
        const session = openStory(noCast);

        await session.storyGenerationWorkflow.accept();

        expect([shownMessages, fetched.mock.calls.length]).toEqual([
            ["Add the characters of the story before continuing: the cast has none."],
            0,
        ]);
    });

    it("continues to the plots once every character supports a concept", async () => {
        const fetched = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ id: STORY_FILE }),
            })
            .mockResolvedValueOnce(NO_STAGE_RUNS);
        vi.stubGlobal("fetch", fetched);
        const everyoneTied = `<!-- cell: salient-concept id="k1" title="Motherhood" -->

A mother's care.

<!-- cell: character id="v1" title="Varn" concepts="k1" -->

A captain.

<!-- cell: character id="d1" title="Dax" concepts="k1" -->

A thief.

<!-- cell: GeneratedDocumentCheckpoint id="g1" -->

stage: concept titles: True
stage: concepts: True
stage: cast: Review
stage: plots: False
stage: mesh: False
stage: scenes: False
stage: choices: False
stage: validity: False
`;
        const session = openStory(everyoneTied);

        await session.storyGenerationWorkflow.accept();

        const [, started] = fetched.mock.calls[0];
        expect([shownMessages, JSON.parse(started.body).stage]).toEqual([[], "plots"]);
    });
});

describe("StoryGenerationWorkflow.reject — the author rejects what a stage leaves, and has it run again", () => {
    it("drops every suggestion, and runs the stage again on the story as it was before it", async () => {
        const fetched = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ id: STORY_FILE }),
            })
            .mockResolvedValueOnce(NO_STAGE_RUNS);
        vi.stubGlobal("fetch", fetched);
        const session = openStory(THE_STORY_AWAITING_REVIEW);

        await session.storyGenerationWorkflow.reject();

        const [startedAt, started] = fetched.mock.calls[0];
        expect([startedAt, JSON.parse(started.body), files.get(STORY_FILE)]).toEqual([
            expect.stringContaining("/generate/story"),
            { path: STORY_FILE, story: LEFT_OFF_AT_THE_CONCEPTS, stage: "concepts" },
            LEFT_OFF_AT_THE_CONCEPTS,
        ]);
    });

    it("shows the stage it left off at, for the author to resume, when the stage cannot be run again", async () => {
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValueOnce(NO_STAGE_RUNS)
                .mockRejectedValueOnce(new Error("The models are still being deployed")),
        );
        const session = openStory(THE_STORY_AWAITING_REVIEW);
        await session.storyGenerationWorkflow.showWhereItStands();

        await session.storyGenerationWorkflow.reject();

        expect(session.theStoryGeneration).toEqual({
            running: false,
            progress: { steps: [] },
            stages: STAGES_LEFT_OFF_AT_THE_CONCEPTS,
            asked: null,
        });
    });
});

describe("StoryGenerationWorkflow — watches the author review the suggestions of a stage one by one", () => {
    it("deletes a cell the stage proposed once its suggestion is rejected, and leaves a cell the stage only changed", async () => {
        const session = openStory(THE_STORY_AWAITING_REVIEW);

        await new ReviewTheSuggestionCommand().invoke(session, { cellId: "k1", verdict: "reject" });
        await new ReviewTheSuggestionCommand().invoke(session, { cellId: "c1", verdict: "reject" });

        expect(files.get(STORY_FILE)).toBe(`<!-- cell: markdown id="c1" -->

She saw the door.

<!-- cell: GeneratedDocumentCheckpoint id="g1" -->

stage: concept titles: True
stage: concepts: Review
stage: cast: False
stage: plots: False
stage: mesh: False
stage: scenes: False
stage: choices: False
stage: validity: False
`);
    });
});

describe("StoryGenerationWorkflow.quit — the author quits the generation altogether", () => {
    it("drops the suggestions of the stage awaiting review, and saves the story without the record of the stages", async () => {
        const fetched = vi
            .fn()
            .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
        vi.stubGlobal("fetch", fetched);
        const session = openStory(THE_STORY_AWAITING_REVIEW);

        await session.storyGenerationWorkflow.quit();

        const [droppedAt] = fetched.mock.calls[0];
        expect([droppedAt, files.get(STORY_FILE), session.theStoryGeneration]).toEqual([
            expect.stringContaining("/jobs/cancel"),
            NEVER_GENERATED,
            null,
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
            '<!-- cell: markdown id="c1" -->\n\nShe saw the door at last.\n\n' +
                '<!-- cell: salient-concept id="k1" title="Motherhood" -->\n\nA mother\'s care.\n',
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

    it("saves what a stage done changed to the story's file as suggestions, awaiting review, and drops the stage", async () => {
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

    it("accepts a stage that changed nothing, with nothing to review, and moves on to the next stage", async () => {
        files.set(STORY_FILE, LEFT_OFF_AT_THE_CONCEPTS);
        const fetched = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: () =>
                    Promise.resolve({
                        ...ASKS_FOR_A_REVIEW_OF_THE_CONCEPTS,
                        story: LEFT_OFF_AT_THE_CONCEPTS,
                    }),
            })
            .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
        vi.stubGlobal("fetch", fetched);
        const session = openStory(LEFT_OFF_AT_THE_CONCEPTS);

        await session.storyGenerationWorkflow.showWhereItStands();

        expect([fetched.mock.calls.length, files.get(STORY_FILE)]).toEqual([
            2,
            `<!-- cell: markdown id="c1" -->

She saw the door.

<!-- cell: GeneratedDocumentCheckpoint id="g1" -->

stage: concept titles: True
stage: concepts: True
stage: cast: Review
stage: plots: False
stage: mesh: False
stage: scenes: False
stage: choices: False
stage: validity: False
`,
        ]);
    });

    it("brings back the review the story's file awaits, with no stage running", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(NO_STAGE_RUNS));
        const session = openStory(THE_STORY_AWAITING_REVIEW);

        await session.storyGenerationWorkflow.showWhereItStands();

        expect(session.theStoryGeneration).toEqual(REVIEWS_THE_CONCEPTS);
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
        const session = openStory(THE_STORY_AWAITING_REVIEW);

        await session.storyGenerationWorkflow.showWhereItStands();

        expect([files.get(STORY_FILE), session.document.text]).toEqual([
            THE_STORY_AWAITING_REVIEW,
            THE_STORY_AWAITING_REVIEW,
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
                running: true,
                progress: DESCRIBES_THE_CONCEPTS.progress,
                stages: STAGES_LEFT_OFF_AT_THE_CONCEPTS,
                asked: null,
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
