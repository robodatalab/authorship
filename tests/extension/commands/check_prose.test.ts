import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CheckProseCommand } from "../../../extension/vscode_runtime/commands/check_prose";
import { shownMessages } from "../vscode";
import { forgetWhatTheEditorDid, storyOfThreeCells } from "./open_story";

const ONE_ERROR = {
    cellId: "c2",
    startOffsetInCell: 4,
    endOffsetInCell: 7,
    ruleThatFoundTheError: "filter-word",
    isAnErrorOf: "style",
    reasonForError: "It reports rather than shows.",
    correctVersion: "",
};

beforeEach(forgetWhatTheEditorDid);
afterEach(() => vi.unstubAllGlobals());

describe("CheckProseCommand — checks the document's prose", () => {
    it("sends the document to the checker and waits for what it found", async () => {
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
                                  findings: [ONE_ERROR],
                              }
                            : { id: "job-1" },
                    ),
            });
        });

        await new CheckProseCommand().invoke(storyOfThreeCells());

        expect(asked[0]).toContain("/check/prose");
        expect(asked[1]).toContain("/check/prose/status?id=job-1");
        expect(shownMessages[0]).toContain("1 errors");
    });
});
