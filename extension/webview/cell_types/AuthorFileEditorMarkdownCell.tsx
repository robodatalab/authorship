import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
    AuthorFileEditorCellWarning,
    useAuthorFileEditorCellProseErrors,
    useAuthorFileEditorCellFindHighlights,
    useAuthorFileEditorCellStoryTextHighlights,
    useAuthorFileEditorCellStoryTextClicked,
    useAuthorFileEditorCellStoryTextSelected,
    useAuthorFileEditorCellStoryTextShown,
    useAuthorFileEditorCellTimesTheHostWroteIt,
} from "../author_editor/AuthorFileEditorCell";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import {
    invokeAuthorDocumentCommand,
    sayTheAuthorTypedInTheCell,
    type SendMessagesToVscode,
} from "../author_editor/AuthorFileEditorCanvas";
import {
    MARKDOWN,
    type MarkdownCell,
} from "authordoc/cells/markdown_cell";

interface AuthorFileEditorMarkdownCellProps {
    cell: MarkdownCell;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorFileEditorMarkdownCell({
    cell,
    sendMessagesToVscode,
}: AuthorFileEditorMarkdownCellProps) {
    const proseErrors = useAuthorFileEditorCellProseErrors();
    const findHighlights = useAuthorFileEditorCellFindHighlights();
    const storyTextSelected = useAuthorFileEditorCellStoryTextSelected();
    const storyTextClicked = useAuthorFileEditorCellStoryTextClicked();
    const storyTextHighlights =
        useAuthorFileEditorCellStoryTextHighlights();
    const { storyTextShown, onStoryTextShownAt } =
        useAuthorFileEditorCellStoryTextShown();
    const timesTheHostWroteIt = useAuthorFileEditorCellTimesTheHostWroteIt();

    return (
        <AuthorFileEditorCell sidebar={<AuthorFileEditorCellWarning />}>
            <AuthorFileEditorCellHeader>Markdown</AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <MarkdownEditor
                    cellId={cell.uniqueId}
                    highlights={findHighlights}
                    storyTextHighlights={storyTextHighlights}
                    storyTextShown={storyTextShown}
                    onTextSelected={storyTextSelected}
                    onTextClicked={storyTextClicked}
                    onStoryTextShownAt={onStoryTextShownAt}
                    markdown={cell.source}
                    timesTheHostWroteIt={timesTheHostWroteIt}
                    errors={proseErrors}
                    onFixAsked={(proseError) =>
                        invokeAuthorDocumentCommand(
                            sendMessagesToVscode,
                            "fixProse",
                            {
                                ...proseError,
                            },
                        )
                    }
                    onMarkdownCommitted={(markdown) =>
                        sayTheAuthorTypedInTheCell(
                            sendMessagesToVscode,
                            cell.uniqueId,
                            markdown,
                        )
                    }
                />
            </AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}

registerAuthorDocumentCellType({
    cellKind: MARKDOWN,
    menuLabel: "Markdown",
    insertMenuGroup: "primary",
});
