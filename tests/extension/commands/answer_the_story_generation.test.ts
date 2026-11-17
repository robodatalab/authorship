import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnswerTheStoryGenerationCommand } from "../../../extension/vscode_runtime/commands/answer_the_story_generation";
import { files } from "../vscode";
import { forgetWhatTheEditorDid, openStory, STORY_FILE } from "./open_story";

const THE_STORY_REVIEWED = `
<!-- cell: markdown id="c1" -->

She saw the door at last.
`;

beforeEach(forgetWhatTheEditorDid);
afterEach(() => vi.unstubAllGlobals());

describe("AnswerTheStoryGenerationCommand — answers what a stage asks", () => {
    it("accepting saves the story with the stage done", async () => {
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
                .mockRejectedValue(new Error("connection refused")),
        );
        const session = openStory(THE_STORY_REVIEWED);
        session.showTheStoryGeneration({
            running: false,
            error: null,
            progress: { steps: [] },
            stages: [],
            asked: {
                stage: "concept titles",
                story: "",
                shown: {
                    kind: "command",
                    cellKind: "salient-concept",
                    commandName: "addStoryAnnotation",
                },
            },
        });

        await new AnswerTheStoryGenerationCommand().invoke(session, {
            verdict: "accept",
        });

        expect(files.get(STORY_FILE)).toContain(
            "stage: concept titles: True\nstage: concepts: False\n",
        );
    });

    it("stopping takes the story back as its file has it", async () => {
        files.set(
            STORY_FILE,
            '<!-- cell: markdown id="c1" -->\n\nShe saw the door.\n',
        );
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
                .mockRejectedValue(new Error("connection refused")),
        );
        const session = openStory(THE_STORY_REVIEWED);

        await new AnswerTheStoryGenerationCommand().invoke(session, {
            verdict: "stop",
        });

        expect(session.document.text).toBe(
            '<!-- cell: markdown id="c1" -->\n\nShe saw the door.\n',
        );
    });
});
