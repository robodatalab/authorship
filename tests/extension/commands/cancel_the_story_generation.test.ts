import { afterEach, describe, expect, it, vi } from "vitest";

import { CancelTheStoryGenerationCommand } from "../../../extension/vscode_runtime/commands/cancel_the_story_generation";
import { dialogs, files } from "../vscode";
import { STORY_FILE, openStory } from "./open_story";

const LEFT_OFF_AT_THE_CONCEPTS = `<!-- cell: markdown id="c1" -->

She saw the door.

<!-- cell: GeneratedDocumentCheckpoint id="g1" -->

stage: concept titles: True
stage: concepts: False
`;

afterEach(() => {
    dialogs.answerToTheWarning = undefined;
    vi.unstubAllGlobals();
});

describe("CancelTheStoryGenerationCommand — cancels the story generation once the author confirms", () => {
    it.each([
        [
            "removes the record of the stages once the author confirms",
            "Cancel the Generation",
            '<!-- cell: markdown id="c1" -->\n\nShe saw the door.\n',
        ],
        ["leaves the story alone when the author does not", undefined, LEFT_OFF_AT_THE_CONCEPTS],
    ])("%s", async (_, answer, expected) => {
        files.set(STORY_FILE, LEFT_OFF_AT_THE_CONCEPTS);
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }),
        );
        dialogs.answerToTheWarning = answer;
        const session = openStory(LEFT_OFF_AT_THE_CONCEPTS);

        await new CancelTheStoryGenerationCommand().invoke(session);

        expect(files.get(STORY_FILE)).toBe(expected);
    });
});
