import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { CharacterCell } from "authordoc/cells/character_cell";
import type { RuntimeCommand } from "./runtime_command";

export const REMOVE_CONCEPT_FROM_CHARACTER = "removeConceptFromCharacter";

export class RemoveConceptFromCharacterCommand implements RuntimeCommand {
    constructor(
        private readonly characterCellId: string,
        private readonly conceptCellId: string,
    ) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): RemoveConceptFromCharacterCommand {
        const characterCellId = serialized.characterCellId as string;
        const conceptCellId = serialized.conceptCellId as string;
        const command = new RemoveConceptFromCharacterCommand(
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
            const referenced = character.concepts(story);
            const conceptsKept = referenced.filter(
                (concept) => concept.uniqueId !== this.conceptCellId,
            );
            const characterKept = character.withConcepts(conceptsKept);
            const storyChanged = story.withCell(characterKept);
            return storyChanged;
        });
    }
}
