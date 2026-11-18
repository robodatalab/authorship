import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellHeaderTitle,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
    AuthorFileEditorCellCard,
    useAuthorFileEditorCellFindHighlights,
    useAuthorFileEditorCellTimesTheHostWroteIt,
} from "../author_editor/AuthorFileEditorCell";
import { AuthorFileEditorCellFields } from "../author_editor/AuthorFileEditorCellFields";
import type { AuthorFileEditorCellField } from "../author_editor/AuthorFileEditorCellFields";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import {
    replaceTheCell,
    sayTheAuthorTypedInTheCell,
    type SendMessagesToVscode,
} from "../author_editor/AuthorFileEditorCanvas";
import {
    AuthorFileEditorCellReferences,
    type AuthorFileEditorCellReferencesWording,
} from "./AuthorFileEditorCellReferences";
import { placesAround } from "../../vscode_runtime/place_hierarchy";
import { PLACE, PlaceCell } from "authordoc/cells/place_cell";
import type { Document } from "authordoc/storydoc";

const PLACE_PARENT_WORDING: AuthorFileEditorCellReferencesWording = {
    heading: "Parent",
    referenceOne: "Choose the place this place lies within",
    stopReferencing: "Take this place out of its parent",
    noneReferenced: "Lies within no other place",
    untitled: "Untitled place",
};

interface AuthorFileEditorPlaceCellProps {
    cell: PlaceCell;
    story: Document;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorFileEditorPlaceCell({
    cell,
    story,
    sendMessagesToVscode,
}: AuthorFileEditorPlaceCellProps) {
    const findHighlights = useAuthorFileEditorCellFindHighlights();
    const timesTheHostWroteIt = useAuthorFileEditorCellTimesTheHostWroteIt();
    const parent = cell.parent(story);
    const parentReferenced = parent === undefined ? [] : [parent];
    const placesInTheStory = story.cells.filter(
        (storyCell) => storyCell instanceof PlaceCell,
    );
    const placesToChoose = placesInTheStory.filter((other) => {
        const aroundTheOther = placesAround(other, story);
        const liesWithinThisPlace = aroundTheOther.some(
            (outer) => outer.uniqueId === cell.uniqueId,
        );
        return (
            other.uniqueId !== cell.uniqueId &&
            other.uniqueId !== cell._parent &&
            !liesWithinThisPlace
        );
    });

    function setTheParent(parentCellId: string): void {
        sendMessagesToVscode({
            type: "invoke",
            commandName: "setParentOfPlace",
            commandArguments: { placeCellId: cell.uniqueId, parentCellId },
        });
    }
    const fields: AuthorFileEditorCellField[] = [
        {
            label: "Name",
            said: cell.title,
            onSaid: (title) => {
                const renamed = new PlaceCell(
                    title,
                    cell.source,
                    cell.folded,
                    cell.at,
                    cell.uniqueId,
                    cell._parent,
                );
                replaceTheCell(sendMessagesToVscode, renamed);
            },
        },
    ];

    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>
                Place
                <AuthorFileEditorCellHeaderTitle title={cell.title} />
            </AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <AuthorFileEditorCellCard>
                    <AuthorFileEditorCellFields fields={fields} />
                </AuthorFileEditorCellCard>
                <AuthorFileEditorCellCard>
                    <MarkdownEditor
                        cellId={cell.uniqueId}
                        highlights={findHighlights}
                        markdown={cell.source}
                        timesTheHostWroteIt={timesTheHostWroteIt}
                        onMarkdownCommitted={(description) =>
                            sayTheAuthorTypedInTheCell(
                                sendMessagesToVscode,
                                cell.uniqueId,
                                description,
                            )
                        }
                    />
                </AuthorFileEditorCellCard>
                <AuthorFileEditorCellCard>
                    <AuthorFileEditorCellReferences
                        className="author-file-editor-place-parent"
                        referencedCells={parentReferenced}
                        cellsToChoose={placesToChoose}
                        wording={PLACE_PARENT_WORDING}
                        onReferenced={setTheParent}
                        onStoppedReferencing={() => setTheParent("")}
                    />
                </AuthorFileEditorCellCard>
            </AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}

registerAuthorDocumentCellType({
    cellKind: PLACE,
    menuLabel: "Place",
    insertMenuGroup: "primary",
});
