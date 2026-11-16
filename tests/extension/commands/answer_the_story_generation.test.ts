import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnswerTheStoryGenerationCommand } from "../../../extension/vscode_runtime/commands/answer_the_story_generation";
import { forgetWhatTheEditorDid, openStory, STORY_FILE } from "./open_story";

const THE_STORY = `
<!-- cell: markdown id="c1" -->

She saw the door.
`;

beforeEach(forgetWhatTheEditorDid);
afterEach(() => vi.unstubAllGlobals());

describe("AnswerTheStoryGenerationCommand — answers the generation", () => {
    it("sends the author's verdict, with the story as the editor has it", async () => {
        const fetched = vi.fn().mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({}),
        });
        vi.stubGlobal("fetch", fetched);
        const session = openStory(THE_STORY);

        await new AnswerTheStoryGenerationCommand().invoke(session, {
            verdict: "accept",
        });

        const [answeredAt, answered] = fetched.mock.calls[0];
        expect(answeredAt).toContain("/generate/story/answer");
        expect(JSON.parse(answered.body)).toEqual({
            path: STORY_FILE,
            verdict: "accept",
            story: '<!-- cell: markdown id="c1" -->\n\nShe saw the door.\n',
        });
    });
});
