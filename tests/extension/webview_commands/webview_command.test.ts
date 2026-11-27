import { describe, expect, it } from "vitest";
import { deserializeWebviewCommand } from "../../../extension/vscode_runtime/webview_commands/webview_command";

describe("deserializing a webview command", () => {
    it("throws for a type no webview command has", () => {
        expect(() => deserializeWebviewCommand({ type: "something" })).toThrow(
            'No webview command has the type "something"',
        );
    });
});
