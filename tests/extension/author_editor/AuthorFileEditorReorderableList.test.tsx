import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { AuthorFileEditorReorderableList } from "../../../extension/webview/author_editor/AuthorFileEditorReorderableList";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe("a reorderable list", () => {
    let onMoved: Mock;
    let drawBesideTheItems: Mock;

    afterEach(() => vi.restoreAllMocks());

    async function mountTheList(itemIds: string[]): Promise<void> {
        onMoved = vi.fn();
        drawBesideTheItems = vi.fn(() => null);
        document.body.innerHTML = "";
        const container = document.createElement("div");
        document.body.append(container);
        const root = createRoot(container);
        await act(async () => {
            root.render(
                <AuthorFileEditorReorderableList
                    itemIds={itemIds}
                    onMoved={onMoved}
                    drawTheItem={(itemId, dragging) => (
                        <span
                            className="handle"
                            draggable
                            onDragStart={dragging.onDragStarted}
                            onDragEnd={dragging.onDragEnded}
                        >
                            {itemId}
                        </span>
                    )}
                    drawBesideTheItems={drawBesideTheItems}
                />,
            );
        });
    }

    async function dispatch(element: Element, eventType: string): Promise<void> {
        const event = new MouseEvent(eventType, { bubbles: true });
        await act(async () => {
            element.dispatchEvent(event);
        });
    }

    function itemsShown(): string[] {
        const items = document.querySelectorAll(
            ".author-file-editor-reorderable-list-item",
        );
        return [...items].map((item) => item.textContent ?? "");
    }

    function itemsMarkedDragged(): boolean[] {
        const items = document.querySelectorAll(
            ".author-file-editor-reorderable-list-item",
        );
        return [...items].map((item) =>
            item.classList.contains(
                "author-file-editor-reorderable-list-item-dragged",
            ),
        );
    }

    it("draws an item for every id, in their order", async () => {
        await mountTheList(["a", "b", "c"]);

        expect(itemsShown()).toEqual(["a", "b", "c"]);
    });

    it("lets an item be dragged only by what it hands the drag to", async () => {
        await mountTheList(["a", "b", "c"]);

        const items = document.querySelectorAll(
            ".author-file-editor-reorderable-list-item",
        );
        const draggable = [...items].map((item) =>
            item.getAttribute("draggable"),
        );
        expect(draggable).toEqual([null, null, null]);
    });

    it.each([
        { dragged: 1, droppedOn: 0, itemId: "b", inPlaceOfItemId: "a" },
        { dragged: 0, droppedOn: 2, itemId: "a", inPlaceOfItemId: "c" },
        { dragged: 2, droppedOn: 1, itemId: "c", inPlaceOfItemId: "b" },
    ])(
        "asks for the item $itemId dragged to take the place of the item $inPlaceOfItemId dropped on",
        async ({ dragged, droppedOn, itemId, inPlaceOfItemId }) => {
            await mountTheList(["a", "b", "c"]);
            const handles = document.querySelectorAll(".handle");
            const items = document.querySelectorAll(
                ".author-file-editor-reorderable-list-item",
            );

            await dispatch(handles[dragged], "dragstart");
            await dispatch(items[droppedOn], "dragenter");
            await dispatch(items[droppedOn], "drop");

            expect(onMoved.mock.calls).toEqual([[itemId, inPlaceOfItemId]]);
        },
    );

    it("moves nothing when an item is dropped on itself", async () => {
        await mountTheList(["a", "b", "c"]);
        const handles = document.querySelectorAll(".handle");
        const items = document.querySelectorAll(
            ".author-file-editor-reorderable-list-item",
        );

        await dispatch(handles[0], "dragstart");
        await dispatch(items[0], "dragenter");
        await dispatch(items[0], "drop");

        expect(onMoved).not.toHaveBeenCalled();
    });

    it("moves nothing once an item was let go outside the list", async () => {
        await mountTheList(["a", "b", "c"]);
        const handles = document.querySelectorAll(".handle");
        const items = document.querySelectorAll(
            ".author-file-editor-reorderable-list-item",
        );

        await dispatch(handles[0], "dragstart");
        await dispatch(items[1], "dragenter");
        await dispatch(handles[0], "dragend");
        await dispatch(items[1], "drop");

        expect(onMoved).not.toHaveBeenCalled();
    });

    it.each([
        {
            dragging: "the first item over the last",
            dragged: 0,
            draggedOver: 2,
            shown: ["b", "c", "a"],
        },
        {
            dragging: "the last item over the first",
            dragged: 2,
            draggedOver: 0,
            shown: ["c", "a", "b"],
        },
        {
            dragging: "the middle item over the first",
            dragged: 1,
            draggedOver: 0,
            shown: ["b", "a", "c"],
        },
        {
            dragging: "an item over itself",
            dragged: 1,
            draggedOver: 1,
            shown: ["a", "b", "c"],
        },
    ])(
        "shows where the item lands while dragging $dragging",
        async ({ dragged, draggedOver, shown }) => {
            await mountTheList(["a", "b", "c"]);
            const handles = document.querySelectorAll(".handle");
            const items = document.querySelectorAll(
                ".author-file-editor-reorderable-list-item",
            );

            await dispatch(handles[dragged], "dragstart");
            await dispatch(items[draggedOver], "dragenter");

            expect(itemsShown()).toEqual(shown);
        },
    );

    it("keeps the item dragged where it landed while the item it displaced stays under the pointer", async () => {
        await mountTheList(["a", "b", "c"]);
        const handles = document.querySelectorAll(".handle");
        const items = document.querySelectorAll(
            ".author-file-editor-reorderable-list-item",
        );

        await dispatch(handles[1], "dragstart");
        await dispatch(items[0], "dragenter");
        await dispatch(items[0], "dragenter");

        expect(itemsShown()).toEqual(["b", "a", "c"]);
    });

    it("asks for the item dragged to take the place of the item it displaced, though that item stayed under the pointer", async () => {
        await mountTheList(["a", "b", "c"]);
        const handles = document.querySelectorAll(".handle");
        const items = document.querySelectorAll(
            ".author-file-editor-reorderable-list-item",
        );

        await dispatch(handles[1], "dragstart");
        await dispatch(items[0], "dragenter");
        await dispatch(items[0], "dragenter");
        await dispatch(items[0], "drop");

        expect(onMoved.mock.calls).toEqual([["b", "a"]]);
    });

    it("puts the item dragged back once the pointer moves from it onto the item it displaced", async () => {
        await mountTheList(["a", "b", "c"]);
        const handles = document.querySelectorAll(".handle");
        const items = document.querySelectorAll(
            ".author-file-editor-reorderable-list-item",
        );

        await dispatch(handles[1], "dragstart");
        await dispatch(items[0], "dragenter");
        await dispatch(items[0], "dragenter");
        await dispatch(items[1], "dragenter");
        await dispatch(items[0], "dragenter");

        expect(itemsShown()).toEqual(["a", "b", "c"]);
    });

    it("marks only the item dragged, where it lands, while dragging", async () => {
        await mountTheList(["a", "b", "c"]);
        const handles = document.querySelectorAll(".handle");
        const items = document.querySelectorAll(
            ".author-file-editor-reorderable-list-item",
        );

        await dispatch(handles[0], "dragstart");
        await dispatch(items[2], "dragenter");

        expect(itemsMarkedDragged()).toEqual([false, false, true]);
    });

    it("marks no item once the drag ends", async () => {
        await mountTheList(["a", "b", "c"]);
        const handles = document.querySelectorAll(".handle");
        const items = document.querySelectorAll(
            ".author-file-editor-reorderable-list-item",
        );

        await dispatch(handles[0], "dragstart");
        await dispatch(items[2], "dragenter");
        await dispatch(handles[0], "dragend");

        expect(itemsMarkedDragged()).toEqual([false, false, false]);
    });

    it("puts the item back once the drag ends outside the list", async () => {
        await mountTheList(["a", "b", "c"]);
        const handles = document.querySelectorAll(".handle");
        const items = document.querySelectorAll(
            ".author-file-editor-reorderable-list-item",
        );

        await dispatch(handles[0], "dragstart");
        await dispatch(items[2], "dragenter");
        await dispatch(handles[0], "dragend");

        expect(itemsShown()).toEqual(["a", "b", "c"]);
    });

    it("draws beside the items their order, with none dragged, and how tall each is, while nothing is dragged", async () => {
        vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(100);
        await mountTheList(["a", "b", "c"]);

        expect(drawBesideTheItems).toHaveBeenLastCalledWith(
            ["a", "b", "c"],
            null,
            [100, 100, 100],
        );
    });

    it("draws beside the items the order they are shown in, the item dragged, and how tall each is, while dragging", async () => {
        vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(100);
        await mountTheList(["a", "b", "c"]);
        const handles = document.querySelectorAll(".handle");
        const items = document.querySelectorAll(
            ".author-file-editor-reorderable-list-item",
        );

        await dispatch(handles[0], "dragstart");
        await dispatch(items[2], "dragenter");

        expect(drawBesideTheItems).toHaveBeenLastCalledWith(
            ["b", "c", "a"],
            "a",
            [100, 100, 100],
        );
    });
});
