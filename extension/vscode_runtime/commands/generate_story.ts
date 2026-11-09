import * as vscode from "vscode";

import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { AuthorDocumentCommand } from "./author_document_command";
import { awaitServerJob, startServerJob } from "../server/jobs";
import type {
    StoryGeneration,
    StoryGenerationAsked,
} from "../story_generation";
import { StoryWordsIterator } from "authordoc/iterators/story_words_iterator";

// Brings what the generation asks into view: the story as a step would leave
// it, to review, and the part of authorship the step changed, or the author is
// to work in. The sidebar draws its own part of it.
function showWhatTheStoryGenerationAsks(
    session: AuthorFileEditorSession,
    asked: StoryGenerationAsked,
): void {
    if (asked.story !== null) {
        session.importDocumentFromText(asked.story);
    }
    const shown = asked.shown;
    if (shown.kind === "annotation") {
        session.selectTheStoryAnnotation(shown.cellKind, shown.annotationCellId);
        session.selectThePassage(shown.cellKind, shown.passageId);
    } else if (shown.kind === "cell") {
        const cell = session.document.cellWithId(shown.cellId)!;
        const storyWords = new StoryWordsIterator(session.document);
        const cellWords = storyWords.rangeBetween(
            shown.cellId,
            0,
            cell.source.length,
        );
        if (cellWords) {
            session.showTheStoryWordRange(cellWords);
        }
    }
}

export class GenerateStoryCommand implements AuthorDocumentCommand {
    readonly commandName = "generateStory";
    readonly buttonGroup = "generate";
    readonly iconClassName = "codicon codicon-sparkle";
    readonly tooltip = "Generate the story with you, stage by stage";

    async invoke(session: AuthorFileEditorSession): Promise<void> {
        // The question last brought into view: every one is acted on once,
        // however many times the job is polled while it waits for the author.
        let numberShown = 0;
        try {
            await session.writeTheDocumentToItsFile();
            const jobId = await startServerJob("/generate/story", {
                path: session.document.path,
            });
            await awaitServerJob<StoryGeneration>(
                "/generate/story/status",
                jobId,
                (storyGeneration) => {
                    const asked = storyGeneration.asked;
                    if (asked !== null && asked.number !== numberShown) {
                        numberShown = asked.number;
                        showWhatTheStoryGenerationAsks(session, asked);
                    }
                    session.showTheStoryGeneration(storyGeneration);
                },
            );
        } catch (failure) {
            void vscode.window.showErrorMessage(
                `Cannot generate the story — is the server running? (${failure instanceof Error ? failure.message : String(failure)})`,
            );
        } finally {
            session.showTheStoryGeneration(null);
            // A story shown for review and not accepted gives way to the story
            // as the generation saved it.
            await session.readTheDocumentBackFromItsFile();
        }
    }
}
