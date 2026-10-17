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
