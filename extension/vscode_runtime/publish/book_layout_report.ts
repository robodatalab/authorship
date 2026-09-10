import {
    blankCellOfKind,
    fieldsOfCellKind,
    labelOfCellKind,
} from "../storydoc/cell_kinds";
import type { ImmutableCell } from "../storydoc/model";

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
    cells: readonly ImmutableCell[],
    plan: PlannedSection[],
): ImmutableCell[] {
    return plan.map((section) =>
        section.at === null ? blankCellOfKind(section.kind) : cells[section.at],
    );
}

export function kindsStillToWrite(report: BookLayoutReport): string[] {
    return report.wanting.map((section) => section.kind);
}

export function wordsForWhatIsMissing(
    cellKind: string,
    missing: string[],
): string {
    const fields = fieldsOfCellKind(cellKind);
    return missing
        .map((name) => {
            if (name === NEEDS_TEXT) {
                return "something written in it";
            }
            return (
                fields.find((field) => field.attributeName === name)?.label ??
                name
            );
        })
        .join(", ");
}

function labelsFor(kinds: string[]): string {
    return kinds.map((kind) => labelOfCellKind(kind)).join(", ");
}

export function askedBeforeBinding(
    fileName: string,
    report: BookLayoutReport,
): { message: string; detail: string } {
    const lines: string[] = [];
    if (report.added.length) {
        lines.push(`Missing: ${labelsFor(report.added)}`);
    }
    if (report.moved.length) {
        lines.push(`Out of place: ${labelsFor(report.moved)}`);
    }
    for (const section of report.wanting) {
        lines.push(
            `${labelOfCellKind(section.kind)} needs ${wordsForWhatIsMissing(section.kind, section.needs)}`,
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
        report.added.length && `Added ${labelsFor(report.added)}`,
        report.moved.length && `moved ${labelsFor(report.moved)} into place`,
    ].filter(Boolean);

    const laidOut = lines.length
        ? `${lines.join(" and ")} in ${fileName}.`
        : `${fileName} laid out.`;
    return report.wanting.length
        ? `${laidOut} The sections still to write are marked.`
        : laidOut;
}
