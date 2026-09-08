import { CHAPTER, MARKDOWN, PART, type AuthorDocument } from "./model";

export function numberOfWords(markdown: string): number {
    return markdown.split(/\s+/).filter((word) => /\w/.test(word)).length;
}

export class WordCounter {
    private wordsInEachSection = new Map<string, number>();
    private wordsInTheWholeDocument = 0;

    synchronize(document: AuthorDocument): void {
        const wordsInEachSection = new Map<string, number>();
        let wordsInTheWholeDocument = 0;
        let part: string | undefined;
        let chapter: string | undefined;

        for (const cell of document.cells) {
            if (cell.kind === PART) {
                part = cell.uniqueId;
                chapter = undefined;
                wordsInEachSection.set(part, 0);
                continue;
            }
            if (cell.kind === CHAPTER) {
                chapter = cell.uniqueId;
                wordsInEachSection.set(chapter, 0);
                continue;
            }
            if (cell.kind !== MARKDOWN) {
                continue;
            }
            const words = numberOfWords(cell.source);
            wordsInTheWholeDocument += words;
            for (const section of [part, chapter]) {
                if (section !== undefined) {
                    wordsInEachSection.set(
                        section,
                        (wordsInEachSection.get(section) ?? 0) + words,
                    );
                }
            }
        }

        this.wordsInEachSection = wordsInEachSection;
        this.wordsInTheWholeDocument = wordsInTheWholeDocument;
    }

    wordsInTheSection(cellId: string): number | undefined {
        return this.wordsInEachSection.get(cellId);
    }

    get wordsInTheDocument(): number {
        return this.wordsInTheWholeDocument;
    }

    get wordsInEverySection(): Record<string, number> {
        return Object.fromEntries(this.wordsInEachSection);
    }
}
