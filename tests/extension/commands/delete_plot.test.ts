import { beforeEach, describe, expect, it } from "vitest";

import { DeletePlotCommand } from "../../../extension/vscode_runtime/commands/delete_plot";
import { dialogs, shownMessages } from "../vscode";
import { forgetWhatTheEditorDid, openStory } from "./open_story";

beforeEach(forgetWhatTheEditorDid);

describe("DeletePlotCommand — deletes a plot once the author confirms", () => {
    it("asks the author whether to delete the plot", async () => {
        const session = openStory(`
<!-- cell: markdown id="m1" -->

She saw the door.

<!-- cell: plot title="The door" id="p1" -->

She finds the door.
`);

        await new DeletePlotCommand().invoke(session, { plotCellId: "p1" });

        expect(shownMessages).toEqual(["Delete the plot “The door”?"]);
    });

    it.each([
        { answer: "Delete", kindsLeft: ["markdown"] },
        { answer: undefined, kindsLeft: ["markdown", "plot"] },
    ])(
        "leaves $kindsLeft when the author answers $answer",
        async ({ answer, kindsLeft }) => {
            dialogs.answerToTheWarning = answer;
            const session = openStory(`
<!-- cell: markdown id="m1" -->

She saw the door.

<!-- cell: plot title="The door" id="p1" -->

She finds the door.
`);

            await new DeletePlotCommand().invoke(session, { plotCellId: "p1" });

            const kindsOfTheCells = session.document.cells.map(
                (cell) => cell.kind,
            );
            expect(kindsOfTheCells).toEqual(kindsLeft);
        },
    );
});
