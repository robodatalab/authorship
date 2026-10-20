import { useMemo } from "react";
import type { SendMessagesToVscode } from "./AuthorshipPanelCanvas";
import {
    AuthorshipPanelStoryAnnotationsList,
    type AuthorshipPanelStoryAnnotationsListWording,
} from "./AuthorshipPanelStoryAnnotationsList";
import { AuthorshipPanelStoryAnnotationTitleAndDescription } from "./AuthorshipPanelStoryAnnotationTitleAndDescription";
import { StoryAnnotationRetitled } from "./StoryAnnotationRetitled";
import { replaceTheCell } from "../author_editor/AuthorFileEditorCanvas";
import {
    StoryAnnotationsIterator,
    type StoryAnnotationInTheStory,
} from "../../library/storydoc/iterators/story_annotations_iterator";
import { PLOT } from "../../library/storydoc/cells/plot_cell";
import type { StoryAnnotationSelected } from "../../vscode_runtime/story_annotation_selection";
import type { StoryTextSpan } from "../../library/storydoc/iterators/story_words_iterator";
import type { Cell } from "../../library/storydoc/cells/cell";
import type { Document } from "../../library/storydoc/storydoc";
import "./AuthorshipPanelStoryAnnotations.css";

const PLOTS_LIST_WORDING: AuthorshipPanelStoryAnnotationsListWording = {
    addAnAnnotation: "Add a plot",
    noAnnotationsYet: "No plots yet",
    deleteTheAnnotation: "Delete this plot",
    passagesCounted: "Spans",
};
const ADD_THE_WORDS_SELECTED = "Add the selected words to the trajectory";
const TAKE_THE_NODE_OUT = "Take these words out of the trajectory";

interface AuthorshipPanelPlotsProps {
    story: Document | null;
    storyAnnotationSelected: StoryAnnotationSelected;
    storyTextSelected: StoryTextSpan | null;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorshipPanelPlots({
    story,
    storyAnnotationSelected,
    storyTextSelected,
    sendMessagesToVscode,
}: AuthorshipPanelPlotsProps) {
    const plots = useMemo(() => {
        if (story === null) {
            return null;
        }
        const plotsInTheStory = new StoryAnnotationsIterator(story, PLOT);
        return Array.from(plotsInTheStory);
    }, [story]);
    if (story === null || plots === null) {
        return <div className="authorship-panel-idle">No manuscript open</div>;
    }
    const plotShown = plots.find(
        (plot) =>
            plot.annotationCellId === storyAnnotationSelected.annotationCellId,
    );

    function retitleThePlot(plotCellId: string, title: string): void {
        const plotCell = story?.cellWithId(plotCellId);
        if (plotCell === undefined) {
            return;
        }
        const retitling = new StoryAnnotationRetitled(title);
        const retitled = plotCell.accept<Cell>(retitling);
        replaceTheCell(sendMessagesToVscode, retitled);
    }

    return (
        <div className="authorship-panel-story-annotations">
            <AuthorshipPanelStoryAnnotationsList
                cellKind={PLOT}
                storyAnnotations={plots}
                annotationShown={plotShown}
                wording={PLOTS_LIST_WORDING}
                sendMessagesToVscode={sendMessagesToVscode}
            />
            {plots.length > 0 &&
                (plotShown === undefined ? (
                    <section className="authorship-panel-story-annotation-details">
                        <div className="authorship-panel-idle">
                            Select a plot to see its abstract and trajectory
                        </div>
                    </section>
                ) : (
                    <AuthorshipPanelPlot
                        key={plotShown.annotationCellId}
                        plot={plotShown}
                        nodeSelected={storyAnnotationSelected.passage}
                        storyTextSelected={storyTextSelected}
                        onRetitled={(title) =>
                            retitleThePlot(plotShown.annotationCellId, title)
                        }
                        sendMessagesToVscode={sendMessagesToVscode}
                    />
                ))}
        </div>
    );
}

interface AuthorshipPanelPlotProps {
    plot: StoryAnnotationInTheStory;
    nodeSelected: number | null;
    storyTextSelected: StoryTextSpan | null;
    onRetitled: (title: string) => void;
    sendMessagesToVscode: SendMessagesToVscode;
}

function AuthorshipPanelPlot({
    plot,
    nodeSelected,
    storyTextSelected,
    onRetitled,
    sendMessagesToVscode,
}: AuthorshipPanelPlotProps) {
    return (
        <section className="authorship-panel-story-annotation-details">
            <AuthorshipPanelStoryAnnotationTitleAndDescription
                annotationCellId={plot.annotationCellId}
                title={plot.title}
                description={plot.description}
                onRetitled={onRetitled}
                sendMessagesToVscode={sendMessagesToVscode}
            />
            <div className="authorship-panel-story-annotation-passages-heading">
                <h4>Trajectory</h4>
                <button
                    type="button"
                    className="authorship-panel-story-annotation-assign"
                    title={ADD_THE_WORDS_SELECTED}
                    aria-label={ADD_THE_WORDS_SELECTED}
                    disabled={storyTextSelected === null}
                    onClick={() =>
                        sendMessagesToVscode({
                            type: "invoke",
                            commandName: "assignStoryText",
                            commandArguments: {
                                annotationCellId: plot.annotationCellId,
                                ...storyTextSelected,
                            },
                        })
                    }
                >
                    <i className="codicon codicon-add" />
                </button>
            </div>
            {plot.passages.length === 0 ? (
                <div className="authorship-panel-idle">
                    No words in the trajectory yet
                </div>
            ) : (
                <ul className="authorship-panel-story-annotation-passages">
                    {plot.passages.map((storyWordRange, node) => (
                        <li
                            key={`${storyWordRange.firstWord}-${storyWordRange.lastWord}`}
                            className={
                                node === nodeSelected
                                    ? "authorship-panel-story-annotation-passage authorship-panel-story-annotation-passage-selected"
                                    : "authorship-panel-story-annotation-passage"
                            }
                        >
                            <button
                                type="button"
                                className="authorship-panel-story-annotation-passage-shown"
                                title={storyWordRange.wordsItCovers}
                                aria-pressed={node === nodeSelected}
                                onClick={() => {
                                    sendMessagesToVscode({
                                        type: "selectPassage",
                                        cellKind: PLOT,
                                        passage: node,
                                    });
                                    sendMessagesToVscode({
                                        type: "showStoryWordRange",
                                        firstWord: storyWordRange.firstWord,
                                        lastWord: storyWordRange.lastWord,
                                    });
                                }}
                            >
                                {storyWordRange.wordsItCovers}
                            </button>
                            <button
                                type="button"
                                className="authorship-panel-story-annotation-passage-removed"
                                title={TAKE_THE_NODE_OUT}
                                aria-label={TAKE_THE_NODE_OUT}
                                onClick={() =>
                                    sendMessagesToVscode({
                                        type: "invoke",
                                        commandName: "removeStoryWordRange",
                                        commandArguments: {
                                            annotationCellId:
                                                plot.annotationCellId,
                                            firstWord: storyWordRange.firstWord,
                                            lastWord: storyWordRange.lastWord,
                                        },
                                    })
                                }
                            >
                                <i className="codicon codicon-close" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
