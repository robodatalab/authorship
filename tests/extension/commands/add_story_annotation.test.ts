import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AddStoryAnnotationCommand } from "../../../extension/vscode_runtime/commands/add_story_annotation";
import { forgetWhatTheEditorDid, storyOfThreeCells } from "./open_story";

beforeEach(forgetWhatTheEditorDid);
afterEach(() => vi.restoreAllMocks());

describe("AddStoryAnnotationCommand — adds a story annotation and selects it", () => {
    it.each([{ cellKind: "salient-concept" }, { cellKind: "plot" }])(
        "adds an untitled $cellKind after the rest of the story",
        ({ cellKind }) => {
            vi.spyOn(crypto, "randomUUID").mockReturnValue(
                "00000000-0000-4000-8000-000000000009",
            );
            const session = storyOfThreeCells();

            new AddStoryAnnotationCommand().invoke(session, { cellKind });

            const cellsOfTheStory = session.document.cells.map((cell) => [
                cell.kind,
                cell.source,
                cell.attrs,
            ]);
            expect(cellsOfTheStory).toEqual([
                ["chapter", "", { title: "One", id: "c1" }],
                ["markdown", "She saw the door.", { id: "c2" }],
                ["markdown", "He heard the bell.", { id: "c3" }],
                [
                    cellKind,
                    "",
                    {
                        title: "Untitled",
                        id: "00000000-0000-4000-8000-000000000009",
                    },
                ],
            ]);
        },
    );

    it.each([
        {
            cellKind: "salient-concept",
            selected: {
                "salient-concept": {
                    annotationCellId: "00000000-0000-4000-8000-000000000009",
                    passage: null,
                },
                plot: { annotationCellId: null, passage: null },
            },
        },
        {
            cellKind: "plot",
            selected: {
                "salient-concept": { annotationCellId: null, passage: null },
                plot: {
                    annotationCellId: "00000000-0000-4000-8000-000000000009",
                    passage: null,
                },
            },
        },
    ])("selects the $cellKind it added", ({ cellKind, selected }) => {
        vi.spyOn(crypto, "randomUUID").mockReturnValue(
            "00000000-0000-4000-8000-000000000009",
        );
        const session = storyOfThreeCells();

        new AddStoryAnnotationCommand().invoke(session, { cellKind });

        expect(session.theStoryAnnotationsSelected).toEqual(selected);
    });
});
