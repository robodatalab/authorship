export interface MonacoEditorOnThePage {
    type(markdown: string): void;
    typeCharacter(character: string): void;
    getValue(): string;
    cursorOffset(): number;
    point(offset: number | null): void;
    pointAway(): void;
    marks(): { range: unknown; options: { inlineClassName: string } }[];
}

const theEditorsTheDoubleHasMade = globalThis as {
    monacoEditorsOnThePage?: MonacoEditorOnThePage[];
};
theEditorsTheDoubleHasMade.monacoEditorsOnThePage ??= [];

export const monacoEditorsOnThePage =
    theEditorsTheDoubleHasMade.monacoEditorsOnThePage;

export function monacoEditorApi(): unknown {
    const disposable = { dispose: () => {} };
    return {
        KeyMod: { CtrlCmd: 1, Shift: 2 },
        Range: {
            fromPositions: (from: unknown, to: unknown) => ({ from, to }),
        },
        KeyCode: { KeyZ: 4, KeyY: 8, KeyS: 16, Escape: 32 },
        languages: {
            register: () => {},
            setLanguageConfiguration: () => {},
            setMonarchTokensProvider: () => {},
        },
        editor: {
            addKeybindingRules: () => {},
            defineTheme: () => {},
            create: (node: HTMLElement, options: { value: string }) => {
                let value = options.value;
                let cursorOffset = value.length;
                let changed = (_changed: { isFlush: boolean }): void => {};
                let pointed: (event: unknown) => void = () => {};
                let pointedAway = (): void => {};
                const collections: {
                    range: unknown;
                    options: { inlineClassName: string };
                }[][] = [];
                const editor = {
                    getValue: () => value,
                    setValue: (next: string) => {
                        value = next;
                        cursorOffset = 0;
                        changed({ isFlush: true });
                    },
                    getContentHeight: () => 100,
                    layout: () => {},
                    focus: () => {},
                    dispose: () => {},
                    addCommand: () => {},
                    onDidContentSizeChange: () => disposable,
                    onDidChangeModelContent: (
                        listener: (changed: { isFlush: boolean }) => void,
                    ) => {
                        changed = listener;
                        return disposable;
                    },
                    onMouseMove: (listener: (event: unknown) => void) => {
                        pointed = listener;
                        return disposable;
                    },
                    onMouseLeave: (listener: () => void) => {
                        pointedAway = listener;
                        return disposable;
                    },
                    createDecorationsCollection: () => {
                        const drawn = collections.length;
                        collections.push([]);
                        return {
                            set: (
                                next: {
                                    range: unknown;
                                    options: { inlineClassName: string };
                                }[],
                            ) => {
                                collections[drawn] = next;
                            },
                        };
                    },
                    getModel: () => ({
                        getOffsetAt: (position: { column: number }) =>
                            position.column - 1,
                        getPositionAt: (offset: number) => ({
                            lineNumber: 1,
                            column: offset + 1,
                        }),
                    }),
                    getScrolledVisiblePosition: () => ({
                        top: 10,
                        left: 20,
                        height: 18,
                    }),
                    marks: () => collections.flat(),
                    point: (offset: number | null) =>
                        pointed({
                            target: {
                                position:
                                    offset === null
                                        ? null
                                        : { lineNumber: 1, column: offset + 1 },
                            },
                        }),
                    pointAway: () => pointedAway(),
                    type: (markdown: string) => {
                        value = markdown;
                        cursorOffset = markdown.length;
                        changed({ isFlush: false });
                    },
                    typeCharacter: (character: string) => {
                        value =
                            value.slice(0, cursorOffset) +
                            character +
                            value.slice(cursorOffset);
                        cursorOffset += character.length;
                        changed({ isFlush: false });
                    },
                    cursorOffset: () => cursorOffset,
                };
                node.dataset.monaco = "open";
                theEditorsTheDoubleHasMade.monacoEditorsOnThePage!.push(editor);
                return editor;
            },
        },
    };
}
