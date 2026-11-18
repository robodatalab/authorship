import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { CharacterCell } from "authordoc/cells/character_cell";
import type { AuthorDocumentCommand } from "./author_document_command";

export class RemoveConceptFromCharacterCommand implements AuthorDocumentCommand {
    readonly commandName = "removeConceptFromCharacter";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const characterCellId = commandArguments.characterCellId as string;
        const conceptCellId = commandArguments.conceptCellId as string;
        session.changeTheDocument((story) => {
            const character = story.cellWithId(characterCellId);
            if (!(character instanceof CharacterCell)) {
                return story;
            }
            const referenced = character.concepts(story);
            const conceptsKept = referenced.filter(
                (concept) => concept.uniqueId !== conceptCellId,
            );
            const characterKept = character.withConcepts(conceptsKept);
            const storyChanged = story.withCell(characterKept);
            return storyChanged;
        });
    }
}
