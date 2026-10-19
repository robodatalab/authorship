import { StoryWordRange } from "../cells/story_word_range";
import type { Document } from "../storydoc";
import { ProseCellsIterator } from "./prose_cells_iterator";
import { TextWordsIterator } from "./text_words_iterator";

export class StoryWord {
    constructor(
        readonly number: number,
        readonly cellId: string,
        readonly text: string,
        readonly startCharacterOffsetInCell: number,
        readonly endCharacterOffsetInCell: number,
    ) {}
}

export class StoryTextSpan {
    constructor(
        readonly cellId: string,
        readonly startCharacterOffsetInCell: number,
        readonly endCharacterOffsetInCell: number,
    ) {}
}

export class StoryWordsIterator implements Iterable<StoryWord> {
    constructor(private readonly document: Document) {}

    *[Symbol.iterator](): Iterator<StoryWord> {
        let number = 0;
        const proseCells = new ProseCellsIterator(this.document);
        for (const cell of proseCells) {
            const textWords = new TextWordsIterator(cell.source);
            for (const word of textWords) {
                yield new StoryWord(
                    number,
                    cell.uniqueId,
                    word.text,
                    word.startCharacterOffset,
                    word.endCharacterOffset,
                );
                number += 1;
            }
        }
    }

    text(range: StoryWordRange): string {
        const spans = this.spans(range);
        const textsOfTheCells = spans.map((span) => {
            const cell = this.document.cellWithId(span.cellId);
            return (
                cell?.source.slice(
                    span.startCharacterOffsetInCell,
                    span.endCharacterOffsetInCell,
                ) ?? ""
            );
        });
        return textsOfTheCells.join("\n\n");
    }

    spans(range: StoryWordRange): StoryTextSpan[] {
        const spans: StoryTextSpan[] = [];
        for (const word of this) {
            if (word.number > range.lastWord) {
                break;
            }
            if (word.number < range.firstWord) {
                continue;
            }
            const spanBefore = spans[spans.length - 1];
            if (spanBefore?.cellId === word.cellId) {
                spans[spans.length - 1] = new StoryTextSpan(
                    spanBefore.cellId,
                    spanBefore.startCharacterOffsetInCell,
                    word.endCharacterOffsetInCell,
                );
            } else {
                const span = new StoryTextSpan(
                    word.cellId,
                    word.startCharacterOffsetInCell,
                    word.endCharacterOffsetInCell,
                );
                spans.push(span);
            }
        }
        return spans;
    }

    rangeBetween(
        cellId: string,
        startCharacterOffsetInCell: number,
        endCharacterOffsetInCell: number,
    ): StoryWordRange | null {
        const wordsTouched = Array.from(this).filter(
            (word) =>
                word.cellId === cellId &&
                word.startCharacterOffsetInCell < endCharacterOffsetInCell &&
                startCharacterOffsetInCell < word.endCharacterOffsetInCell,
        );
        if (wordsTouched.length === 0) {
            return null;
        }
        const firstWord = wordsTouched[0];
        const lastWord = wordsTouched[wordsTouched.length - 1];
        return new StoryWordRange(firstWord.number, lastWord.number);
    }
}
