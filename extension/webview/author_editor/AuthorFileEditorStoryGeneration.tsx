import {
    invokeAuthorDocumentCommand,
    type SendMessagesToVscode,
} from "./AuthorFileEditorCanvas";
import type { StoryGeneration } from "../../vscode_runtime/story_generation";
import "./AuthorFileEditorStoryGeneration.css";

const ANSWER_THE_STORY_GENERATION = "answerTheStoryGeneration";
const GENERATE_STORY = "generateStory";

// How every stage is drawn: finished, the one the generation is at, or to come.
const ICON_OF_EACH_STATE: Record<string, string> = {
    done: "codicon codicon-pass-filled",
    working: "codicon codicon-loading codicon-modifier-spin",
    asking: "codicon codicon-circle-filled",
    "left-off": "codicon codicon-debug-pause",
    "to-come": "codicon codicon-circle-outline",
};

interface AuthorFileEditorStoryGenerationProps {
    storyGeneration: StoryGeneration | null;
    sendMessagesToVscode: SendMessagesToVscode;
}

/**
 * The story generation, in a row of its own under the main menu's tools, while
 * it runs. Every stage of the workflow, in order: those finished, the one it is
 * at, and those to come. Under them, what the stage it is at does: while it
 * works, how far along it is; once it is done, what the author is to do, and the
 * answers they can give: accept the story as they leave it, edits included, or
 * stop. Asked to do something themselves, with a command highlighted, the
 * author continues once done.
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
    const asked = storyGeneration.asked;
    const running = storyGeneration.running;

    function answer(verdict: string): void {
        invokeAuthorDocumentCommand(
            sendMessagesToVscode,
            ANSWER_THE_STORY_GENERATION,
            { verdict },
        );
    }

    function whatTheStageDoes(): string {
        if (!running) {
            return "left off here";
        }
        if (asked !== null && asked.shown.kind === "command") {
            return "use the highlighted button, then continue";
        }
        if (asked !== null) {
            return "review it, edit what you like, then accept";
        }
        if (stageProgress?.doing === stageAt?.name) {
            return `step ${stageProgress.done + 1} of ${stageProgress.of}`;
        }
        return "starting";
    }

    const stageDoes = whatTheStageDoes();
    const stateOfTheStageAt = !running
        ? "left-off"
        : asked === null
          ? "working"
          : "asking";

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
                        {`${stageAt.name}: ${stageDoes}`}
                    </span>
                    {!running && (
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
                                onClick={() => answer("stop")}
                            >
                                Stop
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
