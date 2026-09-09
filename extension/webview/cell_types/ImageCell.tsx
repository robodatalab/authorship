import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
    AuthorFileEditorCellCard,
} from "../author_editor/AuthorFileEditorCell";
import { AuthorFileEditorCellFields } from "../author_editor/AuthorFileEditorCellFields";
import type { AuthorFileEditorCellField } from "../author_editor/AuthorFileEditorCellFields";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import {
    invokeAuthorDocumentCommand,
    type SendMessagesToVscode,
    type WebviewCell,
} from "../author_editor/AuthorFileEditorCanvas";
import { IMAGE } from "../../vscode_runtime/storydoc/model";
import "./ImageCell.css";

const FIELDS: AuthorFileEditorCellField[] = [
    { attributeName: "src", label: "Image", placeholder: "cover.jpg" },
    {
        attributeName: "full-page",
        label: "On a page of its own",
        isCheckbox: true,
    },
];

interface ImageCellProps {
    cell: WebviewCell;
    cellId: string;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function ImageCell({
    cell,
    cellId,
    sendMessagesToVscode,
}: ImageCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Image</AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <AuthorFileEditorCellCard>
                    <AuthorFileEditorCellFields
                        fields={FIELDS}
                        cellAttributes={cell.attrs}
                        onAttributeChanged={(attributeName, attributeValue) =>
                            invokeAuthorDocumentCommand(
                                sendMessagesToVscode,
                                "replaceAttribute",
                                { cellId, attributeName, attributeValue },
                            )
                        }
                    />
                </AuthorFileEditorCellCard>
                {cell.attrs.src ? (
                    <AuthorFileEditorCellCard>
                        <img
                            className="image-cell-picture"
                            src={cell.attrs.src}
                            alt=""
                        />
                    </AuthorFileEditorCellCard>
                ) : null}
            </AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}

registerAuthorDocumentCellType({
    cellKind: IMAGE,
    menuLabel: "Image",
    insertMenuGroup: "secondary",
    render: (cell, cellId, sendMessagesToVscode) => (
        <ImageCell
            cell={cell}
            cellId={cellId}
            sendMessagesToVscode={sendMessagesToVscode}
        />
    ),
});
