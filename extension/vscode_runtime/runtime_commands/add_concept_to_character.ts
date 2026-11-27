import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { CharacterCell } from "authordoc/cells/character_cell";
import { SalientConceptCell } from "authordoc/cells/salient_concept_cell";
import type { AuthorDocumentCommand } from "./author_document_command";

export class AddConceptToCharacterCommand implements AuthorDocumentCommand {
    readonly commandName = "addConceptToCharacter";
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
            const concept = story.cellWithId(conceptCellId);
            if (!(concept instanceof SalientConceptCell)) {
                return story;
            }
            const referenced = character.concepts(story);
            if (referenced.some((cell) => cell.uniqueId === conceptCellId)) {
                return story;
            }
            const concepts = [...referenced, concept];
            const characterSupporting = character.withConcepts(concepts);
            const storyChanged = story.withCell(characterSupporting);
            return storyChanged;
        });
    }
}
