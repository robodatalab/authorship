import { describe, expect, it } from "vitest";
import * as vscode from "vscode";

import {
    openAuthorFileEditorSession,
    type AuthorFileEditorSession,
} from "../../../extension/vscode_runtime/author_file_editor_session";
import { AddCharacterToPlotEventCommand } from "../../../extension/vscode_runtime/runtime_commands/add_character_to_plot_event";
import type { PlotCell } from "authordoc/cells/plot_cell";
import { STORY_FILE, openStory } from "./open_story";

const THE_STORY = `<!-- cell: character id="v1" title="Varn" -->

A captain.

<!-- cell: character id="d1" title="Lia" -->

Her daughter.

<!-- cell: place id="h1" title="The hall" -->

<!-- cell: plot title="The door" id="p1" -->

<ol title="She finds the door.">
<li id="e1" characters="v1">She finds the door.</li>
<li id="e2">She opens the door.</li>
</ol>
`;

function charactersOfTheEvent(
    session: AuthorFileEditorSession,
    nodeId: string,
): string[] {
    const plot = session.document.cellWithId("p1") as PlotCell;
    const event = plot.getNodeById(nodeId);
    const characters = event.characters(session.document);
    const names = characters.map((character) => character.title);
    return names;
}

describe("AddCharacterToPlotEventCommand — puts a character in one event of a plot", () => {
    it.each([
        ["after the ones the event has", "e1", "d1", ["Varn", "Lia"]],
        ["in an event that has none", "e2", "d1", ["Lia"]],
        ["only once", "e1", "v1", ["Varn"]],
        ["never a cell that is not a character", "e1", "h1", ["Varn"]],
        ["never a cell the story does not have", "e1", "x9", ["Varn"]],
    ])("puts the character in %s", (_, nodeId, characterCellId, expected) => {
        const session = openStory(THE_STORY);

        AddCharacterToPlotEventCommand.deserialize({
            annotationCellId: "p1",
            nodeId,
            characterCellId,
        }).invoke(session);

        expect(charactersOfTheEvent(session, nodeId)).toEqual(expected);
    });

    it("changes nothing when the plot has no such event", () => {
        const session = openStory(THE_STORY);
        const plotBefore = session.document.cellWithId("p1");

        AddCharacterToPlotEventCommand.deserialize({
            annotationCellId: "p1",
            nodeId: "e9",
            characterCellId: "d1",
        }).invoke(session);

        expect(session.document.cellWithId("p1")).toEqual(plotBefore);
    });

    it("takes the character back out when undone, and puts it in again when redone", () => {
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
        AddCharacterToPlotEventCommand.deserialize({
            annotationCellId: "p1",
            nodeId: "e1",
            characterCellId: "d1",
        }).invoke(session);

        edits[0].undo();
        const charactersUndone = charactersOfTheEvent(session, "e1");
        edits[0].redo();
        const charactersRedone = charactersOfTheEvent(session, "e1");

        expect(charactersUndone).toEqual(["Varn"]);
        expect(charactersRedone).toEqual(["Varn", "Lia"]);
    });
});
