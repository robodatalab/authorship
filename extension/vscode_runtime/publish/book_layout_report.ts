import type { Cell } from "authordoc/cells/cell";
import { cellOfKind } from "authordoc/parser";

const NEEDS_TEXT = "text";

export interface SectionStillToWrite {
    kind: string;
    needs: string[];
}

export interface BookLayoutReport {
    ready_to_export: boolean;
    missing_cells: string[];
    missing_cell_content: SectionStillToWrite[];
    path?: string;
}

export function cellsWithMissingCellsAppended(
    cells: readonly Cell[],
    missingCells: string[],
): Cell[] {
    const blanks = missingCells.map((kind) => cellOfKind(kind));
    return [...cells, ...blanks];
}

export function kindsStillToWrite(report: BookLayoutReport): string[] {
    return report.missing_cell_content.map((section) => section.kind);
}

export function wordsForWhatIsMissing(missing: string[]): string {
    return missing
        .map((name) => (name === NEEDS_TEXT ? "something written in it" : name))
        .join(", ");
}

export function askedBeforeBinding(
    fileName: string,
    report: BookLayoutReport,
): { message: string; detail: string } {
    const lines: string[] = [];
    if (report.missing_cells.length) {
        lines.push(`Missing: ${report.missing_cells.join(", ")}`);
    }
    for (const section of report.missing_cell_content) {
        lines.push(
            `${section.kind} needs ${wordsForWhatIsMissing(section.needs)}`,
        );
    }
    lines.push(
        "Fix adds the missing sections and marks what is still to write. It does not export. " +
            "Export Anyway binds the book as it stands.",
    );

    return {
        message: `${fileName} is not ready to bind.`,
        detail: lines.join("\n"),
    };
}

export function saidAfterLayingOut(
    fileName: string,
    report: BookLayoutReport,
): string {
    const laidOut = report.missing_cells.length
        ? `Added ${report.missing_cells.join(", ")} in ${fileName}.`
        : `${fileName} laid out.`;
    return report.missing_cell_content.length
        ? `${laidOut} The sections still to write are marked.`
        : laidOut;
}
