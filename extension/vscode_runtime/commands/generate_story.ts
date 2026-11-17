import * as vscode from "vscode";

import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { AuthorDocumentCommand } from "./author_document_command";
import { awaitServerJob, startServerJob } from "../server/jobs";
import { fetchFromServer } from "../server/fetch";
import type {
    StoryGeneration,
    StoryGenerationAsked,
} from "../story_generation";

// Opens the Authorship panel in the sidebar: VS Code gives every view a command
// that focuses it.
const OPEN_THE_AUTHORSHIP_PANEL = "authorship.manuscript.focus";

// Brings what the generation asks into view: the story as a stage leaves it,
// to review, in the editor, and the part of authorship the stage worked in. A
// tab, or a command in it, is shown in the Authorship panel, which is opened on
// it and draws its own part of it.
function showWhatTheStoryGenerationAsks(
    session: AuthorFileEditorSession,
    asked: StoryGenerationAsked,
): void {
    session.importDocumentFromText(asked.story);
    if (asked.shown.kind !== "editor") {
        void vscode.commands.executeCommand(OPEN_THE_AUTHORSHIP_PANEL);
    }
}

function showTheFailureToGenerate(failure: unknown): void {
    void vscode.window.showErrorMessage(
        `Cannot generate the story — is the server running? (${failure instanceof Error ? failure.message : String(failure)})`,
    );
}

function leftOff(storyGeneration: StoryGeneration): StoryGeneration | null {
    const stagesDone = storyGeneration.stages.filter((stage) => stage.done);
    const someStagesDoneAndSomeNot =
        stagesDone.length > 0 &&
        stagesDone.length < storyGeneration.stages.length;
    return someStagesDoneAndSomeNot ? storyGeneration : null;
}

async function followTheStoryGeneration(
    session: AuthorFileEditorSession,
    path: string,
): Promise<void> {
    try {
        await awaitServerJob<StoryGeneration>(
            "/generate/story/status",
            path,
            (storyGeneration) => session.showTheStoryGeneration(storyGeneration),
        );
    } catch (failure) {
        showTheFailureToGenerate(failure);
    }
}

export async function showWhereTheStoryGenerationStands(
    session: AuthorFileEditorSession,
): Promise<void> {
    const path = session.uri.fsPath;
    let storyGeneration: StoryGeneration;
    try {
        storyGeneration = await fetchFromServer<StoryGeneration>(
            `/generate/story/status?id=${encodeURIComponent(path)}`,
        );
    } catch {
        session.showTheStoryGeneration(null);
        return;
    }
    if (storyGeneration.running) {
        await followTheStoryGeneration(session, path);
        if (session.isShownInItsEditor) {
            await showWhereTheStoryGenerationStands(session);
        }
        return;
    }
    const asked = storyGeneration.asked;
    if (asked !== null) {
        showWhatTheStoryGenerationAsks(session, asked);
        session.showTheStoryGeneration(storyGeneration);
        return;
    }
    const storyGenerationLeftOff = leftOff(storyGeneration);
    session.showTheStoryGeneration(storyGenerationLeftOff);
}

export class GenerateStoryCommand implements AuthorDocumentCommand {
    readonly commandName = "generateStory";
    readonly buttonGroup = "generate";
    readonly iconClassName = "codicon codicon-wand";
    readonly tooltip = "Generate the story with you, stage by stage";

    async invoke(session: AuthorFileEditorSession): Promise<void> {
        try {
            await session.writeTheDocumentToItsFile();
            await startServerJob("/generate/story", {
                path: session.document.path,
            });
        } catch (failure) {
            showTheFailureToGenerate(failure);
            return;
        }
        await showWhereTheStoryGenerationStands(session);
    }
}
