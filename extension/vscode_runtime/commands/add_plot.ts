import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { blankCellOfKind } from "../storydoc/cell_kinds";
import { PLOT } from "../storydoc/model";
import type { AuthorDocumentCommand } from "./author_document_command";

export class AddPlotCommand implements AuthorDocumentCommand {
    readonly commandName = "addPlot";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(session: AuthorFileEditorSession): void {
        const plot = blankCellOfKind(PLOT);
        session.changeTheDocument((story) => story.insertBefore(null, plot));
        session.selectThePlot(plot.uniqueId);
    }
}
