import { describe, expect, it } from "vitest";

import {
    openAuthorFileEditorSession,
    type AuthorFileEditorSession,
} from "../../extension/vscode_runtime/author_file_editor_session";
import { NoteCell } from "authordoc/cells/note_cell";
import { AuthorDocDiff } from "authordoc/diff";
import { Suggestion } from "authordoc/suggestion";
import { EventEmitter, files, Uri } from "./vscode";

const DOCUMENT_PATH = "/stories/expat_pet.author";

const THE_CHAPTER = '<!-- cell: chapter id="c0" title="One" -->\n';
const SHE_SAW = '<!-- cell: markdown id="c1" -->\n\nShe saw the door.\n';
const HE_HEARD = '<!-- cell: markdown id="c2" -->\n\nHe heard the bell.\n';
const THE_STORY = THE_CHAPTER + "\n" + SHE_SAW + "\n" + HE_HEARD;

interface RecordedEdit {
    undo(): void;
    redo(): void;
}

interface OpenSession {
    session: AuthorFileEditorSession;
    editsRecorded: RecordedEdit[];
    undoEverythingRecorded(): void;
    redoEverythingRecorded(): void;
}

function openSession(text: string): OpenSession {
    const edited = new EventEmitter<RecordedEdit>();
    const editsRecorded: RecordedEdit[] = [];
    edited.event((edit) => editsRecorded.push(edit));
    const session = openAuthorFileEditorSession(
        Uri.file(DOCUMENT_PATH) as never,
        text,
        edited as never,
    );
    return {
        session,
        editsRecorded,
        undoEverythingRecorded: () => {
            for (const edit of [...editsRecorded].reverse()) {
                edit.undo();
            }
        },
        redoEverythingRecorded: () => {
            for (const edit of editsRecorded) {
                edit.redo();
            }
        },
    };
}

function typing(
    session: AuthorFileEditorSession,
    cellId: string,
    markdownItStoodAs: string,
    typed: string,
): void {
    let markdown = markdownItStoodAs;
    for (const character of typed) {
        markdown += character;
        session.theAuthorTypedInTheCell(cellId, markdown);
    }
}

function cellsOf(session: AuthorFileEditorSession): string[] {
    return session.document.cells.map(
        (cell) => `${cell.uniqueId}:${cell.kind}:${cell.source}`,
    );
}

describe("what a change to the document records", () => {
    it("records nothing when the change writes what already stood there", () => {
        const { session, editsRecorded } = openSession(THE_STORY);

        session.theAuthorTypedInTheCell("c1", "She saw the door.");

        expect(editsRecorded).toEqual([]);
    });

    it("records nothing when the change touches no cell at all", () => {
        const { session, editsRecorded } = openSession(THE_STORY);

        session.changeTheDocument((story) => story);

        expect(editsRecorded).toEqual([]);
    });

    it("records one edit for a run of keystrokes in the one cell", () => {
        const { session, editsRecorded } = openSession(THE_STORY);

        typing(session, "c1", "She saw the door.", "door!!!");

        expect(editsRecorded).toHaveLength(1);
    });

    it("begins another edit at the space between two words", () => {
        const { session, editsRecorded } = openSession(THE_STORY);

        typing(session, "c1", "She saw the door.", "!! Then");

        expect(editsRecorded).toHaveLength(2);
    });

    it("begins another edit when the author types in another cell", () => {
        const { session, editsRecorded } = openSession(THE_STORY);

        typing(session, "c1", "She saw the door.", "!!");
        typing(session, "c2", "He heard the bell.", "!!");

        expect(editsRecorded).toHaveLength(2);
    });

    it("begins another edit when the author leaves the cell and comes back", () => {
        const { session, editsRecorded } = openSession(THE_STORY);

        typing(session, "c1", "She saw the door.", "!!");
        session.theAuthorIsEditingTheCell(null);
        typing(session, "c1", "She saw the door.!!", "!!");

        expect(editsRecorded).toHaveLength(2);
    });

    it("begins another edit when a command changed the document in between", () => {
        const { session, editsRecorded } = openSession(THE_STORY);

        typing(session, "c1", "She saw the door.", "!!");
        session.changeTheDocument((story) => {
            const [chapter] = story.cells;
            const chapterFolded = chapter.withFolded(true);
            const storyFolded = story.withCell(chapterFolded);
            return storyFolded;
        });
        typing(session, "c1", "She saw the door.!!", "!!");

        expect(editsRecorded).toHaveLength(3);
    });

    it("begins another edit once the document has been saved", async () => {
        const { session, editsRecorded } = openSession(THE_STORY);

        typing(session, "c1", "She saw the door.", "!!");
        await session.writeTheDocumentToItsFile();
        typing(session, "c1", "She saw the door.!!", "!!");

        expect(editsRecorded).toHaveLength(2);
    });

    it("begins another edit once the author has undone one", () => {
        const { session, editsRecorded } = openSession(THE_STORY);

        typing(session, "c1", "She saw the door.", "!!");
        editsRecorded[0].undo();
        typing(session, "c1", "She saw the door.", "!!");

        expect(editsRecorded).toHaveLength(2);
    });

    it("does not let one run of typing grow without end", () => {
        const { session, editsRecorded } = openSession(THE_STORY);

        typing(session, "c1", "She saw the door.", "!".repeat(60));

        expect(editsRecorded).toHaveLength(2);
    });
});

describe("undoing and redoing what the author did", () => {
    it("puts back the text a keystroke wrote, and writes it again", () => {
        const { session, editsRecorded } = openSession(THE_STORY);
        const asItStood = session.document.text;

        session.theAuthorTypedInTheCell("c1", "She saw the door!");
        editsRecorded[0].undo();

        expect(session.document.text).toEqual(asItStood);

        editsRecorded[0].redo();

        expect(session.document.cellWithId("c1")?.source).toEqual(
            "She saw the door!",
        );
    });

    it("takes back the whole run the author typed, and writes it again", () => {
        const { session, editsRecorded } = openSession(THE_STORY);
        const asItStood = session.document.text;

        typing(session, "c1", "She saw the door.", "way");

        expect(editsRecorded).toHaveLength(1);
        expect(session.document.cellWithId("c1")?.source).toEqual(
            "She saw the door.way",
        );

        editsRecorded[0].undo();
        expect(session.document.text).toEqual(asItStood);

        editsRecorded[0].redo();
        expect(session.document.cellWithId("c1")?.source).toEqual(
            "She saw the door.way",
        );
    });

    it("takes back one run of typing at a time, newest first", () => {
        const { session, editsRecorded } = openSession(THE_STORY);
        const asItStood = session.document.text;

        typing(session, "c1", "She saw the door.", " It opened.");

        expect(editsRecorded).toHaveLength(2);

        editsRecorded[1].undo();
        expect(session.document.cellWithId("c1")?.source).toEqual(
            "She saw the door. It",
        );

        editsRecorded[0].undo();
        expect(session.document.text).toEqual(asItStood);
    });

    it("takes back a cell the author put in, and puts it back where it stood", () => {
        const { session, editsRecorded } = openSession(THE_STORY);
        const asItStood = session.document.text;

        session.changeTheDocument((story) => {
            const [chapter, sheSaw, heHeard] = story.cells;
            const note = new NoteCell();
            const storyWithTheNote = story.withCells([chapter, note, sheSaw, heHeard]);
            return storyWithTheNote;
        });
        const withTheNote = cellsOf(session);

        expect(withTheNote).toHaveLength(4);
        expect(session.document.cells[1].kind).toEqual("note");

        editsRecorded[0].undo();
        expect(session.document.text).toEqual(asItStood);

        editsRecorded[0].redo();
        expect(cellsOf(session)).toEqual(withTheNote);
    });

    it("writes back a cell the author deleted, where it stood", () => {
        const { session, editsRecorded } = openSession(THE_STORY);
        const asItStood = session.document.text;

        session.changeTheDocument((story) => {
            const [chapter, , heHeard] = story.cells;
            const storyWithoutTheCell = story.withCells([chapter, heHeard]);
            return storyWithoutTheCell;
        });

        expect(cellsOf(session)).toEqual([
            "c0:chapter:",
            "c2:markdown:He heard the bell.",
        ]);

        editsRecorded[0].undo();
        expect(session.document.text).toEqual(asItStood);

        editsRecorded[0].redo();
        expect(cellsOf(session)).toEqual([
            "c0:chapter:",
            "c2:markdown:He heard the bell.",
        ]);
    });

    it("puts a cell the author moved back in the order it stood in", () => {
        const { session, editsRecorded } = openSession(THE_STORY);
        const asItStood = session.document.text;

        session.changeTheDocument((story) => {
            const [chapter, sheSaw, heHeard] = story.cells;
            const storyReordered = story.withCells([heHeard, chapter, sheSaw]);
            return storyReordered;
        });

        expect(session.document.cells.map((cell) => cell.uniqueId)).toEqual([
            "c2",
            "c0",
            "c1",
        ]);

        editsRecorded[0].undo();
        expect(session.document.text).toEqual(asItStood);

        editsRecorded[0].redo();
        expect(session.document.cells.map((cell) => cell.uniqueId)).toEqual([
            "c2",
            "c0",
            "c1",
        ]);
    });

    it("unfolds a cell the author folded, and folds it again", () => {
        const { session, editsRecorded } = openSession(THE_STORY);
        const asItStood = session.document.text;

        session.changeTheDocument((story) => {
            const [chapter] = story.cells;
            const chapterFolded = chapter.withFolded(true);
            const storyFolded = story.withCell(chapterFolded);
            return storyFolded;
        });

        expect(session.document.cellWithId("c0")?.folded).toBe(true);

        editsRecorded[0].undo();
        expect(session.document.text).toEqual(asItStood);

        editsRecorded[0].redo();
        expect(session.document.cellWithId("c0")?.folded).toBe(true);
    });

    it("undoes every change the author made, however many ways they changed it", () => {
        const { session, undoEverythingRecorded, redoEverythingRecorded } =
            openSession(THE_STORY);
        const asItStood = session.document.text;

        session.theAuthorTypedInTheCell("c1", "She saw the gate.");
        session.changeTheDocument((story) => {
            const [chapter, sheSaw, heHeard] = story.cells;
            const note = new NoteCell();
            const storyWithTheNote = story.withCells([chapter, sheSaw, note, heHeard]);
            return storyWithTheNote;
        });
        session.changeTheDocument((story) => {
            const [, sheSaw, note, heHeard] = story.cells;
            const storyWithoutTheChapter = story.withCells([sheSaw, note, heHeard]);
            return storyWithoutTheChapter;
        });
        session.changeTheDocument((story) => {
            const [sheSaw, note, heHeard] = story.cells;
            const storyReordered = story.withCells([note, sheSaw, heHeard]);
            return storyReordered;
        });
        const asTheAuthorLeftIt = cellsOf(session);

        undoEverythingRecorded();
        expect(session.document.text).toEqual(asItStood);

        redoEverythingRecorded();
        expect(cellsOf(session)).toEqual(asTheAuthorLeftIt);
    });

    it("undoes what the edit changed and leaves alone what the file changed since", () => {
        const { session, editsRecorded } = openSession(THE_STORY);

        session.theAuthorIsEditingTheCell("c1");
        session.theAuthorTypedInTheCell("c1", "She saw the gate.");
        session.importTheFileLeavingTheCellTheAuthorIsEditing(
            THE_CHAPTER +
                "\n" +
                SHE_SAW +
                "\n" +
                '<!-- cell: markdown id="c2" -->\n\nHe heard a bell.\n',
        );

        editsRecorded[0].undo();

        expect(cellsOf(session)).toEqual([
            "c0:chapter:",
            "c1:markdown:She saw the door.",
            "c2:markdown:He heard a bell.",
        ]);
    });
});

describe("the suggestions the document holds", () => {
    const SUGGESTED_AT_LAST =
        '<!-- suggestion: id="c1" -->\n<!-- change: text from="16" removed="" written=" at last" -->\n';
    const THE_STORY_WITH_A_SUGGESTION =
        THE_CHAPTER + "\n" + SHE_SAW + "\n" + SUGGESTED_AT_LAST + "\n" + HE_HEARD;

    it("are kept from the file opened", () => {
        const { session } = openSession(THE_STORY_WITH_A_SUGGESTION);

        const kept = session.document.suggestions.map((suggestion) => suggestion.cellId);

        expect(kept).toEqual(["c1"]);
    });

    it("are written back to the file with the cells", async () => {
        const { session } = openSession(THE_STORY_WITH_A_SUGGESTION);

        await session.writeTheDocumentToItsFile();

        expect(files.get(DOCUMENT_PATH)).toBe(THE_STORY_WITH_A_SUGGESTION);
    });

    it("stay as they are while the author edits the cells", () => {
        const { session } = openSession(THE_STORY_WITH_A_SUGGESTION);

        typing(session, "c2", "He heard the bell.", " Twice.");

        expect(session.document.serialize()).toBe(
            THE_CHAPTER + "\n" + SHE_SAW + "\n" + SUGGESTED_AT_LAST + "\n" +
                '<!-- cell: markdown id="c2" -->\n\nHe heard the bell. Twice.\n',
        );
    });

    it("patch their cell with their diff once accepted, and are dropped", () => {
        const { session } = openSession(THE_STORY_WITH_A_SUGGESTION);

        session.acceptTheSuggestion("c1");

        expect(session.document.serialize()).toBe(
            THE_CHAPTER + "\n" + '<!-- cell: markdown id="c1" -->\n\nShe saw the door at last.\n' + "\n" + HE_HEARD,
        );
    });

    it("are dropped once rejected, leaving their cell as it is", () => {
        const { session } = openSession(THE_STORY_WITH_A_SUGGESTION);

        session.rejectTheSuggestion("c1");

        expect(session.document.serialize()).toBe(THE_STORY);
    });

    it("take what the author types in a cell with a suggestion into its diff, leaving the cell as it stands", () => {
        const { session } = openSession(THE_STORY_WITH_A_SUGGESTION);

        session.theAuthorTypedInTheCell("c1", "She saw the door at last, slowly.");

        expect(session.document.serialize()).toBe(
            THE_CHAPTER + "\n" + SHE_SAW + "\n" +
                '<!-- suggestion: id="c1" -->\n<!-- change: text from="16" removed="" written=" at last, slowly" -->\n' +
                "\n" + HE_HEARD,
        );
    });

    it("take a change to a cell with a suggestion into its diff, leaving the cell as it stands", () => {
        const { session } = openSession(THE_STORY_WITH_A_SUGGESTION);

        session.changeTheDocument((document) => {
            const cellShown = document.cellWithId("c1")!;
            const cellChanged = cellShown.withSource("She saw the door at last, once.");
            const documentChanged = document.withCell(cellChanged);
            return documentChanged;
        });

        expect(session.document.serialize()).toBe(
            THE_CHAPTER + "\n" + SHE_SAW + "\n" +
                '<!-- suggestion: id="c1" -->\n<!-- change: text from="16" removed="" written=" at last, once" -->\n' +
                "\n" + HE_HEARD,
        );
    });

    it("are dropped once the author changes the cell back to how it stands", () => {
        const { session } = openSession(THE_STORY_WITH_A_SUGGESTION);

        session.theAuthorTypedInTheCell("c1", "She saw the door.");

        expect(session.document.serialize()).toBe(THE_STORY);
    });

    it("take a change that touches no cell but a suggestion", () => {
        const { session } = openSession(THE_STORY);
        const emptyDiff = new AuthorDocDiff([]);
        const suggestion = new Suggestion("c2", emptyDiff);

        session.changeTheDocument((document) => {
            const documentWithTheSuggestion = document.withSuggestion(suggestion);
            return documentWithTheSuggestion;
        });

        const suggested = session.document.suggestions.map((held) => held.cellId);
        expect(suggested).toEqual(["c2"]);
    });

    describe("undone and redone", () => {
        const SUGGESTED_AT_LAST_ONCE =
            '<!-- suggestion: id="c1" -->\n<!-- change: text from="16" removed="" written=" at last, once" -->\n';
        const A_NEW_SECTION_SUGGESTED =
            '<!-- suggestion: id="c3" -->\n<!-- change: added at="3" kind="markdown" text="It rang." -->\n';

        it("record one edit for a run of keystrokes typed into a suggestion", () => {
            const { session, editsRecorded } = openSession(THE_STORY_WITH_A_SUGGESTION);

            typing(session, "c1", "She saw the door at last.", "!!!");

            expect(editsRecorded).toHaveLength(1);
        });

        it("take back what the author typed into a suggestion, and type it again", () => {
            const { session, editsRecorded } = openSession(THE_STORY_WITH_A_SUGGESTION);

            session.theAuthorTypedInTheCell("c1", "She saw the door at last, once.");
            editsRecorded[0].undo();

            expect(session.document.serialize()).toBe(THE_STORY_WITH_A_SUGGESTION);

            editsRecorded[0].redo();

            expect(session.document.serialize()).toBe(
                THE_CHAPTER + "\n" + SHE_SAW + "\n" + SUGGESTED_AT_LAST_ONCE + "\n" + HE_HEARD,
            );
        });

        it("take back a change a command made to a suggestion, and make it again", () => {
            const { session, editsRecorded } = openSession(THE_STORY_WITH_A_SUGGESTION);

            session.changeTheDocument((document) => {
                const cellShown = document.cellWithId("c1")!;
                const cellChanged = cellShown.withSource("She saw the door at last, once.");
                const documentChanged = document.withCell(cellChanged);
                return documentChanged;
            });
            editsRecorded[0].undo();

            expect(session.document.serialize()).toBe(THE_STORY_WITH_A_SUGGESTION);

            editsRecorded[0].redo();

            expect(session.document.serialize()).toBe(
                THE_CHAPTER + "\n" + SHE_SAW + "\n" + SUGGESTED_AT_LAST_ONCE + "\n" + HE_HEARD,
            );
        });

        it("take back, as one edit, a change to a cell with a suggestion and to a cell without one", () => {
            const { session, editsRecorded } = openSession(THE_STORY_WITH_A_SUGGESTION);

            session.changeTheDocument((document) => {
                const sheSaw = document.cellWithId("c1")!;
                const heHeard = document.cellWithId("c2")!;
                const sheSawChanged = sheSaw.withSource("She saw the door at last, once.");
                const heHeardChanged = heHeard.withSource("He heard the bell twice.");
                const documentWithSheSawChanged = document.withCell(sheSawChanged);
                const documentChanged = documentWithSheSawChanged.withCell(heHeardChanged);
                return documentChanged;
            });

            expect(editsRecorded).toHaveLength(1);

            editsRecorded[0].undo();

            expect(session.document.serialize()).toBe(THE_STORY_WITH_A_SUGGESTION);

            editsRecorded[0].redo();

            expect(session.document.serialize()).toBe(
                THE_CHAPTER + "\n" + SHE_SAW + "\n" + SUGGESTED_AT_LAST_ONCE + "\n" +
                    '<!-- cell: markdown id="c2" -->\n\nHe heard the bell twice.\n',
            );
        });

        it("come back as they stood when the author takes back accepting one, and are accepted again", () => {
            const { session, editsRecorded } = openSession(THE_STORY_WITH_A_SUGGESTION);

            session.acceptTheSuggestion("c1");
            editsRecorded[0].undo();

            expect(session.document.serialize()).toBe(THE_STORY_WITH_A_SUGGESTION);

            editsRecorded[0].redo();

            expect(session.document.serialize()).toBe(
                THE_CHAPTER + "\n" + '<!-- cell: markdown id="c1" -->\n\nShe saw the door at last.\n' + "\n" + HE_HEARD,
            );
        });

        it("come back when the author takes back rejecting one, and are rejected again", () => {
            const { session, editsRecorded } = openSession(THE_STORY_WITH_A_SUGGESTION);

            session.rejectTheSuggestion("c1");
            editsRecorded[0].undo();

            expect(session.document.serialize()).toBe(THE_STORY_WITH_A_SUGGESTION);

            editsRecorded[0].redo();

            expect(session.document.serialize()).toBe(THE_STORY);
        });

        it("come back when the author takes back changing the cell back to how it stands", () => {
            const { session, editsRecorded } = openSession(THE_STORY_WITH_A_SUGGESTION);

            session.theAuthorTypedInTheCell("c1", "She saw the door.");
            editsRecorded[0].undo();

            expect(session.document.serialize()).toBe(THE_STORY_WITH_A_SUGGESTION);

            editsRecorded[0].redo();

            expect(session.document.serialize()).toBe(THE_STORY);
        });

        it("take what the author types in a suggested new section into its suggestion, and take it back", () => {
            const { session, editsRecorded } = openSession(THE_STORY + "\n" + A_NEW_SECTION_SUGGESTED);

            session.theAuthorTypedInTheCell("c3", "It rang twice.");

            expect(session.document.serialize()).toBe(
                THE_STORY + "\n" +
                    '<!-- suggestion: id="c3" -->\n<!-- change: added at="3" kind="markdown" text="It rang twice." -->\n',
            );

            editsRecorded[0].undo();

            expect(session.document.serialize()).toBe(THE_STORY + "\n" + A_NEW_SECTION_SUGGESTED);
        });

        it("stay as they are when the author takes back an edit of a cell without one", () => {
            const { session, editsRecorded } = openSession(THE_STORY_WITH_A_SUGGESTION);

            session.theAuthorTypedInTheCell("c2", "He heard the bell!");
            editsRecorded[0].undo();

            expect(session.document.serialize()).toBe(THE_STORY_WITH_A_SUGGESTION);
        });
    });
});
