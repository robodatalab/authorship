import { Cell } from "./cell";
import type { CellVisitor } from "./cell_visitor";
import type { PlotEdge } from "./plot_edge";
import type { PlotNode } from "./plot_node";

export const PLOT = "plot";

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

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitPlot(this);
    }
}
