// The menu that opens on a right-click, and on the "…" at the end of an insert
// bar.
//
// Two menus and one element: what is in it is built each time it is asked for,
// because what can be done to a cell depends on which cell it is. Placed after
// it is shown, so its measured height is what keeps it on screen.

import { KINDS, isAutomated, isGenerated, labelOf, runCell } from './model';
import { commit, deleteCell, insertCell, moveCell } from './edits';
import { menuEl, post } from './elements';
import { state } from './state';

/**
 * The kinds the bar has no button for, added after `index`.
 *
 * The everyday few are already buttons an inch to the left, so listing them here
 * again would be two ways to click the same thing. Between the buttons and this,
 * every kind is one click from the bar and none of them twice.
 */
export function openInsertMenu(x: number, y: number, at: number): void {
	menuEl.textContent = '';
	for (const kind of KINDS.filter((k) => !k.primary)) {
		menuEl.append(menuItem(kind.label, () => insertCell(at, kind.blank())));
	}
	placeMenu(x, y);
}

/** What can be done to this cell. Adding one is the insert bar's question. */
export function openCellMenu(x: number, y: number, index: number): void {
	menuEl.textContent = '';
	const kind = state.cells[index]?.kind ?? '';
	menuEl.append(menuHeading(labelOf(kind)));
	if (isAutomated(kind)) {
		menuEl.append(menuItem('Run', () => commit(runCell(state.cells, index))));
	} else if (isGenerated(kind)) {
		menuEl.append(
			state.writing?.at === index
				? menuItem('Stop', () => post({ type: 'stop', at: index }))
				: menuItem('Write', () => post({ type: 'generate', at: index }))
		);
	}
	menuEl.append(
		menuItem('Move up', () => moveCell(index, -1)),
		menuItem('Move down', () => moveCell(index, 1)),
		menuItem('Delete', () => deleteCell(index))
	);
	placeMenu(x, y);
}

function placeMenu(x: number, y: number): void {
	menuEl.hidden = false;
	// Placed after it is shown, so its measured height keeps it on screen.
	menuEl.style.left = `${Math.max(4, Math.min(x, window.innerWidth - menuEl.offsetWidth - 8))}px`;
	menuEl.style.top = `${Math.max(4, Math.min(y, window.innerHeight - menuEl.offsetHeight - 8))}px`;
}

export function closeMenu(): void {
	menuEl.hidden = true;
}

/** Whether a menu is standing open, which is what Escape and a stray click ask. */
export function menuIsOpen(): boolean {
	return !menuEl.hidden;
}

/** Whether the click that just happened landed inside the open menu. */
export function menuHolds(target: Node | null): boolean {
	return target !== null && menuEl.contains(target);
}

function menuHeading(text: string): HTMLElement {
	const heading = document.createElement('div');
	heading.className = 'menu-heading';
	heading.textContent = text;
	return heading;
}

function menuItem(text: string, onClick: () => void): HTMLElement {
	const item = document.createElement('button');
	item.type = 'button';
	item.className = 'menu-item';
	item.textContent = text;
	item.addEventListener('click', () => {
		closeMenu();
		onClick();
	});
	return item;
}
