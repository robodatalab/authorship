// Finding and replacing, on the page.
//
// The editor is a webview and the find widget is the text editor's; nothing
// about Ctrl+F reaches in here. So the widget is ours: this is the box, the keys
// that open it, and the state that says which match the author is standing on.
// Where the matches themselves are is AuthorFileEditorFind, which is free of the
// DOM and tested without one.

import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import {
    isUnderstood,
    matchesIn,
    replaced,
    replacedAll,
} from "./AuthorFileEditorFind";
import type {
    AuthorFileEditorFindMatch,
    AuthorFileEditorFindQuery,
    AuthorFileEditorFindReplacement,
} from "./AuthorFileEditorFind";
import {
    invokeAuthorDocumentCommand,
    type SendMessagesToVscode,
    type WebviewCell,
} from "./AuthorFileEditorCanvas";
import "./AuthorFileEditorFindBar.css";

const NOTHING_LOOKED_FOR: AuthorFileEditorFindQuery = {
    text: "",
    matchCase: false,
    wholeWord: false,
    regex: false,
};

export interface WhatTheAuthorFileEditorIsFinding {
    query: AuthorFileEditorFindQuery;
    askFor: (query: AuthorFileEditorFindQuery) => void;
    isSearching: boolean;
    found: AuthorFileEditorFindMatch[];
    current: AuthorFileEditorFindMatch | null;
    open: (withReplace: boolean) => void;
    close: () => void;
    step: (by: number) => void;
    replaceCurrent: (replacement: string) => void;
    replaceEverywhere: (replacement: string) => void;
    isReplaceShown: boolean;
    showReplace: (shown: boolean) => void;
    lookedForBox: RefObject<HTMLInputElement | null>;
}

/**
 * What is being looked for, and where it is.
 *
 * The query outlives the widget being shut, as it does in the editor next door —
 * an author who closes the box and opens it again is looking for the same thing.
 *
 * Where the author stands is kept as a place in the document rather than a
 * number: an edit anywhere above them would otherwise renumber the matches under
 * their feet and send them back to a chapter they had finished with.
 */
export function useAuthorFileEditorFind(
    cells: WebviewCell[],
    sendMessagesToVscode: SendMessagesToVscode,
): WhatTheAuthorFileEditorIsFinding {
    const [query, askFor] = useState(NOTHING_LOOKED_FOR);
    const [isSearching, search] = useState(false);
    const [isReplaceShown, showReplace] = useState(false);
    const [placeStoodOn, standOn] = useState<AuthorFileEditorFindMatch | null>(
        null,
    );
    const lookedForBox = useRef<HTMLInputElement>(null);

    const found = useMemo(
        () => (isSearching ? matchesIn(cells, query) : []),
        [cells, query, isSearching],
    );
    const current = placeStoodOn
        ? (found[nextFrom(found, placeStoodOn)] ?? null)
        : (found[0] ?? null);

    function write(replacements: AuthorFileEditorFindReplacement[]): void {
        if (replacements.length > 0) {
            invokeAuthorDocumentCommand(sendMessagesToVscode, "replaceTexts", {
                texts: replacements,
            });
        }
    }

    function open(withReplace: boolean): void {
        const seed = selectedText();
        if (seed) {
            askFor({ ...query, text: seed });
        }
        search(true);
        if (withReplace) {
            showReplace(true);
        }
        // Opening a box that is already open puts the author back in it, the way
        // pressing the key again does in the editor next door. On the first
        // opening there is no box yet, and the widget takes the focus as it is
        // drawn.
        lookedForBox.current?.focus();
        lookedForBox.current?.select();
    }

    function close(): void {
        search(false);
        standOn(null);
    }

    function step(by: number): void {
        if (found.length === 0) {
            return;
        }
        const at = current ? found.indexOf(current) : 0;
        standOn(found[(at + by + found.length) % found.length]);
    }

    function replaceCurrent(replacement: string): void {
        if (!current) {
            return;
        }
        const written = replaced(cells, current, query, replacement);
        if (!written) {
            return;
        }
        write([written]);
        // Past what was just written, not at it: replacing "the" with "there"
        // would otherwise land on the match it had just made and never move on.
        standOn({ ...current, at: current.at + replacement.length });
    }

    useEffect(() => {
        const pressed = (event: KeyboardEvent): void => {
            if (isReplaceKey(event)) {
                event.preventDefault();
                open(true);
            } else if (isFindKey(event)) {
                event.preventDefault();
                open(false);
            } else if (isSearching && event.key === "Escape") {
                event.preventDefault();
                close();
            } else if (isSearching && event.key === "F3") {
                event.preventDefault();
                step(event.shiftKey ? -1 : 1);
            }
        };
        document.addEventListener("keydown", pressed);
        return () => document.removeEventListener("keydown", pressed);
    });

    // Bringing the current match on screen without taking the focus off the box:
    // the author is still typing what they are looking for, and a match that took
    // the caret with it would put the next keystroke in the manuscript.
    useEffect(() => {
        document
            .querySelector(
                ".author-file-editor-find-match-current, .author-file-editor-find-field-current",
            )
            ?.scrollIntoView({ block: "center" });
    }, [current?.cell, current?.attributeName, current?.at]);

    return {
        query,
        askFor,
        isSearching,
        found,
        current,
        isReplaceShown,
        showReplace,
        lookedForBox,
        open,
        close,
        step,
        replaceCurrent,
        replaceEverywhere: (replacement: string) =>
            write(replacedAll(cells, query, replacement)),
    };
}

/** Ctrl+F, and Cmd+F on a Mac. */
function isFindKey(event: KeyboardEvent): boolean {
    return (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "f"
    );
}

/** Ctrl+H, and Cmd+Alt+F on a Mac, where Cmd+H is the system's own. */
function isReplaceKey(event: KeyboardEvent): boolean {
    if (event.altKey) {
        // Alt makes the key itself say something else on a Mac; what is meant is
        // where the key is on the keyboard.
        return (event.ctrlKey || event.metaKey) && event.code === "KeyF";
    }
    return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "h";
}

/** The first match at or after a place, wrapping to the top when there is none. */
function nextFrom(
    found: AuthorFileEditorFindMatch[],
    place: AuthorFileEditorFindMatch,
): number {
    const at = found.findIndex(
        (match) =>
            match.cell > place.cell ||
            (match.cell === place.cell && match.at >= place.at),
    );
    return at >= 0 ? at : 0;
}

/**
 * What the author has selected, when it is a line of it worth searching for.
 *
 * The box seeds itself from the selection the way the editor's does. Its own
 * selection is not a seed — opening find twice would then search for whatever it
 * had already highlighted in the box.
 */
function selectedText(): string {
    const focused = document.activeElement;
    if (focused instanceof HTMLInputElement) {
        return "";
    }
    const text = window.getSelection()?.toString() ?? "";
    return text.includes("\n") ? "" : text;
}

interface AuthorFileEditorFindBarProps {
    find: WhatTheAuthorFileEditorIsFinding;
}

export function AuthorFileEditorFindBar({
    find,
}: AuthorFileEditorFindBarProps) {
    const [replacement, replaceWith] = useState("");
    const written = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (find.isSearching) {
            find.lookedForBox.current?.focus();
            find.lookedForBox.current?.select();
        }
    }, [find.isSearching]);

    useEffect(() => {
        if (find.isReplaceShown) {
            written.current?.focus();
        }
    }, [find.isReplaceShown]);

    if (!find.isSearching) {
        return null;
    }

    const nothingToStepThrough = find.found.length === 0;
    const at = find.current ? find.found.indexOf(find.current) : -1;

    return (
        <div className="author-file-editor-find">
            <button
                type="button"
                className="author-file-editor-find-toggle"
                title="Toggle Replace"
                aria-label="Toggle Replace"
                aria-expanded={find.isReplaceShown}
                onClick={() => find.showReplace(!find.isReplaceShown)}
            >
                <i
                    className={
                        find.isReplaceShown
                            ? "codicon codicon-chevron-down"
                            : "codicon codicon-chevron-right"
                    }
                />
            </button>
            <div className="author-file-editor-find-rows">
                <div className="author-file-editor-find-row">
                    <div
                        className={
                            isUnderstood(find.query)
                                ? "author-file-editor-find-box"
                                : "author-file-editor-find-box author-file-editor-find-box-invalid"
                        }
                    >
                        <input
                            ref={find.lookedForBox}
                            type="text"
                            className="author-file-editor-find-input"
                            placeholder="Find"
                            aria-label="Find"
                            value={find.query.text}
                            onChange={(event) =>
                                find.askFor({
                                    ...find.query,
                                    text: event.currentTarget.value,
                                })
                            }
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.preventDefault();
                                    find.step(event.shiftKey ? -1 : 1);
                                }
                            }}
                        />
                        <AuthorFileEditorFindOption
                            iconClassName="codicon codicon-case-sensitive"
                            label="Match Case"
                            isOn={find.query.matchCase}
                            turn={(on) =>
                                find.askFor({ ...find.query, matchCase: on })
                            }
                        />
                        <AuthorFileEditorFindOption
                            iconClassName="codicon codicon-whole-word"
                            label="Match Whole Word"
                            isOn={find.query.wholeWord}
                            turn={(on) =>
                                find.askFor({ ...find.query, wholeWord: on })
                            }
                        />
                        <AuthorFileEditorFindOption
                            iconClassName="codicon codicon-regex"
                            label="Use Regular Expression"
                            isOn={find.query.regex}
                            turn={(on) =>
                                find.askFor({ ...find.query, regex: on })
                            }
                        />
                    </div>
                    <span className="author-file-editor-find-count">
                        {!find.query.text
                            ? ""
                            : nothingToStepThrough
                              ? "No results"
                              : `${at + 1} of ${find.found.length}`}
                    </span>
                    <AuthorFileEditorFindAction
                        iconClassName="codicon codicon-arrow-up"
                        label="Previous Match"
                        isDisabled={nothingToStepThrough}
                        act={() => find.step(-1)}
                    />
                    <AuthorFileEditorFindAction
                        iconClassName="codicon codicon-arrow-down"
                        label="Next Match"
                        isDisabled={nothingToStepThrough}
                        act={() => find.step(1)}
                    />
                    <AuthorFileEditorFindAction
                        iconClassName="codicon codicon-close"
                        label="Close"
                        isDisabled={false}
                        act={find.close}
                    />
                </div>
                {find.isReplaceShown && (
                    <div className="author-file-editor-find-row">
                        <div className="author-file-editor-find-box">
                            <input
                                ref={written}
                                type="text"
                                className="author-file-editor-find-input"
                                placeholder="Replace"
                                aria-label="Replace"
                                value={replacement}
                                onChange={(event) =>
                                    replaceWith(event.currentTarget.value)
                                }
                                onKeyDown={(event) => {
                                    if (event.key !== "Enter") {
                                        return;
                                    }
                                    event.preventDefault();
                                    if (
                                        event.ctrlKey ||
                                        event.metaKey ||
                                        event.altKey
                                    ) {
                                        find.replaceEverywhere(replacement);
                                    } else {
                                        find.replaceCurrent(replacement);
                                    }
                                }}
                            />
                        </div>
                        <AuthorFileEditorFindAction
                            iconClassName="codicon codicon-replace"
                            label="Replace"
                            isDisabled={nothingToStepThrough}
                            act={() => find.replaceCurrent(replacement)}
                        />
                        <AuthorFileEditorFindAction
                            iconClassName="codicon codicon-replace-all"
                            label="Replace All"
                            isDisabled={nothingToStepThrough}
                            act={() => find.replaceEverywhere(replacement)}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

interface AuthorFileEditorFindOptionProps {
    iconClassName: string;
    label: string;
    isOn: boolean;
    turn: (on: boolean) => void;
}

function AuthorFileEditorFindOption({
    iconClassName,
    label,
    isOn,
    turn,
}: AuthorFileEditorFindOptionProps) {
    return (
        <button
            type="button"
            className={
                isOn
                    ? "author-file-editor-find-option author-file-editor-find-option-on"
                    : "author-file-editor-find-option"
            }
            title={label}
            aria-label={label}
            aria-pressed={isOn}
            onClick={() => turn(!isOn)}
        >
            <i className={iconClassName} />
        </button>
    );
}

interface AuthorFileEditorFindActionProps {
    iconClassName: string;
    label: string;
    isDisabled: boolean;
    act: () => void;
}

function AuthorFileEditorFindAction({
    iconClassName,
    label,
    isDisabled,
    act,
}: AuthorFileEditorFindActionProps) {
    return (
        <button
            type="button"
            className="author-file-editor-find-action"
            title={label}
            aria-label={label}
            disabled={isDisabled}
            onClick={act}
        >
            <i className={iconClassName} />
        </button>
    );
}
