import { StoryWordRange } from "../cells/story_word_range";
import type { Document } from "../storydoc";
import { AnnotatedPassagesOf } from "../visitors/annotated_passages_of";
import { StoryWordsIterator } from "./story_words_iterator";

export class StoryWordRangeInTheStory extends StoryWordRange {
    constructor(
        firstWord: number,
        lastWord: number,
        readonly cellId: string,
        readonly wordsItCovers: string,
    ) {
        super(firstWord, lastWord);
    }
}

export class StoryAnnotationInTheStory {
    constructor(
        readonly annotationCellId: string,
        readonly title: string,
        readonly description: string,
        readonly passages: readonly StoryWordRangeInTheStory[],
    ) {}
}

export class StoryAnnotationsIterator implements Iterable<StoryAnnotationInTheStory> {
    constructor(
        private readonly document: Document,
        private readonly cellKind: string,
    ) {}

    *[Symbol.iterator](): Iterator<StoryAnnotationInTheStory> {
        const storyWordsIterator = new StoryWordsIterator(this.document);
        const storyWords = Array.from(storyWordsIterator);
        const annotatedPassagesOf = new AnnotatedPassagesOf();
        for (const cell of this.document.cells) {
            if (cell.kind !== this.cellKind) {
                continue;
            }
            const annotated = cell.accept(annotatedPassagesOf);
            if (annotated === null) {
                continue;
            }
            const passages = annotated.storyWordRanges.map((range) => {
                const wordsCovered = storyWords
                    .slice(range.firstWord, range.lastWord + 1)
                    .map((word) => word.text);
                const cellId = storyWords[range.firstWord]?.cellId ?? "";
                return new StoryWordRangeInTheStory(
                    range.firstWord,
                    range.lastWord,
                    cellId,
                    wordsCovered.join(" "),
                );
            });
            yield new StoryAnnotationInTheStory(
                cell.uniqueId,
                annotated.title,
                cell.source,
                passages,
            );
        }
    }
}
