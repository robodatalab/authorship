import type { Cell } from "authordoc/cells/cell";
import { cellOfKind } from "authordoc/parser";

const NEEDS_TEXT = "text";

export interface PlannedSection {
    kind: string;
    at: number | null;
}

export interface SectionStillToWrite {
    kind: string;
    needs: string[];
}

export interface BookLayoutReport {
    ready_to_export: boolean;
    cell_export_order: PlannedSection[];
    missing_cells: string[];
    misplaced_cells: string[];
    missing_cell_content: SectionStillToWrite[];
    path?: string;
}

export function cellsLaidOutByPlan(
    cells: readonly Cell[],
    cellExportOrder: PlannedSection[],
): Cell[] {
    return cellExportOrder.map((section) =>
        section.at === null ? cellOfKind(section.kind) : cells[section.at],
    );
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
    if (report.misplaced_cells.length) {
        lines.push(`Out of place: ${report.misplaced_cells.join(", ")}`);
    }
    for (const section of report.missing_cell_content) {
        lines.push(
            `${section.kind} needs ${wordsForWhatIsMissing(section.needs)}`,
        );
    }
    lines.push(
        "Fix lays the sections out and marks what is still to write. It does not export. " +
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
    const lines = [
        report.missing_cells.length && `Added ${report.missing_cells.join(", ")}`,
        report.misplaced_cells.length && `moved ${report.misplaced_cells.join(", ")} into place`,
    ].filter(Boolean);

    const laidOut = lines.length
        ? `${lines.join(" and ")} in ${fileName}.`
        : `${fileName} laid out.`;
    return report.missing_cell_content.length
        ? `${laidOut} The sections still to write are marked.`
        : laidOut;
}
