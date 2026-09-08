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

import { fieldsOfCellKind } from "../../vscode_runtime/storydoc/cell_kinds";
import type { WebviewCell } from "./AuthorFileEditorCanvas";

export interface AuthorFileEditorFindQuery {
    text: string;
    matchCase: boolean;
    wholeWord: boolean;
    regex: boolean;
}

/** One match: which cell, which of its texts, and where in it. */
export interface AuthorFileEditorFindMatch {
    /** The attribute the match is in, or null for the cell's prose. */
    attributeName: string | null;
    cell: number;
    at: number;
    end: number;
}

/** One cell's text written back, in the words the editor's command takes. */
export interface AuthorFileEditorFindReplacement {
    cellId: string;
    attributeName: string | null;
    text: string;
}

/** Where a text is to be marked, and which of its marks the author stands on. */
export interface AuthorFileEditorFindHighlight {
    at: number;
    end: number;
    isCurrent: boolean;
}

/** A run of text that is either marked or not, for a cell that draws no HTML. */
export interface AuthorFileEditorFindMarkedText {
    text: string;
    isMatch: boolean;
    isCurrent: boolean;
}

/**
 * What breaks a word, so that "whole word" here means what it means in the
 * editor next door rather than whatever `\b` happens to do.
 */
const SEPARATORS = "`~!@#$%^&*()-=+[{]}\\|;:'\",.<>/?";

/**
 * The characters a match is fenced with before the text is rendered.
 *
 * Private-use codepoints, because a fence has to be something no manuscript
 * contains and nothing in the markdown renderer treats as syntax.
 */
const OPEN = "\uE000";
const CLOSE = "\uE001";
const OPEN_CURRENT = "\uE002";
const CLOSE_CURRENT = "\uE003";

const FENCED = /\uE000([^\uE000-\uE003]*)\uE001/g;
const FENCED_CURRENT = /\uE002([^\uE000-\uE003]*)\uE003/g;
const STRAY = /[\uE000-\uE003]/g;

export function matchesIn(
    cells: WebviewCell[],
    query: AuthorFileEditorFindQuery,
): AuthorFileEditorFindMatch[] {
    const pattern = patternOf(query);
    if (!pattern) {
        return [];
    }
    const found: AuthorFileEditorFindMatch[] = [];
    cells.forEach((cell, index) => {
        // The facts before the prose, which is the order the file itself is in:
        // the marker line carries the attributes and the text follows under it.
        for (const field of fieldsOfCellKind(cell.kind)) {
            for (const span of spansIn(
                cell.attrs[field.attributeName] ?? "",
                pattern,
                query,
            )) {
                found.push({
                    attributeName: field.attributeName,
                    cell: index,
                    ...span,
                });
            }
        }
        for (const span of spansIn(cell.source, pattern, query)) {
            found.push({ attributeName: null, cell: index, ...span });
        }
    });
    return found;
}

/** One cell's text with one match written over. */
export function replaced(
    cells: WebviewCell[],
    match: AuthorFileEditorFindMatch,
    query: AuthorFileEditorFindQuery,
    replacement: string,
): AuthorFileEditorFindReplacement | null {
    const cell = cells[match.cell];
    if (!cell) {
        return null;
    }
    const text = textOf(cell, match.attributeName);
    return {
        cellId: cell.attrs.id,
        attributeName: match.attributeName,
        text:
            text.slice(0, match.at) +
            expanded(text, match, query, replacement) +
            text.slice(match.end),
    };
}

/**
 * Every text with every match in it written over.
 *
 * One replacement per text rather than per match: the editor is told what a text
 * says now, and a text told twice would keep only the second telling.
 */
export function replacedAll(
    cells: WebviewCell[],
    query: AuthorFileEditorFindQuery,
    replacement: string,
): AuthorFileEditorFindReplacement[] {
    const written = new Map<string, AuthorFileEditorFindReplacement>();
    // Backwards, so that writing over one match does not move the next.
    for (const match of matchesIn(cells, query).reverse()) {
        const cell = cells[match.cell];
        if (!cell) {
            continue;
        }
        const inThisText = `${match.cell} ${match.attributeName ?? ""}`;
        const soFar = written.get(inThisText);
        const text = soFar ? soFar.text : textOf(cell, match.attributeName);
        written.set(inThisText, {
            cellId: cell.attrs.id,
            attributeName: match.attributeName,
            text:
                text.slice(0, match.at) +
                expanded(text, match, query, replacement) +
                text.slice(match.end),
        });
    }
    return [...written.values()];
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

/**
 * The text with its matches fenced off, ready to be rendered.
 *
 * A mark cannot be put in as a tag: the renderer escapes what it is given, as it
 * must. So the spans are fenced with characters that survive escaping, and the
 * page turns them into marks once the HTML exists.
 */
export function fenced(
    text: string,
    highlights: AuthorFileEditorFindHighlight[],
): string {
    let out = text;
    // From the end, so that each fence leaves the offsets before it alone.
    for (const span of [...highlights].sort((a, b) => b.at - a.at)) {
        // A match of nothing but space would turn a blank line into a paragraph.
        if (!text.slice(span.at, span.end).trim()) {
            continue;
        }
        out =
            out.slice(0, span.at) +
            (span.isCurrent ? OPEN_CURRENT : OPEN) +
            out.slice(span.at, span.end) +
            (span.isCurrent ? CLOSE_CURRENT : CLOSE) +
            out.slice(span.end);
    }
    return out;
}

/**
 * The rendered HTML with its fences turned into marks.
 *
 * Only fences that came through rendering in pairs become marks; one that did
 * not — inside a link's address, which is never shown — is dropped rather than
 * left as a half-open tag.
 */
export function markedUp(html: string): string {
    return html
        .replace(
            FENCED_CURRENT,
            '<mark class="author-file-editor-find-match author-file-editor-find-match-current">$1</mark>',
        )
        .replace(
            FENCED,
            '<mark class="author-file-editor-find-match">$1</mark>',
        )
        .replace(STRAY, "");
}

/**
 * The fenced text broken into its marked and unmarked runs.
 *
 * For a cell that shows its text as it was typed rather than as HTML: there is
 * no rendering for a fence to survive, so the runs are handed over as they are
 * and the cell draws the marks itself.
 */
export function markedText(text: string): AuthorFileEditorFindMarkedText[] {
    const runs: AuthorFileEditorFindMarkedText[] = [];
    let run = "";
    let isCurrent: boolean | null = null;
    for (const character of text) {
        if (character === OPEN || character === OPEN_CURRENT) {
            if (run) {
                runs.push({ text: run, isMatch: false, isCurrent: false });
            }
            run = "";
            isCurrent = character === OPEN_CURRENT;
        } else if (character === CLOSE || character === CLOSE_CURRENT) {
            if (run) {
                runs.push({ text: run, isMatch: true, isCurrent: !!isCurrent });
            }
            run = "";
            isCurrent = null;
        } else {
            run += character;
        }
    }
    if (run) {
        runs.push({
            text: run,
            isMatch: isCurrent !== null,
            isCurrent: !!isCurrent,
        });
    }
    return runs;
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
    match: AuthorFileEditorFindMatch,
    query: AuthorFileEditorFindQuery,
    replacement: string,
): string {
    const pattern = query.regex ? patternOf(query) : null;
    if (!pattern) {
        return replacement;
    }
    pattern.lastIndex = match.at;
    const found = pattern.exec(text);
    if (!found || found.index !== match.at) {
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

function textOf(cell: WebviewCell, attributeName: string | null): string {
    return attributeName === null
        ? cell.source
        : (cell.attrs[attributeName] ?? "");
}
