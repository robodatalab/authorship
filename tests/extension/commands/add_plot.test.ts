import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AddPlotCommand } from "../../../extension/vscode_runtime/commands/add_plot";
import { forgetWhatTheEditorDid, storyOfThreeCells } from "./open_story";

beforeEach(forgetWhatTheEditorDid);
afterEach(() => vi.restoreAllMocks());

describe("AddPlotCommand — adds a plot and selects it", () => {
    it("adds an untitled plot after the rest of the story", () => {
        vi.spyOn(crypto, "randomUUID").mockReturnValue(
            "00000000-0000-4000-8000-000000000009",
        );
        const session = storyOfThreeCells();

        new AddPlotCommand().invoke(session);

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
                "plot",
                "",
                {
                    title: "Untitled",
                    id: "00000000-0000-4000-8000-000000000009",
                },
            ],
        ]);
    });

    it("selects the plot it added", () => {
        vi.spyOn(crypto, "randomUUID").mockReturnValue(
            "00000000-0000-4000-8000-000000000009",
        );
        const session = storyOfThreeCells();

        new AddPlotCommand().invoke(session);

        expect(session.thePlotSelected).toBe(
            "00000000-0000-4000-8000-000000000009",
        );
    });
});
