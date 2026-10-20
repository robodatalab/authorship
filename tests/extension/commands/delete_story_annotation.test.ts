import { beforeEach, describe, expect, it } from "vitest";

import { DeleteStoryAnnotationCommand } from "../../../extension/vscode_runtime/commands/delete_story_annotation";
import { dialogs, shownMessages } from "../vscode";
import { forgetWhatTheEditorDid, openStory } from "./open_story";

beforeEach(forgetWhatTheEditorDid);

describe("DeleteStoryAnnotationCommand — deletes a story annotation once the author confirms", () => {
    it.each([
        {
            cellKind: "salient-concept",
            asked: "Delete the salient-concept “Door”?",
        },
        { cellKind: "plot", asked: "Delete the plot “Door”?" },
    ])(
        "asks the author whether to delete the $cellKind",
        async ({ cellKind, asked }) => {
            const session = openStory(`
<!-- cell: markdown id="m1" -->

She saw the door.

<!-- cell: ${cellKind} title="Door" id="a1" -->

What she saw.
`);

            await new DeleteStoryAnnotationCommand().invoke(session, {
                annotationCellId: "a1",
            });

            expect(shownMessages).toEqual([asked]);
        },
    );

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

<!-- cell: plot title="Door" id="a1" -->

What she saw.
`);

            await new DeleteStoryAnnotationCommand().invoke(session, {
                annotationCellId: "a1",
            });

            const kindsOfTheCells = session.document.cells.map(
                (cell) => cell.kind,
            );
            expect(kindsOfTheCells).toEqual(kindsLeft);
        },
    );
});
