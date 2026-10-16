import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AddSalientConceptCommand } from "../../../extension/vscode_runtime/commands/add_salient_concept";
import { forgetWhatTheEditorDid, storyOfThreeCells } from "./open_story";

beforeEach(forgetWhatTheEditorDid);
afterEach(() => vi.restoreAllMocks());

describe("AddSalientConceptCommand — adds a concept and selects it", () => {
    it("adds an untitled concept after the rest of the story", () => {
        vi.spyOn(crypto, "randomUUID").mockReturnValue(
            "00000000-0000-4000-8000-000000000009",
        );
        const session = storyOfThreeCells();

        new AddSalientConceptCommand().invoke(session);

        expect(
            session.document.cells.map((cell) => [
                cell.kind,
                cell.source,
                cell.attrs,
            ]),
        ).toEqual([
            ["chapter", "", { title: "One", id: "c1" }],
            ["markdown", "She saw the door.", { id: "c2" }],
            ["markdown", "He heard the bell.", { id: "c3" }],
            [
                "salient-concept",
                "",
                {
                    title: "Untitled",
                    id: "00000000-0000-4000-8000-000000000009",
                },
            ],
        ]);
    });

    it("selects the concept it added", () => {
        vi.spyOn(crypto, "randomUUID").mockReturnValue(
            "00000000-0000-4000-8000-000000000009",
        );
        const session = storyOfThreeCells();

        new AddSalientConceptCommand().invoke(session);

        expect(session.theSalientConceptSelected).toBe(
            "00000000-0000-4000-8000-000000000009",
        );
    });
});
