import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";

import type { Cell } from "../../extension/storydoc/model";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let posted: { type: string }[] = [];

function markdownCell(source: string): Cell {
    return { kind: "markdown", source, attrs: {} };
}

async function openWebview(): Promise<void> {
    document.body.innerHTML = '<div id="author-file-editor-root"></div>';
    posted = [];
    (globalThis as Record<string, unknown>).acquireVsCodeApi = () => ({
        postMessage: (message: { type: string }) => posted.push(message),
    });
    vi.resetModules();
    await act(async () => {
        await import("../../extension/author_file_editor_webview");
    });
}

async function hostSends(cells: Cell[]): Promise<void> {
    await act(async () => {
        window.dispatchEvent(
            new MessageEvent("message", { data: { type: "cells", cells } }),
        );
    });
}

function renderedCellText(): string[] {
    return [
        ...document.querySelectorAll(".author-file-editor-cell-body"),
    ].map((body) => body.textContent ?? "");
}

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
        await hostSends([markdownCell("one"), markdownCell("two")]);
        expect(renderedCellText()).toEqual(["one", "two"]);
    });

    it("renders nothing for a kind no renderer covers", async () => {
        await openWebview();
        await hostSends([
            markdownCell("kept"),
            { kind: "chapter", source: "", attrs: { title: "Dropped" } },
        ]);
        expect(renderedCellText()).toEqual(["kept"]);
    });
});

describe("refreshing the document", () => {
    it("replaces what is on the page when the document changes", async () => {
        await openWebview();
        await hostSends([markdownCell("first")]);
        await hostSends([markdownCell("second")]);
        expect(renderedCellText()).toEqual(["second"]);
    });

    it("follows a cell being added", async () => {
        await openWebview();
        await hostSends([markdownCell("one")]);
        await hostSends([markdownCell("one"), markdownCell("two")]);
        expect(renderedCellText()).toEqual(["one", "two"]);
    });

    it("follows a cell being taken out", async () => {
        await openWebview();
        await hostSends([markdownCell("one"), markdownCell("two")]);
        await hostSends([markdownCell("two")]);
        expect(renderedCellText()).toEqual(["two"]);
    });

    it("ignores a message that is not the document", async () => {
        await openWebview();
        await hostSends([markdownCell("kept")]);
        await act(async () => {
            window.dispatchEvent(
                new MessageEvent("message", { data: { type: "something" } }),
            );
        });
        expect(renderedCellText()).toEqual(["kept"]);
    });
});
