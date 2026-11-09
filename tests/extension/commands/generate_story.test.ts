import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GenerateStoryCommand } from "../../../extension/vscode_runtime/commands/generate_story";
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
            progress: { steps: [{ doing: "concepts", done: 0, of: 2 }] },
            asked: {
                number: 1,
                story: null,
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

describe("GenerateStoryCommand — brings what the generation asks into view", () => {
    it("selects the plot and the event a step changed, in the story the step would leave", async () => {
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
                        progress: { steps: [{ doing: "plots", done: 1, of: 3 }] },
                        asked: {
                            number: 1,
                            story: THE_STORY_WITH_A_PLOT,
                            shown: {
                                kind: "annotation",
                                cellKind: "plot",
                                annotationCellId: "p1",
                                passageId: "e1",
                            },
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

        expect(session.theStoryAnnotationsSelected.plot).toEqual({
            annotationCellId: "p1",
            passageId: "e1",
        });
    });

    it("brings the scene a step wrote into view in the editor", async () => {
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
                        progress: { steps: [{ doing: "scenes", done: 0, of: 1 }] },
                        asked: {
                            number: 1,
                            story: THE_STORY_WITH_A_PLOT,
                            shown: { kind: "cell", cellId: "c1" },
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

        expect(sentToThePage).toContainEqual({
            type: "storyTextShown",
            storyTextShown: {
                cellId: "c1",
                startCharacterOffsetInCell: 0,
                endCharacterOffsetInCell: 17,
            },
        });
    });
});
