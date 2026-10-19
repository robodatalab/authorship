export class StoryTextSpan {
    constructor(
        readonly cellId: string,
        readonly startCharacterOffsetInCell: number,
        readonly endCharacterOffsetInCell: number,
    ) {}
}
