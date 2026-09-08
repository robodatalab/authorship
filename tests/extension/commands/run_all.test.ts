import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { authorDocumentCommandThatRunsCellsOfKind } from "../../../extension/vscode_runtime/commands/author_document_commands";
import { RunAllCommand } from "../../../extension/vscode_runtime/commands/run_all";
import { BLURB, Cell } from "../../../extension/vscode_runtime/storydoc/model";
import { forgetWhatTheEditorDid, openStory } from "./open_story";

const A_STORY_OF_TWO_BLURBS_AND_A_TABLE_OF_CONTENTS = `
<!-- cell: blurb id="b1" -->

<!-- cell: blurb id="b2" -->

<!-- cell: contents id="toc" -->

<!-- cell: chapter title="One" id="c1" -->

<!-- cell: markdown id="c2" -->

She saw the door.
`;

function serverThatWritesEveryBlurb(
    whileTheFirstBlurbIsWritten: () => void = () => undefined,
): string[] {
    const asked: string[] = [];
    let statusAskedFor = 0;
    vi.stubGlobal("fetch", (url: string) => {
        asked.push(url);
        const stillRunning = url.includes("status") && statusAskedFor++ < 1;
        if (stillRunning) {
            whileTheFirstBlurbIsWritten();
        }
        return Promise.resolve({
            ok: true,
            json: () =>
                Promise.resolve(
                    url.includes("status")
                        ? {
                              running: stillRunning,
                              error: null,
                              text: "A woman loses her name.",
                              progress: { written: 1, chapters: 1 },
                          }
                        : { id: "job-1" },
                ),
        });
    });
    return asked;
}

function blurbsAsked(asked: string[]): number {
    return asked.filter((url) => url.includes("/generate/blurb")).length;
}

beforeEach(forgetWhatTheEditorDid);
afterEach(() => vi.unstubAllGlobals());

describe("RunAllCommand — runs every cell that writes itself", () => {
    it("writes each of them and leaves the others alone", async () => {
        const asked = serverThatWritesEveryBlurb();
        const document = openStory(
            A_STORY_OF_TWO_BLURBS_AND_A_TABLE_OF_CONTENTS,
        );

        await new RunAllCommand(
            authorDocumentCommandThatRunsCellsOfKind,
        ).invoke(document);

        expect(blurbsAsked(asked)).toBe(2);
        expect(document.cellWithId("b1")?.source).toBe(
            "A woman loses her name.",
        );
        expect(document.cellWithId("b2")?.source).toBe(
            "A woman loses her name.",
        );
        expect(document.cellWithId("toc")?.source).toBe("1. One");
        expect(document.cellWithId("c2")?.source).toBe("She saw the door.");
    });

    it("runs nothing at all when no cell writes itself", async () => {
        const asked = serverThatWritesEveryBlurb();
        const document = openStory(
            '<!-- cell: markdown id="c1" -->\n\nShe saw the door.\n',
        );

        await new RunAllCommand(
            authorDocumentCommandThatRunsCellsOfKind,
        ).invoke(document);

        expect(asked).toEqual([]);
    });
});

describe("RunAllCommand — while it runs", () => {
    it("leaves a cell the author added afterwards for another run", async () => {
        const document = openStory(
            A_STORY_OF_TWO_BLURBS_AND_A_TABLE_OF_CONTENTS,
        );
        const asked = serverThatWritesEveryBlurb(() =>
            document.insertAfter("b2", new Cell(BLURB, "", { id: "b3" })),
        );

        await new RunAllCommand(
            authorDocumentCommandThatRunsCellsOfKind,
        ).invoke(document);

        expect(blurbsAsked(asked)).toBe(2);
        expect(document.cellWithId("b3")?.source).toBe("");
    });

    it("passes over a cell the author deleted afterwards", async () => {
        const document = openStory(
            A_STORY_OF_TWO_BLURBS_AND_A_TABLE_OF_CONTENTS,
        );
        const asked = serverThatWritesEveryBlurb(() =>
            document.removeCell("b2"),
        );

        await new RunAllCommand(
            authorDocumentCommandThatRunsCellsOfKind,
        ).invoke(document);

        expect(blurbsAsked(asked)).toBe(1);
        expect(document.cellWithId("b2")).toBeUndefined();
        expect(document.cellWithId("toc")?.source).toBe("1. One");
    });
});
