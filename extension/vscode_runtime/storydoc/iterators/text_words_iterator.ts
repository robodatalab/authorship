const RUN_OF_NON_SPACES = /\S+/g;
const WORD_CHARACTER = /\w/;

export class TextWord {
    constructor(
        readonly text: string,
        readonly startCharacterOffset: number,
        readonly endCharacterOffset: number,
    ) {}
}

export class TextWordsIterator implements Iterable<TextWord> {
    constructor(private readonly text: string) {}

    *[Symbol.iterator](): Iterator<TextWord> {
        for (const run of this.text.matchAll(RUN_OF_NON_SPACES)) {
            if (WORD_CHARACTER.test(run[0])) {
                const end = run.index + run[0].length;
                yield new TextWord(run[0], run.index, end);
            }
        }
    }
}
