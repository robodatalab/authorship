import { createRoot } from "react-dom/client";
import { AuthorFileEditorCanvas } from "./author_editor/AuthorFileEditorCanvas";
import { AUTHOR_FILE_EDITOR_COMMANDS } from "./author_file_editor_commands";
import { AUTHOR_FILE_EDITOR_INSERTABLE_CELL_LABELS } from "./author_file_editor_insertable_cell_labels";

createRoot(document.getElementById("author-file-editor-root")!).render(
    <AuthorFileEditorCanvas
        mainMenuCommands={AUTHOR_FILE_EDITOR_COMMANDS}
        cellInsertCommands={AUTHOR_FILE_EDITOR_INSERTABLE_CELL_LABELS}
    />,
);
