import type { ServerJob } from "./server/jobs";

// A salient concept or a plot, selected in its sidebar tab, and, when there is
// one, a passage of it: a plot's event, a concept's reference.
export interface StoryGenerationAnnotationShown {
    kind: "annotation";
    cellKind: string;
    annotationCellId: string;
    passageId: string | null;
}

// A cell of the story, brought into view in the editor.
export interface StoryGenerationCellShown {
    kind: "cell";
    cellId: string;
}

// The sidebar tab of a kind of cell, with the button of one of its commands
// highlighted: what the author is to do there.
export interface StoryGenerationCommandShown {
    kind: "command";
    cellKind: string;
    commandName: string;
}

// The part of authorship the story generation brings into view for the author.
export type StoryGenerationShown =
    | StoryGenerationAnnotationShown
    | StoryGenerationCellShown
    | StoryGenerationCommandShown;

// What the story generation asks the author, numbered, so that every question
// is acted on once: to review `story`, the story as a step would leave it, or,
// with no story, to work on the story as it is; either way, with a part of
// authorship shown.
export interface StoryGenerationAsked {
    number: number;
    story: string | null;
    shown: StoryGenerationShown;
}

// A stage of the story generation, and how many of its steps are done of how
// many it has.
export interface StoryGenerationStage {
    doing: string;
    done: number;
    of: number | null;
}

export interface StoryGeneration extends ServerJob {
    progress: { steps: StoryGenerationStage[] };
    asked: StoryGenerationAsked | null;
}
