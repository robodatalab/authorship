import { describe, expect, it } from "vitest";

import { ReplaceAttributeCommand } from "../../../extension/vscode_runtime/commands/replace_attribute";
import { storyOfThreeCells } from "./open_story";

describe("ReplaceAttributeCommand — replaces a cell's attribute", () => {
    it("writes the new value into that cell's marker", () => {
        const session = storyOfThreeCells();
        new ReplaceAttributeCommand().invoke(session, {
            cellId: "c1",
            attributeName: "title",
            attributeValue: "The Door",
        });
        expect(session.document.cells[0].attrs.title).toBe("The Door");
        expect(session.document.text).toContain('title="The Door"');
    });

    it("writes nothing when there is no cell at that index", () => {
        const session = storyOfThreeCells();
        new ReplaceAttributeCommand().invoke(session, {
            cellId: "nowhere",
            attributeName: "title",
            attributeValue: "Nowhere",
        });
        expect(session.document.text).not.toContain("Nowhere");
    });
});
