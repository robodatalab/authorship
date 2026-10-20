export interface AuthorDocumentCellType {
    cellKind: string;
    menuLabel: string;
    insertMenuGroup: string;
}

const registeredCellTypes = new Map<string, AuthorDocumentCellType>();

export function registerAuthorDocumentCellType(
    cellType: AuthorDocumentCellType,
): void {
    registeredCellTypes.set(cellType.cellKind, cellType);
}

export function authorDocumentCellTypes(): AuthorDocumentCellType[] {
    return [...registeredCellTypes.values()];
}
