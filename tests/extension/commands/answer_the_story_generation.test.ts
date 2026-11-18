import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnswerTheStoryGenerationCommand } from "../../../extension/vscode_runtime/commands/answer_the_story_generation";
import { files, keptInTheWorkspace } from "../vscode";
import { forgetWhatTheEditorDid, openStory, STORY_FILE } from "./open_story";

const THE_STORY_AWAITING_REVIEW = `
<!-- cell: markdown id="c1" -->

She saw the door at last.

<!-- cell: GeneratedDocumentCheckpoint id="g1" -->

stage: concept titles: Review
`;

beforeEach(forgetWhatTheEditorDid);
afterEach(() => vi.unstubAllGlobals());

describe("AnswerTheStoryGenerationCommand — answers what a stage asks", () => {
    it("accepting saves the story with the stage done", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockRejectedValue(new Error("connection refused")),
        );
        const session = openStory(THE_STORY_AWAITING_REVIEW);

        await new AnswerTheStoryGenerationCommand().invoke(session, {
            verdict: "accept",
        });

        expect(files.get(STORY_FILE)).toContain(
            "stage: concept titles: True\nstage: concepts: False\n",
        );
    });

    it("rejecting puts back the story as it was before the stage", async () => {
        keptInTheWorkspace.set("storyGenerationReview:/stories/story.author", {
            shown: { kind: "editor" },
            storyBeforeTheStage:
                '<!-- cell: markdown id="c1" -->\n\nShe saw the door.\n',
        });
        const session = openStory(THE_STORY_AWAITING_REVIEW);

        await new AnswerTheStoryGenerationCommand().invoke(session, {
            verdict: "reject",
        });

        expect(session.document.text).toBe(
            '<!-- cell: markdown id="c1" -->\n\nShe saw the door.\n',
        );
    });
});
