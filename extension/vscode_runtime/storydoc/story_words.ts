import {
    MARKDOWN,
    SALIENT_CONCEPT,
    UNIQUE_CELL_ID,
    type ImmutableAuthorDocument,
    type ImmutableCell,
    type MutableAuthorDocument,
} from "./model";

type StoryDocumentCell = Pick<ImmutableCell, "kind" | "source" | "attrs">;

export const STORY_WORD_RANGES = "words";

export interface StoryWord {
    cellId: string;
    text: string;
    startCharacterOffsetInCell: number;
    endCharacterOffsetInCell: number;
}

export interface StoryWordRange {
    firstWord: number;
    lastWord: number;
}

export interface StoryWordRangeInTheStory extends StoryWordRange {
    cellId: string;
    wordsItCovers: string;
}

export interface SalientConceptInTheStory {
    conceptCellId: string;
    title: string;
    storyWordRanges: StoryWordRangeInTheStory[];
}

interface WordsAnEditReplaced {
    firstOldWord: number;
    endOfOldWords: number;
    firstNewWord: number;
    endOfNewWords: number;
}

interface WhereTheStoryWordsWent {
    newIndexOfEachOldWord: (number | null)[];
    wordsTheEditsReplaced: WordsAnEditReplaced[];
}

function storyWordsInTheCell(cell: StoryDocumentCell): StoryWord[] {
    return [...cell.source.matchAll(/\S+/g)]
        .filter((run) => /\w/.test(run[0]))
        .map((run) => ({
            cellId: cell.attrs[UNIQUE_CELL_ID],
            text: run[0],
            startCharacterOffsetInCell: run.index,
            endCharacterOffsetInCell: run.index + run[0].length,
        }));
}

export function storyWordsIn(
    cells: readonly StoryDocumentCell[],
): StoryWord[] {
    return cells
        .filter((cell) => cell.kind === MARKDOWN)
        .flatMap(storyWordsInTheCell);
}

export function storyWordRangeBetween(
    cells: readonly StoryDocumentCell[],
    cellId: string,
    startCharacterOffsetInCell: number,
    endCharacterOffsetInCell: number,
): StoryWordRange | null {
    const wordsTouched = storyWordsIn(cells)
        .map((word, wordIndex) => ({ word, wordIndex }))
        .filter(
            ({ word }) =>
                word.cellId === cellId &&
                word.startCharacterOffsetInCell < endCharacterOffsetInCell &&
                startCharacterOffsetInCell < word.endCharacterOffsetInCell,
        );
    if (wordsTouched.length === 0) {
        return null;
    }
    return {
        firstWord: wordsTouched[0].wordIndex,
        lastWord: wordsTouched[wordsTouched.length - 1].wordIndex,
    };
}

export function storyWordRangesOf(
    concept: Pick<ImmutableCell, "attrs">,
): StoryWordRange[] {
    return (concept.attrs[STORY_WORD_RANGES] ?? "")
        .split(",")
        .map((said) => /^\s*(\d+)-(\d+)\s*$/.exec(said))
        .filter((range) => range !== null)
        .map(([, firstWord, lastWord]) => ({
            firstWord: Number(firstWord),
            lastWord: Number(lastWord),
        }));
}

export function storyWordRangesAsTheyAreWritten(
    ranges: StoryWordRange[],
): string | undefined {
    if (ranges.length === 0) {
        return undefined;
    }
    return ranges
        .map((range) => `${range.firstWord}-${range.lastWord}`)
        .join(", ");
}

export function salientConceptsIn(
    cells: readonly StoryDocumentCell[],
): SalientConceptInTheStory[] {
    const storyWords = storyWordsIn(cells);
    return cells
        .filter((cell) => cell.kind === SALIENT_CONCEPT)
        .map((concept) => ({
            conceptCellId: concept.attrs[UNIQUE_CELL_ID],
            title: concept.attrs.title ?? "",
            storyWordRanges: storyWordRangesOf(concept).map((range) => ({
                ...range,
                cellId: storyWords[range.firstWord]?.cellId ?? "",
                wordsItCovers: storyWords
                    .slice(range.firstWord, range.lastWord + 1)
                    .map((word) => word.text)
                    .join(" "),
            })),
        }));
}

function firstStoryWordOfEachCell(
    cells: readonly ImmutableCell[],
): Map<string, number> {
    const firstWordOfTheCell = new Map<string, number>();
    let wordsBefore = 0;
    for (const cell of cells.filter((cell) => cell.kind === MARKDOWN)) {
        firstWordOfTheCell.set(cell.uniqueId, wordsBefore);
        wordsBefore += storyWordsInTheCell(cell).length;
    }
    return firstWordOfTheCell;
}

function wordsBothEndsOfTheCellShare(
    oldWords: string[],
    newWords: string[],
): { wordsAtTheStart: number; wordsAtTheEnd: number } {
    let wordsAtTheStart = 0;
    while (
        wordsAtTheStart < Math.min(oldWords.length, newWords.length) &&
        oldWords[wordsAtTheStart] === newWords[wordsAtTheStart]
    ) {
        wordsAtTheStart += 1;
    }
    let wordsAtTheEnd = 0;
    while (
        wordsAtTheEnd <
            Math.min(oldWords.length, newWords.length) - wordsAtTheStart &&
        oldWords[oldWords.length - 1 - wordsAtTheEnd] ===
            newWords[newWords.length - 1 - wordsAtTheEnd]
    ) {
        wordsAtTheEnd += 1;
    }
    return { wordsAtTheStart, wordsAtTheEnd };
}

function whereTheStoryWordsWent(
    before: readonly ImmutableCell[],
    after: readonly ImmutableCell[],
): WhereTheStoryWordsWent {
    const firstOldWordOfTheCell = firstStoryWordOfEachCell(before);
    const firstNewWordOfTheCell = firstStoryWordOfEachCell(after);
    const newIndexOfEachOldWord: (number | null)[] = new Array<number | null>(
        storyWordsIn(before).length,
    ).fill(null);
    const wordsTheEditsReplaced: WordsAnEditReplaced[] = [];
    for (const oldCell of before.filter((cell) => cell.kind === MARKDOWN)) {
        const newCell = after.find(
            (cell) => cell.uniqueId === oldCell.uniqueId,
        );
        const firstNewWord = firstNewWordOfTheCell.get(oldCell.uniqueId);
        if (newCell === undefined || firstNewWord === undefined) {
            continue;
        }
        const firstOldWord = firstOldWordOfTheCell.get(oldCell.uniqueId) ?? 0;
        const oldWords = storyWordsInTheCell(oldCell).map((word) => word.text);
        const newWords = storyWordsInTheCell(newCell).map((word) => word.text);
        const { wordsAtTheStart, wordsAtTheEnd } = wordsBothEndsOfTheCellShare(
            oldWords,
            newWords,
        );
        for (let word = 0; word < wordsAtTheStart; word += 1) {
            newIndexOfEachOldWord[firstOldWord + word] = firstNewWord + word;
        }
        for (let word = 0; word < wordsAtTheEnd; word += 1) {
            newIndexOfEachOldWord[firstOldWord + oldWords.length - 1 - word] =
                firstNewWord + newWords.length - 1 - word;
        }
        if (
            wordsAtTheStart + wordsAtTheEnd <
            Math.max(oldWords.length, newWords.length)
        ) {
            wordsTheEditsReplaced.push({
                firstOldWord: firstOldWord + wordsAtTheStart,
                endOfOldWords: firstOldWord + oldWords.length - wordsAtTheEnd,
                firstNewWord: firstNewWord + wordsAtTheStart,
                endOfNewWords: firstNewWord + newWords.length - wordsAtTheEnd,
            });
        }
    }
    return { newIndexOfEachOldWord, wordsTheEditsReplaced };
}

function theEditFallsWithinTheRange(
    edit: WordsAnEditReplaced,
    range: StoryWordRange,
): boolean {
    if (edit.firstOldWord === edit.endOfOldWords) {
        return (
            range.firstWord < edit.firstOldWord &&
            edit.firstOldWord <= range.lastWord
        );
    }
    return (
        edit.firstOldWord <= range.lastWord &&
        edit.endOfOldWords > range.firstWord
    );
}

function theRangeKeptInStep(
    range: StoryWordRange,
    whereTheWordsWent: WhereTheStoryWordsWent,
): StoryWordRange | null {
    const wordsItCovers: number[] = [];
    for (let word = range.firstWord; word <= range.lastWord; word += 1) {
        const newIndex = whereTheWordsWent.newIndexOfEachOldWord[word];
        if (newIndex !== null && newIndex !== undefined) {
            wordsItCovers.push(newIndex);
        }
    }
    for (const edit of whereTheWordsWent.wordsTheEditsReplaced) {
        if (
            edit.firstNewWord < edit.endOfNewWords &&
            theEditFallsWithinTheRange(edit, range)
        ) {
            wordsItCovers.push(edit.firstNewWord, edit.endOfNewWords - 1);
        }
    }
    if (wordsItCovers.length === 0) {
        return null;
    }
    return {
        firstWord: Math.min(...wordsItCovers),
        lastWord: Math.max(...wordsItCovers),
    };
}

export function synchronizeTheStoryWordRanges(
    before: ImmutableAuthorDocument,
    after: MutableAuthorDocument,
): void {
    const concepts = after.cells.filter(
        (cell) =>
            cell.kind === SALIENT_CONCEPT &&
            cell.attrs[STORY_WORD_RANGES] !== undefined,
    );
    if (concepts.length === 0) {
        return;
    }
    const whereTheWordsWent = whereTheStoryWordsWent(before.cells, after.cells);
    for (const concept of concepts) {
        const rangesKeptInStep = storyWordRangesOf(concept)
            .map((range) => theRangeKeptInStep(range, whereTheWordsWent))
            .filter((range) => range !== null);
        concept.replaceAttribute(
            STORY_WORD_RANGES,
            storyWordRangesAsTheyAreWritten(rangesKeptInStep),
        );
    }
}
