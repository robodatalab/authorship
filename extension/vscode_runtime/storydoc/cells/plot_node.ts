import type { StoryWordRange } from "./story_word_range";

export class PlotNode {
    constructor(
        readonly nodeId: string,
        readonly storyWordRange: StoryWordRange,
    ) {}
}
