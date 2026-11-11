import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GenerateStoryCommand } from "../../../extension/vscode_runtime/commands/generate_story";
import type { StoryGenerationShown } from "../../../extension/vscode_runtime/story_generation";
import { executedCommands } from "../vscode";
import {
    forgetWhatTheEditorDid,
    openStory,
    sentToThePage,
    STORY_FILE,
} from "./open_story";

const THE_STORY = `
<!-- cell: markdown id="c1" -->

She saw the door.
`;

const THE_STORY_WITH_A_PLOT = `<!-- cell: markdown id="c1" -->

She saw the door.

<!-- cell: plot title="The door" id="p1" -->

She finds the door.
`;

beforeEach(forgetWhatTheEditorDid);
afterEach(() => vi.unstubAllGlobals());

describe("GenerateStoryCommand — runs the generation on the story's file", () => {
    it("starts it on the file and shows what it asks in the main menu until it ends", async () => {
        const asksForTheConcepts = {
            running: true,
            error: null,
            progress: { steps: [{ doing: "concept titles", done: 0, of: 0 }] },
            asked: {
                number: 1,
                story: THE_STORY_WITH_A_PLOT,
                shown: {
                    kind: "command",
                    cellKind: "salient-concept",
                    commandName: "addStoryAnnotation",
                },
            },
        };
        const fetched = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ id: STORY_FILE }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(asksForTheConcepts),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () =>
                    Promise.resolve({
                        running: false,
                        error: null,
                        progress: { steps: [] },
                        asked: null,
                    }),
            });
        vi.stubGlobal("fetch", fetched);
        const session = openStory(THE_STORY);

        await new GenerateStoryCommand().invoke(session);

        const [startedAt, started] = fetched.mock.calls[0];
        const [polledAt] = fetched.mock.calls[1];
        expect(startedAt).toContain("/generate/story");
        expect(JSON.parse(started.body)).toEqual({ path: STORY_FILE });
        expect(polledAt).toContain(
            "/generate/story/status?id=%2Fstories%2Fstory.author",
        );
        expect(sentToThePage).toContainEqual({
            type: "storyGeneration",
            storyGeneration: asksForTheConcepts,
        });
        expect(sentToThePage).toContainEqual({
            type: "storyGeneration",
            storyGeneration: null,
        });
        expect(session.theStoryGeneration).toBeNull();
    });
});

describe("GenerateStoryCommand — brings the part of authorship a stage worked in into view", () => {
    it.each<{ shown: StoryGenerationShown; commandsExecuted: string[] }>([
        {
            shown: {
                kind: "command",
                cellKind: "salient-concept",
                commandName: "addStoryAnnotation",
            },
            commandsExecuted: ["authorship.manuscript.focus"],
        },
        {
            shown: { kind: "tab", cellKind: "plot" },
            commandsExecuted: ["authorship.manuscript.focus"],
        },
        {
            shown: { kind: "editor" },
            commandsExecuted: [],
        },
    ])(
        "opens the Authorship panel only on a part of its own: $shown.kind",
        async ({ shown, commandsExecuted }) => {
            const fetched = vi
                .fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ id: STORY_FILE }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            running: true,
                            error: null,
                            progress: {
                                steps: [{ doing: "plots", done: 3, of: 3 }],
                            },
                            asked: {
                                number: 1,
                                story: THE_STORY_WITH_A_PLOT,
                                shown,
                            },
                        }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            running: false,
                            error: null,
                            progress: { steps: [] },
                            asked: null,
                        }),
                });
            vi.stubGlobal("fetch", fetched);
            const session = openStory(THE_STORY);

            await new GenerateStoryCommand().invoke(session);

            expect(executedCommands).toEqual(commandsExecuted);
        },
    );
});
