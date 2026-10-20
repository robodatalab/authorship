import type { PlotEdge } from "../../library/storydoc/cells/plot_cell";

export class PlotEdgeInALane {
    constructor(
        readonly edgeId: string,
        readonly fromRow: number,
        readonly toRow: number,
        readonly lane: number,
    ) {}
}

export class PlotTrajectoryLanes {
    readonly laneOfEachNode: readonly number[];
    readonly edgesInLanes: readonly PlotEdgeInALane[];
    readonly lanesTaken: number;

    constructor(nodeIds: readonly string[], edges: readonly PlotEdge[]) {
        const edgesBetweenRows = edges
            .map((edge) => ({
                edgeId: edge.edgeId,
                fromRow: nodeIds.indexOf(edge.fromNodeId),
                toRow: nodeIds.indexOf(edge.toNodeId),
            }))
            .filter(
                ({ fromRow, toRow }) =>
                    fromRow >= 0 && toRow >= 0 && fromRow !== toRow,
            )
            .map(({ edgeId, fromRow, toRow }) => ({
                edgeId,
                fromRow,
                toRow,
                topRow: Math.min(fromRow, toRow),
                bottomRow: Math.max(fromRow, toRow),
            }));
        const laneOfEachEdge = new Map<string, number>();
        const laneOfEachNode: number[] = [];
        nodeIds.forEach((_nodeId, row) => {
            const lanesPassingThrough = edgesBetweenRows
                .filter((edge) => edge.topRow < row && row < edge.bottomRow)
                .map((edge) => laneOfEachEdge.get(edge.edgeId)!);
            const lanesEndingHere = edgesBetweenRows
                .filter((edge) => edge.bottomRow === row)
                .map((edge) => laneOfEachEdge.get(edge.edgeId)!);
            const nodeLane =
                lanesEndingHere.length > 0
                    ? Math.min(...lanesEndingHere)
                    : firstLaneFree(lanesPassingThrough);
            laneOfEachNode.push(nodeLane);
            const edgesStartingHere = edgesBetweenRows
                .filter((edge) => edge.topRow === row)
                .sort((one, other) => one.bottomRow - other.bottomRow);
            const lanesTakenBelow = [...lanesPassingThrough];
            for (const edge of edgesStartingHere) {
                const edgeLane = lanesTakenBelow.includes(nodeLane)
                    ? firstLaneFree(lanesTakenBelow)
                    : nodeLane;
                laneOfEachEdge.set(edge.edgeId, edgeLane);
                lanesTakenBelow.push(edgeLane);
            }
        });
        this.laneOfEachNode = laneOfEachNode;
        this.edgesInLanes = edgesBetweenRows.map(
            (edge) =>
                new PlotEdgeInALane(
                    edge.edgeId,
                    edge.fromRow,
                    edge.toRow,
                    laneOfEachEdge.get(edge.edgeId)!,
                ),
        );
        const lanesOfEdges = this.edgesInLanes.map((edge) => edge.lane);
        const lastLane = Math.max(-1, ...laneOfEachNode, ...lanesOfEdges);
        this.lanesTaken = lastLane + 1;
    }
}

function firstLaneFree(lanesTaken: readonly number[]): number {
    let lane = 0;
    while (lanesTaken.includes(lane)) {
        lane += 1;
    }
    return lane;
}
