import type { StoryWordRangeInTheStory } from "./story_word_range_in_the_story";

export class StoryAnnotationInTheStory {
    constructor(
        readonly annotationCellId: string,
        readonly title: string,
        readonly description: string,
        readonly passages: readonly StoryWordRangeInTheStory[],
    ) {}
}
