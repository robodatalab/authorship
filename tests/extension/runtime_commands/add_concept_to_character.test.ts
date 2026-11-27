import { describe, expect, it } from "vitest";

import { AddConceptToCharacterCommand } from "../../../extension/vscode_runtime/runtime_commands/add_concept_to_character";
import type { AuthorFileEditorSession } from "../../../extension/vscode_runtime/author_file_editor_session";
import type { CharacterCell } from "authordoc/cells/character_cell";
import { openStory } from "./open_story";

const THE_STORY = `<!-- cell: salient-concept id="k1" title="Motherhood" -->

A mother puts her child first.

<!-- cell: salient-concept id="k2" title="The promise" -->

A promise is kept whatever it costs.

<!-- cell: character id="v1" title="Varn" concepts="k1" -->

A captain.
`;

function conceptsOfTheCharacter(session: AuthorFileEditorSession): string[] {
    const character = session.document.cellWithId("v1") as CharacterCell;
    const concepts = character.concepts(session.document);
    const titles = concepts.map((concept) => concept.title);
    return titles;
}

describe("AddConceptToCharacterCommand — has a character support a salient concept", () => {
    it.each([
        ["after the ones it supports", "k2", ["Motherhood", "The promise"]],
        ["only once", "k1", ["Motherhood"]],
        ["never a cell that is not a concept", "v1", ["Motherhood"]],
        ["never a cell the story does not have", "x9", ["Motherhood"]],
    ])("supports the concept %s", (_, conceptCellId, expected) => {
        const session = openStory(THE_STORY);

        new AddConceptToCharacterCommand().invoke(session, {
            characterCellId: "v1",
            conceptCellId,
        });

        expect(conceptsOfTheCharacter(session)).toEqual(expected);
    });
});
