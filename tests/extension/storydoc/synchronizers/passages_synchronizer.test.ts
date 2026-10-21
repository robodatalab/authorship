import { describe, expect, it } from "vitest";

import { PlotEdge, PlotNode } from "../../../../extension/library/storydoc/cells/plot_cell";
import { SalientConceptReference } from "../../../../extension/library/storydoc/cells/salient_concept_cell";
import { StoryWordRange } from "../../../../extension/library/storydoc/cells/story_word_range";
import { AuthorDocDiff } from "../../../../extension/library/storydoc/diff";
import { Document } from "../../../../extension/library/storydoc/storydoc";
import { PassagesSynchronizer } from "../../../../extension/library/storydoc/synchronizers/passages_synchronizer";

const THE_CHAPTER = '<!-- cell: chapter title="One" id="c1" -->\n';
const THE_NOTE = '<!-- cell: note id="n1" -->\n\n<!--\nNot a story word.\n-->\n';
const HE_HEARD = '<!-- cell: markdown id="c3" -->\n\nHe heard the bell.\n';
const IT_RANG = '<!-- cell: markdown id="c4" -->\n\nIt rang.\n';

function sheSaw(door: string): string {
    return `<!-- cell: markdown id="c2" -->\n\n${door}\n`;
}

function theConcept(words: string): string {
    return `<!-- cell: salient-concept title="Door" words="${words}" id="k1" -->\n\nWhat she saw.\n`;
}

function thePlot(nodes: string, edges: string): string {
    return `<!-- cell: plot title="The bell" nodes="${nodes}" edges="${edges}" id="p1" -->\n\nHe hears the bell.\n`;
}

function withThePassagesInStep(beforeText: string, afterText: string): Document {
    const before = new Document(beforeText);
    const after = new Document(afterText);
    const change = AuthorDocDiff.diff(before, after);
    const passagesMoved = new PassagesSynchronizer().synchronize(
        before,
        change,
    );
    return passagesMoved.applyTheDiff(after);
}

describe("a salient concept's passages, as the author writes in a cell", () => {
    it("move on when a word is written before them", () => {
        const story = withThePassagesInStep(
            [sheSaw("She saw the door."), HE_HEARD, theConcept("r1:6-7")].join("\n"),
            [sheSaw("She saw the old door."), HE_HEARD, theConcept("r1:6-7")].join("\n"),
        );

        expect(story.cellWithId("k1")).toMatchObject({
            references: [new SalientConceptReference("r1", new StoryWordRange(7, 8))],
        });
    });

    it("take in a word written among them", () => {
        const story = withThePassagesInStep(
            [sheSaw("She saw the door."), HE_HEARD, theConcept("r1:1-3")].join("\n"),
            [sheSaw("She saw the old door."), HE_HEARD, theConcept("r1:1-3")].join("\n"),
        );

        expect(story.cellWithId("k1")).toMatchObject({
            references: [new SalientConceptReference("r1", new StoryWordRange(1, 4))],
        });
    });

    it("leave out a word written just before them", () => {
        const story = withThePassagesInStep(
            [sheSaw("She saw the door."), HE_HEARD, theConcept("r1:2-3")].join("\n"),
            [sheSaw("She saw quietly the door."), HE_HEARD, theConcept("r1:2-3")].join("\n"),
        );

        expect(story.cellWithId("k1")).toMatchObject({
            references: [new SalientConceptReference("r1", new StoryWordRange(3, 4))],
        });
    });

    it("leave out a word written just after them", () => {
        const story = withThePassagesInStep(
            [sheSaw("She saw the door."), HE_HEARD, theConcept("r1:1-2")].join("\n"),
            [sheSaw("She saw the old door."), HE_HEARD, theConcept("r1:1-2")].join("\n"),
        );

        expect(story.cellWithId("k1")).toMatchObject({
            references: [new SalientConceptReference("r1", new StoryWordRange(1, 2))],
        });
    });

    it("keep a word of theirs that was written over", () => {
        const story = withThePassagesInStep(
            [sheSaw("She saw the door."), HE_HEARD, theConcept("r1:1-3")].join("\n"),
            [sheSaw("She sees the door."), HE_HEARD, theConcept("r1:1-3")].join("\n"),
        );

        expect(story.cellWithId("k1")).toMatchObject({
            references: [new SalientConceptReference("r1", new StoryWordRange(1, 3))],
        });
    });

    it("lose a passage whose words were all deleted", () => {
        const story = withThePassagesInStep(
            [sheSaw("She saw the door."), HE_HEARD, theConcept("r1:1-1, r2:2-3")].join("\n"),
            [sheSaw("She saw"), HE_HEARD, theConcept("r1:1-1, r2:2-3")].join("\n"),
        );

        expect(story.cellWithId("k1")).toMatchObject({
            references: [new SalientConceptReference("r1", new StoryWordRange(1, 1))],
        });
    });

    it("are gone when every one of them was deleted", () => {
        const story = withThePassagesInStep(
            [sheSaw("She saw the door."), HE_HEARD, theConcept("r1:2-3")].join("\n"),
            [sheSaw("She saw"), HE_HEARD, theConcept("r1:2-3")].join("\n"),
        );

        expect(story.cellWithId("k1")).toMatchObject({ references: [] });
    });

    it("count no words of a cell that is not prose", () => {
        const story = withThePassagesInStep(
            [THE_CHAPTER, sheSaw("She saw the door."), THE_NOTE, HE_HEARD, theConcept("r1:6-7")].join("\n"),
            [THE_CHAPTER, sheSaw("She saw the old door."), THE_NOTE, HE_HEARD, theConcept("r1:6-7")].join("\n"),
        );

        expect(story.cellWithId("k1")).toMatchObject({
            references: [new SalientConceptReference("r1", new StoryWordRange(7, 8))],
        });
    });
});

describe("a salient concept's passages, as the author adds, takes out and moves cells", () => {
    it("move on when a cell is written before them", () => {
        const story = withThePassagesInStep(
            [sheSaw("She saw the door."), HE_HEARD, theConcept("r1:6-7")].join("\n"),
            [sheSaw("She saw the door."), IT_RANG, HE_HEARD, theConcept("r1:6-7")].join("\n"),
        );

        expect(story.cellWithId("k1")).toMatchObject({
            references: [new SalientConceptReference("r1", new StoryWordRange(8, 9))],
        });
    });

    it("move back when a cell before them is taken out", () => {
        const story = withThePassagesInStep(
            [sheSaw("She saw the door."), HE_HEARD, theConcept("r1:6-7")].join("\n"),
            [HE_HEARD, theConcept("r1:6-7")].join("\n"),
        );

        expect(story.cellWithId("k1")).toMatchObject({
            references: [new SalientConceptReference("r1", new StoryWordRange(2, 3))],
        });
    });

    it("go with the cell they stand in when it moves", () => {
        const story = withThePassagesInStep(
            [sheSaw("She saw the door."), HE_HEARD, theConcept("r1:6-7")].join("\n"),
            [HE_HEARD, sheSaw("She saw the door."), theConcept("r1:6-7")].join("\n"),
        );

        expect(story.cellWithId("k1")).toMatchObject({
            references: [new SalientConceptReference("r1", new StoryWordRange(2, 3))],
        });
    });

    it("are gone with the cell they stand in", () => {
        const story = withThePassagesInStep(
            [sheSaw("She saw the door."), HE_HEARD, theConcept("r1:2-3, r2:6-7")].join("\n"),
            [HE_HEARD, theConcept("r1:2-3, r2:6-7")].join("\n"),
        );

        expect(story.cellWithId("k1")).toMatchObject({
            references: [new SalientConceptReference("r2", new StoryWordRange(2, 3))],
        });
    });
});

describe("a salient concept's passages the change writes itself", () => {
    it("are left as the change writes them", () => {
        const story = withThePassagesInStep(
            [sheSaw("She saw the door."), HE_HEARD, theConcept("r1:6-7")].join("\n"),
            [sheSaw("She saw the old door."), HE_HEARD, theConcept("r1:2-3")].join("\n"),
        );

        expect(story.cellWithId("k1")).toMatchObject({
            references: [new SalientConceptReference("r1", new StoryWordRange(2, 3))],
        });
    });

    it("are left as they come when the concept is added", () => {
        const story = withThePassagesInStep(
            [sheSaw("She saw the door."), HE_HEARD].join("\n"),
            [sheSaw("She saw the old door."), HE_HEARD, theConcept("r1:6-7")].join("\n"),
        );

        expect(story.cellWithId("k1")).toMatchObject({
            references: [new SalientConceptReference("r1", new StoryWordRange(6, 7))],
        });
    });
});

describe("a plot's nodes", () => {
    it("move on when a word is written before them", () => {
        const story = withThePassagesInStep(
            [sheSaw("She saw the door."), HE_HEARD, thePlot("n-she:0-0, n-bell:6-7", "e-1:n-she>n-bell")].join("\n"),
            [sheSaw("She saw the old door."), HE_HEARD, thePlot("n-she:0-0, n-bell:6-7", "e-1:n-she>n-bell")].join("\n"),
        );

        expect(story.cellWithId("p1")).toMatchObject({
            nodes: [
                new PlotNode("n-she", new StoryWordRange(0, 0)),
                new PlotNode("n-bell", new StoryWordRange(7, 8)),
            ],
            edges: [new PlotEdge("e-1", "n-she", "n-bell")],
        });
    });

    it("are taken out with their edges when all their words are deleted", () => {
        const story = withThePassagesInStep(
            [sheSaw("She saw the door."), HE_HEARD, thePlot("n-she:0-0, n-door:2-3, n-bell:6-7", "e-1:n-she>n-door, e-2:n-she>n-bell")].join("\n"),
            [sheSaw("She saw"), HE_HEARD, thePlot("n-she:0-0, n-door:2-3, n-bell:6-7", "e-1:n-she>n-door, e-2:n-she>n-bell")].join("\n"),
        );

        expect(story.cellWithId("p1")).toMatchObject({
            nodes: [
                new PlotNode("n-she", new StoryWordRange(0, 0)),
                new PlotNode("n-bell", new StoryWordRange(4, 5)),
            ],
            edges: [new PlotEdge("e-2", "n-she", "n-bell")],
        });
    });
});

describe("a change that moves no passage", () => {
    it("asks for no change of its own", () => {
        const before = new Document(
            [sheSaw("She saw the door."), HE_HEARD, theConcept("2-3")].join("\n"),
        );
        const after = new Document(
            [
                sheSaw("She saw the door."),
                '<!-- cell: markdown id="c3" -->\n\nHe heard the bells.\n',
                theConcept("2-3"),
            ].join("\n"),
        );
        const change = AuthorDocDiff.diff(before, after);

        const passagesMoved = new PassagesSynchronizer().synchronize(
            before,
            change,
        );

        expect(passagesMoved.empty()).toBe(true);
    });
});
