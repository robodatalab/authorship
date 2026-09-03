import { createRoot } from 'react-dom/client';
import { AuthorFileEditorMainMenu } from './AuthorFileEditorMainMenu';
import './AuthorFileEditorCanvas.css';

export function AuthorFileEditorCanvas() {
	return (
		<div className="author-file-editor-canvas">
			<AuthorFileEditorMainMenu />
			<main className="author-file-editor-cell-list" />
		</div>
	);
}

createRoot(document.getElementById('author-file-editor-root')!).render(
	<AuthorFileEditorCanvas />
);
