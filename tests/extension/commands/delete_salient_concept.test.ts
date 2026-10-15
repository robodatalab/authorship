import { beforeEach, describe, expect, it } from "vitest";

import { DeleteSalientConceptCommand } from "../../../extension/vscode_runtime/commands/delete_salient_concept";
import { dialogs, shownMessages } from "../vscode";
import { forgetWhatTheEditorDid, openStory } from "./open_story";

beforeEach(forgetWhatTheEditorDid);

describe("DeleteSalientConceptCommand — deletes a concept once the author confirms", () => {
    it("asks the author whether to delete the concept", async () => {
        const session = openStory(`
<!-- cell: markdown id="m1" -->

She saw the door.

<!-- cell: salient-concept title="Door" id="k1" -->

What she saw.
`);

        await new DeleteSalientConceptCommand().invoke(session, {
            conceptCellId: "k1",
        });

        expect(shownMessages).toEqual(["Delete the salient concept “Door”?"]);
    });

    it.each([
        { answer: "Delete", kindsLeft: ["markdown"] },
        { answer: undefined, kindsLeft: ["markdown", "salient-concept"] },
    ])(
        "leaves $kindsLeft when the author answers $answer",
        async ({ answer, kindsLeft }) => {
            dialogs.answerToTheWarning = answer;
            const session = openStory(`
<!-- cell: markdown id="m1" -->

She saw the door.

<!-- cell: salient-concept title="Door" id="k1" -->

What she saw.
`);

            await new DeleteSalientConceptCommand().invoke(session, {
                conceptCellId: "k1",
            });

            expect(session.document.cells.map((cell) => cell.kind)).toEqual(
                kindsLeft,
            );
        },
    );
});
