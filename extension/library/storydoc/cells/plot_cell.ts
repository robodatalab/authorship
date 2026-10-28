import { Cell } from "./cell";
import type { CellVisitor } from "./cell_visitor";
import { StoryWordRange } from "./story_word_range";
import {
    attributesIn,
    writtenAttributeValue,
} from "../written_attributes";

export const PLOT = "plot";

// A plot's body is its overview and its events, written to a rigid schema, one
// element to a line:
//
//     <ol title="How Captain Varn gave her life to buy her daughter time.">
//     <li id="e1" timestamp="1.1" location="earth, Varn's house" words="412-468">Captain Varn watches the news with her daughter.</li>
//     <li id="e2" timestamp="1.2" location="earth, command center">Varn is given command of the corvette.</li>
//     </ol>
//
// The attributes are written as a cell marker's are, and an event's summary is
// the rest of its line, up to the closing tag. The timestamps are a clock the
// whole manuscript shares, so a plot skips the moments nothing happens in it;
// the location runs from the broadest place to the most specific; and `words`
// are the story's words that tell the event, once there are any.
const ATTRIBUTES = String.raw`((?:\s+[A-Za-z0-9][A-Za-z0-9_-]*\s*=\s*"(?:[^"\\]|\\.)*")*)\s*`;
const EVENTS_OPENED = new RegExp(String.raw`^<ol${ATTRIBUTES}>$`);
const EVENT = new RegExp(String.raw`^<li${ATTRIBUTES}>(.*)</li>$`);
const EVENTS_CLOSED = "</ol>";
const EVENT_WORDS = /^(\d+)-(\d+)$/;

const OVERVIEW = "title";
const EVENT_ID = "id";
const TIMESTAMP = "timestamp";
const LOCATION = "location";
const WORDS = "words";

export class PlotNode {
    constructor(
        readonly nodeId: string,
        readonly storyWordRange: StoryWordRange | null,
        readonly timestamp: string = "",
        readonly location: string = "",
        readonly summary: string = "",
    ) {}

    withStoryWordRange(storyWordRange: StoryWordRange | null): PlotNode {
        return new PlotNode(
            this.nodeId,
            storyWordRange,
            this.timestamp,
            this.location,
            this.summary,
        );
    }

    withTimestamp(timestamp: string): PlotNode {
        return new PlotNode(
            this.nodeId,
            this.storyWordRange,
            timestamp,
            this.location,
            this.summary,
        );
    }

    withLocation(location: string): PlotNode {
        return new PlotNode(
            this.nodeId,
            this.storyWordRange,
            this.timestamp,
            location,
            this.summary,
        );
    }

    withSummary(summary: string): PlotNode {
        return new PlotNode(
            this.nodeId,
            this.storyWordRange,
            this.timestamp,
            this.location,
            summary,
        );
    }
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
        readonly overview: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(writtenPlotBody(overview, nodes), folded, at, uniqueId);
    }

    /** The plot whose body is `body`: its overview and events read from it. */
    static fromBody(
        title: string,
        edges: readonly PlotEdge[],
        body: string,
        folded: boolean,
        at: readonly [number, number] | null,
        uniqueId: string,
    ): PlotCell {
        const [overview, nodes] = plotBodyRead(body);
        return new PlotCell(title, nodes, edges, overview, folded, at, uniqueId);
    }

    withSource(source: string): PlotCell {
        return PlotCell.fromBody(
            this.title,
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
            this.overview,
            folded,
            this.at,
            this.uniqueId,
        );
    }

    withOverview(overview: string): PlotCell {
        return new PlotCell(
            this.title,
            this.nodes,
            this.edges,
            overview,
            this.folded,
            this.at,
            this.uniqueId,
        );
    }

    /** The plot with `node` in place of its event of the same id. */
    withNode(node: PlotNode): PlotCell {
        const nodes = this.nodes.map((nodeInThePlot) =>
            nodeInThePlot.nodeId === node.nodeId ? node : nodeInThePlot,
        );
        return new PlotCell(
            this.title,
            nodes,
            this.edges,
            this.overview,
            this.folded,
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
            this.overview,
            this.folded,
            this.at,
            this.uniqueId,
        );
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitPlot(this);
    }
}

/**
 * A plot's body as the schema writes it; nothing at all for a plot with neither
 * an overview nor events.
 */
export function writtenPlotBody(
    overview: string,
    nodes: readonly PlotNode[],
): string {
    if (overview === "" && nodes.length === 0) {
        return "";
    }
    const opened = `<ol${writtenAttributes([[OVERVIEW, overview]])}>`;
    const events = nodes.map(writtenPlotEvent);
    return [opened, ...events, EVENTS_CLOSED].join("\n");
}

/**
 * The overview and the events a plot's body holds. A body that is not a list of
 * events — one written before plots had events, or one never given any — is
 * all overview.
 */
export function plotBodyRead(body: string): [string, PlotNode[]] {
    const lines = body
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "");
    const opened = lines.length > 0 ? EVENTS_OPENED.exec(lines[0]) : null;
    if (opened === null) {
        return [body, []];
    }
    const overview = attributesIn(opened[1])[OVERVIEW] ?? "";
    const nodes: PlotNode[] = [];
    for (const line of lines.slice(1)) {
        if (line === EVENTS_CLOSED) {
            break;
        }
        const event = EVENT.exec(line);
        if (event === null) {
            continue;
        }
        const node = plotEventRead(event[1], event[2]);
        nodes.push(node);
    }
    return [overview, nodes];
}

function plotEventRead(writtenAttributes: string, summary: string): PlotNode {
    const attributes = attributesIn(writtenAttributes);
    const nodeId = attributes[EVENT_ID] || crypto.randomUUID();
    const words = EVENT_WORDS.exec(attributes[WORDS] ?? "");
    const storyWordRange =
        words === null
            ? null
            : new StoryWordRange(Number(words[1]), Number(words[2]));
    return new PlotNode(
        nodeId,
        storyWordRange,
        attributes[TIMESTAMP] ?? "",
        attributes[LOCATION] ?? "",
        summary.trim(),
    );
}

function writtenPlotEvent(node: PlotNode): string {
    const words =
        node.storyWordRange === null
            ? ""
            : `${node.storyWordRange.firstWord}-${node.storyWordRange.lastWord}`;
    const attributes = writtenAttributes([
        [EVENT_ID, node.nodeId],
        [TIMESTAMP, node.timestamp],
        [LOCATION, node.location],
        [WORDS, words],
    ]);
    // An event is one line, so a summary is too.
    const summary = node.summary.replace(/\s*\n\s*/g, " ");
    return `<li${attributes}>${summary}</li>`;
}

function writtenAttributes(attributes: readonly [string, string][]): string {
    return attributes
        .filter(([, value]) => value !== "")
        .map(([name, value]) => ` ${name}="${writtenAttributeValue(value)}"`)
        .join("");
}
