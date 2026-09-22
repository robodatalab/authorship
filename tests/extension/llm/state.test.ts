import { describe, expect, it } from "vitest";

import { renderStatus } from "../../../extension/vscode_runtime/llm/state";

describe("renderStatus", () => {
    it("names the extension, not the model, in every state", () => {
        for (const phase of ["offline", "ready"] as const) {
            expect(renderStatus(phase).text).toMatch(
                /^\$\(book\) Authorship: /,
            );
        }
    });

    it("reads as ok when working, rather than talking about the model", () => {
        expect(renderStatus("ready").text).toBe("$(book) Authorship: ok");
    });

    it("never offers to start a server the extension does not start", () => {
        for (const phase of ["offline", "ready"] as const) {
            expect(renderStatus(phase).tooltip).not.toMatch(/click/i);
        }
    });
});
