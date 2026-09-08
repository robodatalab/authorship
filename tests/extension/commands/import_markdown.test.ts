import { beforeEach, describe, expect, it } from "vitest";
import * as vscode from "vscode";

import { ImportMarkdownCommand } from "../../../extension/vscode_runtime/commands/import_markdown";
import { dialogs, files } from "../vscode";
import {
    forgetWhatTheEditorDid,
    STORY_FILE,
    storyOfThreeCells,
} from "./open_story";

beforeEach(forgetWhatTheEditorDid);

describe("ImportMarkdownCommand — imports markdown into the document", () => {
    it("writes the chosen manuscript over the document, as cells", async () => {
        const manuscript = vscode.Uri.file("/stories/manuscript.md");
        files.set(
            manuscript.toString(),
            "# Veriona\n\n### One\n\nShe saw the door.\n",
        );
        dialogs.filesTheAuthorChose = [manuscript];
        dialogs.answerToTheWarning = "Replace";

        await new ImportMarkdownCommand().invoke(storyOfThreeCells());

        const written = files.get(STORY_FILE) ?? "";
        expect(written).toContain('<!-- cell: title-page title="Veriona"');
        expect(written).toContain('<!-- cell: chapter title="One"');
        expect(written).toContain("She saw the door.");
    });

    it("leaves the document alone when the author does not confirm", async () => {
        const manuscript = vscode.Uri.file("/stories/manuscript.md");
        files.set(manuscript.toString(), "# Veriona\n");
        dialogs.filesTheAuthorChose = [manuscript];

        await new ImportMarkdownCommand().invoke(storyOfThreeCells());

        expect(files.has(STORY_FILE)).toBe(false);
    });
});
