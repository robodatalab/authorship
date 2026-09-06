import { beforeEach, describe, expect, it } from "vitest";

import { OpenAsTextCommand } from "../../../extension/vscode_runtime/commands/open_as_text";
import { executedCommands } from "../vscode";
import { forgetWhatTheEditorDid, storyOfThreeCells } from "./open_story";

beforeEach(forgetWhatTheEditorDid);

describe("OpenAsTextCommand — opens the document as text", () => {
    it("asks the editor to open the same file with the plain text editor", () => {
        new OpenAsTextCommand().invoke(storyOfThreeCells());
        expect(executedCommands).toEqual(["vscode.openWith"]);
    });
});
