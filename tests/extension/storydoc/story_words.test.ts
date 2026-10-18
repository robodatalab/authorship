import { describe, expect, it } from "vitest";

import {
    ImmutableAuthorDocument,
    MutableAuthorDocument,
} from "../../../extension/vscode_runtime/storydoc/model";
import {
    storyAnnotationsIn,
    storyTextSpansOf,
    storyWordRangesOf,
    storyWordsIn,
    synchronizeTheStoryWordRanges,
} from "../../../extension/vscode_runtime/storydoc/story_words";
import { openStory } from "../commands/open_story";

function storyWhereSheSaw(door: string, words: string): string {
    return [
        '<!-- cell: chapter title="One" id="c1" -->',
        "",
        '<!-- cell: markdown id="c2" -->',
        "",
        door,
        "",
        '<!-- cell: note id="n1" -->',
        "",
        "<!--\nNot a story word.\n-->",
        "",
        '<!-- cell: markdown id="c3" -->',
        "",
        "He heard the bell.",
        "",
        `<!-- cell: salient-concept title="Door" words="${words}" id="k1" -->`,
        "",
        "What she saw.",
        "",
    ].join("\n");
}

function wordsOfTheConceptOnceSheWrote(
    words: string,
    door: string,
): string | undefined {
    const after = MutableAuthorDocument.fromText(
        storyWhereSheSaw(door, words),
    );
    synchronizeTheStoryWordRanges(
        ImmutableAuthorDocument.fromText(
            storyWhereSheSaw("She saw the door.", words),
        ),
        after,
    );
    return after.cellWithId("k1")?.attrs.words;
}

describe("the story's words", () => {
    it("are the words of the markdown cells, numbered across them", () => {
        const story = ImmutableAuthorDocument.fromText(
            storyWhereSheSaw("She saw the door.", "2-3"),
        );

        expect(storyWordsIn(story.cells).map((word) => word.text)).toEqual([
            "She",
            "saw",
            "the",
            "door.",
            "He",
            "heard",
            "the",
            "bell.",
        ]);
    });

    it("know where in their cell they stand", () => {
        const story = ImmutableAuthorDocument.fromText(
            storyWhereSheSaw("She saw the door.", "2-3"),
        );

        expect(storyWordsIn(story.cells)[5]).toEqual({
            cellId: "c3",
            text: "heard",
            startCharacterOffsetInCell: 3,
            endCharacterOffsetInCell: 8,
        });
    });
});

describe("the text a range of story words covers", () => {
    it("is one span in every cell the range reaches", () => {
        const story = ImmutableAuthorDocument.fromText(
            storyWhereSheSaw("She saw the door.", "2-5"),
        );

        expect(
            storyTextSpansOf(storyWordsIn(story.cells), {
                firstWord: 2,
                lastWord: 5,
            }),
        ).toEqual([
            {
                cellId: "c2",
                startCharacterOffsetInCell: 8,
                endCharacterOffsetInCell: 17,
            },
            {
                cellId: "c3",
                startCharacterOffsetInCell: 0,
                endCharacterOffsetInCell: 8,
            },
        ]);
    });
});

describe("a salient concept's words", () => {
    it("are read from the ranges it lists", () => {
        const story = ImmutableAuthorDocument.fromText(
            storyWhereSheSaw("She saw the door.", "2-3, 6-7"),
        );

        expect(storyWordRangesOf(story.cells[4])).toEqual([
            { firstWord: 2, lastWord: 3 },
            { firstWord: 6, lastWord: 7 },
        ]);
    });

    it("are listed with their title and the words each range covers", () => {
        const story = ImmutableAuthorDocument.fromText(
            storyWhereSheSaw("She saw the door.", "2-3, 6-7"),
        );

        const conceptsInTheStory = storyAnnotationsIn(
            story.cells,
            "salient-concept",
        );

        expect(conceptsInTheStory).toEqual([
            {
                annotationCellId: "k1",
                title: "Door",
                description: "What she saw.",
                passages: [
                    {
                        firstWord: 2,
                        lastWord: 3,
                        cellId: "c2",
                        wordsItCovers: "the door.",
                    },
                    {
                        firstWord: 6,
                        lastWord: 7,
                        cellId: "c3",
                        wordsItCovers: "the bell.",
                    },
                ],
            },
        ]);
    });

    it("move on when a word is written before them", () => {
        expect(
            wordsOfTheConceptOnceSheWrote("6-7", "She saw the old door."),
        ).toBe("7-8");
    });

    it("take in a word written among them", () => {
        expect(
            wordsOfTheConceptOnceSheWrote("1-3", "She saw the old door."),
        ).toBe("1-4");
    });

    it("leave out a word written just before them", () => {
        expect(
            wordsOfTheConceptOnceSheWrote("2-3", "She saw quietly the door."),
        ).toBe("3-4");
    });

    it("leave out a word written just after them", () => {
        expect(
            wordsOfTheConceptOnceSheWrote("1-2", "She saw the old door."),
        ).toBe("1-2");
    });

    it("keep a word of theirs that was written over", () => {
        expect(
            wordsOfTheConceptOnceSheWrote("1-3", "She sees the door."),
        ).toBe("1-3");
    });

    it("lose a range whose words were all deleted", () => {
        expect(wordsOfTheConceptOnceSheWrote("1-1, 2-3", "She saw")).toBe(
            "1-1",
        );
    });

    it("are gone when every one of them was deleted", () => {
        expect(wordsOfTheConceptOnceSheWrote("2-3", "She saw")).toBe(
            undefined,
        );
    });

    it("move on as the author types", () => {
        const session = openStory(
            storyWhereSheSaw("She saw the door.", "6-7"),
        );

        session.theAuthorTypedInTheCell("c2", "She saw the old door.");

        expect(session.document.cellWithId("k1")?.attrs.words).toBe("7-8");
    });
});

describe("a plot's trajectory", () => {
    const STORY_OF_THE_BELL = [
        '<!-- cell: markdown id="c2" -->',
        "",
        "She saw the door.",
        "",
        '<!-- cell: markdown id="c3" -->',
        "",
        "He heard the bell.",
        "",
        '<!-- cell: plot title="The bell" words="6-7, 2-3" id="p1" -->',
        "",
        "He hears the bell, so she opens the door.",
        "",
    ].join("\n");

    it("is listed with the plot's title and abstract, in the order it is written", () => {
        const story = ImmutableAuthorDocument.fromText(STORY_OF_THE_BELL);

        const plotsInTheStory = storyAnnotationsIn(story.cells, "plot");

        expect(plotsInTheStory).toEqual([
            {
                annotationCellId: "p1",
                title: "The bell",
                description: "He hears the bell, so she opens the door.",
                passages: [
                    {
                        firstWord: 6,
                        lastWord: 7,
                        cellId: "c3",
                        wordsItCovers: "the bell.",
                    },
                    {
                        firstWord: 2,
                        lastWord: 3,
                        cellId: "c2",
                        wordsItCovers: "the door.",
                    },
                ],
            },
        ]);
    });

    it("moves on as the author types", () => {
        const session = openStory(STORY_OF_THE_BELL);

        session.theAuthorTypedInTheCell("c2", "She saw the old door.");

        const trajectoryAsItIsWritten =
            session.document.cellWithId("p1")?.attrs.words;
        expect(trajectoryAsItIsWritten).toBe("7-8, 2-4");
    });
});
