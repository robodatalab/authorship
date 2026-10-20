import { PLOT } from "../library/storydoc/cells/plot_cell";
import { SALIENT_CONCEPT } from "../library/storydoc/cells/salient_concept_cell";

export const STORY_ANNOTATION_KINDS = [SALIENT_CONCEPT, PLOT];

export interface StoryAnnotationSelected {
    annotationCellId: string | null;
    passage: number | null;
}

export const NO_STORY_ANNOTATION_SELECTED: StoryAnnotationSelected = {
    annotationCellId: null,
    passage: null,
};
