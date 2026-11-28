import { describe, expect, it } from "vitest";

import { RemoveConceptFromCharacterCommand } from "../../../extension/vscode_runtime/runtime_commands/remove_concept_from_character";
import type { AuthorFileEditorSession } from "../../../extension/vscode_runtime/author_file_editor_session";
import type { CharacterCell } from "authordoc/cells/character_cell";
import { openStory } from "./open_story";

const THE_STORY = `<!-- cell: salient-concept id="k1" title="Motherhood" -->

A mother puts her child first.

<!-- cell: salient-concept id="k2" title="The promise" -->

A promise is kept whatever it costs.

<!-- cell: character id="v1" title="Varn" concepts="k1, k2" -->

A captain.
`;

function conceptsOfTheCharacter(session: AuthorFileEditorSession): string[] {
    const character = session.document.cellWithId("v1") as CharacterCell;
    const concepts = character.concepts(session.document);
    const titles = concepts.map((concept) => concept.title);
    return titles;
}

describe("RemoveConceptFromCharacterCommand — has a character stop supporting a salient concept", () => {
    it.each([
        ["the one it was asked to, keeping the others", "k1", ["The promise"]],
        [
            "none when the character does not support the concept",
            "x9",
            ["Motherhood", "The promise"],
        ],
    ])("stops supporting %s", (_, conceptCellId, expected) => {
        const session = openStory(THE_STORY);

        RemoveConceptFromCharacterCommand.deserialize({
            characterCellId: "v1",
            conceptCellId,
        }).invoke(session);

        expect(conceptsOfTheCharacter(session)).toEqual(expected);
    });
});
