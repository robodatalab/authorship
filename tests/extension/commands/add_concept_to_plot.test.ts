import { describe, expect, it } from "vitest";
import * as vscode from "vscode";

import {
    openAuthorFileEditorSession,
    type AuthorFileEditorSession,
} from "../../../extension/vscode_runtime/author_file_editor_session";
import { AddConceptToPlotCommand } from "../../../extension/vscode_runtime/commands/add_concept_to_plot";
import type { PlotCell } from "authordoc/cells/plot_cell";
import { STORY_FILE, openStory } from "./open_story";

const THE_STORY = `<!-- cell: salient-concept id="k1" title="Motherhood" -->

A mother puts her child first.

<!-- cell: salient-concept id="k2" title="The promise" -->

A promise is kept whatever it costs.

<!-- cell: plot title="The door" concepts="k1" id="p1" -->

She finds the door.
`;

function conceptsOfThePlot(session: AuthorFileEditorSession): string[] {
    const plot = session.document.cellWithId("p1") as PlotCell;
    const concepts = plot.concepts(session.document);
    const titles = concepts.map((concept) => concept.title);
    return titles;
}

describe("AddConceptToPlotCommand — makes a plot reference a salient concept", () => {
    it("references the concept it was asked to, after the ones the plot references", () => {
        const session = openStory(THE_STORY);

        new AddConceptToPlotCommand().invoke(session, {
            annotationCellId: "p1",
            conceptCellId: "k2",
        });

        expect(conceptsOfThePlot(session)).toEqual(["Motherhood", "The promise"]);
    });

    it("references a concept only once", () => {
        const session = openStory(THE_STORY);

        new AddConceptToPlotCommand().invoke(session, {
            annotationCellId: "p1",
            conceptCellId: "k1",
        });

        expect(conceptsOfThePlot(session)).toEqual(["Motherhood"]);
    });

    it("references nothing that is not a salient concept", () => {
        const session = openStory(THE_STORY);

        new AddConceptToPlotCommand().invoke(session, {
            annotationCellId: "p1",
            conceptCellId: "p1",
        });

        expect(conceptsOfThePlot(session)).toEqual(["Motherhood"]);
    });

    it("takes the reference back when undone, and makes it again when redone", () => {
        const edits: { undo(): void; redo(): void }[] = [];
        const edited = new vscode.EventEmitter<{ undo(): void; redo(): void }>();
        edited.event((edit) => edits.push(edit));
        const session = openAuthorFileEditorSession(
            vscode.Uri.file(STORY_FILE),
            THE_STORY,
            edited as never,
        );
        new AddConceptToPlotCommand().invoke(session, {
            annotationCellId: "p1",
            conceptCellId: "k2",
        });

        edits[0].undo();
        const conceptsUndone = conceptsOfThePlot(session);
        edits[0].redo();
        const conceptsRedone = conceptsOfThePlot(session);

        expect(conceptsUndone).toEqual(["Motherhood"]);
        expect(conceptsRedone).toEqual(["Motherhood", "The promise"]);
    });
});
