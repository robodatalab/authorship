import { Cell } from "./cell";
import type { CellVisitor } from "./cell_visitor";
import type { StoryWordRange } from "./story_word_range";

export const SALIENT_CONCEPT = "salient-concept";

export class SalientConceptReference {
    constructor(
        readonly referenceId: string,
        readonly storyWordRange: StoryWordRange,
    ) {}
}

export class SalientConceptCell extends Cell {
    readonly kind = SALIENT_CONCEPT;

    constructor(
        readonly title: string = "",
        readonly references: readonly SalientConceptReference[] = [],
        source: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(source, folded, at, uniqueId);
    }

    withSource(source: string): SalientConceptCell {
        return new SalientConceptCell(
            this.title,
            this.references,
            source,
            this.folded,
            this.at,
            this.uniqueId,
        );
    }

    withFolded(folded: boolean): SalientConceptCell {
        return new SalientConceptCell(
            this.title,
            this.references,
            this.source,
            folded,
            this.at,
            this.uniqueId,
        );
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitSalientConcept(this);
    }
}
