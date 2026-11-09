import { useState } from "react";
import {
    invokeAuthorDocumentCommand,
    type SendMessagesToVscode,
} from "./AuthorFileEditorCanvas";
import type { StoryGeneration } from "../../vscode_runtime/story_generation";
import "./AuthorFileEditorStoryGeneration.css";

const ANSWER_THE_STORY_GENERATION = "answerTheStoryGeneration";

interface AuthorFileEditorStoryGenerationProps {
    storyGeneration: StoryGeneration | null;
    sendMessagesToVscode: SendMessagesToVscode;
}

/**
 * The story generation in the main menu, while it runs: the stage it is in and
 * how far along, and, when it waits for the author, the answers they can give.
 * To the story as a step would leave it: accept, revise, saying what should
 * change, or stop. Once they have worked on the story themselves: continue, or
 * stop.
 */
export function AuthorFileEditorStoryGeneration({
    storyGeneration,
    sendMessagesToVscode,
}: AuthorFileEditorStoryGenerationProps) {
    const [revising, startRevising] = useState(false);
    const [comment, writeTheComment] = useState("");
    if (storyGeneration === null) {
        return null;
    }
    const stages = storyGeneration.progress.steps;
    const stage = stages[stages.length - 1];
    const asked = storyGeneration.asked;

    function answer(verdict: string, said: string): void {
        invokeAuthorDocumentCommand(
            sendMessagesToVscode,
            ANSWER_THE_STORY_GENERATION,
            { verdict, comment: said },
        );
        startRevising(false);
        writeTheComment("");
    }

    return (
        <span className="author-file-editor-story-generation">
            {stage !== undefined && (
                <span className="author-file-editor-story-generation-stage">
                    {stage.doing}: step {stage.done + 1} of {stage.of}
                </span>
            )}
            {asked !== null && asked.story === null && (
                <button
                    type="button"
                    className="author-file-editor-story-generation-answer author-file-editor-story-generation-answer-default"
                    onClick={() => answer("accept", "")}
                >
                    Continue
                </button>
            )}
            {asked !== null && asked.story !== null && !revising && (
                <>
                    <button
                        type="button"
                        className="author-file-editor-story-generation-answer author-file-editor-story-generation-answer-default"
                        onClick={() => answer("accept", "")}
                    >
                        Accept
                    </button>
                    <button
                        type="button"
                        className="author-file-editor-story-generation-answer"
                        onClick={() => startRevising(true)}
                    >
                        Revise
                    </button>
                </>
            )}
            {asked !== null && revising && (
                <input
                    type="text"
                    className="author-file-editor-story-generation-comment"
                    placeholder="What should change? Enter sends it"
                    aria-label="What should change"
                    value={comment}
                    autoFocus
                    onChange={(typed) => writeTheComment(typed.target.value)}
                    onKeyDown={(pressed) => {
                        if (pressed.key === "Enter") {
                            answer("revise", comment);
                        }
                    }}
                />
            )}
            {asked !== null && (
                <button
                    type="button"
                    className="author-file-editor-story-generation-answer"
                    onClick={() => answer("stop", "")}
                >
                    Stop
                </button>
            )}
        </span>
    );
}
