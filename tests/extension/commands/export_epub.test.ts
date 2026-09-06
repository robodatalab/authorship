import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ExportEpubCommand } from "../../../extension/vscode_runtime/commands/export_epub";
import { files, shownMessages } from "../vscode";
import {
    forgetWhatTheEditorDid,
    STORY_FILE,
    storyOfThreeCells,
} from "./open_story";

beforeEach(forgetWhatTheEditorDid);
afterEach(() => vi.unstubAllGlobals());

describe("ExportEpubCommand — exports the document as an EPUB", () => {
    it("saves the document and asks the server to bind it", async () => {
        const asked: { url: string; body: unknown }[] = [];
        vi.stubGlobal("fetch", (url: string, sent: { body: string }) => {
            asked.push({ url, body: JSON.parse(sent.body) });
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ path: "/stories/story.epub" }),
            });
        });

        await new ExportEpubCommand().invoke(storyOfThreeCells());

        expect(files.get(STORY_FILE)).toContain("She saw the door.");
        expect(asked[0].url).toContain("/export/epub");
        expect(asked[0].body).toEqual({ path: STORY_FILE, force: false });
        expect(shownMessages).toContain("Exported story.epub");
    });
});
