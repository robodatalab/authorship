import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GenerateStoryCommand } from "../../../extension/vscode_runtime/runtime_commands/generate_story";
import { forgetWhatTheEditorDid, openStory, STORY_FILE } from "./open_story";

const THE_STORY = `
<!-- cell: markdown id="c1" -->

She saw the door.

<!-- cell: GeneratedDocumentCheckpoint id="g1" -->

stage: concept titles: True
`;

beforeEach(forgetWhatTheEditorDid);
afterEach(() => vi.unstubAllGlobals());

describe("GenerateStoryCommand — generates the story with the author", () => {
    it("runs the first stage of the generation the story has not done", async () => {
        const fetched = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ id: STORY_FILE }),
            })
            .mockRejectedValueOnce(new Error("connection refused"));
        vi.stubGlobal("fetch", fetched);
        const session = openStory(THE_STORY);

        await new GenerateStoryCommand().invoke(session);

        const [startedAt, started] = fetched.mock.calls[0];
        expect(startedAt).toContain("/generate/story");
        expect(JSON.parse(started.body)).toEqual({
            path: STORY_FILE,
            story:
                '<!-- cell: markdown id="c1" -->\n\nShe saw the door.\n\n' +
                '<!-- cell: GeneratedDocumentCheckpoint id="g1" -->\n\nstage: concept titles: True\n',
            stage: "concepts",
        });
    });
});
