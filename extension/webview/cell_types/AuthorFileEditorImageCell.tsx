import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
    AuthorFileEditorCellCard,
} from "../author_editor/AuthorFileEditorCell";
import { AuthorFileEditorCellFields } from "../author_editor/AuthorFileEditorCellFields";
import type {
    AuthorFileEditorCellCheckbox,
    AuthorFileEditorCellField,
} from "../author_editor/AuthorFileEditorCellFields";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import {
    replaceTheCell,
    type SendMessagesToVscode,
} from "../author_editor/AuthorFileEditorCanvas";
import { IMAGE, ImageCell } from "../../library/storydoc/cells/image_cell";
import "./ImageCell.css";

interface AuthorFileEditorImageCellProps {
    cell: ImageCell;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorFileEditorImageCell({
    cell,
    sendMessagesToVscode,
}: AuthorFileEditorImageCellProps) {
    const fields: AuthorFileEditorCellField[] = [
        {
            label: "Image",
            said: cell.src,
            placeholder: "cover.jpg",
            onSaid: (src) => {
                const image = new ImageCell(
                    src,
                    cell.fullPage,
                    cell.source,
                    cell.folded,
                    cell.at,
                    cell.uniqueId,
                );
                replaceTheCell(sendMessagesToVscode, image);
            },
        },
    ];
    const checkboxes: AuthorFileEditorCellCheckbox[] = [
        {
            label: "On a page of its own",
            isChecked: cell.fullPage,
            onChecked: (fullPage) => {
                const image = new ImageCell(
                    cell.src,
                    fullPage,
                    cell.source,
                    cell.folded,
                    cell.at,
                    cell.uniqueId,
                );
                replaceTheCell(sendMessagesToVscode, image);
            },
        },
    ];

    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Image</AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <AuthorFileEditorCellCard>
                    <AuthorFileEditorCellFields
                        fields={fields}
                        checkboxes={checkboxes}
                    />
                </AuthorFileEditorCellCard>
                {cell.src ? (
                    <AuthorFileEditorCellCard>
                        <img
                            className="image-cell-picture"
                            src={cell.src}
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
});
