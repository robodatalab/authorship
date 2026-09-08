import { beforeEach, describe, expect, it } from "vitest";

import { ExportMarkdownCommand } from "../../../extension/vscode_runtime/commands/export_markdown";
import { files } from "../vscode";
import { forgetWhatTheEditorDid, storyOfThreeCells } from "./open_story";

beforeEach(forgetWhatTheEditorDid);

describe("ExportMarkdownCommand — exports the document as markdown", () => {
    it("writes one markdown manuscript beside the document", async () => {
        await new ExportMarkdownCommand().invoke(storyOfThreeCells());

        const manuscript = files.get("/stories/story.md") ?? "";
        expect(manuscript).toContain("# One");
        expect(manuscript).toContain("She saw the door.");
        expect(manuscript).not.toContain("<!-- cell:");
    });
});
