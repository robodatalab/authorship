import {
    createContext,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { PLOT } from "authordoc/cells/plot_cell";
import { SALIENT_CONCEPT } from "authordoc/cells/salient_concept_cell";
import type { StoryTextSpan } from "authordoc/iterators/story_words_iterator";

export const STORY_ANNOTATION_KINDS = [SALIENT_CONCEPT, PLOT];

export interface StoryAnnotationSelected {
    annotationCellId: string | null;
    passageId: string | null;
}

export const NO_STORY_ANNOTATION_SELECTED: StoryAnnotationSelected = {
    annotationCellId: null,
    passageId: null,
};

export interface AuthorFileEditorSelection {
    storyAnnotationsSelected: Readonly<Record<string, StoryAnnotationSelected>>;
    storyTextSelected: StoryTextSpan | null;
    selectTheStoryAnnotation(
        cellKind: string,
        annotationCellId: string | null,
    ): void;
    selectThePassage(cellKind: string, passageId: string | null): void;
    selectTheStoryText(storyTextSelected: StoryTextSpan | null): void;
}

export const AuthorFileEditorSelectionContext =
    createContext<AuthorFileEditorSelection | null>(null);

export function AuthorFileEditorSelectionFence({
    children,
}: {
    children: ReactNode;
}) {
    const [storyAnnotationsSelected, selectTheStoryAnnotations] = useState<
        Readonly<Record<string, StoryAnnotationSelected>>
    >({});
    const [storyTextSelected, selectTheStoryText] =
        useState<StoryTextSpan | null>(null);
    const selection = useMemo<AuthorFileEditorSelection>(
        () => ({
            storyAnnotationsSelected,
            storyTextSelected,
            selectTheStoryAnnotation: (cellKind, annotationCellId) =>
                selectTheStoryAnnotations((selectedBefore) => ({
                    ...selectedBefore,
                    [cellKind]: { annotationCellId, passageId: null },
                })),
            selectThePassage: (cellKind, passageId) =>
                selectTheStoryAnnotations((selectedBefore) => {
                    const annotationSelected =
                        selectedBefore[cellKind] ??
                        NO_STORY_ANNOTATION_SELECTED;
                    return {
                        ...selectedBefore,
                        [cellKind]: {
                            annotationCellId:
                                annotationSelected.annotationCellId,
                            passageId,
                        },
                    };
                }),
            selectTheStoryText,
        }),
        [storyAnnotationsSelected, storyTextSelected],
    );
    return (
        <AuthorFileEditorSelectionContext.Provider value={selection}>
            {children}
        </AuthorFileEditorSelectionContext.Provider>
    );
}

export function useAuthorFileEditorSelection(): AuthorFileEditorSelection {
    const selection = useContext(AuthorFileEditorSelectionContext);
    if (!selection) {
        throw new Error(
            "The selection can only be used inside an AuthorFileEditorSelectionFence.",
        );
    }
    return selection;
}
