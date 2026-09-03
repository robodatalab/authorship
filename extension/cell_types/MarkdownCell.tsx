import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
} from "../author_editor/AuthorFileEditorCell";

interface MarkdownCellProps {
    markdown: string;
}

export function MarkdownCell({ markdown }: MarkdownCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader></AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>{markdown}</AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}
