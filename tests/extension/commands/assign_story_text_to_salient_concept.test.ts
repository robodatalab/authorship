import { describe, expect, it, vi } from "vitest";

import { AssignStoryTextToSalientConceptCommand } from "../../../extension/vscode_runtime/commands/assign_story_text_to_salient_concept";
import { SalientConceptReference } from "../../../extension/library/storydoc/cells/salient_concept_cell";
import { StoryWordRange } from "../../../extension/library/storydoc/cells/story_word_range";
import { openStory } from "./open_story";

function storyWithTheDoor(words: string) {
    return openStory(`
<!-- cell: markdown id="c1" -->

She saw the door.

<!-- cell: salient-concept title="Door" ${words} id="k1" -->

What she saw.
`);
}

describe("AssignStoryTextToSalientConceptCommand — assigns the selected words to a salient concept", () => {
    it("assigns every word the selection touches", () => {
        const session = storyWithTheDoor("");
        vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(
            "3f1c0e2a-0000-4000-8000-000000000001",
        );

        new AssignStoryTextToSalientConceptCommand().invoke(session, {
            annotationCellId: "k1",
            cellId: "c1",
            startCharacterOffsetInCell: 5,
            endCharacterOffsetInCell: 13,
        });

        expect(session.document.cellWithId("k1")).toMatchObject({
            references: [
                new SalientConceptReference(
                    "3f1c0e2a-0000-4000-8000-000000000001",
                    new StoryWordRange(1, 3),
                ),
            ],
        });
    });

    it("adds them to the words the concept already holds", () => {
        const session = storyWithTheDoor('words="r1:0-0"');
        vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(
            "3f1c0e2a-0000-4000-8000-000000000001",
        );

        new AssignStoryTextToSalientConceptCommand().invoke(session, {
            annotationCellId: "k1",
            cellId: "c1",
            startCharacterOffsetInCell: 5,
            endCharacterOffsetInCell: 13,
        });

        expect(session.document.cellWithId("k1")).toMatchObject({
            references: [
                new SalientConceptReference("r1", new StoryWordRange(0, 0)),
                new SalientConceptReference(
                    "3f1c0e2a-0000-4000-8000-000000000001",
                    new StoryWordRange(1, 3),
                ),
            ],
        });
    });

    it("leaves the words as they are when they are assigned already", () => {
        const session = storyWithTheDoor('words="r1:1-3"');

        new AssignStoryTextToSalientConceptCommand().invoke(session, {
            annotationCellId: "k1",
            cellId: "c1",
            startCharacterOffsetInCell: 5,
            endCharacterOffsetInCell: 13,
        });

        expect(session.document.cellWithId("k1")).toMatchObject({
            references: [
                new SalientConceptReference("r1", new StoryWordRange(1, 3)),
            ],
        });
    });

    it("assigns nothing when the selection touches no word", () => {
        const session = storyWithTheDoor("");

        new AssignStoryTextToSalientConceptCommand().invoke(session, {
            annotationCellId: "k1",
            cellId: "c1",
            startCharacterOffsetInCell: 3,
            endCharacterOffsetInCell: 4,
        });

        expect(session.document.cellWithId("k1")).toMatchObject({
            references: [],
        });
    });
});
