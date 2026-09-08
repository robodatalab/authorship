import { beforeEach, describe, expect, it } from "vitest";

import { WriteTableOfContentsCommand } from "../../../extension/vscode_runtime/commands/write_table_of_contents";
import { forgetWhatTheEditorDid, openStory } from "./open_story";

const A_STORY_WITH_A_CONTENTS_CELL = `
<!-- cell: contents id="toc" -->

<!-- cell: chapter title="The Door" id="c1" -->

<!-- cell: markdown id="c2" -->

She saw the door.

<!-- cell: chapter title="The Bell" id="c3" -->
`;

beforeEach(forgetWhatTheEditorDid);

describe("WriteTableOfContentsCommand — writes the table of contents", () => {
    it("lists the chapters, in the order they stand in", () => {
        const document = openStory(A_STORY_WITH_A_CONTENTS_CELL);

        new WriteTableOfContentsCommand().invoke(document, { cellId: "toc" });

        expect(document.cells[0].source).toBe("1. The Door\n1. The Bell");
    });

    it("writes an untitled chapter as one", () => {
        const document = openStory(
            '<!-- cell: contents id="toc" -->\n\n<!-- cell: chapter id="c1" -->\n',
        );

        new WriteTableOfContentsCommand().invoke(document, { cellId: "toc" });

        expect(document.cells[0].source).toBe("1. Untitled");
    });

    it("writes nothing into a story with no chapters", () => {
        const document = openStory('<!-- cell: contents id="toc" -->\n');

        new WriteTableOfContentsCommand().invoke(document, { cellId: "toc" });

        expect(document.cells[0].source).toBe("");
    });

    it("writes nothing when there is no cell at that index", () => {
        const document = openStory(A_STORY_WITH_A_CONTENTS_CELL);
        new WriteTableOfContentsCommand().invoke(document, {
            cellId: "nowhere",
        });
        expect(document.cells[0].source).toBe("");
    });
});
