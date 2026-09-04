export const files = new Map<string, string>();
export const executedCommands: string[] = [];

export class EventEmitter<T> {
    private readonly listeners: ((value: T) => void)[] = [];

    readonly event = (listener: (value: T) => void): { dispose(): void } => {
        this.listeners.push(listener);
        return { dispose: () => undefined };
    };

    fire(value: T): void {
        for (const listener of [...this.listeners]) {
            listener(value);
        }
    }

    dispose(): void {}
}

export interface StubUri {
    toString(): string;
}

function uriOf(path: string): StubUri {
    return { toString: () => path };
}

export const Uri = {
    parse: uriOf,
    file: uriOf,
    joinPath: (base: StubUri, ...parts: string[]): StubUri =>
        uriOf([base.toString(), ...parts].join("/")),
};

export const workspace = {
    fs: {
        readFile: (uri: StubUri): Promise<Uint8Array> =>
            Promise.resolve(
                new TextEncoder().encode(files.get(uri.toString()) ?? ""),
            ),
        writeFile: (uri: StubUri, bytes: Uint8Array): Promise<void> => {
            files.set(uri.toString(), new TextDecoder().decode(bytes));
            return Promise.resolve();
        },
        delete: (): Promise<void> => Promise.resolve(),
    },
    getWorkspaceFolder: (): undefined => undefined,
};

export const commands = {
    executeCommand: (command: string): Promise<void> => {
        executedCommands.push(command);
        return Promise.resolve();
    },
};

export const window = {
    registerCustomEditorProvider: (): { dispose(): void } => ({
        dispose: () => undefined,
    }),
};
