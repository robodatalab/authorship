import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellHeaderTitle,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
    AuthorFileEditorCellCard,
    useAuthorFileEditorCellTimesTheHostWroteIt,
} from "../author_editor/AuthorFileEditorCell";
import { AuthorFileEditorCellFields } from "../author_editor/AuthorFileEditorCellFields";
import type { AuthorFileEditorCellField } from "../author_editor/AuthorFileEditorCellFields";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import {
    replaceTheCell,
    type SendMessagesToVscode,
} from "../author_editor/AuthorFileEditorCanvas";
import { PLOT, type PlotCell } from "authordoc/cells/plot_cell";

interface AuthorFileEditorPlotCellProps {
    cell: PlotCell;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorFileEditorPlotCell({
    cell,
    sendMessagesToVscode,
}: AuthorFileEditorPlotCellProps) {
    const timesTheHostWroteIt = useAuthorFileEditorCellTimesTheHostWroteIt();
    const fields: AuthorFileEditorCellField[] = [
        {
            label: "Title",
            said: cell.title,
            onSaid: (title) => {
                const retitled = cell.withTitle(title);
                replaceTheCell(sendMessagesToVscode, retitled);
            },
        },
    ];

    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>
                Plot
                <AuthorFileEditorCellHeaderTitle title={cell.title} />
            </AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <AuthorFileEditorCellCard>
                    <AuthorFileEditorCellFields fields={fields} />
                </AuthorFileEditorCellCard>
                <AuthorFileEditorCellCard>
                    <MarkdownEditor
                        cellId={cell.uniqueId}
                        markdown={cell.overview}
                        timesTheHostWroteIt={timesTheHostWroteIt}
                        onMarkdownCommitted={(overview) => {
                            const overviewed = cell.withOverview(overview);
                            replaceTheCell(sendMessagesToVscode, overviewed);
                        }}
                    />
                </AuthorFileEditorCellCard>
            </AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}

registerAuthorDocumentCellType({
    cellKind: PLOT,
    menuLabel: "Plot",
    insertMenuGroup: "primary",
});
