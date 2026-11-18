import { PlaceCell } from "authordoc/cells/place_cell";
import type { Document } from "authordoc/storydoc";

export function placesAround(place: PlaceCell, story: Document): PlaceCell[] {
    const around: PlaceCell[] = [];
    let parent = place.parent(story);
    while (parent !== undefined) {
        const reached = parent;
        const isACycle =
            reached.uniqueId === place.uniqueId ||
            around.some((outer) => outer.uniqueId === reached.uniqueId);
        if (isACycle) {
            return [];
        }
        around.push(reached);
        parent = reached.parent(story);
    }
    return around;
}

export function placesNestedIn(story: Document): Map<string, PlaceCell[]> {
    const nested = new Map<string, PlaceCell[]>();
    for (const cell of story.cells) {
        if (!(cell instanceof PlaceCell)) {
            continue;
        }
        const [parent] = placesAround(cell, story);
        if (parent === undefined) {
            continue;
        }
        const siblings = nested.get(parent.uniqueId) ?? [];
        nested.set(parent.uniqueId, [...siblings, cell]);
    }
    return nested;
}
