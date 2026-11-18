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
import { CHARACTER, CharacterCell } from "authordoc/cells/character_cell";
import type { Document } from "authordoc/storydoc";

const CHARACTER_CONCEPTS_WORDING: AuthorFileEditorCellReferencesWording = {
    heading: "Concepts",
    referenceOne: "Have this character support a salient concept",
    stopReferencing: "Stop having this character support this concept",
    noneReferenced: "Supports no concepts yet",
    untitled: "Untitled concept",
};

interface AuthorFileEditorCharacterCellProps {
    cell: CharacterCell;
    story: Document;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorFileEditorCharacterCell({
    cell,
    story,
    sendMessagesToVscode,
}: AuthorFileEditorCharacterCellProps) {
    const findHighlights = useAuthorFileEditorCellFindHighlights();
    const timesTheHostWroteIt = useAuthorFileEditorCellTimesTheHostWroteIt();
    const conceptsSupported = cell.concepts(story);
    const conceptIdsSupported = conceptsSupported.map(
        (concept) => concept.uniqueId,
    );
    const conceptsToChoose = story
        .salientConcepts()
        .filter((concept) => !conceptIdsSupported.includes(concept.uniqueId));
    const fields: AuthorFileEditorCellField[] = [
        {
            label: "Name",
            said: cell.title,
            onSaid: (title) => {
                const renamed = new CharacterCell(
                    title,
                    cell.source,
                    cell.folded,
                    cell.at,
                    cell.uniqueId,
                    cell._concepts,
                );
                replaceTheCell(sendMessagesToVscode, renamed);
            },
        },
    ];

    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>
                Character
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
                        onMarkdownCommitted={(backstory) =>
                            sayTheAuthorTypedInTheCell(
                                sendMessagesToVscode,
                                cell.uniqueId,
                                backstory,
                            )
                        }
                    />
                </AuthorFileEditorCellCard>
                <AuthorFileEditorCellCard>
                    <AuthorFileEditorCellReferences
                        className="author-file-editor-character-concepts"
                        referencedCells={conceptsSupported}
                        cellsToChoose={conceptsToChoose}
                        wording={CHARACTER_CONCEPTS_WORDING}
                        onReferenced={(conceptCellId) =>
                            sendMessagesToVscode({
                                type: "invoke",
                                commandName: "addConceptToCharacter",
                                commandArguments: {
                                    characterCellId: cell.uniqueId,
                                    conceptCellId,
                                },
                            })
                        }
                        onStoppedReferencing={(conceptCellId) =>
                            sendMessagesToVscode({
                                type: "invoke",
                                commandName: "removeConceptFromCharacter",
                                commandArguments: {
                                    characterCellId: cell.uniqueId,
                                    conceptCellId,
                                },
                            })
                        }
                    />
                </AuthorFileEditorCellCard>
            </AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}

registerAuthorDocumentCellType({
    cellKind: CHARACTER,
    menuLabel: "Character",
    insertMenuGroup: "primary",
});
