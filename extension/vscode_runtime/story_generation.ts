import type { ServerJob } from "./server/jobs";

// The sidebar tab of a kind of cell.
export interface StoryGenerationTabShown {
    kind: "tab";
    cellKind: string;
}

// The sidebar tab of a kind of cell, with the button of one of its commands
// highlighted: what the author is to do there.
export interface StoryGenerationCommandShown {
    kind: "command";
    cellKind: string;
    commandName: string;
}

// The story, in the editor.
export interface StoryGenerationEditorShown {
    kind: "editor";
}

// The part of authorship the story generation brings into view for the author.
export type StoryGenerationShown =
    | StoryGenerationTabShown
    | StoryGenerationCommandShown
    | StoryGenerationEditorShown;

// What the story generation asks the author, numbered, so that every question
// is acted on once: to review `story`, the story as a stage leaves it, with a
// part of authorship shown.
export interface StoryGenerationAsked {
    number: number;
    story: string;
    shown: StoryGenerationShown;
}

// A stage of the story generation, and how many of its steps are done of how
// many it has.
export interface StoryGenerationStage {
    doing: string;
    done: number;
    of: number | null;
}

// A stage of the story generation's workflow, and whether it is finished.
export interface StoryGenerationWorkflowStage {
    name: string;
    done: boolean;
}

export interface StoryGeneration extends ServerJob {
    progress: { steps: StoryGenerationStage[] };
    // Every stage, in the order they run.
    stages: StoryGenerationWorkflowStage[];
    asked: StoryGenerationAsked | null;
}
