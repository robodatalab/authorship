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
    path: string;
    fsPath: string;
    toString(): string;
    with(replaced: { path: string }): StubUri;
}

function uriOf(path: string): StubUri {
    return {
        path,
        fsPath: path,
        toString: () => path,
        with: ({ path: replaced }) => uriOf(replaced),
    };
}

export const shownMessages: string[] = [];

export const settings = new Map<string, unknown>();

export const geminiKeyInTheKeychain: { key: string | undefined } = {
    key: undefined,
};

export const authentication = {
    registerAuthenticationProvider: (): { dispose(): void } => ({
        dispose: () => undefined,
    }),
    getSession: (): Promise<{ accessToken: string } | undefined> =>
        Promise.resolve(
            geminiKeyInTheKeychain.key
                ? { accessToken: geminiKeyInTheKeychain.key }
                : undefined,
        ),
};

export const dialogs: {
    filesTheAuthorChose: StubUri[];
    answerToTheWarning: string | undefined;
} = { filesTheAuthorChose: [], answerToTheWarning: undefined };

export const Uri = {
    parse: uriOf,
    file: uriOf,
    joinPath: (base: StubUri, ...parts: string[]): StubUri =>
        uriOf([base.toString(), ...parts].join("/")),
};

export class Disposable {
    static from(...disposables: { dispose(): void }[]): Disposable {
        return new Disposable(() =>
            disposables.forEach((disposable) => disposable.dispose()),
        );
    }

    constructor(private readonly disposing: () => void) {}

    dispose(): void {
        this.disposing();
    }
}

export class RelativePattern {
    constructor(
        readonly base: StubUri,
        readonly pattern: string,
    ) {}
}

export const workspace = {
    createFileSystemWatcher: (): {
        onDidChange(listener: () => void): { dispose(): void };
        dispose(): void;
    } => ({
        onDidChange: () => ({ dispose: () => undefined }),
        dispose: () => undefined,
    }),
    fs: {
        readFile: (uri: StubUri): Promise<Uint8Array> =>
            Promise.resolve(
                new TextEncoder().encode(files.get(uri.toString()) ?? ""),
            ),
        writeFile: (uri: StubUri, bytes: Uint8Array): Promise<void> => {
            files.set(uri.toString(), new TextDecoder().decode(bytes));
            return Promise.resolve();
        },
        delete: (uri: StubUri): Promise<void> => {
            files.delete(uri.toString());
            return Promise.resolve();
        },
        createDirectory: (): Promise<void> => Promise.resolve(),
        readDirectory: (): Promise<[string, number][]> => Promise.resolve([]),
    },
    getConfiguration: (
        section: string,
    ): {
        get<Setting>(named: string, fallback?: Setting): Setting | undefined;
    } => ({
        get: <Setting,>(named: string, fallback?: Setting) =>
            (settings.get(`${section}.${named}`) as Setting | undefined) ??
            fallback,
    }),
    onDidChangeConfiguration: (): { dispose(): void } => ({
        dispose: () => undefined,
    }),
    getWorkspaceFolder: (): undefined => undefined,
    asRelativePath: (uri: StubUri): string => uri.toString(),
};

export const FileType = { File: 1, Directory: 2 };

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
    showInformationMessage: (said: string): Promise<undefined> => {
        shownMessages.push(said);
        return Promise.resolve(undefined);
    },
    showErrorMessage: (said: string): Promise<undefined> => {
        shownMessages.push(said);
        return Promise.resolve(undefined);
    },
    showWarningMessage: (said: string): Promise<string | undefined> => {
        shownMessages.push(said);
        return Promise.resolve(dialogs.answerToTheWarning);
    },
    showOpenDialog: (): Promise<StubUri[] | undefined> =>
        Promise.resolve(
            dialogs.filesTheAuthorChose.length > 0
                ? dialogs.filesTheAuthorChose
                : undefined,
        ),
};
