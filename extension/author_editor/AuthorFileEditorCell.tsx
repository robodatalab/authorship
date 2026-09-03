import type { Cell } from '../storydoc/model';

interface AuthorFileEditorCellProps {
	cell: Cell;
}

export function AuthorFileEditorCell({ cell }: AuthorFileEditorCellProps) {
	return <section className="author-file-editor-cell">{cell.source}</section>;
}
