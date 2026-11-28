import { describe, expect, it } from "vitest";

import { FoldCellCommand } from "../../../extension/vscode_runtime/runtime_commands/fold_cell";
import { InvokeNamedCommand } from "../../../extension/vscode_runtime/runtime_commands/invoke_named_command";
import { deserializeRuntimeCommand } from "../../../extension/vscode_runtime/runtime_commands/runtime_command";
import { SendDocumentCommand } from "../../../extension/vscode_runtime/runtime_commands/send_document";
import { SetCellBeingEditedCommand } from "../../../extension/vscode_runtime/runtime_commands/set_cell_being_edited";
import { ShowWordRangeCommand } from "../../../extension/vscode_runtime/runtime_commands/show_word_range";
import { TypeInCellCommand } from "../../../extension/vscode_runtime/runtime_commands/type_in_cell";
import { StoryWordRange } from "authordoc/cells/story_word_range";

describe("deserializing a runtime command", () => {
    it.each([
        [{ type: "ready" }, new SendDocumentCommand()],
        [
            { type: "typed", cellId: "c1", markdown: "She saw the door." },
            new TypeInCellCommand("c1", "She saw the door."),
        ],
        [
            { type: "editing", cellId: "c1" },
            new SetCellBeingEditedCommand("c1"),
        ],
        [
            { type: "showStoryWordRange", firstWord: 2, lastWord: 3 },
            new ShowWordRangeCommand(new StoryWordRange(2, 3)),
        ],
        [
            {
                type: "invoke",
                commandName: "foldCell",
                commandArguments: { cellId: "c1" },
            },
            new InvokeNamedCommand(new FoldCellCommand("c1", true)),
        ],
    ])("%j", (serialized, expected) => {
        expect(deserializeRuntimeCommand(serialized)).toStrictEqual(expected);
    });

    it("throws for a type no runtime command has", () => {
        expect(() => deserializeRuntimeCommand({ type: "something" })).toThrow(
            'No runtime command has the type "something"',
        );
    });
});
