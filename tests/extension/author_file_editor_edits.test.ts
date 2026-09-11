import { describe, expect, it } from "vitest";

import {
    openAuthorFileEditorSession,
    type AuthorFileEditorSession,
} from "../../extension/vscode_runtime/author_file_editor_session";
import { blankCellOfKind } from "../../extension/vscode_runtime/storydoc/cell_kinds";
import { EventEmitter, Uri } from "./vscode";

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

        session.changeTheDocument(() => undefined);

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
        session.changeTheDocument((story) =>
            story.cellWithId("c0")?.fold(true),
        );
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

        session.changeTheDocument((story) =>
            story.insertBefore("c1", blankCellOfKind("note")),
        );
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

        session.changeTheDocument((story) => story.removeCell("c1"));

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

        session.changeTheDocument((story) => story.moveCellsAt(2, 1, 0));

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

        session.changeTheDocument((story) =>
            story.cellWithId("c0")?.fold(true),
        );

        expect(session.document.cellWithId("c0")?.isFolded()).toBe(true);

        editsRecorded[0].undo();
        expect(session.document.text).toEqual(asItStood);

        editsRecorded[0].redo();
        expect(session.document.cellWithId("c0")?.isFolded()).toBe(true);
    });

    it("undoes every change the author made, however many ways they changed it", () => {
        const { session, undoEverythingRecorded, redoEverythingRecorded } =
            openSession(THE_STORY);
        const asItStood = session.document.text;

        session.theAuthorTypedInTheCell("c1", "She saw the gate.");
        session.changeTheDocument((story) =>
            story.insertBefore("c2", blankCellOfKind("note")),
        );
        session.changeTheDocument((story) => story.removeCell("c0"));
        session.changeTheDocument((story) => story.moveCellsAt(0, 1, 1));
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
