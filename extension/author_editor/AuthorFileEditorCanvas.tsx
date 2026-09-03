import { AuthorFileEditorMainMenu } from "./AuthorFileEditorMainMenu";
import type { AuthorDocumentCommand } from "./author_document_command";
import "./AuthorFileEditorCanvas.css";

interface AuthorFileEditorCanvasProps {
    commands: AuthorDocumentCommand[];
}

export function AuthorFileEditorCanvas({
    commands,
}: AuthorFileEditorCanvasProps) {
    return (
        <div className="author-file-editor-canvas">
            <AuthorFileEditorMainMenu commands={commands} />
            <main className="author-file-editor-cell-list" />
        </div>
    );
}
