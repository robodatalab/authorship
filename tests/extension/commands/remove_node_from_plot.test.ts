import { describe, expect, it } from "vitest";
import * as vscode from "vscode";

import { openAuthorFileEditorSession } from "../../../extension/vscode_runtime/author_file_editor_session";
import { RemoveNodeFromPlotCommand } from "../../../extension/vscode_runtime/commands/remove_node_from_plot";
import { PlotEdge, PlotNode } from "authordoc/cells/plot_cell";
import { StoryWordRange } from "authordoc/cells/story_word_range";
import { STORY_FILE, openStory } from "./open_story";

describe("RemoveNodeFromPlotCommand — takes a node out of a plot's trajectory", () => {
    it("removes the node it was asked to, and the lines that reach it", () => {
        const session = openStory(`
<!-- cell: markdown id="c1" -->

She saw the door. He heard the bell.

<!-- cell: plot title="The door" nodes="n1:2-3, n2:6-7, n3:0-0" edges="e1:n1>n2, e2:n3>n1" id="p1" -->

She finds the door.
`);

        new RemoveNodeFromPlotCommand().invoke(session, {
            annotationCellId: "p1",
            nodeId: "n2",
        });

        expect(session.document.cellWithId("p1")).toMatchObject({
            nodes: [
                new PlotNode("n1", new StoryWordRange(2, 3)),
                new PlotNode("n3", new StoryWordRange(0, 0)),
            ],
            edges: [new PlotEdge("e2", "n3", "n1")],
        });
    });

    it("keeps a node holding the same words as the one it removes", () => {
        const session = openStory(`
<!-- cell: markdown id="c1" -->

She saw the door. He heard the bell.

<!-- cell: plot title="The door" nodes="n1:2-3, n2:2-3" id="p1" -->

She finds the door.
`);

        new RemoveNodeFromPlotCommand().invoke(session, {
            annotationCellId: "p1",
            nodeId: "n2",
        });

        expect(session.document.cellWithId("p1")).toMatchObject({
            nodes: [new PlotNode("n1", new StoryWordRange(2, 3))],
        });
    });

    it("brings the node back, still selected, when its removal is undone", () => {
        const edits: { undo(): void }[] = [];
        const edited = new vscode.EventEmitter<{ undo(): void }>();
        edited.event((edit) => edits.push(edit));
        const session = openAuthorFileEditorSession(
            vscode.Uri.file(STORY_FILE),
            `<!-- cell: markdown id="c1" -->

She saw the door. He heard the bell.

<!-- cell: plot title="The door" nodes="n1:2-3, n2:6-7" id="p1" -->

She finds the door.
`,
            edited as never,
        );
        session.selectTheStoryAnnotation("plot", "p1");
        session.selectThePassage("plot", "n2");
        new RemoveNodeFromPlotCommand().invoke(session, {
            annotationCellId: "p1",
            nodeId: "n2",
        });

        edits[0].undo();

        expect(session.document.cellWithId("p1")).toMatchObject({
            nodes: [
                new PlotNode("n1", new StoryWordRange(2, 3)),
                new PlotNode("n2", new StoryWordRange(6, 7)),
            ],
        });
        expect(session.theStoryAnnotationsSelected).toEqual({
            "salient-concept": { annotationCellId: null, passageId: null },
            plot: { annotationCellId: "p1", passageId: "n2" },
        });
    });
});
