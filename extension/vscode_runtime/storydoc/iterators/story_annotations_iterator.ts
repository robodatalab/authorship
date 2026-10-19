import type { Document } from "../storydoc";
import { AnnotatedPassagesOf } from "../visitors/annotated_passages_of";
import { StoryAnnotationInTheStory } from "./story_annotation_in_the_story";
import { StoryWordRangeInTheStory } from "./story_word_range_in_the_story";
import { StoryWordsIterator } from "./story_words_iterator";

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
