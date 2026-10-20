import type { SendMessagesToVscode } from "./AuthorshipPanelCanvas";
import {
    AuthorFileEditorCellFields,
    type AuthorFileEditorCellField,
} from "../author_editor/AuthorFileEditorCellFields";
import {
    MarkdownEditor,
    MarkdownEditorMediator,
    useTimesTheHostRewroteIt,
} from "../markdown/MarkdownEditor";
import "./AuthorshipPanelStoryAnnotations.css";

interface AuthorshipPanelStoryAnnotationTitleAndDescriptionProps {
    annotationCellId: string;
    title: string;
    description: string;
    onRetitled: (title: string) => void;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorshipPanelStoryAnnotationTitleAndDescription({
    annotationCellId,
    title,
    description,
    onRetitled,
    sendMessagesToVscode,
}: AuthorshipPanelStoryAnnotationTitleAndDescriptionProps) {
    const descriptionRewrites = useTimesTheHostRewroteIt(description);
    const fields: AuthorFileEditorCellField[] = [
        { label: "Title", said: title, onSaid: onRetitled },
    ];

    return (
        <>
            <AuthorFileEditorCellFields fields={fields} />
            <div className="authorship-panel-story-annotation-description">
                <MarkdownEditorMediator onEditingTheCell={() => undefined}>
                    <MarkdownEditor
                        cellId={annotationCellId}
                        markdown={description}
                        timesTheHostWroteIt={
                            descriptionRewrites.timesTheHostRewroteIt
                        }
                        onMarkdownCommitted={(markdown) => {
                            descriptionRewrites.theAuthorTyped(markdown);
                            sendMessagesToVscode({
                                type: "typed",
                                cellId: annotationCellId,
                                markdown,
                            });
                        }}
                    />
                </MarkdownEditorMediator>
            </div>
        </>
    );
}
