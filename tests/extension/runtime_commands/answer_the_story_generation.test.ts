import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnswerTheStoryGenerationCommand } from "../../../extension/vscode_runtime/runtime_commands/answer_the_story_generation";
import { files } from "../vscode";
import { forgetWhatTheEditorDid, openStory, STORY_FILE } from "./open_story";

const THE_STORY_AWAITING_REVIEW = `
<!-- cell: markdown id="c1" -->

She saw the door.

<!-- suggestion: id="c1" -->
<!-- change: text from="16" removed="" written=" at last" -->

<!-- cell: GeneratedDocumentCheckpoint id="g1" -->

stage: concept titles: True
stage: concepts: Review
`;

beforeEach(forgetWhatTheEditorDid);
afterEach(() => vi.unstubAllGlobals());

describe("AnswerTheStoryGenerationCommand — answers what a stage asks", () => {
    it("accepting saves the story with the stage done, once no suggestion is left", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockRejectedValue(new Error("connection refused")),
        );
        const session = openStory(`<!-- cell: markdown id="c1" -->

She saw the door at last.

<!-- cell: GeneratedDocumentCheckpoint id="g1" -->

stage: concept titles: Review
`);

        await new AnswerTheStoryGenerationCommand().invoke(session, {
            verdict: "accept",
        });

        expect(files.get(STORY_FILE)).toBe(`<!-- cell: markdown id="c1" -->

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
`);
    });

    it("rejecting runs the stage again on the story as it was before it", async () => {
        const fetched = vi
            .fn()
            .mockRejectedValue(new Error("connection refused"));
        vi.stubGlobal("fetch", fetched);
        const session = openStory(THE_STORY_AWAITING_REVIEW);

        await new AnswerTheStoryGenerationCommand().invoke(session, {
            verdict: "reject",
        });

        const [, started] = fetched.mock.calls[0];
        expect(JSON.parse(started.body)).toEqual({
            path: STORY_FILE,
            story: `<!-- cell: markdown id="c1" -->

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
`,
            stage: "concepts",
        });
    });
});
