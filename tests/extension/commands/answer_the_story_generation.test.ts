import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnswerTheStoryGenerationCommand } from "../../../extension/vscode_runtime/commands/answer_the_story_generation";
import { files } from "../vscode";
import { forgetWhatTheEditorDid, openStory, STORY_FILE } from "./open_story";

const THE_STORY = `
<!-- cell: markdown id="c1" -->

She saw the door.
`;

beforeEach(forgetWhatTheEditorDid);
afterEach(() => vi.unstubAllGlobals());

describe("AnswerTheStoryGenerationCommand — answers the generation", () => {
    it("sends the author's verdict, with the story as the editor has it", async () => {
        const fetched = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({}),
            })
            .mockRejectedValueOnce(new Error("connection refused"));
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

    it("takes the story back as its file has it once answered, and shows where the generation stands", async () => {
        const leftOffAtTheConcepts = {
            running: false,
            cancelled: false,
            error: null,
            progress: { steps: [] },
            stages: [
                { name: "concept titles", done: true },
                { name: "concepts", done: false },
            ],
            asked: null,
        };
        files.set(
            STORY_FILE,
            '<!-- cell: markdown id="c1" -->\n\nShe saw the door at last.\n',
        );
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({}),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(leftOffAtTheConcepts),
                }),
        );
        const session = openStory(THE_STORY);

        await new AnswerTheStoryGenerationCommand().invoke(session, {
            verdict: "stop",
        });

        expect(session.document.text).toBe(
            '<!-- cell: markdown id="c1" -->\n\nShe saw the door at last.\n',
        );
        expect(session.theStoryGeneration).toEqual(leftOffAtTheConcepts);
    });
});
