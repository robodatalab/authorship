import { Cell } from "./cell";
import type { CellVisitor } from "./cell_visitor";
import type { StoryWordRange } from "./story_word_range";

export const PLOT = "plot";

export class PlotNode {
    constructor(
        readonly nodeId: string,
        readonly storyWordRange: StoryWordRange,
    ) {}
}

export class PlotEdge {
    constructor(
        readonly edgeId: string,
        readonly fromNodeId: string,
        readonly toNodeId: string,
    ) {}
}

export class PlotCell extends Cell {
    readonly kind = PLOT;

    constructor(
        readonly title: string = "",
        readonly nodes: readonly PlotNode[] = [],
        readonly edges: readonly PlotEdge[] = [],
        source: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(source, folded, at, uniqueId);
    }

    withSource(source: string): PlotCell {
        return new PlotCell(
            this.title,
            this.nodes,
            this.edges,
            source,
            this.folded,
            this.at,
            this.uniqueId,
        );
    }

    withFolded(folded: boolean): PlotCell {
        return new PlotCell(
            this.title,
            this.nodes,
            this.edges,
            this.source,
            folded,
            this.at,
            this.uniqueId,
        );
    }

    withNodeMovedInPlaceOf(nodeId: string, inPlaceOfNodeId: string): PlotCell {
        const nodeMoved = this.nodes.find((node) => node.nodeId === nodeId);
        const placeTaken = this.nodes.findIndex(
            (node) => node.nodeId === inPlaceOfNodeId,
        );
        if (nodeMoved === undefined || placeTaken < 0) {
            return this;
        }
        const nodesLeft = this.nodes.filter((node) => node.nodeId !== nodeId);
        const nodes = [
            ...nodesLeft.slice(0, placeTaken),
            nodeMoved,
            ...nodesLeft.slice(placeTaken),
        ];
        return new PlotCell(
            this.title,
            nodes,
            this.edges,
            this.source,
            this.folded,
            this.at,
            this.uniqueId,
        );
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitPlot(this);
    }
}
