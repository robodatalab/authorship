import type { Document } from "authordoc/storydoc";

const RAIL_TITLE_WIDTH = 140;
const COLUMN_WIDTH = 180;
const BOX_MARGIN = 12;
const BOX_HEIGHT = 32;
const BOX_GAP = 8;
const RAIL_PADDING = 10;
const TIME_ROW_HEIGHT = 28;
const NO_RAIL = "";
const NO_RAIL_TITLE = "None";
const NO_MOMENT_WRITTEN = "–";

export class StoryGraphEvent {
    constructor(
        readonly eventId: string,
        readonly moment: number | null,
        readonly momentWritten: string,
        readonly summary: string,
        readonly plotIds: readonly string[],
        readonly characterIds: readonly string[],
        readonly placeId: string,
    ) {}
}

export class StoryGraphRail {
    constructor(
        readonly railId: string,
        readonly title: string,
        readonly top: number,
        readonly height: number,
    ) {}
}

export class StoryGraphColumn {
    constructor(
        readonly momentWritten: string,
        readonly middle: number,
    ) {}
}

export class StoryGraphBox {
    constructor(
        readonly eventId: string,
        readonly railId: string,
        readonly summary: string,
        readonly left: number,
        readonly top: number,
        readonly width: number,
        readonly height: number,
    ) {}
}

export class StoryGraphArrow {
    constructor(
        readonly fromEventId: string,
        readonly toEventId: string,
        readonly path: string,
    ) {}
}

interface StoryGraphEventsOfTheStory {
    events: StoryGraphEvent[];
    eventIdOfEachNode: Map<string, string>;
}

function momentOf(timestamp: string): number | null {
    const moment = Number(timestamp);
    const isAMoment = timestamp.trim() !== "" && !Number.isNaN(moment);
    return isAMoment ? moment : null;
}

function union(first: readonly string[], second: readonly string[]): string[] {
    const onlyInTheSecond = second.filter((id) => !first.includes(id));
    return [...first, ...onlyInTheSecond];
}

function nodeKey(plotId: string, nodeId: string): string {
    return `${plotId}/${nodeId}`;
}

function eventsOfTheStory(story: Document): StoryGraphEventsOfTheStory {
    const eventOfEachMeeting = new Map<string, StoryGraphEvent>();
    const eventIdOfEachNode = new Map<string, string>();
    for (const plot of story.plots()) {
        for (const node of plot.nodes) {
            const moment = momentOf(node.timestamp);
            const meeting =
                moment !== null && node.placeId !== ""
                    ? `${moment}@${node.placeId}`
                    : nodeKey(plot.uniqueId, node.nodeId);
            const met = eventOfEachMeeting.get(meeting);
            const plotIds = union(met?.plotIds ?? [], [plot.uniqueId]);
            const characterIds = union(met?.characterIds ?? [], node.characterIds);
            const event = new StoryGraphEvent(
                meeting,
                moment,
                met?.momentWritten ?? node.timestamp,
                met?.summary ?? node.summary,
                plotIds,
                characterIds,
                node.placeId,
            );
            eventOfEachMeeting.set(meeting, event);
            const key = nodeKey(plot.uniqueId, node.nodeId);
            eventIdOfEachNode.set(key, meeting);
        }
    }
    const events = [...eventOfEachMeeting.values()];
    return { events, eventIdOfEachNode };
}

function momentsOfTheColumns(events: readonly StoryGraphEvent[]): (number | null)[] {
    const moments = events.flatMap((event) =>
        event.moment === null ? [] : [event.moment],
    );
    const distinct = new Set(moments);
    const inOrder = [...distinct].sort((earlier, later) => earlier - later);
    const someHaveNoMoment = events.some((event) => event.moment === null);
    return someHaveNoMoment ? [...inOrder, null] : inOrder;
}

function edgesBetweenTheEvents(
    story: Document,
    eventIdOfEachNode: Map<string, string>,
): (readonly [string, string])[] {
    const edgeOfEachPair = new Map<string, readonly [string, string]>();
    for (const plot of story.plots()) {
        for (const edge of plot.edges) {
            const fromKey = nodeKey(plot.uniqueId, edge.fromNodeId);
            const toKey = nodeKey(plot.uniqueId, edge.toNodeId);
            const fromEventId = eventIdOfEachNode.get(fromKey);
            const toEventId = eventIdOfEachNode.get(toKey);
            if (
                fromEventId === undefined ||
                toEventId === undefined ||
                fromEventId === toEventId
            ) {
                continue;
            }
            edgeOfEachPair.set(`${fromEventId}>${toEventId}`, [
                fromEventId,
                toEventId,
            ]);
        }
    }
    const edges = [...edgeOfEachPair.values()];
    return edges;
}

function pathBetween(from: StoryGraphBox, to: StoryGraphBox): string {
    const leavesAtX = from.left + from.width;
    const leavesAtY = from.top + from.height / 2;
    const arrivesAtX = to.left;
    const arrivesAtY = to.top + to.height / 2;
    const turnsAtX = (leavesAtX + arrivesAtX) / 2;
    return `M ${leavesAtX} ${leavesAtY} H ${turnsAtX} V ${arrivesAtY} H ${arrivesAtX}`;
}

function boxPairsOfTheEdge(
    boxesLeft: readonly StoryGraphBox[],
    boxesReached: readonly StoryGraphBox[],
): (readonly [StoryGraphBox, StoryGraphBox])[] {
    const railsShared = boxesLeft
        .map((box) => box.railId)
        .filter((railId) => boxesReached.some((box) => box.railId === railId));
    if (railsShared.length === 0) {
        const [firstLeft] = boxesLeft;
        return boxesReached.map((reached) => [firstLeft, reached] as const);
    }
    return railsShared.map((railId) => {
        const left = boxesLeft.find((box) => box.railId === railId)!;
        const reached = boxesReached.find((box) => box.railId === railId)!;
        return [left, reached] as const;
    });
}

export class StoryGraphLayout {
    readonly events: readonly StoryGraphEvent[];
    readonly columns: readonly StoryGraphColumn[];
    readonly rails: readonly StoryGraphRail[];
    readonly boxes: readonly StoryGraphBox[];
    readonly arrows: readonly StoryGraphArrow[];
    readonly width: number;
    readonly height: number;

    constructor(
        story: Document,
        railsOfTheKind: readonly (readonly [string, string])[],
        railIdsOfTheEvent: (event: StoryGraphEvent) => readonly string[],
    ) {
        const { events, eventIdOfEachNode } = eventsOfTheStory(story);
        this.events = events;

        const columnMoments = momentsOfTheColumns(events);
        this.columns = columnMoments.map((moment, column) => {
            const firstAtTheMoment = events.find((event) => event.moment === moment);
            const momentWritten =
                moment === null
                    ? NO_MOMENT_WRITTEN
                    : (firstAtTheMoment?.momentWritten ?? "");
            const middle = RAIL_TITLE_WIDTH + column * COLUMN_WIDTH + COLUMN_WIDTH / 2;
            return new StoryGraphColumn(momentWritten, middle);
        });

        const railIdsOfTheKind = railsOfTheKind.map(([railId]) => railId);
        const railIdsOfEachEvent = new Map<string, readonly string[]>();
        for (const event of events) {
            const railIds = railIdsOfTheEvent(event);
            const ofTheKind = railIds.filter((railId) =>
                railIdsOfTheKind.includes(railId),
            );
            const railed = ofTheKind.length > 0 ? ofTheKind : [NO_RAIL];
            railIdsOfEachEvent.set(event.eventId, railed);
        }
        const railedEvents = [...railIdsOfEachEvent.values()];
        const someEventIsOnNoRail = railedEvents.some((railed) =>
            railed.includes(NO_RAIL),
        );
        const railsShown: (readonly [string, string])[] = someEventIsOnNoRail
            ? [...railsOfTheKind, [NO_RAIL, NO_RAIL_TITLE]]
            : [...railsOfTheKind];

        const stackOfEachBox = new Map<string, number>();
        const boxesAtEachSpot = new Map<string, number>();
        for (const event of events) {
            const column = columnMoments.indexOf(event.moment);
            for (const railId of railIdsOfEachEvent.get(event.eventId)!) {
                const spot = `${railId}#${column}`;
                const stack = boxesAtEachSpot.get(spot) ?? 0;
                boxesAtEachSpot.set(spot, stack + 1);
                stackOfEachBox.set(`${event.eventId}#${railId}`, stack);
            }
        }

        let railTop = TIME_ROW_HEIGHT;
        const rails: StoryGraphRail[] = [];
        for (const [railId, title] of railsShown) {
            const stacksOnTheRail = columnMoments.map(
                (_moment, column) => boxesAtEachSpot.get(`${railId}#${column}`) ?? 0,
            );
            const deepest = Math.max(1, ...stacksOnTheRail);
            const height =
                2 * RAIL_PADDING + deepest * BOX_HEIGHT + (deepest - 1) * BOX_GAP;
            const rail = new StoryGraphRail(railId, title, railTop, height);
            rails.push(rail);
            railTop += height;
        }
        this.rails = rails;

        const boxes: StoryGraphBox[] = [];
        for (const event of events) {
            const column = columnMoments.indexOf(event.moment);
            for (const railId of railIdsOfEachEvent.get(event.eventId)!) {
                const rail = rails.find((shown) => shown.railId === railId)!;
                const stack = stackOfEachBox.get(`${event.eventId}#${railId}`)!;
                const left = RAIL_TITLE_WIDTH + column * COLUMN_WIDTH + BOX_MARGIN;
                const top = rail.top + RAIL_PADDING + stack * (BOX_HEIGHT + BOX_GAP);
                const width = COLUMN_WIDTH - 2 * BOX_MARGIN;
                const box = new StoryGraphBox(
                    event.eventId,
                    railId,
                    event.summary,
                    left,
                    top,
                    width,
                    BOX_HEIGHT,
                );
                boxes.push(box);
            }
        }
        this.boxes = boxes;

        const arrows: StoryGraphArrow[] = [];
        const edges = edgesBetweenTheEvents(story, eventIdOfEachNode);
        for (const [fromEventId, toEventId] of edges) {
            const boxesLeft = boxes.filter((box) => box.eventId === fromEventId);
            const boxesReached = boxes.filter((box) => box.eventId === toEventId);
            const pairs = boxPairsOfTheEdge(boxesLeft, boxesReached);
            for (const [left, reached] of pairs) {
                const path = pathBetween(left, reached);
                const arrow = new StoryGraphArrow(fromEventId, toEventId, path);
                arrows.push(arrow);
            }
        }
        this.arrows = arrows;

        this.width = RAIL_TITLE_WIDTH + columnMoments.length * COLUMN_WIDTH;
        this.height = railTop;
    }
}
