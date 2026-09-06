import { beforeEach, describe, expect, it } from "vitest";

import { DivideIntoPartsCommand } from "../../../extension/vscode_runtime/commands/divide_into_parts";
import { files } from "../vscode";
import { forgetWhatTheEditorDid, openStory } from "./open_story";

const FIRST_PART = "/stories/story.author/../parts/part_1.author";
const SECOND_PART = "/stories/story.author/../parts/part_2.author";

beforeEach(forgetWhatTheEditorDid);

describe("DivideIntoPartsCommand — divides the document into parts", () => {
    it("writes one file per part the author marked", async () => {
        const document = openStory(`
<!-- cell: part title="Day One" id="p1" -->

<!-- cell: chapter title="One" id="c1" -->

<!-- cell: markdown id="c2" -->

She saw the door.

<!-- cell: part title="Day Two" id="p2" -->

<!-- cell: chapter title="Two" id="c3" -->

<!-- cell: markdown id="c4" -->

He heard the bell.
`);

        await new DivideIntoPartsCommand().invoke(document);

        expect([...files.keys()].sort()).toEqual([FIRST_PART, SECOND_PART]);
        expect(files.get(FIRST_PART)).toContain("She saw the door.");
        expect(files.get(SECOND_PART)).toContain("He heard the bell.");
    });
});
