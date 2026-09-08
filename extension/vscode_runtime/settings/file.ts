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
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document);
    return workspaceFolder
        ? vscode.Uri.joinPath(
              workspaceFolder.uri,
              SETTINGS_FOLDER,
              SETTINGS_FILE,
          )
        : undefined;
}

export async function loadTemplates(document: vscode.Uri): Promise<Templates> {
    const settingsFile = settingsUri(document);
    if (!settingsFile) {
        return EMPTY_TEMPLATES;
    }
    if (!(await fileExists(settingsFile))) {
        await writeEmptySettings(settingsFile);
        return EMPTY_TEMPLATES;
    }
    let settingsJson: string;
    try {
        settingsJson = new TextDecoder().decode(
            await vscode.workspace.fs.readFile(settingsFile),
        );
    } catch {
        return EMPTY_TEMPLATES;
    }
    try {
        return parseSettings(settingsJson);
    } catch (unreadable) {
        void vscode.window.showWarningMessage(
            `${SETTINGS_FOLDER}/${SETTINGS_FILE} could not be read (${whatWentWrong(unreadable)}). ` +
                "Authorship is starting these pages empty until it is fixed.",
        );
        return EMPTY_TEMPLATES;
    }
}

export function watchSettings(
    document: vscode.Uri,
    settingsChanged: () => void,
): vscode.Disposable {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document);
    if (!workspaceFolder) {
        return new vscode.Disposable(() => undefined);
    }
    const settingsWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(
            workspaceFolder,
            `${SETTINGS_FOLDER}/${SETTINGS_FILE}`,
        ),
    );
    return vscode.Disposable.from(
        settingsWatcher.onDidCreate(settingsChanged),
        settingsWatcher.onDidChange(settingsChanged),
        settingsWatcher.onDidDelete(settingsChanged),
        settingsWatcher,
    );
}

async function writeEmptySettings(settingsFile: vscode.Uri): Promise<void> {
    try {
        await vscode.workspace.fs.createDirectory(
            vscode.Uri.joinPath(settingsFile, ".."),
        );
        await vscode.workspace.fs.writeFile(
            settingsFile,
            new TextEncoder().encode(settingsText(EMPTY_TEMPLATES)),
        );
    } catch {}
}

async function fileExists(file: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(file);
        return true;
    } catch {
        return false;
    }
}

function whatWentWrong(failure: unknown): string {
    const message = (failure as { message?: unknown } | null)?.message;
    return typeof message === "string" ? message : String(failure);
}
