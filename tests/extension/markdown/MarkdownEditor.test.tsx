import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ProseCheckError } from "../../../extension/vscode_runtime/commands/check_prose";

vi.mock(
    "monaco-editor/editor/contrib/multicursor/browser/multicursor.js",
    () => ({}),
);
vi.mock("monaco-editor/languages/definitions/markdown/markdown.js", () => ({
    conf: {},
    language: {},
}));
vi.mock("monaco-editor/editor/editor.api", async () => {
    const { monacoEditorApi } = await import("./monaco_editor_double");
    return monacoEditorApi();
});

const { monacoEditorsOnThePage } = await import("./monaco_editor_double");

const {
    MarkdownEditor,
    MarkdownEditorMediator,
    useWhereTheMarkdownEditorsDrawTheirText,
} = await import("../../../extension/webview/markdown/MarkdownEditor");

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;

function emptyBody(): HTMLElement {
    document.body.innerHTML = "";
    const container = document.createElement("div");
    document.body.append(container);
    return container;
}

function committedSpy() {
    return vi.fn();
}

async function mount(
    markdown: string,
    onMarkdownCommitted = committedSpy(),
): Promise<ReturnType<typeof committedSpy>> {
    root = createRoot(emptyBody());
    await render(markdown, onMarkdownCommitted);
    return onMarkdownCommitted;
}

async function render(
    markdown: string,
    onMarkdownCommitted: ReturnType<typeof committedSpy>,
    timesTheHostWroteIt = 0,
): Promise<void> {
    await act(async () => {
        root.render(
            <MarkdownEditorMediator onEditingTheCell={() => undefined}>
                <MarkdownEditor
                    cellId="c1"
                    markdown={markdown}
                    timesTheHostWroteIt={timesTheHostWroteIt}
                    onMarkdownCommitted={onMarkdownCommitted}
                >
                    {(text) => <div className="rendered">{text}</div>}
                </MarkdownEditor>
            </MarkdownEditorMediator>,
        );
    });
}

async function mountAll(
    editors: { markdown: string; committed: ReturnType<typeof committedSpy> }[],
): Promise<void> {
    root = createRoot(emptyBody());
    await act(async () => {
        root.render(
            <MarkdownEditorMediator onEditingTheCell={() => undefined}>
                {editors.map((editor, editorIndex) => (
                    <MarkdownEditor
                        key={editorIndex}
                        cellId={`c${editorIndex}`}
                        markdown={editor.markdown}
                        onMarkdownCommitted={editor.committed}
                    >
                        {(text) => <div className="rendered">{text}</div>}
                    </MarkdownEditor>
                ))}
            </MarkdownEditorMediator>,
        );
    });
}

function rendered(): HTMLElement | null {
    return document.querySelector(".rendered");
}

function renderedMarkdown(): string[] {
    return [...document.querySelectorAll(".rendered")].map(
        (node) => node.textContent ?? "",
    );
}

function openEditor(): HTMLElement | null {
    return document.querySelector("[data-monaco='open']");
}

function openEditorCount(): number {
    return document.querySelectorAll("[data-monaco='open']").length;
}

async function doubleClick(node: Element | null | undefined): Promise<void> {
    await act(async () => {
        node?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
}

async function doubleClickRendered(): Promise<void> {
    await doubleClick(rendered());
}

async function doubleClickRenderedMarkdown(markdown: string): Promise<void> {
    await doubleClick(
        [...document.querySelectorAll(".rendered")].find(
            (node) => node.textContent === markdown,
        ),
    );
}

function latestEditor() {
    return monacoEditorsOnThePage[monacoEditorsOnThePage.length - 1];
}

async function typeIntoEditor(markdown: string): Promise<void> {
    await act(async () => {
        latestEditor().type(markdown);
    });
}

async function typeCharacterIntoEditor(character: string): Promise<void> {
    await act(async () => {
        latestEditor().typeCharacter(character);
    });
}

async function putTheCursorAt(offset: number): Promise<void> {
    await act(async () => {
        latestEditor().putTheCursorAt(offset);
    });
}

async function whereTheCursorStandsAfter(
    shown: string,
    stoodAt: number,
    wanted: string,
): Promise<number> {
    const committed = committedSpy();
    await mount(shown, committed);
    await doubleClickRendered();
    await putTheCursorAt(stoodAt);

    await render(wanted, committed, 1);

    return latestEditor().cursorOffset();
}

async function pressEscape(): Promise<void> {
    await act(async () => {
        window.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
    });
}

async function clickSomethingElse(): Promise<void> {
    await act(async () => {
        document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
}

beforeEach(() => {
    monacoEditorsOnThePage.length = 0;
});

describe("markdown that is not being edited", () => {
    it("hands the child the markdown to render", async () => {
        await mount("The lantern.");

        expect(rendered()?.textContent).toBe("The lantern.");
        expect(openEditor()).toBeNull();
    });

    it("renders the markdown itself when there is no child", async () => {
        root = createRoot(emptyBody());
        await act(async () => {
            root.render(
                <MarkdownEditorMediator onEditingTheCell={() => undefined}>
                    <MarkdownEditor
                        cellId="c1"
                        markdown="# The lantern"
                        onMarkdownCommitted={committedSpy()}
                    />
                </MarkdownEditorMediator>,
            );
        });

        expect(
            document.querySelector(".markdown-rendered h1")?.textContent,
        ).toBe("The lantern");
    });
});

describe("opening the editor", () => {
    it("replaces the rendered markdown with an editor on a double click", async () => {
        await mount("The lantern.");

        await doubleClickRendered();

        expect(rendered()).toBeNull();
        expect(openEditor()).not.toBeNull();
    });

    it("opens the editor on the markdown it was given", async () => {
        await mount("The lantern.");

        await doubleClickRendered();

        expect(monacoEditorsOnThePage[0].getValue()).toBe("The lantern.");
    });
});

describe("editing", () => {
    it("commits what was typed and stays open", async () => {
        const committed = await mount("The lantern.");
        await doubleClickRendered();

        await typeIntoEditor("The lantern had gone out.");

        expect(committed).toHaveBeenCalledWith("The lantern had gone out.");
        expect(openEditor()).not.toBeNull();
    });

    it("commits every change, so that none of them waits on the next", async () => {
        const committed = await mount("The lantern.");
        await doubleClickRendered();

        await typeIntoEditor("The lantern had");
        await typeIntoEditor("The lantern had gone out.");

        expect(committed.mock.calls).toEqual([
            ["The lantern had"],
            ["The lantern had gone out."],
        ]);
    });

    it("stays open when something else is clicked once", async () => {
        await mount("The lantern.");
        await doubleClickRendered();

        await clickSomethingElse();

        expect(openEditor()).not.toBeNull();
    });
});

describe("closing the editor", () => {
    it("renders what was typed when escape is pressed", async () => {
        const committed = await mount("The lantern.");
        await doubleClickRendered();

        await typeIntoEditor("The lantern had gone out.");
        await pressEscape();

        expect(committed).toHaveBeenCalledWith("The lantern had gone out.");
        expect(openEditor()).toBeNull();
        expect(rendered()?.textContent).toBe("The lantern had gone out.");
    });

    it("closes on escape after the editor has lost focus", async () => {
        const committed = await mount("The lantern.");
        await doubleClickRendered();
        await typeIntoEditor("The lantern had gone out.");

        await clickSomethingElse();
        await pressEscape();

        expect(openEditor()).toBeNull();
        expect(committed).toHaveBeenCalledWith("The lantern had gone out.");
    });
});

describe("the host answering a keystroke later than the author typed it", () => {
    const whatTheEditorReported: string[] = [];
    let reporting: ReturnType<typeof committedSpy>;

    beforeEach(async () => {
        whatTheEditorReported.length = 0;
        reporting = vi.fn((markdown: string) => {
            whatTheEditorReported.push(markdown);
        });

        await mount("", reporting);
        await doubleClickRendered();
        await typeIntoEditor("a");
        await typeIntoEditor("ab");
    });

    it("answers each message the page sent, and is sent each answer back", async () => {
        for (let answer = 0; answer < 6; answer++) {
            await render(
                whatTheEditorReported[answer] ??
                    whatTheEditorReported[whatTheEditorReported.length - 1],
                reporting,
            );
        }

        expect(whatTheEditorReported).toEqual(["a", "ab"]);
    });
});

describe("markdown that changes underneath the editor", () => {
    it("follows the new markdown while the editor is open", async () => {
        const committed = committedSpy();
        await mount("The lantern.", committed);
        await doubleClickRendered();

        await render("The lantern had gone out.", committed, 1);

        expect(monacoEditorsOnThePage[0].getValue()).toBe("The lantern had gone out.");
    });
});

describe("where the cursor stands when the text changes underneath the author", () => {
    const A_SENTENCE = "The lantern went out.";

    it("stands exactly where it stood when the new text is the same length", async () => {
        expect(
            await whereTheCursorStandsAfter(
                A_SENTENCE,
                8,
                "The lantern came out.",
            ),
        ).toBe(8);
    });

    it("keeps its place in the words before it when the text grows after it", async () => {
        expect(
            await whereTheCursorStandsAfter(
                A_SENTENCE,
                16,
                "The lantern went out into the night.",
            ),
        ).toBe(16);
    });

    it("keeps its place in the words before it when the text shrinks after it", async () => {
        expect(
            await whereTheCursorStandsAfter(A_SENTENCE, 16, "The lantern went"),
        ).toBe(16);
    });

    it("follows the words it stood behind when the text grows before it", async () => {
        expect(
            await whereTheCursorStandsAfter(
                A_SENTENCE,
                16,
                "In the end, The lantern went out.",
            ),
        ).toBe(28);
    });

    it("stands where it stood in proportion when the words before it were themselves rewritten", async () => {
        expect(
            await whereTheCursorStandsAfter(
                A_SENTENCE,
                16,
                "In the end the lantern went out.",
            ),
        ).toBe(24);
    });

    it("stands where it stood in proportion when the text is nothing like it was", async () => {
        expect(
            await whereTheCursorStandsAfter(A_SENTENCE, 10, "Something else."),
        ).toBe(7);
    });

    it("stands at the start of an emptied cell", async () => {
        expect(await whereTheCursorStandsAfter(A_SENTENCE, 10, "")).toBe(0);
    });

    it("stands at the end when the author was at the end and the text was replaced", async () => {
        expect(
            await whereTheCursorStandsAfter(
                A_SENTENCE,
                A_SENTENCE.length,
                "A different sentence altogether.",
            ),
        ).toBe(32);
    });

    it("stands at the start when the author was at the start", async () => {
        expect(
            await whereTheCursorStandsAfter(
                A_SENTENCE,
                0,
                "The lantern went out into the night.",
            ),
        ).toBe(0);
    });

    it("takes the nearer of two places the same words stand in", async () => {
        expect(
            await whereTheCursorStandsAfter(
                "one two one two",
                7,
                "one two one two three",
            ),
        ).toBe(15);
    });

    it.each([
        {
            edit: "a space typed beside another is taken back",
            shown: "The  lantern",
            stoodAt: 4,
            wanted: "The lantern",
            standsAt: 3,
        },
        {
            edit: "a space typed beside another is put back",
            shown: "The lantern",
            stoodAt: 3,
            wanted: "The  lantern",
            standsAt: 4,
        },
        {
            edit: "a letter typed before the same letter is taken back",
            shown: "abcc",
            stoodAt: 3,
            wanted: "abc",
            standsAt: 2,
        },
        {
            edit: "a word typed is taken back",
            shown: "The old lantern",
            stoodAt: 8,
            wanted: "The lantern",
            standsAt: 4,
        },
        {
            edit: "the words after it are taken away",
            shown: "The lantern went out.",
            stoodAt: 11,
            wanted: "The lantern",
            standsAt: 11,
        },
    ])(
        "stands where the text was changed when $edit",
        async ({ shown, stoodAt, wanted, standsAt }) => {
            expect(
                await whereTheCursorStandsAfter(shown, stoodAt, wanted),
            ).toBe(standsAt);
        },
    );

    it("never stands past the end of a shorter text", async () => {
        expect(
            await whereTheCursorStandsAfter(A_SENTENCE, A_SENTENCE.length, "x"),
        ).toBe(1);
    });
});

describe("two editors", () => {
    it("opens the one that was double clicked", async () => {
        await mountAll([
            { markdown: "The lantern.", committed: committedSpy() },
            { markdown: "The night.", committed: committedSpy() },
        ]);

        await doubleClickRenderedMarkdown("The night.");

        expect(openEditorCount()).toBe(1);
        expect(renderedMarkdown()).toEqual(["The lantern."]);
    });

    it("closes the first when the second is opened", async () => {
        await mountAll([
            { markdown: "The lantern.", committed: committedSpy() },
            { markdown: "The night.", committed: committedSpy() },
        ]);

        await doubleClickRenderedMarkdown("The lantern.");
        await doubleClickRenderedMarkdown("The night.");

        expect(openEditorCount()).toBe(1);
        expect(renderedMarkdown()).toEqual(["The lantern."]);
    });

    it("has nothing left to commit on the way out, every change having been committed as it was typed", async () => {
        const lantern = committedSpy();
        await mountAll([
            { markdown: "The lantern.", committed: lantern },
            { markdown: "The night.", committed: committedSpy() },
        ]);

        await doubleClickRenderedMarkdown("The lantern.");
        await typeIntoEditor("The lantern had gone out.");
        await doubleClickRenderedMarkdown("The night.");

        expect(lantern.mock.calls).toEqual([["The lantern had gone out."]]);
    });
});

describe("what the checks found in the prose being written", () => {
    const REPEATED: ProseCheckError = {
        cellId: "c1",
        startCharacterOffsetInCell: 10,
        endCharacterOffsetInCell: 19,
        wordsInTheCell: "very very",
        isVisible: true,
        ruleThatFoundTheError: "echo",
        isAnErrorOf: "style",
        reasonForError: "“very very” says it twice.",
        correctVersion: "very",
    };

    async function openEditorWithMarks(
        onFixAsked = vi.fn(),
    ): Promise<ReturnType<typeof vi.fn>> {
        root = createRoot(emptyBody());
        await act(async () => {
            root.render(
                <MarkdownEditorMediator onEditingTheCell={() => undefined}>
                    <MarkdownEditor
                        cellId="c1"
                        markdown="It was very very late."
                        errors={[REPEATED]}
                        onFixAsked={onFixAsked}
                        onMarkdownCommitted={committedSpy()}
                    >
                        {(text) => <div className="rendered">{text}</div>}
                    </MarkdownEditor>
                </MarkdownEditorMediator>,
            );
        });
        await doubleClickRendered();
        return onFixAsked;
    }

    async function pointAt(offset: number | null): Promise<void> {
        await act(async () => {
            latestEditor().point(offset);
        });
    }

    function tooltip(): HTMLElement | null {
        return document.querySelector(".linter-tooltip");
    }

    it("underlines the words it was found in", async () => {
        await openEditorWithMarks();

        expect(latestEditor().marks()).toEqual([
            {
                range: {
                    from: { lineNumber: 1, column: 11 },
                    to: { lineNumber: 1, column: 20 },
                },
                options: {
                    inlineClassName:
                        "markdown-editor-mark markdown-editor-mark-style",
                },
            },
        ]);
    });

    it("says what it found when the pointer stops on the underline", async () => {
        await openEditorWithMarks();

        await pointAt(12);

        expect(tooltip()?.textContent).toContain("says it twice");
    });

    it("keeps the tooltip up while the pointer is on it, however it got there", async () => {
        await openEditorWithMarks();

        await pointAt(12);
        await act(async () => {
            tooltip()!.parentElement!.dispatchEvent(
                new MouseEvent("mouseover", { bubbles: true }),
            );
        });
        await act(async () => {
            latestEditor().pointAway();
            await new Promise((over) => setTimeout(over, 250));
        });

        expect(tooltip()).not.toBeNull();
    });

    it("takes the tooltip away when the pointer leaves the editor", async () => {
        await openEditorWithMarks();

        await pointAt(12);
        await act(async () => {
            latestEditor().pointAway();
            await new Promise((over) => setTimeout(over, 250));
        });

        expect(tooltip()).toBeNull();
    });

    it("says nothing when the pointer is on prose it had no quarrel with", async () => {
        await openEditorWithMarks();

        await pointAt(2);
        await act(async () => {
            await new Promise((over) => setTimeout(over, 250));
        });

        expect(tooltip()).toBeNull();
    });

    it("offers nothing to press when the check had no answer to give", async () => {
        root = createRoot(emptyBody());
        await act(async () => {
            root.render(
                <MarkdownEditorMediator onEditingTheCell={() => undefined}>
                    <MarkdownEditor
                        cellId="c1"
                        markdown="It was very very late."
                        errors={[{ ...REPEATED, correctVersion: "" }]}
                        onFixAsked={vi.fn()}
                        onMarkdownCommitted={committedSpy()}
                    >
                        {(text) => <div className="rendered">{text}</div>}
                    </MarkdownEditor>
                </MarkdownEditorMediator>,
            );
        });
        await doubleClickRendered();

        await pointAt(12);

        expect(tooltip()?.textContent).toContain("says it twice");
        expect(document.querySelector(".linter-tooltip-fix")).toBeNull();
    });

    it("asks for the fault under the pointer to be put right", async () => {
        const onFixAsked = await openEditorWithMarks();
        await pointAt(12);

        await act(async () => {
            document
                .querySelector(".linter-tooltip-fix")!
                .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(onFixAsked).toHaveBeenCalledWith(REPEATED);
    });
});

describe("selecting text", () => {
    it("says where the selection starts and ends in the markdown", async () => {
        const selected = vi.fn();
        root = createRoot(emptyBody());
        await act(async () => {
            root.render(
                <MarkdownEditorMediator onEditingTheCell={() => undefined}>
                    <MarkdownEditor
                        cellId="c1"
                        markdown="The lantern had gone out."
                        onMarkdownCommitted={committedSpy()}
                        onTextSelected={selected}
                    >
                        {(text) => <div className="rendered">{text}</div>}
                    </MarkdownEditor>
                </MarkdownEditorMediator>,
            );
        });
        await doubleClickRendered();

        await act(async () => {
            latestEditor().select(4, 11);
        });

        expect(selected).toHaveBeenCalledWith(4, 11);
    });
});

describe("selecting text in the rendered markdown", () => {
    async function mountRendered(
        markdown: string,
        selected: ReturnType<typeof vi.fn>,
    ): Promise<HTMLElement> {
        root = createRoot(emptyBody());
        await act(async () => {
            root.render(
                <MarkdownEditorMediator onEditingTheCell={() => undefined}>
                    <MarkdownEditor
                        cellId="c1"
                        markdown={markdown}
                        onMarkdownCommitted={committedSpy()}
                        onTextSelected={selected}
                    />
                </MarkdownEditorMediator>,
            );
        });
        return document.querySelector(".markdown-rendered")!;
    }

    async function selectInTheRenderedText(
        rendered: HTMLElement,
        from: string,
        to: string,
    ): Promise<void> {
        const textNodes: Text[] = [];
        const walking = document.createTreeWalker(rendered, NodeFilter.SHOW_TEXT);
        while (walking.nextNode()) {
            textNodes.push(walking.currentNode as Text);
        }
        const startsIn = textNodes.find((node) => node.data.includes(from))!;
        const endsIn = textNodes.find((node) => node.data.includes(to))!;
        const range = document.createRange();
        range.setStart(startsIn, startsIn.data.indexOf(from));
        range.setEnd(endsIn, endsIn.data.indexOf(to) + to.length);
        await act(async () => {
            document.getSelection()!.removeAllRanges();
            document.getSelection()!.addRange(range);
            document.dispatchEvent(new Event("selectionchange"));
        });
    }

    it("says which words of the markdown the selection touches", async () => {
        const selected = vi.fn();
        const rendered = await mountRendered("She saw **the** door.", selected);

        await selectInTheRenderedText(rendered, "the", "do");

        expect(selected).toHaveBeenLastCalledWith(8, 21);
    });

    it("keeps the rendered text, and so the selection, when the page is drawn again", async () => {
        const selected = vi.fn();
        const rendered = await mountRendered("She saw the door.", selected);
        const textSelectedIn = rendered.querySelector("p")!.firstChild!;

        await act(async () => {
            root.render(
                <MarkdownEditorMediator onEditingTheCell={() => undefined}>
                    <MarkdownEditor
                        cellId="c1"
                        markdown="She saw the door."
                        onMarkdownCommitted={committedSpy()}
                        onTextSelected={vi.fn()}
                        highlights={[]}
                    />
                </MarkdownEditorMediator>,
            );
        });

        expect(textSelectedIn.isConnected).toBe(true);
    });

    it("finds the words past markdown that renders no words", async () => {
        const selected = vi.fn();
        const rendered = await mountRendered(
            "1. She saw the door.\n2. He heard the bell.",
            selected,
        );

        await selectInTheRenderedText(rendered, "heard", "heard");

        expect(selected).toHaveBeenLastCalledWith(27, 32);
    });
});

describe("the words of a salient concept", () => {
    const THE_DOOR_HIGHLIGHTED = [
        {
            startCharacterOffsetInCell: 8,
            endCharacterOffsetInCell: 21,
            highlightColor: 1,
            emphasized: false,
        },
    ];

    async function mountHighlighted(): Promise<void> {
        root = createRoot(emptyBody());
        await act(async () => {
            root.render(
                <MarkdownEditorMediator onEditingTheCell={() => undefined}>
                    <MarkdownEditor
                        cellId="c1"
                        markdown="She saw **the** door."
                        onMarkdownCommitted={committedSpy()}
                        storyTextHighlights={THE_DOOR_HIGHLIGHTED}
                    />
                </MarkdownEditorMediator>,
            );
        });
    }

    it("are highlighted in the rendered text, in the concept's colour", async () => {
        const highlights = new Map<string, Set<Range>>();
        vi.stubGlobal("Highlight", Set);
        vi.stubGlobal("CSS", { highlights });

        await mountHighlighted();

        expect(
            [
                ...(highlights.get("markdown-editor-story-text-highlight-1") ?? []),
            ].map((range) => range.toString()),
        ).toEqual(["the door."]);
        vi.unstubAllGlobals();
    });

    it("are highlighted in the editor, in the concept's colour", async () => {
        await mountHighlighted();
        await doubleClick(document.querySelector(".markdown-rendered"));

        expect(latestEditor().marks()).toContainEqual({
            range: {
                from: { lineNumber: 1, column: 9 },
                to: { lineNumber: 1, column: 22 },
            },
            options: {
                inlineClassName:
                    "markdown-editor-story-text-highlight markdown-editor-story-text-highlight-1",
            },
        });
    });
});

describe("story text highlighted with emphasis", () => {
    const THE_DOOR_EMPHASIZED = [
        {
            startCharacterOffsetInCell: 8,
            endCharacterOffsetInCell: 21,
            highlightColor: 1,
            emphasized: true,
        },
    ];

    async function mountEmphasized(): Promise<void> {
        root = createRoot(emptyBody());
        await act(async () => {
            root.render(
                <MarkdownEditorMediator onEditingTheCell={() => undefined}>
                    <MarkdownEditor
                        cellId="c1"
                        markdown="She saw **the** door."
                        onMarkdownCommitted={committedSpy()}
                        storyTextHighlights={THE_DOOR_EMPHASIZED}
                    />
                </MarkdownEditorMediator>,
            );
        });
    }

    it("is highlighted in the rendered text with the emphasized shade of its colour", async () => {
        const highlights = new Map<string, Set<Range>>();
        vi.stubGlobal("Highlight", Set);
        vi.stubGlobal("CSS", { highlights });

        await mountEmphasized();

        const emphasized = [
            ...(highlights.get(
                "markdown-editor-story-text-highlight-emphasized-1",
            ) ?? []),
        ].map((range) => range.toString());
        expect(emphasized).toEqual(["the door."]);
        vi.unstubAllGlobals();
    });

    it("is highlighted in the editor with the emphasized shade of its colour", async () => {
        await mountEmphasized();
        await doubleClick(document.querySelector(".markdown-rendered"));

        const marksDrawn = latestEditor().marks();
        expect(marksDrawn).toContainEqual({
            range: {
                from: { lineNumber: 1, column: 9 },
                to: { lineNumber: 1, column: 22 },
            },
            options: {
                inlineClassName:
                    "markdown-editor-story-text-highlight markdown-editor-story-text-highlight-emphasized markdown-editor-story-text-highlight-1",
            },
        });
    });
});

describe("showing a salient concept's words", () => {
    const THE_DOOR_SHOWN = {
        startCharacterOffsetInCell: 8,
        endCharacterOffsetInCell: 21,
    };

    async function mountShowing(
        storyTextShown: typeof THE_DOOR_SHOWN | undefined,
        shownAt: ReturnType<typeof vi.fn>,
    ): Promise<void> {
        await act(async () => {
            root.render(
                <MarkdownEditorMediator onEditingTheCell={() => undefined}>
                    <MarkdownEditor
                        cellId="c1"
                        markdown="She saw **the** door."
                        onMarkdownCommitted={committedSpy()}
                        storyTextShown={storyTextShown}
                        onStoryTextShownAt={shownAt}
                    />
                </MarkdownEditorMediator>,
            );
        });
    }

    it("says where the words are drawn in the rendered text", async () => {
        const shownAt = vi.fn();
        root = createRoot(emptyBody());

        await mountShowing(THE_DOOR_SHOWN, shownAt);

        expect(shownAt).toHaveBeenCalledTimes(1);
    });

    it("says where the words are drawn in the editor", async () => {
        const shownAt = vi.fn();
        root = createRoot(emptyBody());
        await mountShowing(undefined, shownAt);
        await doubleClick(document.querySelector(".markdown-rendered"));

        await mountShowing(THE_DOOR_SHOWN, shownAt);

        expect(shownAt).toHaveBeenLastCalledWith(10, 28);
    });
});

describe("clicking the text", () => {
    it("says where in the markdown the word the author clicked begins", async () => {
        const clicked = vi.fn();
        root = createRoot(emptyBody());
        await act(async () => {
            root.render(
                <MarkdownEditorMediator onEditingTheCell={() => undefined}>
                    <MarkdownEditor
                        cellId="c1"
                        markdown="She saw **the** door."
                        onMarkdownCommitted={committedSpy()}
                        onTextClicked={clicked}
                    />
                </MarkdownEditorMediator>,
            );
        });
        const rendered = document.querySelector(".markdown-rendered")!;
        const doorDrawnIn = rendered.querySelector("p")!.lastChild as Text;
        const caret = document.createRange();
        caret.setStart(doorDrawnIn, 3);
        caret.collapse(true);

        await act(async () => {
            document.getSelection()!.removeAllRanges();
            document.getSelection()!.addRange(caret);
            rendered.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(clicked).toHaveBeenCalledWith(16);
    });

    it("says where in the markdown the author clicked while typing", async () => {
        const clicked = vi.fn();
        root = createRoot(emptyBody());
        await act(async () => {
            root.render(
                <MarkdownEditorMediator onEditingTheCell={() => undefined}>
                    <MarkdownEditor
                        cellId="c1"
                        markdown="She saw the door."
                        onMarkdownCommitted={committedSpy()}
                        onTextClicked={clicked}
                    />
                </MarkdownEditorMediator>,
            );
        });
        await doubleClick(document.querySelector(".markdown-rendered"));

        await act(async () => {
            latestEditor().click(12);
        });

        expect(clicked).toHaveBeenCalledWith(12);
    });
});

describe("where an editor draws its text", () => {
    function SaysWhereTheDoorIsDrawn() {
        const { whereTheTextIsDrawn, timesTheEditorsWereDrawn } =
            useWhereTheMarkdownEditorsDrawTheirText();
        const doorDrawnAt = whereTheTextIsDrawn("c1", 12, 16);
        return (
            <div
                className="test-door-drawn-at"
                data-times-drawn={timesTheEditorsWereDrawn}
                data-drawn-at={JSON.stringify(doorDrawnAt)}
            />
        );
    }

    it("is where the editor the author types in draws it", async () => {
        root = createRoot(emptyBody());
        await act(async () => {
            root.render(
                <MarkdownEditorMediator onEditingTheCell={() => undefined}>
                    <MarkdownEditor
                        cellId="c1"
                        markdown="She saw the door."
                        onMarkdownCommitted={committedSpy()}
                    />
                    <SaysWhereTheDoorIsDrawn />
                </MarkdownEditorMediator>,
            );
        });
        await doubleClick(document.querySelector(".markdown-rendered"));

        const doorDrawnAt = document.querySelector<HTMLElement>(
            ".test-door-drawn-at",
        )!.dataset.drawnAt!;
        expect(JSON.parse(doorDrawnAt)).toEqual({
            startsAt: { x: 20, top: 10, bottom: 28 },
            endsAt: { x: 20, top: 10, bottom: 28 },
        });
    });

    it("is nowhere for an editor the mediator does not hold", async () => {
        root = createRoot(emptyBody());
        await act(async () => {
            root.render(
                <MarkdownEditorMediator onEditingTheCell={() => undefined}>
                    <SaysWhereTheDoorIsDrawn />
                </MarkdownEditorMediator>,
            );
        });

        const doorDrawnAt = document.querySelector<HTMLElement>(
            ".test-door-drawn-at",
        )!.dataset.drawnAt!;
        expect(JSON.parse(doorDrawnAt)).toBe(null);
    });
});
