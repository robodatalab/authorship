import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WriteBlurbCommand } from "../../../extension/vscode_runtime/commands/write_blurb";
import {
    closeAuthorFileEditorSession,
    openAuthorFileEditorSession,
} from "../../../extension/vscode_runtime/author_file_editor_session";
import { files } from "../vscode";
import { forgetWhatTheEditorDid, openStory, STORY_FILE } from "./open_story";

const A_STORY_WITH_A_BLURB_CELL = `
<!-- cell: blurb id="b1" -->

<!-- cell: markdown id="c1" -->

She saw the door.
`;

beforeEach(forgetWhatTheEditorDid);
afterEach(() => vi.unstubAllGlobals());

describe("WriteBlurbCommand — writes the blurb", () => {
    it("saves the document, asks the server for a blurb, and writes what came back", async () => {
        const asked: { url: string; body: unknown }[] = [];
        let chaptersRead = 0;
        vi.stubGlobal("fetch", (url: string, sent?: { body: string }) => {
            asked.push({ url, body: sent?.body && JSON.parse(sent.body) });
            const stillReading = url.includes("status") && chaptersRead++ < 1;
            return Promise.resolve({
                ok: true,
                json: () =>
                    Promise.resolve(
                        url.includes("status")
                            ? {
                                  running: stillReading,
                                  error: null,
                                  text: "A woman loses her name.",
                                  progress: { written: 1, chapters: 2 },
                              }
                            : { id: "job-1" },
                    ),
            });
        });

        const document = openStory(A_STORY_WITH_A_BLURB_CELL);
        const sentToTheWebview: unknown[] = [];
        openAuthorFileEditorSession(document, {
            webview: {
                postMessage: (message: unknown) =>
                    sentToTheWebview.push(message),
            },
        } as never);

        await new WriteBlurbCommand().invoke(document, { cellIndex: 0 });
        closeAuthorFileEditorSession(document);

        expect(files.get(STORY_FILE)).toContain("She saw the door.");
        expect(asked[0].url).toContain("/generate/blurb");
        expect(asked[0].body).toEqual({ path: STORY_FILE });
        expect(asked[1].url).toContain("/generate/status?id=job-1");
        expect(document.cells[0].source).toBe("A woman loses her name.");
        expect(sentToTheWebview).toContainEqual({
            type: "cellsBeingWritten",
            cellsBeingWritten: { b1: 0 },
        });
        expect(sentToTheWebview).toContainEqual({
            type: "cellsBeingWritten",
            cellsBeingWritten: { b1: 0.5 },
        });
        expect(sentToTheWebview.at(-1)).toEqual({
            type: "cellsBeingWritten",
            cellsBeingWritten: {},
        });
    });
});
