import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CheckProseCommand } from "../../../extension/vscode_runtime/commands/check_prose";
import { openAuthorFileEditorSession } from "../../../extension/vscode_runtime/author_file_editor_session";
import {
    forgetWhatTheEditorDid,
    sentToThePage,
    storyOfThreeCells,
} from "./open_story";

const A_STYLE_ERROR = {
    cellId: "c2",
    startCharacterOffsetInCell: 4,
    endCharacterOffsetInCell: 7,
    wordsInTheCell: "saw",
    isVisible: true,
    ruleThatFoundTheError: "filter-word",
    isAnErrorOf: "style",
    reasonForError: "It reports rather than shows.",
    correctVersion: "",
};

const A_GRAMMAR_ERROR = {
    cellId: "c3",
    startCharacterOffsetInCell: 0,
    endCharacterOffsetInCell: 2,
    wordsInTheCell: "He",
    isVisible: true,
    ruleThatFoundTheError: "grammar:agreement",
    isAnErrorOf: "grammar",
    reasonForError: "He hear the bell.",
    correctVersion: "He heard",
};

beforeEach(forgetWhatTheEditorDid);
afterEach(() => vi.unstubAllGlobals());

describe("CheckProseCommand — checks the document's prose", () => {
    it("asks the rules and then the model, drawing what the rules found first", async () => {
        const asked: string[] = [];
        vi.stubGlobal("fetch", (url: string) => {
            asked.push(url);
            return Promise.resolve({
                ok: true,
                json: () =>
                    Promise.resolve(
                        url.includes("status")
                            ? {
                                  running: false,
                                  error: null,
                                  findings: url.includes("grammar")
                                      ? [A_GRAMMAR_ERROR]
                                      : [A_STYLE_ERROR],
                              }
                            : { id: "job-1" },
                    ),
            });
        });

        const session = storyOfThreeCells();

        await new CheckProseCommand().invoke(session);

        expect(asked[0]).toContain("/check/prose");
        expect(asked[1]).toContain("/check/prose/status?id=job-1");
        expect(asked[2]).toContain("/check/grammar");
        expect(asked[3]).toContain("/check/grammar/status?id=job-1");
        expect(sentToThePage).toEqual([
            { type: "proseErrors", proseErrors: [A_STYLE_ERROR] },
            {
                type: "proseErrors",
                proseErrors: [A_STYLE_ERROR, A_GRAMMAR_ERROR],
            },
        ]);
    });
});
