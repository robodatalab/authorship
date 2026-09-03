import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
} from "../author_editor/AuthorFileEditorCell";

interface MarkdownCellProps {}

export function MarkdownCell({}: MarkdownCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader></AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody></AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}
