export class StoryWord {
    constructor(
        readonly number: number,
        readonly cellId: string,
        readonly text: string,
        readonly startCharacterOffsetInCell: number,
        readonly endCharacterOffsetInCell: number,
    ) {}
}
