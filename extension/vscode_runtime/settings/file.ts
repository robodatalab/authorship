import * as vscode from "vscode";

import {
    SETTINGS_FILE,
    SETTINGS_FOLDER,
    EMPTY_TEMPLATES,
    parseSettings,
    settingsText,
    type Templates,
} from "./model";

export function settingsUri(document: vscode.Uri): vscode.Uri | undefined {
    const project = vscode.workspace.getWorkspaceFolder(document);
    return project
        ? vscode.Uri.joinPath(project.uri, SETTINGS_FOLDER, SETTINGS_FILE)
        : undefined;
}

export async function loadTemplates(document: vscode.Uri): Promise<Templates> {
    const uri = settingsUri(document);
    if (!uri) {
        return EMPTY_TEMPLATES;
    }
    if (!(await exists(uri))) {
        await seed(uri);
        return EMPTY_TEMPLATES;
    }
    let text: string;
    try {
        text = new TextDecoder().decode(
            await vscode.workspace.fs.readFile(uri),
        );
    } catch {
        return EMPTY_TEMPLATES;
    }
    try {
        return parseSettings(text);
    } catch (err) {
        void vscode.window.showWarningMessage(
            `${SETTINGS_FOLDER}/${SETTINGS_FILE} could not be read (${describe(err)}). ` +
                "Authorship is starting these pages empty until it is fixed.",
        );
        return EMPTY_TEMPLATES;
    }
}

export function watchSettings(
    document: vscode.Uri,
    changed: () => void,
): vscode.Disposable {
    const project = vscode.workspace.getWorkspaceFolder(document);
    if (!project) {
        return new vscode.Disposable(() => undefined);
    }
    const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(
            project,
            `${SETTINGS_FOLDER}/${SETTINGS_FILE}`,
        ),
    );
    return vscode.Disposable.from(
        watcher.onDidCreate(changed),
        watcher.onDidChange(changed),
        watcher.onDidDelete(changed),
        watcher,
    );
}

async function seed(uri: vscode.Uri): Promise<void> {
    try {
        await vscode.workspace.fs.createDirectory(
            vscode.Uri.joinPath(uri, ".."),
        );
        await vscode.workspace.fs.writeFile(
            uri,
            new TextEncoder().encode(settingsText(EMPTY_TEMPLATES)),
        );
    } catch {}
}

async function exists(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch {
        return false;
    }
}

function describe(err: unknown): string {
    const message = (err as { message?: unknown } | null)?.message;
    return typeof message === "string" ? message : String(err);
}
