import { templates } from "../settings/model";
import {
    ABOUT,
    BLURB,
    CHAPTER,
    CONTENTS,
    IMAGE,
    Cell,
    DISCLAIMER,
    MARKDOWN,
    NOTE,
    PART,
    RECAP,
    TITLE_PAGE,
} from "./model";

export interface CellKindField {
    attributeName: string;
    label: string;
}

interface CellKind {
    cellKind: string;
    label: string;
    fields: CellKindField[];
    isFrontOrBackMatter?: boolean;
    isKeptOutOfTheBook?: boolean;
    isAnAsideToTheProseAroundIt?: boolean;
    blank: () => Cell;
}

function withoutTheOnesNothingHasBeenSaidAbout(
    attributes: Record<string, string>,
): Record<string, string> {
    return Object.fromEntries(
        Object.entries(attributes).filter(([, said]) => said !== ""),
    );
}

const CELL_KINDS: CellKind[] = [
    {
        cellKind: MARKDOWN,
        label: "Markdown",
        fields: [],
        blank: () => new Cell(MARKDOWN, "", {}),
    },
    {
        cellKind: CHAPTER,
        label: "Chapter",
        fields: [{ attributeName: "title", label: "Title" }],
        blank: () => new Cell(CHAPTER, "", { title: "Untitled" }),
    },
    {
        cellKind: NOTE,
        label: "Note",
        fields: [],
        isKeptOutOfTheBook: true,
        isAnAsideToTheProseAroundIt: true,
        blank: () => new Cell(NOTE, "", {}),
    },
    {
        cellKind: PART,
        label: "Part",
        fields: [{ attributeName: "title", label: "Title" }],
        blank: () => new Cell(PART, "", { title: "Untitled" }),
    },
    {
        cellKind: TITLE_PAGE,
        label: "Title Page",
        fields: [
            { attributeName: "title", label: "Title" },
            { attributeName: "subtitle", label: "Subtitle" },
            { attributeName: "author", label: "Author" },
            { attributeName: "publisher", label: "Publisher" },
            { attributeName: "date", label: "Date" },
            { attributeName: "version", label: "Version" },
            { attributeName: "isbn", label: "ISBN" },
            { attributeName: "cover-designer", label: "Cover Designer" },
        ],
        isFrontOrBackMatter: true,
        blank: () =>
            new Cell(
                TITLE_PAGE,
                "",
                withoutTheOnesNothingHasBeenSaidAbout({
                    title: "Untitled",
                    author: templates()["title-page"].author,
                    publisher: templates()["title-page"].publisher,
                    version: "1.0",
                }),
            ),
    },
    {
        cellKind: IMAGE,
        label: "Image",
        fields: [],
        blank: () => new Cell(IMAGE, "", { src: "" }),
    },
    {
        cellKind: CONTENTS,
        label: "Table of Contents",
        fields: [],
        isFrontOrBackMatter: true,
        blank: () => new Cell(CONTENTS, "", {}),
    },
    {
        cellKind: DISCLAIMER,
        label: "Disclaimer",
        fields: [{ attributeName: "title", label: "Title" }],
        isFrontOrBackMatter: true,
        blank: () =>
            new Cell(
                DISCLAIMER,
                templates().disclaimer.text,
                withoutTheOnesNothingHasBeenSaidAbout({
                    title: templates().disclaimer.title,
                }),
            ),
    },
    {
        cellKind: ABOUT,
        label: "About the Author",
        fields: [
            { attributeName: "kdp", label: "KDP" },
            { attributeName: "website", label: "Website" },
            { attributeName: "substack", label: "Substack" },
        ],
        isFrontOrBackMatter: true,
        blank: () =>
            new Cell(
                ABOUT,
                templates().about.text,
                withoutTheOnesNothingHasBeenSaidAbout({
                    kdp: templates().about.kdp,
                    website: templates().about.website,
                    substack: templates().about.substack,
                }),
            ),
    },
    {
        cellKind: BLURB,
        label: "Blurb",
        fields: [],
        isKeptOutOfTheBook: true,
        blank: () => new Cell(BLURB, "", {}),
    },
    {
        cellKind: RECAP,
        label: "The Story So Far",
        fields: [{ attributeName: "documents", label: "Documents" }],
        isKeptOutOfTheBook: true,
        blank: () => new Cell(RECAP, "", {}),
    },
];

function cellKind(kind: string): CellKind | undefined {
    return CELL_KINDS.find((known) => known.cellKind === kind);
}

export function labelOfCellKind(kind: string): string {
    return cellKind(kind)?.label ?? kind;
}

export function fieldsOfCellKind(kind: string): CellKindField[] {
    return cellKind(kind)?.fields ?? [];
}

export function blankCellOfKind(kind: string): Cell {
    return cellKind(kind)?.blank() ?? new Cell(kind, "", {});
}

export function isFrontOrBackMatter(kind: string): boolean {
    return cellKind(kind)?.isFrontOrBackMatter ?? false;
}

export function isKeptOutOfTheBook(kind: string): boolean {
    return cellKind(kind)?.isKeptOutOfTheBook ?? false;
}

export function isAnAsideToTheProseAroundIt(kind: string): boolean {
    return cellKind(kind)?.isAnAsideToTheProseAroundIt ?? false;
}

export function standsOutsideTheStory(kind: string): boolean {
    return (
        isFrontOrBackMatter(kind) ||
        (isKeptOutOfTheBook(kind) && !isAnAsideToTheProseAroundIt(kind))
    );
}
