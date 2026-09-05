import * as vscode from "vscode";

import { authorFileEditorSession } from "../author_file_editor_session";
import { AuthorDocumentProseError, placeInDocument } from "../prose/model";
import {
    awaitModelServerJob,
    startModelServerJob,
    type ModelServerJob,
} from "../server/jobs";
import type { AuthorDocument } from "../storydoc/model";
import type { AuthorDocumentCommand } from "./author_document_command";

/** A place in the file, which is how the server says where anything is. */
interface At {
    line: number;
    character: number;
}

/** One thing a pass found. */
interface Finding {
    rule: string;
    kind: string;
    message: string;
    detail: string;
    at: At;
    end: At;
    replacements?: string[];
}

interface ProseCheckJob extends ModelServerJob {
    findings?: Finding[];
}

export class CheckProseCommand implements AuthorDocumentCommand {
    readonly name = "checkProse";
    readonly category = "manuscript";
    readonly iconClassName = "codicon codicon-checklist";
    readonly tooltip =
        "Check Prose — read the manuscript for grammar and repetition";

    /**
     * Read the whole document and mark what the passes found.
     *
     * The text goes with the request rather than the path alone: a check only
     * reads, and saving a manuscript because a paragraph was worth a second look
     * would be the editor writing files the author did not ask it to.
     *
     * The rules answer in milliseconds and the model in seconds, so they are two
     * passes rather than one, and what the second finds joins the first.
     */
    async invoke(document: AuthorDocument): Promise<void> {
        const session = authorFileEditorSession(document);
        if (!session) {
            return;
        }
        try {
            const rules = await checked("/check/prose", document);
            session.proseCheck.replace(errorsFound(document, rules, 0));
            const read = await checked("/check/grammar", document);
            session.proseCheck.add(errorsFound(document, read, rules.length));
        } catch (err: unknown) {
            void vscode.window.showErrorMessage(
                `Could not check the prose: ${describe(err)}`,
            );
        }
    }
}

async function checked(
    pass: string,
    document: AuthorDocument,
): Promise<Finding[]> {
    const id = await startModelServerJob(pass, {
        path: document.uri.fsPath,
        text: document.text,
        selection: null,
    });
    return (
        (await awaitModelServerJob<ProseCheckJob>(`${pass}/status`, id))
            .findings ?? []
    );
}

/**
 * The findings as errors on the cells they were found in.
 *
 * A finding the two ends of which fall in different cells is about the layout
 * rather than about the prose, and is dropped.
 */
function errorsFound(
    document: AuthorDocument,
    findings: Finding[],
    firstId: number,
): AuthorDocumentProseError[] {
    return findings.flatMap((finding, found) => {
        const from = placeInDocument(
            document,
            finding.at.line,
            finding.at.character,
        );
        const to = placeInDocument(
            document,
            finding.end.line,
            finding.end.character,
        );
        if (!from || !to || from.cell !== to.cell) {
            return [];
        }
        return [
            new AuthorDocumentProseError(
                firstId + found,
                finding.rule,
                finding.kind,
                from.cell,
                from.offset,
                to.offset,
                finding.message,
                finding.detail,
                finding.replacements ?? [],
            ),
        ];
    });
}

function describe(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
