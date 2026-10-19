import type { StoryWordRange } from "../cells/story_word_range";

export class AnnotatedPassages {
    constructor(
        readonly title: string,
        readonly storyWordRanges: readonly StoryWordRange[],
    ) {}
}
