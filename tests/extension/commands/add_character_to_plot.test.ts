import { describe, expect, it } from "vitest";

import { AddCharacterToPlotCommand } from "../../../extension/vscode_runtime/commands/add_character_to_plot";
import type { AuthorFileEditorSession } from "../../../extension/vscode_runtime/author_file_editor_session";
import type { PlotCell } from "authordoc/cells/plot_cell";
import { openStory } from "./open_story";

const THE_STORY = `<!-- cell: character id="v1" title="Varn" -->

A captain.

<!-- cell: character id="d1" title="Lia" -->

Her daughter.

<!-- cell: place id="h1" title="The hall" -->

<!-- cell: plot title="The door" characters="v1" id="p1" -->

She finds the door.
`;

function charactersOfThePlot(session: AuthorFileEditorSession): string[] {
    const plot = session.document.cellWithId("p1") as PlotCell;
    const characters = plot.characters(session.document);
    const names = characters.map((character) => character.title);
    return names;
}

describe("AddCharacterToPlotCommand — has a plot follow a character", () => {
    it.each([
        ["after the ones the plot follows", "d1", ["Varn", "Lia"]],
        ["only once", "v1", ["Varn"]],
        ["never a cell that is not a character", "h1", ["Varn"]],
        ["never a cell the story does not have", "x9", ["Varn"]],
    ])("follows the character %s", (_, characterCellId, expected) => {
        const session = openStory(THE_STORY);

        new AddCharacterToPlotCommand().invoke(session, {
            annotationCellId: "p1",
            characterCellId,
        });

        expect(charactersOfThePlot(session)).toEqual(expected);
    });
});
