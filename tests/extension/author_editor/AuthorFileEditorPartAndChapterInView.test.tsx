import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { AuthorFileEditorPartAndChapterInView } from "../../../extension/webview/author_editor/AuthorFileEditorPartAndChapterInView";
import type { Cell } from "../../../extension/library/storydoc/cells/cell";
import { parse } from "../../../extension/library/storydoc/parser";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const A_STORY_IN_TWO_PARTS = parse(`<!-- cell: title-page id="title" -->
<!-- cell: part id="p1" title="The Morning" -->
<!-- cell: chapter id="c1" title="Waking" -->
<!-- cell: markdown id="m1" -->
<!-- cell: chapter id="c2" title="Breakfast" -->
<!-- cell: markdown id="m2" -->
<!-- cell: part id="p2" title="The Evening" -->
<!-- cell: chapter id="c3" title="Drinks" -->
<!-- cell: markdown id="m3" -->
`);

async function draw(
    cellIdInView: string | undefined,
    cells: Cell[] = A_STORY_IN_TWO_PARTS,
    wordsInTheDocument = 0,
): Promise<void> {
    document.body.innerHTML = "";
    const container = document.createElement("div");
    document.body.append(container);
    await act(async () => {
        createRoot(container).render(
            <AuthorFileEditorPartAndChapterInView
                cells={cells}
                cellIdInView={cellIdInView}
                wordsInTheDocument={wordsInTheDocument}
            />,
        );
    });
}

async function saidAbout(
    cellIdInView: string | undefined,
    cells: Cell[] = A_STORY_IN_TWO_PARTS,
): Promise<string> {
    await draw(cellIdInView, cells);
    return (
        document.querySelector(".author-file-editor-part-and-chapter-said")
            ?.textContent ?? ""
    );
}

describe("the part and chapter the author is looking at", () => {
    it("names the part and the chapter the cell stands in", async () => {
        expect(await saidAbout("m3")).toBe("The Evening / Drinks");
    });

    it("names the chapter the author is looking at as that chapter", async () => {
        expect(await saidAbout("c2")).toBe("The Morning / Breakfast");
    });

    it("names the part alone until the first chapter of it", async () => {
        expect(await saidAbout("p2")).toBe("The Evening");
    });

    it("names the chapter alone in a story nobody divided into parts", async () => {
        expect(
            await saidAbout(
                "m1",
                parse(`<!-- cell: chapter id="c1" title="Waking" -->
<!-- cell: markdown id="m1" -->
`),
            ),
        ).toBe("Waking");
    });

    it("says untitled for a section the author has not named", async () => {
        expect(
            await saidAbout(
                "m1",
                parse(`<!-- cell: chapter id="c1" -->
<!-- cell: markdown id="m1" -->
`),
            ),
        ).toBe("Untitled");
    });

    it("says nothing above the first part and the first chapter", async () => {
        expect(await saidAbout("title")).toBe("");
    });

    it("says nothing until a cell is in view", async () => {
        expect(await saidAbout(undefined)).toBe("");
    });

    it("says nothing about a cell the document has not got", async () => {
        expect(await saidAbout("nowhere")).toBe("");
    });
});

describe("the words of the whole document", () => {
    it("are said beside the part and the chapter", async () => {
        await draw("m3", A_STORY_IN_TWO_PARTS, 12043);
        expect(
            document.querySelector(".author-file-editor-words-in-the-document")
                ?.textContent,
        ).toBe("12,043 words");
    });

    it("are said even where no part or chapter stands above", async () => {
        await draw("title", A_STORY_IN_TWO_PARTS, 7);
        expect(
            document.querySelector(".author-file-editor-part-and-chapter-said"),
        ).toBeNull();
        expect(
            document.querySelector(".author-file-editor-words-in-the-document")
                ?.textContent,
        ).toBe("7 words");
    });
});
