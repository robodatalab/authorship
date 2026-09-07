import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WriteStorySoFarCommand } from "../../../extension/vscode_runtime/commands/write_story_so_far";
import { shownMessages } from "../vscode";
import { forgetWhatTheEditorDid, openStory, STORY_FILE } from "./open_story";

const A_STORY_SO_FAR_THAT_NAMES_ITS_DOCUMENTS =
    '<!-- cell: recap id="r1" documents="parts/part_1.author, parts/part_2.author" -->\n';

const A_STORY_SO_FAR_THAT_NAMES_NONE = '<!-- cell: recap id="r1" -->\n';

beforeEach(forgetWhatTheEditorDid);
afterEach(() => vi.unstubAllGlobals());

describe("WriteStorySoFarCommand — writes the story so far", () => {
    it("names the documents to summarise and writes what came back", async () => {
        const asked: { url: string; body: unknown }[] = [];
        vi.stubGlobal("fetch", (url: string, sent?: { body: string }) => {
            asked.push({ url, body: sent?.body && JSON.parse(sent.body) });
            return Promise.resolve({
                ok: true,
                json: () =>
                    Promise.resolve(
                        url.includes("status")
                            ? {
                                  running: false,
                                  error: null,
                                  text: "She had lost her name.",
                                  progress: { written: 2, chapters: 2 },
                              }
                            : { id: "job-1" },
                    ),
            });
        });

        const document = openStory(A_STORY_SO_FAR_THAT_NAMES_ITS_DOCUMENTS);

        await new WriteStorySoFarCommand().invoke(document, { cellIndex: 0 });

        expect(asked[0].url).toContain("/generate/recap");
        expect(asked[0].body).toEqual({
            path: STORY_FILE,
            documents: ["parts/part_1.author", "parts/part_2.author"],
        });
        expect(document.cells[0].source).toBe("She had lost her name.");
    });

    it("asks for the documents rather than the server when the cell names none", async () => {
        const asked: string[] = [];
        vi.stubGlobal("fetch", (url: string) => {
            asked.push(url);
            return Promise.resolve({ ok: true, json: () => ({}) });
        });

        const document = openStory(A_STORY_SO_FAR_THAT_NAMES_NONE);

        await new WriteStorySoFarCommand().invoke(document, { cellIndex: 0 });

        expect(asked).toEqual([]);
        expect(shownMessages[0]).toContain("Name the documents");
    });
});
