import { describe, expect, it } from "vitest";

import { RemoveCharacterFromPlotCommand } from "../../../extension/vscode_runtime/commands/remove_character_from_plot";
import type { AuthorFileEditorSession } from "../../../extension/vscode_runtime/author_file_editor_session";
import type { PlotCell } from "authordoc/cells/plot_cell";
import { openStory } from "./open_story";

const THE_STORY = `<!-- cell: character id="v1" title="Varn" -->

A captain.

<!-- cell: character id="d1" title="Lia" -->

Her daughter.

<!-- cell: plot title="The door" characters="v1, d1" id="p1" -->

She finds the door.
`;

function charactersOfThePlot(session: AuthorFileEditorSession): string[] {
    const plot = session.document.cellWithId("p1") as PlotCell;
    const characters = plot.characters(session.document);
    const names = characters.map((character) => character.title);
    return names;
}

describe("RemoveCharacterFromPlotCommand — has a plot stop following a character", () => {
    it.each([
        ["the one it was asked to, keeping the others", "v1", ["Lia"]],
        ["none when the plot does not follow the character", "x9", ["Varn", "Lia"]],
    ])("stops following %s", (_, characterCellId, expected) => {
        const session = openStory(THE_STORY);

        new RemoveCharacterFromPlotCommand().invoke(session, {
            annotationCellId: "p1",
            characterCellId,
        });

        expect(charactersOfThePlot(session)).toEqual(expected);
    });
});
