import type { SendMessagesToVscode } from "./AuthorshipPanelCanvas";
import { AuthorFileEditorCellFields } from "../author_editor/AuthorFileEditorCellFields";
import {
    MarkdownEditor,
    MarkdownEditorMediator,
    useTimesTheHostRewroteIt,
} from "../markdown/MarkdownEditor";
import { fieldsOfCellKind } from "../../vscode_runtime/storydoc/cell_kinds";
import { PLOT } from "../../vscode_runtime/storydoc/model";
import type {
    PlotInTheStory,
    StoryTextSpan,
} from "../../vscode_runtime/storydoc/story_words";
import "./AuthorshipPanelPlots.css";

interface AuthorshipPanelPlotsProps {
    plots: PlotInTheStory[] | null;
    plotSelected: string | null;
    passageSelected: number | null;
    storyTextSelected: StoryTextSpan | null;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorshipPanelPlots({
    plots,
    plotSelected,
    passageSelected,
    storyTextSelected,
    sendMessagesToVscode,
}: AuthorshipPanelPlotsProps) {
    if (plots === null) {
        return <div className="authorship-panel-idle">No manuscript open</div>;
    }
    const plotShown = plots.find((plot) => plot.plotCellId === plotSelected);

    return (
        <div className="authorship-panel-plots">
            <header className="authorship-panel-toolbar">
                <button
                    type="button"
                    className="authorship-panel-toolbar-button"
                    title="Add a plot"
                    aria-label="Add a plot"
                    onClick={() =>
                        sendMessagesToVscode({
                            type: "invoke",
                            commandName: "addPlot",
                            commandArguments: {},
                        })
                    }
                >
                    <i className="codicon codicon-add" />
                </button>
            </header>
            {plots.length === 0 ? (
                <div className="authorship-panel-idle">No plots yet</div>
            ) : (
                <>
                    <ul className="authorship-panel-plots-list authorship-panel-swatches">
                        {plots.map((plot) => (
                            <li
                                key={plot.plotCellId}
                                className={
                                    plot === plotShown
                                        ? "authorship-panel-plot authorship-panel-plot-selected"
                                        : "authorship-panel-plot"
                                }
                            >
                                <button
                                    type="button"
                                    className="authorship-panel-plot-title"
                                    aria-pressed={plot === plotShown}
                                    onClick={() =>
                                        sendMessagesToVscode({
                                            type: "selectPlot",
                                            plotCellId:
                                                plot === plotShown
                                                    ? null
                                                    : plot.plotCellId,
                                        })
                                    }
                                >
                                    <span className="authorship-panel-swatch" />
                                    {plot.title}
                                </button>
                                <span
                                    className="authorship-panel-plot-spans-count"
                                    title="Spans"
                                >
                                    {plot.trajectory.length}
                                </span>
                                <button
                                    type="button"
                                    className="authorship-panel-plot-deleted"
                                    title="Delete this plot"
                                    aria-label="Delete this plot"
                                    onClick={() =>
                                        sendMessagesToVscode({
                                            type: "invoke",
                                            commandName: "deletePlot",
                                            commandArguments: {
                                                plotCellId: plot.plotCellId,
                                            },
                                        })
                                    }
                                >
                                    <i className="codicon codicon-trash" />
                                </button>
                            </li>
                        ))}
                    </ul>
                    {plotShown === undefined ? (
                        <section className="authorship-panel-plot-details">
                            <div className="authorship-panel-idle">
                                Select a plot to see its abstract and trajectory
                            </div>
                        </section>
                    ) : (
                        <AuthorshipPanelPlotDetails
                            key={plotShown.plotCellId}
                            plot={plotShown}
                            passageSelected={passageSelected}
                            storyTextSelected={storyTextSelected}
                            sendMessagesToVscode={sendMessagesToVscode}
                        />
                    )}
                </>
            )}
        </div>
    );
}

interface AuthorshipPanelPlotDetailsProps {
    plot: PlotInTheStory;
    passageSelected: number | null;
    storyTextSelected: StoryTextSpan | null;
    sendMessagesToVscode: SendMessagesToVscode;
}

function AuthorshipPanelPlotDetails({
    plot,
    passageSelected,
    storyTextSelected,
    sendMessagesToVscode,
}: AuthorshipPanelPlotDetailsProps) {
    const abstract = useTimesTheHostRewroteIt(plot.abstract);
    const plotFields = fieldsOfCellKind(PLOT);

    return (
        <section className="authorship-panel-plot-details">
            <AuthorFileEditorCellFields
                fields={plotFields}
                cellAttributes={{ title: plot.title }}
                onAttributeChanged={(attributeName, attributeValue) =>
                    sendMessagesToVscode({
                        type: "invoke",
                        commandName: "replaceAttribute",
                        commandArguments: {
                            cellId: plot.plotCellId,
                            attributeName,
                            attributeValue,
                        },
                    })
                }
            />
            <div className="authorship-panel-plot-abstract">
                <MarkdownEditorMediator onEditingTheCell={() => undefined}>
                    <MarkdownEditor
                        cellId={plot.plotCellId}
                        markdown={plot.abstract}
                        timesTheHostWroteIt={abstract.timesTheHostRewroteIt}
                        onMarkdownCommitted={(markdown) => {
                            abstract.theAuthorTyped(markdown);
                            sendMessagesToVscode({
                                type: "typed",
                                cellId: plot.plotCellId,
                                markdown,
                            });
                        }}
                    />
                </MarkdownEditorMediator>
            </div>
            <div className="authorship-panel-plot-trajectory-heading">
                <h4>Trajectory</h4>
                <button
                    type="button"
                    className="authorship-panel-plot-assign"
                    title="Add the selected words to the trajectory"
                    aria-label="Add the selected words to the trajectory"
                    disabled={storyTextSelected === null}
                    onClick={() =>
                        sendMessagesToVscode({
                            type: "invoke",
                            commandName: "assignStoryTextToThePlot",
                            commandArguments: {
                                plotCellId: plot.plotCellId,
                                ...storyTextSelected,
                            },
                        })
                    }
                >
                    <i className="codicon codicon-add" />
                </button>
            </div>
            {plot.trajectory.length === 0 ? (
                <div className="authorship-panel-idle">
                    No words in the trajectory yet
                </div>
            ) : (
                <ul className="authorship-panel-plot-trajectory">
                    {plot.trajectory.map((storyWordRange, passage) => (
                        <li
                            key={`${storyWordRange.firstWord}-${storyWordRange.lastWord}`}
                            className={
                                passage === passageSelected
                                    ? "authorship-panel-plot-span authorship-panel-plot-span-selected"
                                    : "authorship-panel-plot-span"
                            }
                        >
                            <button
                                type="button"
                                className="authorship-panel-plot-span-shown"
                                title={storyWordRange.wordsItCovers}
                                aria-pressed={passage === passageSelected}
                                onClick={() => {
                                    sendMessagesToVscode({
                                        type: "selectPassage",
                                        passageSelected: passage,
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
                                className="authorship-panel-plot-span-removed"
                                title="Take these words out of the trajectory"
                                aria-label="Take these words out of the trajectory"
                                onClick={() =>
                                    sendMessagesToVscode({
                                        type: "invoke",
                                        commandName:
                                            "removeStoryWordRangeFromThePlot",
                                        commandArguments: {
                                            plotCellId: plot.plotCellId,
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
