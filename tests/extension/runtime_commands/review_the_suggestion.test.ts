import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewTheSuggestionCommand } from "../../../extension/vscode_runtime/runtime_commands/review_the_suggestion";
import { files } from "../vscode";
import {
    forgetWhatTheEditorDid,
    openStory,
    sentToThePage,
    STORY_FILE,
} from "./open_story";

const THE_STORY_WITH_TWO_SUGGESTIONS = `
<!-- cell: markdown id="c1" -->

She saw the door.

<!-- suggestion: id="c1" -->
<!-- change: text from="16" removed="" written=" at last" -->

<!-- cell: markdown id="c2" -->

He heard the bell.

<!-- suggestion: id="c2" -->
<!-- change: text from="17" removed="" written=" twice" -->
`;

beforeEach(forgetWhatTheEditorDid);
afterEach(() => vi.unstubAllGlobals());

describe("ReviewTheSuggestionCommand — answers for the suggestion on one cell, and saves the story", () => {
    it.each([
        [
            "accepting patches the cell with the suggestion's diff, and drops the suggestion",
            "accept",
            `<!-- cell: markdown id="c1" -->

She saw the door at last.

<!-- cell: markdown id="c2" -->

He heard the bell.

<!-- suggestion: id="c2" -->
<!-- change: text from="17" removed="" written=" twice" -->
`,
        ],
        [
            "rejecting drops the suggestion, leaving the cell as it is",
            "reject",
            `<!-- cell: markdown id="c1" -->

She saw the door.

<!-- cell: markdown id="c2" -->

He heard the bell.

<!-- suggestion: id="c2" -->
<!-- change: text from="17" removed="" written=" twice" -->
`,
        ],
    ])("%s", async (_, verdict, expected) => {
        const session = openStory(THE_STORY_WITH_TWO_SUGGESTIONS);

        await ReviewTheSuggestionCommand.deserialize({
            cellId: "c1",
            verdict,
        }).invoke(session);

        expect(files.get(STORY_FILE)).toBe(expected);
    });

    it("tells the page the suggestions left", async () => {
        const session = openStory(THE_STORY_WITH_TWO_SUGGESTIONS);

        await ReviewTheSuggestionCommand.deserialize({
            cellId: "c1",
            verdict: "reject",
        }).invoke(session);

        expect(sentToThePage).toContainEqual({
            type: "setSuggestions",
            suggestions:
                '<!-- suggestion: id="c2" -->\n<!-- change: text from="17" removed="" written=" twice" -->\n',
        });
    });

    it("sends the page the cell as it stands once its suggestion is rejected", async () => {
        const session = openStory(THE_STORY_WITH_TWO_SUGGESTIONS);

        await ReviewTheSuggestionCommand.deserialize({
            cellId: "c1",
            verdict: "reject",
        }).invoke(session);

        expect(sentToThePage).toContainEqual({
            type: "updateCells",
            cells: ['<!-- cell: markdown id="c1" -->\n\nShe saw the door.\n'],
            cellsThePageTyped: [],
        });
    });

    it("sends the page every cell as its suggestion makes it", () => {
        const session = openStory(THE_STORY_WITH_TWO_SUGGESTIONS);

        session.sendDocument();

        expect(sentToThePage[0]).toEqual({
            type: "setAllCells",
            cells: [
                '<!-- cell: markdown id="c1" -->\n\nShe saw the door at last.\n',
                '<!-- cell: markdown id="c2" -->\n\nHe heard the bell twice.\n',
            ],
        });
    });
});
