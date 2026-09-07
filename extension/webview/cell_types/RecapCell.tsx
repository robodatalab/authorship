import {
    AuthorFileEditorCell,
    AuthorFileEditorCellRun,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
    AuthorFileEditorCellCard,
    AuthorFileEditorCellWarning,
    useAuthorFileEditorCellProseErrors,
    useAuthorFileEditorCellIsBeingWritten,
} from "../author_editor/AuthorFileEditorCell";
import { AuthorFileEditorCellFields } from "../author_editor/AuthorFileEditorCellFields";
import type { AuthorFileEditorCellField } from "../author_editor/AuthorFileEditorCellFields";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import type {
    SendMessagesToVscode,
    WebviewCell,
} from "../author_editor/AuthorFileEditorCanvas";
import {
    fixProseError,
    writeStorySoFar,
    replaceCellAttribute,
    replaceCellMarkdown,
} from "../../vscode_runtime/commands/author_document_edits";
import { RECAP } from "../../vscode_runtime/storydoc/model";

const FIELDS: AuthorFileEditorCellField[] = [
    {
        attributeName: "documents",
        label: "Documents",
        placeholder: "parts/part_1.author, parts/part_2.author",
    },
];

interface RecapCellProps {
    cell: WebviewCell;
    cellIndex: number;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function RecapCell({
    cell,
    cellIndex,
    sendMessagesToVscode,
}: RecapCellProps) {
    const howFarTheCellHasBeenWritten = useAuthorFileEditorCellIsBeingWritten();
    const proseErrors = useAuthorFileEditorCellProseErrors();

    return (
        <AuthorFileEditorCell
            sidebar={
                <>
                    <AuthorFileEditorCellRun
                        isRunning={howFarTheCellHasBeenWritten !== undefined}
                        howFarAlong={howFarTheCellHasBeenWritten ?? 0}
                        onRun={() =>
                            writeStorySoFar(sendMessagesToVscode, cellIndex)
                        }
                    />
                    <AuthorFileEditorCellWarning />
                </>
            }
        >
            <AuthorFileEditorCellHeader>
                The Story So Far
            </AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <AuthorFileEditorCellCard>
                    <AuthorFileEditorCellFields
                        fields={FIELDS}
                        cellAttributes={cell.attrs}
                        onAttributeChanged={(attributeName, attributeValue) =>
                            replaceCellAttribute(
                                sendMessagesToVscode,
                                cellIndex,
                                attributeName,
                                attributeValue,
                            )
                        }
                    />
                </AuthorFileEditorCellCard>
                <AuthorFileEditorCellCard>
                    <MarkdownEditor
                        markdown={cell.source}
                        errors={proseErrors}
                        onFixAsked={(proseError) =>
                            fixProseError(sendMessagesToVscode, proseError)
                        }
                        onMarkdownCommitted={(markdown) =>
                            replaceCellMarkdown(
                                sendMessagesToVscode,
                                cellIndex,
                                markdown,
                            )
                        }
                    />
                </AuthorFileEditorCellCard>
            </AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}

registerAuthorDocumentCellType({
    cellKind: RECAP,
    menuLabel: "The Story So Far",
    insertMenuGroup: "secondary",
    render: (cell, cellIndex, sendMessagesToVscode) => (
        <RecapCell
            cell={cell}
            cellIndex={cellIndex}
            sendMessagesToVscode={sendMessagesToVscode}
        />
    ),
    newCell: () => ({ kind: RECAP, source: "", attrs: {} }),
});
