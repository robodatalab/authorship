import { StoryWordRange } from "../cells/story_word_range";

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
