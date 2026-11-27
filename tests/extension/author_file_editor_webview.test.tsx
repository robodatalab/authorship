import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let posted: { type: string }[] = [];

function markdownCell(cellId: string, source: string): string {
    return `<!-- cell: markdown id="${cellId}" -->\n\n${source}\n`;
}

async function openWebview(): Promise<void> {
    document.body.innerHTML = '<div id="author-file-editor-root"></div>';
    posted = [];
    (globalThis as Record<string, unknown>).acquireVsCodeApi = () => ({
        postMessage: (message: { type: string }) => posted.push(message),
    });
    vi.resetModules();
    await act(async () => {
        await import("../../extension/webview/webview_command_executor");
    });
}

async function hostSends(cells: string[]): Promise<void> {
    await act(async () => {
        window.dispatchEvent(
            new MessageEvent("message", {
                data: { type: "setAllCells", cells },
            }),
        );
    });
}

function renderedCellText(): string[] {
    return [...document.querySelectorAll(".author-file-editor-cell-body")].map(
        (cellBody) => cellBody.textContent?.trim() ?? "",
    );
}

beforeAll(openWebview);

beforeEach(() => {
    posted = [];
});

describe("opening the document", () => {
    it("asks the host for the document, since nothing is pushed before that", async () => {
        await openWebview();
        expect(posted).toEqual([{ type: "ready" }]);
    });

    it("draws the surface before the host has answered", async () => {
        await openWebview();
        expect(
            document.querySelector(".author-file-editor-canvas"),
        ).not.toBeNull();
        expect(renderedCellText()).toEqual([]);
    });

    it("renders the cells the host sends", async () => {
        await openWebview();
        await hostSends([markdownCell("m1", "one"), markdownCell("m2", "two")]);
        expect(renderedCellText()).toEqual(["one", "two"]);
    });

    it("renders nothing for a kind no renderer covers", async () => {
        await openWebview();
        await hostSends([
            markdownCell("m1", "kept"),
            '<!-- cell: mystery id="x1" -->\n\nDropped\n',
        ]);
        expect(renderedCellText()).toEqual(["kept"]);
    });
});

describe("refreshing the document", () => {
    it("replaces what is on the page when the document changes", async () => {
        await openWebview();
        await hostSends([markdownCell("m1", "first")]);
        await hostSends([markdownCell("m1", "second")]);
        expect(renderedCellText()).toEqual(["second"]);
    });

    it("follows a cell being added", async () => {
        await openWebview();
        await hostSends([markdownCell("m1", "one")]);
        await hostSends([markdownCell("m1", "one"), markdownCell("m2", "two")]);
        expect(renderedCellText()).toEqual(["one", "two"]);
    });

    it("follows a cell being taken out", async () => {
        await openWebview();
        await hostSends([markdownCell("m1", "one"), markdownCell("m2", "two")]);
        await hostSends([markdownCell("m2", "two")]);
        expect(renderedCellText()).toEqual(["two"]);
    });
});

describe("the suggestions the host sends", () => {
    it("draws a suggested cell as the host sends it, in its frame", async () => {
        await openWebview();
        await hostSends([markdownCell("m1", "one more")]);

        await act(async () => {
            window.dispatchEvent(
                new MessageEvent("message", {
                    data: {
                        type: "setSuggestions",
                        suggestions:
                            '<!-- suggestion: id="m1" -->\n<!-- change: text from="3" removed="" written=" more" -->\n',
                    },
                }),
            );
        });

        const proposed = document.querySelector(
            '[data-suggestion-id="m1"] .author-file-editor-suggestion-proposed',
        );
        expect(proposed?.textContent).toContain("one more");
    });

    describe("drawing every suggested cell in the document as the host sends it", () => {
        const MARKUS =
            '<!-- cell: character id="mv" title="Markus Vader" -->\n';
        const PLACES_CHARACTER_AND_PLOT_AS_SUGGESTED = [
            '<!-- cell: place id="ms" title="Mars" -->\n',
            '<!-- cell: place id="hb" title="Hellas Basin" parent="ms" -->\n',
            '<!-- cell: character id="tl" title="Teodor Lin" -->\n\nA drill operator in debt to the company.\n',
            '<!-- cell: plot id="dd" title="Drilling deeper" -->\n\n<ol>\n<li id="e1" timestamp="2.4" place="hb" characters="mv, tl">They drive the drill deeper.</li>\n</ol>\n',
        ];
        const SUGGESTED_PLACES_CHARACTER_AND_PLOT =
            '<!-- suggestion: id="ms" -->\n<!-- change: header kind="place" after-title="Mars" -->\n\n' +
            '<!-- suggestion: id="hb" -->\n<!-- change: header kind="place" after-title="Hellas Basin" after-parent="ms" -->\n\n' +
            '<!-- suggestion: id="tl" -->\n<!-- change: header kind="character" after-title="Teodor Lin" -->\n' +
            '<!-- change: text from="0" removed="" written="A drill operator in debt to the company." -->\n\n' +
            '<!-- suggestion: id="dd" -->\n<!-- change: header kind="plot" after-title="Drilling deeper" -->\n' +
            '<!-- change: text from="0" removed="" written="<ol>\\n<li id=\\"e1\\" timestamp=\\"2.4\\" place=\\"hb\\" characters=\\"mv, tl\\">They drive the drill deeper.</li>\\n</ol>" -->\n';

        async function hostSendsMarkusAndTheSuggestions(): Promise<void> {
            await openWebview();
            await hostSends([
                MARKUS,
                ...PLACES_CHARACTER_AND_PLOT_AS_SUGGESTED,
            ]);
            await act(async () => {
                window.dispatchEvent(
                    new MessageEvent("message", {
                        data: {
                            type: "setSuggestions",
                            suggestions: SUGGESTED_PLACES_CHARACTER_AND_PLOT,
                        },
                    }),
                );
            });
        }

        it.each([
            [
                "the suggested place it happens in",
                ".author-file-editor-plot-event-place",
                ["Hellas Basin"],
            ],
            [
                "the suggested characters in it beside the ones the story has",
                ".author-file-editor-plot-event-characters",
                ["Markus Vader", "Teodor Lin"],
            ],
        ])(
            "names, in a suggested event, %s",
            async (_, referencesShown, expected) => {
                await hostSendsMarkusAndTheSuggestions();

                const named = [
                    ...document.querySelectorAll(
                        `[data-suggestion-id="dd"] ${referencesShown} .author-file-editor-cell-references-referenced .author-file-editor-story-annotation-passage-shown`,
                    ),
                ].map((reference) => reference.textContent);

                expect(named).toEqual(expected);
            },
        );

        it("draws a suggested place under the suggested place it lies within", async () => {
            await hostSendsMarkusAndTheSuggestions();

            const nestedUnder = [
                ...document.querySelectorAll(".author-file-editor-place-scope"),
            ].map((scope) => [
                scope.parentElement!.getAttribute("data-cell-id"),
                [...scope.querySelectorAll(":scope > li[data-cell-id]")].map(
                    (nested) => nested.getAttribute("data-cell-id"),
                ),
            ]);

            expect(nestedUnder).toEqual([["ms", ["hb"]]]);
        });
    });
});
