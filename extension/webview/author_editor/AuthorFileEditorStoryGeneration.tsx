import {
    invokeAuthorDocumentCommand,
    type SendMessagesToVscode,
} from "./AuthorFileEditorCanvas";
import type { StoryGeneration } from "../../vscode_runtime/story_generation";
import { onTheClock } from "../elapsed_time";
import "./AuthorFileEditorStoryGeneration.css";

const ANSWER_THE_STORY_GENERATION = "answerTheStoryGeneration";
const GENERATE_STORY = "generateStory";
const QUIT_THE_STORY_GENERATION = "quitTheStoryGeneration";

// How every stage is drawn: finished, the one the generation is at, or to come.
const ICON_OF_EACH_STATE: Record<string, string> = {
    done: "codicon codicon-pass-filled",
    working: "codicon codicon-loading codicon-modifier-spin",
    asking: "codicon codicon-circle-filled",
    "left-off": "codicon codicon-debug-pause",
    "to-come": "codicon codicon-circle-outline",
};

function rateOfTheSteps(secondsPerStep: number | null): string {
    if (secondsPerStep === null || secondsPerStep === 0) {
        return "?it/s";
    }
    if (secondsPerStep > 1) {
        return `${secondsPerStep.toFixed(2)}s/it`;
    }
    const stepsPerSecond = 1 / secondsPerStep;
    return `${stepsPerSecond.toFixed(2)}it/s`;
}

interface AuthorFileEditorStoryGenerationProps {
    storyGeneration: StoryGeneration | null;
    sendMessagesToVscode: SendMessagesToVscode;
}

/**
 * The story generation, in a row of its own under the main menu's tools, while
 * it runs. Every stage of the workflow, in order: those finished, the one it is
 * at, and those to come. Under them, what the stage it is at does: while it
 * works, how far along it is; once it is done, what the author is to do, and the
 * answers they can give: accept the story as they leave it, edits included,
 * reject it, or have the stage run again. Asked to do something themselves,
 * with a command highlighted, the author continues once done. Whatever the
 * stage is doing, the author can quit the generation altogether.
 */
export function AuthorFileEditorStoryGeneration({
    storyGeneration,
    sendMessagesToVscode,
}: AuthorFileEditorStoryGenerationProps) {
    if (storyGeneration === null) {
        return null;
    }
    const stages = storyGeneration.stages;
    const currentStage = stages.findIndex((stage) => !stage.done);
    const stageAt = stages[currentStage];
    const progress = storyGeneration.progress.steps;
    const stageProgress = progress[progress.length - 1];
    const progressOfTheStageAt =
        stageProgress?.doing === stageAt?.name ? stageProgress : undefined;
    const stepsDone = progressOfTheStageAt?.done ?? 0;
    const stepsOf = progressOfTheStageAt?.of ?? null;
    const workInTheStep = progressOfTheStageAt?.steps.at(-1);
    const shareOfTheStepDone =
        workInTheStep?.state === "running" && workInTheStep.of
            ? workInTheStep.done / workInTheStep.of
            : 0;
    const shareOfTheStageDone = stepsOf
        ? (stepsDone + shareOfTheStepDone) / stepsOf
        : 0;
    const percentOfTheStageDone = shareOfTheStageDone * 100;
    const wholePercentOfTheStageDone = Math.round(percentOfTheStageDone);
    const secondsTheStageHasTaken = progressOfTheStageAt?.seconds ?? 0;
    const secondsPerStep = progressOfTheStageAt?.secondsPerItem ?? null;
    const stepsLeft =
        stepsOf === null ? null : stepsOf - stepsDone - shareOfTheStepDone;
    const timeTheStageHasTaken = onTheClock(secondsTheStageHasTaken);
    const timeTheStageHasLeft =
        stepsLeft === null || secondsPerStep === null
            ? "?"
            : onTheClock(stepsLeft * secondsPerStep);
    const rateOfTheStage = rateOfTheSteps(secondsPerStep);
    const stepsOfTheStage = `${stepsDone}/${stepsOf ?? "?"}`;
    const asked = storyGeneration.asked;
    const running = storyGeneration.running;

    function answer(verdict: string): void {
        invokeAuthorDocumentCommand(
            sendMessagesToVscode,
            ANSWER_THE_STORY_GENERATION,
            { verdict },
        );
    }

    function whatTheStageDoes(): string | null {
        if (asked === null) {
            return "left off here";
        }
        if (asked.shown.kind === "command") {
            return null;
        }
        return "review it, edit what you like, then accept";
    }

    const stageDoes = whatTheStageDoes();
    const stateOfTheStageAt = running
        ? "working"
        : asked !== null
          ? "asking"
          : "left-off";

    return (
        <div className="author-file-editor-story-generation">
            <ol className="author-file-editor-story-generation-stages">
                {stages.map((stage, index) => {
                    const state = stage.done
                        ? "done"
                        : index === currentStage
                          ? stateOfTheStageAt
                          : "to-come";
                    return (
                        <li
                            key={stage.name}
                            className={`author-file-editor-story-generation-stage author-file-editor-story-generation-stage-${state}`}
                            aria-current={
                                index === currentStage ? "step" : undefined
                            }
                        >
                            <i className={ICON_OF_EACH_STATE[state]} />
                            {stage.name}
                        </li>
                    );
                })}
            </ol>
            {stageAt !== undefined && (
                <div className="author-file-editor-story-generation-status">
                    <span className="author-file-editor-story-generation-doing">
                        {stateOfTheStageAt === "working" || stageDoes === null
                            ? stageAt.name
                            : `${stageAt.name}: ${stageDoes}`}
                    </span>
                    {stateOfTheStageAt === "working" && (
                        <>
                            <span className="author-file-editor-story-generation-progress-percent">
                                {`${wholePercentOfTheStageDone}%`}
                            </span>
                            <div
                                className="author-file-editor-story-generation-progress"
                                role="progressbar"
                                aria-valuenow={wholePercentOfTheStageDone}
                            >
                                <div
                                    className="author-file-editor-story-generation-progress-done"
                                    style={{ width: `${percentOfTheStageDone}%` }}
                                />
                            </div>
                            <span className="author-file-editor-story-generation-progress-steps-and-time">
                                {`${stepsOfTheStage} [${timeTheStageHasTaken}<${timeTheStageHasLeft}, ${rateOfTheStage}]`}
                            </span>
                        </>
                    )}
                    {stateOfTheStageAt === "left-off" && (
                        <button
                            type="button"
                            className="author-file-editor-story-generation-answer author-file-editor-story-generation-answer-default"
                            onClick={() =>
                                invokeAuthorDocumentCommand(
                                    sendMessagesToVscode,
                                    GENERATE_STORY,
                                    {},
                                )
                            }
                        >
                            Resume
                        </button>
                    )}
                    {asked !== null && (
                        <>
                            <button
                                type="button"
                                className="author-file-editor-story-generation-answer author-file-editor-story-generation-answer-default"
                                onClick={() => answer("accept")}
                            >
                                {asked.shown.kind === "command"
                                    ? "Continue"
                                    : "Accept"}
                            </button>
                            <button
                                type="button"
                                className="author-file-editor-story-generation-answer"
                                onClick={() => answer("reject")}
                            >
                                Reject
                            </button>
                            {asked.shown.kind !== "command" && (
                                <button
                                    type="button"
                                    className="author-file-editor-story-generation-answer"
                                    title="Throw away what this stage made and run it again"
                                    onClick={() => answer("restart")}
                                >
                                    Restart
                                </button>
                            )}
                        </>
                    )}
                    <button
                        type="button"
                        className="author-file-editor-story-generation-answer"
                        title="Quit the story generation altogether"
                        onClick={() =>
                            invokeAuthorDocumentCommand(
                                sendMessagesToVscode,
                                QUIT_THE_STORY_GENERATION,
                                {},
                            )
                        }
                    >
                        Quit
                    </button>
                </div>
            )}
        </div>
    );
}
