import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useWhereTheMarkdownEditorsDrawTheirText } from "../markdown/MarkdownEditor";
import type { StoryTextSpan } from "../../library/storydoc/iterators/story_words_iterator";
import "./AuthorFileEditorOverviewRuler.css";

const OVERVIEW_RULER_COLORS_THE_STYLESHEET_DEFINES = 6;
const THINNEST_MARK_PX = 3;
const MARKS_START_AT_PX = 4;
const MARK_WIDTH_PX = 10;
const ARROWS_START_AT_PX = MARKS_START_AT_PX + MARK_WIDTH_PX + 2;
const ARROW_LANE_WIDTH_PX = 6;
const WHERE_AN_ARROW_LEAVES_A_MARK = 0.75;
const WHERE_AN_ARROW_ARRIVES_AT_A_MARK = 0.25;

export interface AuthorFileEditorOverviewRulerMark {
    storyText: StoryTextSpan[];
    highlightColor: number;
    dimmed: boolean;
}

export interface AuthorFileEditorOverviewRulerArrow {
    fromMark: number;
    toMark: number;
}

interface AuthorFileEditorOverviewRulerProps {
    scrolledList: RefObject<HTMLElement | null>;
    marks: AuthorFileEditorOverviewRulerMark[];
    arrows: AuthorFileEditorOverviewRulerArrow[];
}

interface ArrowOnTheRuler {
    leavesAt: number;
    arrivesAt: number;
    lane: number;
    highlightColor: number;
}

interface DrawnOnTheRuler {
    top: number;
    height: number;
}

function colorClassName(highlightColor: number): string {
    return `author-file-editor-overview-ruler-color-${highlightColor % OVERVIEW_RULER_COLORS_THE_STYLESHEET_DEFINES}`;
}

export function AuthorFileEditorOverviewRuler({
    scrolledList,
    marks,
    arrows,
}: AuthorFileEditorOverviewRulerProps) {
    const drawnOn = useRef<HTMLDivElement>(null);
    const { whereTheTextIsDrawn, timesTheEditorsWereDrawn } =
        useWhereTheMarkdownEditorsDrawTheirText();
    const [marksOnTheRuler, placeTheMarks] = useState<
        (DrawnOnTheRuler | null)[]
    >([]);
    const [areaInView, showTheAreaInView] = useState<DrawnOnTheRuler | null>(
        null,
    );

    useLayoutEffect(() => {
        const ruler = drawnOn.current;
        const list = scrolledList.current;
        if (!ruler || !list) {
            return;
        }
        const rulerPixelsPerListPixel = (): number => {
            const rulerDrawnAt = ruler.getBoundingClientRect();
            return list.scrollHeight > 0
                ? rulerDrawnAt.height / list.scrollHeight
                : 0;
        };
        const showWhatIsInView = (): void => {
            const scale = rulerPixelsPerListPixel();
            const top = list.scrollTop * scale;
            const height = list.clientHeight * scale;
            showTheAreaInView((before) =>
                before?.top === top && before.height === height
                    ? before
                    : { top, height },
            );
        };
        const placeEveryMark = (): void => {
            const listDrawnAt = list.getBoundingClientRect();
            const scale = rulerPixelsPerListPixel();
            const placed = marks.map((mark) => {
                const firstSpan = mark.storyText[0];
                const lastSpan = mark.storyText[mark.storyText.length - 1];
                if (!firstSpan || !lastSpan) {
                    return null;
                }
                const firstSpanDrawnAt = whereTheTextIsDrawn(
                    firstSpan.cellId,
                    firstSpan.startCharacterOffsetInCell,
                    firstSpan.endCharacterOffsetInCell,
                );
                const lastSpanDrawnAt = whereTheTextIsDrawn(
                    lastSpan.cellId,
                    lastSpan.startCharacterOffsetInCell,
                    lastSpan.endCharacterOffsetInCell,
                );
                if (!firstSpanDrawnAt || !lastSpanDrawnAt) {
                    return null;
                }
                const top =
                    (firstSpanDrawnAt.startsAt.top -
                        listDrawnAt.top +
                        list.scrollTop) *
                    scale;
                const bottom =
                    (lastSpanDrawnAt.endsAt.bottom -
                        listDrawnAt.top +
                        list.scrollTop) *
                    scale;
                return {
                    top,
                    height: Math.max(THINNEST_MARK_PX, bottom - top),
                };
            });
            const placedAsWritten = JSON.stringify(placed);
            placeTheMarks((before) =>
                JSON.stringify(before) === placedAsWritten ? before : placed,
            );
        };
        const drawTheRuler = (): void => {
            placeEveryMark();
            showWhatIsInView();
        };
        drawTheRuler();
        list.addEventListener("scroll", showWhatIsInView);
        const watching = new ResizeObserver(drawTheRuler);
        watching.observe(list);
        const cellsDrawn = list.querySelectorAll("li[data-cell-id]");
        for (const cellDrawn of cellsDrawn) {
            watching.observe(cellDrawn);
        }
        return () => {
            list.removeEventListener("scroll", showWhatIsInView);
            watching.disconnect();
        };
    }, [marks, scrolledList, whereTheTextIsDrawn, timesTheEditorsWereDrawn]);

    const arrowsBetweenMarks = arrows.flatMap((arrow) => {
        const leaves = marksOnTheRuler[arrow.fromMark];
        const arrives = marksOnTheRuler[arrow.toMark];
        const markArrivedAt = marks[arrow.toMark];
        if (!leaves || !arrives || !markArrivedAt) {
            return [];
        }
        return [
            {
                leavesAt:
                    leaves.top + leaves.height * WHERE_AN_ARROW_LEAVES_A_MARK,
                arrivesAt:
                    arrives.top +
                    arrives.height * WHERE_AN_ARROW_ARRIVES_AT_A_MARK,
                highlightColor: markArrivedAt.highlightColor,
            },
        ];
    });
    const arrowsOnTheRuler: ArrowOnTheRuler[] = [];
    for (const arrow of arrowsBetweenMarks) {
        const top = Math.min(arrow.leavesAt, arrow.arrivesAt);
        const bottom = Math.max(arrow.leavesAt, arrow.arrivesAt);
        const lanesTaken = arrowsOnTheRuler
            .filter(
                (drawn) =>
                    Math.min(drawn.leavesAt, drawn.arrivesAt) <= bottom &&
                    top <= Math.max(drawn.leavesAt, drawn.arrivesAt),
            )
            .map((drawn) => drawn.lane);
        let lane = ARROWS_START_AT_PX + ARROW_LANE_WIDTH_PX;
        while (lanesTaken.includes(lane)) {
            lane += ARROW_LANE_WIDTH_PX;
        }
        arrowsOnTheRuler.push({ ...arrow, lane });
    }

    return (
        <div
            ref={drawnOn}
            className="author-file-editor-overview-ruler"
            aria-hidden="true"
        >
            <svg className="author-file-editor-overview-ruler-drawing">
                {areaInView && (
                    <rect
                        className="author-file-editor-overview-ruler-area-in-view"
                        x={0}
                        y={areaInView.top}
                        width="100%"
                        height={areaInView.height}
                    />
                )}
                {marks.map((mark, markIndex) => {
                    const placed = marksOnTheRuler[markIndex];
                    if (!placed) {
                        return null;
                    }
                    const markColor = colorClassName(mark.highlightColor);
                    return (
                        <rect
                            key={markIndex}
                            className={
                                mark.dimmed
                                    ? `author-file-editor-overview-ruler-mark author-file-editor-overview-ruler-mark-dimmed ${markColor}`
                                    : `author-file-editor-overview-ruler-mark ${markColor}`
                            }
                            x={MARKS_START_AT_PX}
                            y={placed.top}
                            width={MARK_WIDTH_PX}
                            height={placed.height}
                        />
                    );
                })}
                {arrowsOnTheRuler.map((arrow, arrowIndex) => (
                    <g
                        key={arrowIndex}
                        className={`author-file-editor-overview-ruler-arrow ${colorClassName(arrow.highlightColor)}`}
                    >
                        <path
                            className="author-file-editor-overview-ruler-arrow-line"
                            d={`M ${ARROWS_START_AT_PX} ${arrow.leavesAt} H ${arrow.lane} V ${arrow.arrivesAt} H ${ARROWS_START_AT_PX}`}
                        />
                        <path
                            className="author-file-editor-overview-ruler-arrowhead"
                            d={`M ${ARROWS_START_AT_PX} ${arrow.arrivesAt} l 5 -3 v 6 z`}
                        />
                    </g>
                ))}
            </svg>
        </div>
    );
}
