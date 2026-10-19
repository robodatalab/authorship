// Finding and replacing across a document, apart from the page that draws it.
//
// The editor is a webview, and the find widget is the text editor's; nothing
// about Ctrl+F reaches in here. So the widget is ours, and this is what it asks:
// where the matches are, and what a cell says once one is replaced. Free of the
// DOM, so it can be unit tested without a page.
//
// A cell holds two kinds of text and both are searched. The prose is the obvious
// one. The other is the facts it records — a chapter's title is in the document
// as much as the chapter is, and an author renaming a character must not have to
// rename them twice.

import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { SynchronizedRepresentation } from "../storydoc/synchronizers/character_range_synchronizer";
import { fieldsOfCellKind } from "../storydoc/cell_kinds";
import type { ImmutableAuthorDocument } from "../storydoc/model";
import type { AuthorDocumentCommand } from "./author_document_command";

export interface AuthorFileEditorFindQuery {
    text: string;
    matchCase: boolean;
    wholeWord: boolean;
    regex: boolean;
}

export interface AuthorFileEditorFindMatchInTheProse extends SynchronizedRepresentation {
    attributeName: null;
}

export interface AuthorFileEditorFindMatchInAField {
    cellId: string;
    attributeName: string;
    startCharacterOffsetInField: number;
    endCharacterOffsetInField: number;
    wordsInTheField: string;
}

/** One match: which cell, which of its texts, and where in it. */
export type AuthorFileEditorFindMatch =
    AuthorFileEditorFindMatchInTheProse | AuthorFileEditorFindMatchInAField;

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
                const cell = story.cellWithId(findMatch.cellId);
                if (!cell) {
                    continue;
                }
                if (findMatch.attributeName === null) {
                    const proseReplaced = replacedIn(
                        cell.source,
                        findMatch.startCharacterOffsetInCell,
                        findMatch.endCharacterOffsetInCell,
                        findMatch.wordsInTheCell,
                        query,
                        replacement,
                    );
                    cell.replaceMarkdown(proseReplaced);
                } else {
                    const fieldReplaced = replacedIn(
                        cell.attrs[findMatch.attributeName] ?? "",
                        findMatch.startCharacterOffsetInField,
                        findMatch.endCharacterOffsetInField,
                        findMatch.wordsInTheField,
                        query,
                        replacement,
                    );
                    cell.replaceAttribute(
                        findMatch.attributeName,
                        fieldReplaced,
                    );
                }
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
    document: ImmutableAuthorDocument,
    query: AuthorFileEditorFindQuery,
): AuthorFileEditorFindMatch[] {
    const pattern = patternOf(query);
    if (!pattern) {
        return [];
    }
    const found: AuthorFileEditorFindMatch[] = [];
    for (const cell of document.cells) {
        // The facts before the prose, which is the order the file itself is in:
        // the marker line carries the attributes and the text follows under it.
        for (const field of fieldsOfCellKind(cell.kind)) {
            const fieldText = cell.attrs[field.attributeName] ?? "";
            for (const span of spansIn(fieldText, pattern, query)) {
                found.push({
                    cellId: cell.uniqueId,
                    attributeName: field.attributeName,
                    startCharacterOffsetInField: span.at,
                    endCharacterOffsetInField: span.end,
                    wordsInTheField: fieldText.slice(span.at, span.end),
                });
            }
        }
        for (const span of spansIn(cell.source, pattern, query)) {
            found.push({
                cellId: cell.uniqueId,
                attributeName: null,
                startCharacterOffsetInCell: span.at,
                endCharacterOffsetInCell: span.end,
                wordsInTheCell: cell.source.slice(span.at, span.end),
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
