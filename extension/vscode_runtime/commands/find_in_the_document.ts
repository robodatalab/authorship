// Finding and replacing across a document, apart from the page that draws it.
//
// The editor is a webview, and the find widget is the text editor's; nothing
// about Ctrl+F reaches in here. So the widget is ours, and this is what it asks:
// where the matches are, and what a cell says once one is replaced. Free of the
// DOM, so it can be unit tested without a page.

import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { Document } from "../../library/storydoc/storydoc";
import type { SynchronizedRepresentation } from "../../library/storydoc/synchronizers/character_range_synchronizer";
import type { AuthorDocumentCommand } from "./author_document_command";

export interface AuthorFileEditorFindQuery {
    text: string;
    matchCase: boolean;
    wholeWord: boolean;
    regex: boolean;
}

/** One match: which cell, and where in its text. */
export interface AuthorFileEditorFindMatch extends SynchronizedRepresentation {}

/**
 * What breaks a word, so that "whole word" here means what it means in the
 * editor next door rather than whatever `\b` happens to do.
 */
const SEPARATORS = "`~!@#$%^&*()-=+[{]}\\|;:'\",.<>/?";

export class FindInTheDocumentCommand implements AuthorDocumentCommand {
    readonly commandName = "findInTheDocument";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const findMatches = findMatchesIn(
            session.document,
            commandArguments.query as AuthorFileEditorFindQuery,
        );
        session.showFindMatches(findMatches);
    }
}

export class ReplaceFindMatchesCommand implements AuthorDocumentCommand {
    readonly commandName = "replaceFindMatches";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const query = commandArguments.query as AuthorFileEditorFindQuery;
        const replacement = commandArguments.replacement as string;
        const findMatches =
            commandArguments.findMatches as AuthorFileEditorFindMatch[];
        const findMatchesFromTheLast = [...findMatches].reverse();
        session.changeTheDocument((story) => {
            // Backwards, so that writing over one match does not move the next.
            for (const findMatch of findMatchesFromTheLast) {
                const cellIndex = story.cells.findIndex(
                    (cell) => cell.uniqueId === findMatch.cellId,
                );
                if (cellIndex === -1) {
                    continue;
                }
                const cell = story.cells[cellIndex];
                const proseReplaced = replacedIn(
                    cell.source,
                    findMatch.startCharacterOffsetInCell,
                    findMatch.endCharacterOffsetInCell,
                    findMatch.wordsInTheCell,
                    query,
                    replacement,
                );
                story.cells[cellIndex] = cell.withSource(proseReplaced);
            }
        });
    }
}

/**
 * Whether the query is one that can be searched for.
 *
 * A half-typed regular expression is not an error to report — the author is
 * still typing it — but the box says so, the way it does in the editor.
 */
export function isUnderstood(query: AuthorFileEditorFindQuery): boolean {
    return query.text === "" || patternOf(query) !== null;
}

function findMatchesIn(
    document: Document,
    query: AuthorFileEditorFindQuery,
): AuthorFileEditorFindMatch[] {
    const pattern = patternOf(query);
    if (!pattern) {
        return [];
    }
    const found: AuthorFileEditorFindMatch[] = [];
    for (const cell of document.cells) {
        const spans = spansIn(cell.source, pattern, query);
        for (const span of spans) {
            const wordsInTheCell = cell.source.slice(span.at, span.end);
            found.push({
                cellId: cell.uniqueId,
                startCharacterOffsetInCell: span.at,
                endCharacterOffsetInCell: span.end,
                wordsInTheCell,
                isVisible: true,
            });
        }
    }
    return found;
}

function replacedIn(
    text: string,
    at: number,
    end: number,
    words: string,
    query: AuthorFileEditorFindQuery,
    replacement: string,
): string {
    if (text.slice(at, end) !== words) {
        return text;
    }
    const textBefore = text.slice(0, at);
    const replacementWritten = expanded(text, at, query, replacement);
    const textAfter = text.slice(end);
    return textBefore + replacementWritten + textAfter;
}

function patternOf(query: AuthorFileEditorFindQuery): RegExp | null {
    if (!query.text) {
        return null;
    }
    try {
        return new RegExp(
            query.regex
                ? query.text
                : query.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            query.matchCase ? "g" : "gi",
        );
    } catch {
        return null;
    }
}

function spansIn(
    text: string,
    pattern: RegExp,
    query: AuthorFileEditorFindQuery,
): { at: number; end: number }[] {
    const spans: { at: number; end: number }[] = [];
    pattern.lastIndex = 0;
    for (let found = pattern.exec(text); found; found = pattern.exec(text)) {
        // A pattern that can match nothing would otherwise sit on the same spot
        // for ever.
        if (found[0].length === 0) {
            pattern.lastIndex += 1;
            continue;
        }
        const at = found.index;
        const end = at + found[0].length;
        if (!query.wholeWord || isWholeWord(text, at, end)) {
            spans.push({ at, end });
        }
    }
    return spans;
}

/**
 * Whether neither end of the match is in the middle of a word.
 *
 * Only the ends that are word characters are asked about: a search for "-ish"
 * would otherwise be a whole word nowhere, since a dash is a break in a word
 * itself.
 */
function isWholeWord(text: string, at: number, end: number): boolean {
    if (isWordChar(text[at]) && at > 0 && isWordChar(text[at - 1])) {
        return false;
    }
    if (
        isWordChar(text[end - 1]) &&
        end < text.length &&
        isWordChar(text[end])
    ) {
        return false;
    }
    return true;
}

function isWordChar(character: string | undefined): boolean {
    return (
        character !== undefined &&
        !/\s/.test(character) &&
        !SEPARATORS.includes(character)
    );
}

/**
 * What goes in place of a match.
 *
 * Typed text goes in as it was typed — a replacement of "$5" is five dollars.
 * A regular expression is the one case where the author is writing a rule rather
 * than words, and there `$1` and `$&` mean what they mean everywhere else.
 */
function expanded(
    text: string,
    at: number,
    query: AuthorFileEditorFindQuery,
    replacement: string,
): string {
    const pattern = query.regex ? patternOf(query) : null;
    if (!pattern) {
        return replacement;
    }
    pattern.lastIndex = at;
    const found = pattern.exec(text);
    if (!found || found.index !== at) {
        return replacement;
    }
    return replacement.replace(/\$(\$|&|\d)/g, (whole, what: string) => {
        if (what === "$") {
            return "$";
        }
        if (what === "&") {
            return found[0];
        }
        return found[Number(what)] ?? whole;
    });
}
