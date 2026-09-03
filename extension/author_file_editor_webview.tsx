import { createRoot } from "react-dom/client";
import { AuthorFileEditorCanvas } from "./author_editor/AuthorFileEditorCanvas";
import { AUTHOR_FILE_EDITOR_COMMANDS } from "./author_file_editor_commands";

createRoot(document.getElementById("author-file-editor-root")!).render(
    <AuthorFileEditorCanvas commands={AUTHOR_FILE_EDITOR_COMMANDS} />,
);
