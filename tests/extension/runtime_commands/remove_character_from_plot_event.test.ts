import { describe, expect, it } from "vitest";
import * as vscode from "vscode";

import {
    openAuthorFileEditorSession,
    type AuthorFileEditorSession,
} from "../../../extension/vscode_runtime/author_file_editor_session";
import { RemoveCharacterFromPlotEventCommand } from "../../../extension/vscode_runtime/runtime_commands/remove_character_from_plot_event";
import type { PlotCell } from "authordoc/cells/plot_cell";
import { STORY_FILE, openStory } from "./open_story";

const THE_STORY = `<!-- cell: character id="v1" title="Varn" -->

A captain.

<!-- cell: character id="d1" title="Lia" -->

Her daughter.

<!-- cell: plot title="The door" id="p1" -->

<ol title="She finds the door.">
<li id="e1" characters="v1, d1">She finds the door.</li>
</ol>
`;

function charactersOfTheEvent(session: AuthorFileEditorSession): string[] {
    const plot = session.document.cellWithId("p1") as PlotCell;
    const event = plot.getNodeById("e1");
    const characters = event.characters(session.document);
    const names = characters.map((character) => character.title);
    return names;
}

describe("RemoveCharacterFromPlotEventCommand — takes a character out of one event of a plot", () => {
    it.each([
        ["the one it was asked to, keeping the others", "v1", ["Lia"]],
        [
            "none when the event does not have the character",
            "x9",
            ["Varn", "Lia"],
        ],
    ])("takes out %s", (_, characterCellId, expected) => {
        const session = openStory(THE_STORY);

        new RemoveCharacterFromPlotEventCommand().invoke(session, {
            annotationCellId: "p1",
            nodeId: "e1",
            characterCellId,
        });

        expect(charactersOfTheEvent(session)).toEqual(expected);
    });

    it("puts the character back when undone, and takes it out when redone", () => {
        const edits: { undo(): void; redo(): void }[] = [];
        const edited = new vscode.EventEmitter<{
            undo(): void;
            redo(): void;
        }>();
        edited.event((edit) => edits.push(edit));
        const session = openAuthorFileEditorSession(
            vscode.Uri.file(STORY_FILE),
            THE_STORY,
            edited as never,
        );
        new RemoveCharacterFromPlotEventCommand().invoke(session, {
            annotationCellId: "p1",
            nodeId: "e1",
            characterCellId: "v1",
        });

        edits[0].undo();
        const charactersUndone = charactersOfTheEvent(session);
        edits[0].redo();
        const charactersRedone = charactersOfTheEvent(session);

        expect(charactersUndone).toEqual(["Varn", "Lia"]);
        expect(charactersRedone).toEqual(["Lia"]);
    });
});
