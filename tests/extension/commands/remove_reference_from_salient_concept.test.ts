import { describe, expect, it } from "vitest";

import { RemoveReferenceFromSalientConceptCommand } from "../../../extension/vscode_runtime/commands/remove_reference_from_salient_concept";
import { SalientConceptReference } from "../../../extension/library/storydoc/cells/salient_concept_cell";
import { StoryWordRange } from "../../../extension/library/storydoc/cells/story_word_range";
import { openStory } from "./open_story";

function storyWithTheDoor(words: string) {
    return openStory(`
<!-- cell: markdown id="c1" -->

She saw the door.

<!-- cell: salient-concept title="Door" words="${words}" id="k1" -->

What she saw.
`);
}

describe("RemoveReferenceFromSalientConceptCommand — takes a reference out of a salient concept", () => {
    it("removes the reference it was asked to and keeps the others", () => {
        const session = storyWithTheDoor("r1:1-1, r2:2-3");

        new RemoveReferenceFromSalientConceptCommand().invoke(session, {
            annotationCellId: "k1",
            referenceId: "r2",
        });

        expect(session.document.cellWithId("k1")).toMatchObject({
            references: [
                new SalientConceptReference("r1", new StoryWordRange(1, 1)),
            ],
        });
    });

    it("keeps the references it was not asked to remove in the order they are written", () => {
        const session = storyWithTheDoor("r1:3-3, r2:1-1, r3:0-0");

        new RemoveReferenceFromSalientConceptCommand().invoke(session, {
            annotationCellId: "k1",
            referenceId: "r2",
        });

        expect(session.document.cellWithId("k1")).toMatchObject({
            references: [
                new SalientConceptReference("r1", new StoryWordRange(3, 3)),
                new SalientConceptReference("r3", new StoryWordRange(0, 0)),
            ],
        });
    });

    it("keeps a reference to the same words as the one it removes", () => {
        const session = storyWithTheDoor("r1:2-3, r2:2-3");

        new RemoveReferenceFromSalientConceptCommand().invoke(session, {
            annotationCellId: "k1",
            referenceId: "r2",
        });

        expect(session.document.cellWithId("k1")).toMatchObject({
            references: [
                new SalientConceptReference("r1", new StoryWordRange(2, 3)),
            ],
        });
    });

    it("leaves the concept without words once its last reference is removed", () => {
        const session = storyWithTheDoor("r1:2-3");

        new RemoveReferenceFromSalientConceptCommand().invoke(session, {
            annotationCellId: "k1",
            referenceId: "r1",
        });

        expect(session.document.cellWithId("k1")).toMatchObject({
            references: [],
        });
    });
});
