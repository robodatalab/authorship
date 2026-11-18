import { describe, expect, it } from "vitest";

import { AddEdgeToPlotCommand } from "../../../extension/vscode_runtime/commands/add_edge_to_plot";
import { AddEventToPlotCommand } from "../../../extension/vscode_runtime/commands/add_event_to_plot";
import { AssignStoryTextToPlotCommand } from "../../../extension/vscode_runtime/commands/assign_story_text_to_plot";
import { RemoveEdgeFromPlotCommand } from "../../../extension/vscode_runtime/commands/remove_edge_from_plot";
import { RemoveNodeFromPlotCommand } from "../../../extension/vscode_runtime/commands/remove_node_from_plot";
import type { AuthorDocumentCommand } from "../../../extension/vscode_runtime/commands/author_document_command";
import type { PlotCell } from "authordoc/cells/plot_cell";
import { openStory } from "./open_story";

const THE_STORY = `<!-- cell: markdown id="c1" -->

She saw the door.

<!-- cell: salient-concept id="k1" title="Motherhood" -->

<!-- cell: character id="v1" title="Varn" -->

<!-- cell: plot title="The door" concepts="k1" characters="v1" edges="x1:e1>e2" id="p1" -->

<ol title="She finds the door.">
<li id="e1">She finds the door.</li>
<li id="e2">She opens the door.</li>
</ol>
`;

describe("the commands that change a plot's events and edges", () => {
    it.each([
        ["adding an edge", new AddEdgeToPlotCommand(), { annotationCellId: "p1", fromNodeId: "e2", toNodeId: "e1" }],
        ["adding an event", new AddEventToPlotCommand(), { annotationCellId: "p1", nodeId: "e3" }],
        [
            "telling an event with the words selected",
            new AssignStoryTextToPlotCommand(),
            { annotationCellId: "p1", cellId: "c1", startCharacterOffsetInCell: 8, endCharacterOffsetInCell: 17 },
        ],
        ["removing an edge", new RemoveEdgeFromPlotCommand(), { annotationCellId: "p1", edgeId: "x1" }],
        ["removing an event", new RemoveNodeFromPlotCommand(), { annotationCellId: "p1", nodeId: "e2" }],
    ] as [string, AuthorDocumentCommand, Record<string, unknown>][])(
        "keep the concepts and the characters the plot references when %s",
        (_, command, commandArguments) => {
            const session = openStory(THE_STORY);

            void command.invoke(session, commandArguments);

            const plot = session.document.cellWithId("p1") as PlotCell;
            expect([plot._concepts, plot._characters]).toEqual([["k1"], ["v1"]]);
        },
    );
});
