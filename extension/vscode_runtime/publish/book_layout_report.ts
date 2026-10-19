import type { Cell } from "../storydoc/cells/cell";
import { cellOfKind } from "../storydoc/parser";

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
    ready: boolean;
    plan: PlannedSection[];
    added: string[];
    moved: string[];
    wanting: SectionStillToWrite[];
    path?: string;
}

export function cellsLaidOutByPlan(
    cells: readonly Cell[],
    plan: PlannedSection[],
): Cell[] {
    return plan.map((section) =>
        section.at === null ? cellOfKind(section.kind) : cells[section.at],
    );
}

export function kindsStillToWrite(report: BookLayoutReport): string[] {
    return report.wanting.map((section) => section.kind);
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
    if (report.added.length) {
        lines.push(`Missing: ${report.added.join(", ")}`);
    }
    if (report.moved.length) {
        lines.push(`Out of place: ${report.moved.join(", ")}`);
    }
    for (const section of report.wanting) {
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
        report.added.length && `Added ${report.added.join(", ")}`,
        report.moved.length && `moved ${report.moved.join(", ")} into place`,
    ].filter(Boolean);

    const laidOut = lines.length
        ? `${lines.join(" and ")} in ${fileName}.`
        : `${fileName} laid out.`;
    return report.wanting.length
        ? `${laidOut} The sections still to write are marked.`
        : laidOut;
}
