import type { ReactNode } from "react";
import { AuthorFileEditorMainMenu } from "./AuthorFileEditorMainMenu";
import type { AuthorDocumentCommand } from "./author_document_command";
import { MarkdownCell } from "../cell_types/MarkdownCell";
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
            <ul>
                <li>
                    <MarkdownCell />
                </li>
                <li>
                    <MarkdownCell />
                </li>
            </ul>
        </div>
    );
}
