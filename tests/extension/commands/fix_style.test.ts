import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { authorDocumentCommandCards } from "../../../extension/vscode_runtime/commands/author_document_commands";
import { FixStyleCommand } from "../../../extension/vscode_runtime/commands/fix_style";
import { shownMessages } from "../vscode";
import { forgetWhatTheEditorDid, openStory, STORY_FILE } from "./open_story";

const A_STORY_OF_TWO_CHAPTERS = `
<!-- cell: chapter title="One" id="ch1" -->

<!-- cell: markdown id="c1" -->

She saw the door.

<!-- cell: chapter title="Two" id="ch2" -->

<!-- cell: markdown id="c2" -->

He heard the bell.
`;

function serverAnswers(pass: Record<string, unknown>): {
    url: string;
    body: unknown;
}[] {
    const asked: { url: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", (url: string, sent?: { body: string }) => {
        asked.push({ url, body: sent?.body && JSON.parse(sent.body) });
        return Promise.resolve({
            ok: true,
            json: () =>
                Promise.resolve(
                    url.includes("status")
                        ? {
                              running: false,
                              error: null,
                              leftAlone: [],
                              sections: [],
                              ...pass,
                          }
                        : { id: STORY_FILE },
                ),
        });
    });
    return asked;
}

beforeEach(forgetWhatTheEditorDid);
afterEach(() => vi.unstubAllGlobals());

describe("FixStyleCommand — the pass over the whole manuscript", () => {
    it("is in the main menu as the sparkle", () => {
        expect(
            authorDocumentCommandCards().find(
                (card) => card.commandName === "fixStyle",
            )?.iconClassName,
        ).toBe("codicon codicon-sparkle");
    });

    it("sends the document and puts each corrected section in the cell it came from", async () => {
        const asked = serverAnswers({
            sections: [
                { cellId: "c1", source: "She opened the door." },
                { cellId: "c2", source: "The bell rang." },
            ],
        });

        const session = openStory(A_STORY_OF_TWO_CHAPTERS);
        const asItStoodWhenAsked = session.document.text;
        await new FixStyleCommand().invoke(session);

        expect(asked[0].url).toContain("/fix/style");
        expect(asked[0].body).toEqual({
            path: STORY_FILE,
            text: asItStoodWhenAsked,
        });
        expect(asked[1].url).toContain(
            `/fix/style/status?id=${encodeURIComponent(STORY_FILE)}`,
        );
        expect(session.document.cellWithId("c1")?.source).toBe(
            "She opened the door.",
        );
        expect(session.document.cellWithId("c2")?.source).toBe(
            "The bell rang.",
        );
    });

    it("names the sections it left as the author wrote them", async () => {
        serverAnswers({
            sections: [{ cellId: "c2", source: "The bell rang." }],
            leftAlone: [
                {
                    opening: "She saw the door.",
                    why: "it came back mid-sentence",
                },
            ],
        });

        const session = openStory(A_STORY_OF_TWO_CHAPTERS);
        await new FixStyleCommand().invoke(session);

        expect(session.document.cellWithId("c1")?.source).toBe(
            "She saw the door.",
        );
        expect(shownMessages.at(-1)).toBe(
            "One section was left as you wrote it: “She saw the door.…” — it came back mid-sentence",
        );
    });

    it("says why the pass stopped", async () => {
        serverAnswers({ error: "the model is not serving" });

        await new FixStyleCommand().invoke(openStory(A_STORY_OF_TWO_CHAPTERS));

        expect(shownMessages.at(-1)).toContain("Cannot fix the style");
    });
});
