import {
    useLayoutEffect,
    useRef,
    useState,
    type DragEvent as ReactDragEvent,
    type ReactNode,
} from "react";
import "./AuthorFileEditorReorderableList.css";

export interface AuthorFileEditorReorderableListItemDragging {
    onDragStarted: () => void;
    onDragEnded: () => void;
}

interface AuthorFileEditorReorderableListProps {
    itemIds: readonly string[];
    onMoved: (itemId: string, inPlaceOfItemId: string) => void;
    drawTheItem: (
        itemId: string,
        dragging: AuthorFileEditorReorderableListItemDragging,
    ) => ReactNode;
    drawBesideTheItems: (
        itemIdsShown: readonly string[],
        itemIdDragged: string | null,
        heightOfEachItem: readonly number[],
    ) => ReactNode;
}

export function AuthorFileEditorReorderableList({
    itemIds,
    onMoved,
    drawTheItem,
    drawBesideTheItems,
}: AuthorFileEditorReorderableListProps) {
    const itemsDrawn = useRef<HTMLUListElement>(null);
    const [itemIdDragged, dragTheItem] = useState<string | null>(null);
    const [positionDraggedOver, dragOverThePosition] = useState<
        number | null
    >(null);
    const [itemIdEntered, enterTheItem] = useState<string | null>(null);
    const [heightOfEachItemMeasured, measureTheItems] = useState<
        readonly number[]
    >([]);
    const itemIdsShown =
        itemIdDragged === null || positionDraggedOver === null
            ? itemIds
            : itemIdsWithTheItemMovedTo(
                  itemIds,
                  itemIdDragged,
                  positionDraggedOver,
              );
    const orderShown = JSON.stringify(itemIdsShown);
    const heightOfEachItem = itemIdsShown.map(
        (_, position) => heightOfEachItemMeasured[position] ?? 0,
    );
    const besideTheItems = drawBesideTheItems(
        itemIdsShown,
        itemIdDragged,
        heightOfEachItem,
    );

    useLayoutEffect(() => {
        const list = itemsDrawn.current;
        if (list === null) {
            return;
        }
        const items = [...list.children] as HTMLElement[];
        function measureEveryItem(): void {
            const heights = items.map((item) => item.offsetHeight);
            const heightsWritten = JSON.stringify(heights);
            measureTheItems((before) =>
                JSON.stringify(before) === heightsWritten ? before : heights,
            );
        }
        measureEveryItem();
        const watching = new ResizeObserver(measureEveryItem);
        for (const item of items) {
            watching.observe(item);
        }
        return () => watching.disconnect();
    }, [orderShown]);

    function startDragging(itemId: string, position: number): void {
        dragTheItem(itemId);
        dragOverThePosition(position);
        enterTheItem(null);
    }

    function stopDragging(): void {
        dragTheItem(null);
        dragOverThePosition(null);
        enterTheItem(null);
    }

    function dragOverTheItem(itemId: string, position: number): void {
        if (itemId === itemIdEntered) {
            return;
        }
        enterTheItem(itemId);
        dragOverThePosition(position);
    }

    function letTheItemDraggedBeDropped(event: ReactDragEvent): void {
        if (itemIdDragged !== null) {
            event.preventDefault();
        }
    }

    function moveTheItemDragged(): void {
        if (itemIdDragged === null || positionDraggedOver === null) {
            return;
        }
        const inPlaceOfItemId = itemIds[positionDraggedOver];
        if (inPlaceOfItemId === itemIdDragged) {
            return;
        }
        onMoved(itemIdDragged, inPlaceOfItemId);
    }

    return (
        <div
            className={
                itemIdDragged === null
                    ? "author-file-editor-reorderable-list"
                    : "author-file-editor-reorderable-list author-file-editor-reorderable-list-dragging"
            }
        >
            {besideTheItems}
            <ul
                ref={itemsDrawn}
                className="author-file-editor-reorderable-list-items"
                onDragOver={letTheItemDraggedBeDropped}
                onDrop={moveTheItemDragged}
            >
                {itemIdsShown.map((itemId, position) => {
                    const itemDrawn = drawTheItem(itemId, {
                        onDragStarted: () => startDragging(itemId, position),
                        onDragEnded: stopDragging,
                    });
                    return (
                        <li
                            key={itemId}
                            className={
                                itemId === itemIdDragged
                                    ? "author-file-editor-reorderable-list-item author-file-editor-reorderable-list-item-dragged"
                                    : "author-file-editor-reorderable-list-item"
                            }
                            onDragEnter={() => dragOverTheItem(itemId, position)}
                        >
                            {itemDrawn}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

function itemIdsWithTheItemMovedTo(
    itemIds: readonly string[],
    itemIdMoved: string,
    positionTaken: number,
): string[] {
    const itemIdsLeft = itemIds.filter((itemId) => itemId !== itemIdMoved);
    const itemIdsBefore = itemIdsLeft.slice(0, positionTaken);
    const itemIdsAfter = itemIdsLeft.slice(positionTaken);
    return [...itemIdsBefore, itemIdMoved, ...itemIdsAfter];
}
