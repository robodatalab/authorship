import { useEffect, useState } from "react";
import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
} from "../author_editor/AuthorFileEditorCell";
import { AuthorFileEditorCellFields } from "../author_editor/AuthorFileEditorCellFields";
import type { AuthorFileEditorCellField } from "../author_editor/AuthorFileEditorCellFields";
import { registerAuthorDocumentCellType } from "../author_editor/author_document_cell_types";
import { ABOUT, Cell } from "../storydoc/model";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { marked } from "marked";

const FIELDS: AuthorFileEditorCellField[] = [
        { name: "kdp", label: "KDP", hint: "https://amazon.com/author/…" },
        { name: "website", label: "Website", hint: "https://…" },
        { name: "substack", label: "Substack", hint: "https://….substack.com" },
];

interface AboutCellProps {
    cell: Cell;
}

export function AboutCell({ cell }: AboutCellProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState(cell.source);

    useEffect(() => {
        setDraft(cell.source);
    }, [cell.source]);

    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>About the Author</AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <AuthorFileEditorCellFields
                    fields={FIELDS}
                    attributes={cell.attrs}
                    onAttributeChanged={(name, value) =>
                        cell.replaceAttribute(name, value)
                    }
                />
                {isEditing ? (
                    <MarkdownEditor
                        markdown={draft}
                        onMarkdownChanged={setDraft}
                        onSettled={(settled) => cell.replaceMarkdown(settled)}
                        onFinished={() => {
                            setIsEditing(false);
                            cell.replaceMarkdown(draft);
                        }}
                    />
                ) : (
                    <div
                        className="author-file-editor-cell-prose"
                        onDoubleClick={() => setIsEditing(true)}
                        dangerouslySetInnerHTML={{
                            __html: marked.parse(cell.source, {
                                async: false,
                                gfm: true,
                            }),
                        }}
                    />
                )}
            </AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}

registerAuthorDocumentCellType({
    kind: ABOUT,
    label: "About the Author",
    category: "secondary",
    render: (document, cellIndex) => (
        <AboutCell cell={document.cells[cellIndex]} />
    ),
    create: () => new Cell(ABOUT, "", {}),
});
