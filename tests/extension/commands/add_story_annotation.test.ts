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

            expect(session.document.text).toBe(
                [
                    '<!-- cell: chapter id="c1" title="One" -->',
                    "",
                    '<!-- cell: markdown id="c2" -->',
                    "",
                    "She saw the door.",
                    "",
                    '<!-- cell: markdown id="c3" -->',
                    "",
                    "He heard the bell.",
                    "",
                    `<!-- cell: ${cellKind} id="00000000-0000-4000-8000-000000000009" -->`,
                    "",
                ].join("\n"),
            );
        },
    );

    it.each([
        {
            cellKind: "salient-concept",
            selected: {
                "salient-concept": {
                    annotationCellId: "00000000-0000-4000-8000-000000000009",
                    passageId: null,
                },
                plot: { annotationCellId: null, passageId: null },
            },
        },
        {
            cellKind: "plot",
            selected: {
                "salient-concept": { annotationCellId: null, passageId: null },
                plot: {
                    annotationCellId: "00000000-0000-4000-8000-000000000009",
                    passageId: null,
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
