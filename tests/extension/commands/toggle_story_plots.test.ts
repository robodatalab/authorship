import { beforeEach, describe, expect, it } from "vitest";

import { ToggleStoryPlotsCommand } from "../../../extension/vscode_runtime/commands/toggle_story_plots";
import {
    forgetWhatTheEditorDid,
    sentToThePage,
    storyOfThreeCells,
} from "./open_story";

beforeEach(forgetWhatTheEditorDid);

describe("ToggleStoryPlotsCommand — shows and hides the plots", () => {
    it("shows the plots, then hides them again", () => {
        const session = storyOfThreeCells();

        new ToggleStoryPlotsCommand().invoke(session);
        new ToggleStoryPlotsCommand().invoke(session);

        expect(
            sentToThePage.map(
                (message) =>
                    (message as { storyPlotsAreShown: boolean })
                        .storyPlotsAreShown,
            ),
        ).toEqual([true, false]);
    });
});
