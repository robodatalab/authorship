import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { CharacterCell } from "authordoc/cells/character_cell";
import { SalientConceptCell } from "authordoc/cells/salient_concept_cell";
import type { RuntimeCommand } from "./runtime_command";

export const ADD_CONCEPT_TO_CHARACTER = "addConceptToCharacter";

export class AddConceptToCharacterCommand implements RuntimeCommand {
    constructor(
        private readonly characterCellId: string,
        private readonly conceptCellId: string,
    ) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): AddConceptToCharacterCommand {
        const characterCellId = serialized.characterCellId as string;
        const conceptCellId = serialized.conceptCellId as string;
        const command = new AddConceptToCharacterCommand(
            characterCellId,
            conceptCellId,
        );
        return command;
    }

    invoke(session: AuthorFileEditorSession): void {
        session.changeTheDocument((story) => {
            const character = story.cellWithId(this.characterCellId);
            if (!(character instanceof CharacterCell)) {
                return story;
            }
            const concept = story.cellWithId(this.conceptCellId);
            if (!(concept instanceof SalientConceptCell)) {
                return story;
            }
            const referenced = character.concepts(story);
            if (
                referenced.some((cell) => cell.uniqueId === this.conceptCellId)
            ) {
                return story;
            }
            const concepts = [...referenced, concept];
            const characterSupporting = character.withConcepts(concepts);
            const storyChanged = story.withCell(characterSupporting);
            return storyChanged;
        });
    }
}
