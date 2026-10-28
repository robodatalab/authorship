import { PLOT } from "authordoc/cells/plot_cell";
import { SALIENT_CONCEPT } from "authordoc/cells/salient_concept_cell";

export const STORY_ANNOTATION_KINDS = [SALIENT_CONCEPT, PLOT];

export interface StoryAnnotationSelected {
    annotationCellId: string | null;
    passageId: string | null;
}

export const NO_STORY_ANNOTATION_SELECTED: StoryAnnotationSelected = {
    annotationCellId: null,
    passageId: null,
};
