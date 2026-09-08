import * as vscode from "vscode";
import { spawn } from "node:child_process";
import { chmod } from "node:fs/promises";

const UV_RELEASE = "latest/download";

export interface ModelEnvironment {
    python: vscode.Uri;
}

type InstallProgress = vscode.Progress<{ message?: string }>;

export async function provision(
    context: vscode.ExtensionContext,
    log: vscode.OutputChannel,
): Promise<ModelEnvironment> {
    const extensionStorage = context.globalStorageUri;
    const virtualEnvironment = vscode.Uri.joinPath(extensionStorage, "venv");
    const python =
        process.platform === "win32"
            ? vscode.Uri.joinPath(virtualEnvironment, "Scripts", "python.exe")
            : vscode.Uri.joinPath(virtualEnvironment, "bin", "python");

    const extensionVersion = context.extension.packageJSON.version as string;
    const installedStamp = vscode.Uri.joinPath(
        extensionStorage,
        `installed-${extensionVersion}`,
    );
    if (await fileExists(installedStamp)) {
        return { python };
    }

    await vscode.workspace.fs.createDirectory(extensionStorage);

    const uvEnvironment: NodeJS.ProcessEnv = {
        ...process.env,
        UV_PROJECT_ENVIRONMENT: virtualEnvironment.fsPath,
        UV_CACHE_DIR: vscode.Uri.joinPath(extensionStorage, "cache").fsPath,
        UV_PYTHON_INSTALL_DIR: vscode.Uri.joinPath(extensionStorage, "python")
            .fsPath,
        UV_PYTHON_PREFERENCE: "only-managed",
        UV_PYTHON_DOWNLOADS: "automatic",
        NO_COLOR: "1",
    };

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: "Authorship: installing the writing model",
        },
        async (progress) => {
            const uv = await uvExecutable(extensionStorage, log, progress);
            log.appendLine(
                `installing the model environment into ${virtualEnvironment.fsPath}`,
            );
            await runToCompletion(
                uv.fsPath,
                ["sync", "--frozen", "--no-dev"],
                context.extensionUri.fsPath,
                uvEnvironment,
                log,
                progress,
            );
        },
    );

    await vscode.workspace.fs.writeFile(installedStamp, new Uint8Array());
    return { python };
}

async function uvExecutable(
    extensionStorage: vscode.Uri,
    log: vscode.OutputChannel,
    progress: InstallProgress,
): Promise<vscode.Uri> {
    const onWindows = process.platform === "win32";
    const uvFolder = vscode.Uri.joinPath(extensionStorage, "uv");
    const uv = vscode.Uri.joinPath(uvFolder, onWindows ? "uv.exe" : "uv");
    if (await fileExists(uv)) {
        return uv;
    }

    const archiveName = `uv-${uvBuildForThisMachine()}${onWindows ? ".zip" : ".tar.gz"}`;
    const archiveUrl = `https://github.com/astral-sh/uv/releases/${UV_RELEASE}/${archiveName}`;
    log.appendLine(`fetching ${archiveUrl}`);
    progress.report({ message: "fetching the installer" });

    const response = await fetch(archiveUrl);
    if (!response.ok) {
        throw new Error(`${archiveUrl} answered ${response.status}`);
    }
    const archive = vscode.Uri.joinPath(extensionStorage, archiveName);
    await vscode.workspace.fs.writeFile(
        archive,
        new Uint8Array(await response.arrayBuffer()),
    );
    await vscode.workspace.fs.createDirectory(uvFolder);

    const uvArchiveWrapsItsFilesInAFolder = !onWindows;
    const unwrapTheArchive = uvArchiveWrapsItsFilesInAFolder
        ? ["--strip-components=1"]
        : [];
    await runToCompletion(
        "tar",
        ["-xf", archive.fsPath, "-C", uvFolder.fsPath, ...unwrapTheArchive],
        extensionStorage.fsPath,
        process.env,
        log,
    );
    await vscode.workspace.fs.delete(archive);

    if (!onWindows) {
        await chmod(uv.fsPath, 0o755);
    }
    return uv;
}

function uvBuildForThisMachine(): string {
    switch (`${process.platform}-${process.arch}`) {
        case "darwin-arm64":
            return "aarch64-apple-darwin";
        case "darwin-x64":
            return "x86_64-apple-darwin";
        case "linux-x64":
            return "x86_64-unknown-linux-gnu";
        case "linux-arm64":
            return "aarch64-unknown-linux-gnu";
        case "win32-x64":
            return "x86_64-pc-windows-msvc";
        case "win32-arm64":
            return "aarch64-pc-windows-msvc";
        default:
            throw new Error(
                `no uv build for ${process.platform}-${process.arch}`,
            );
    }
}

function runToCompletion(
    command: string,
    commandArguments: readonly string[],
    workingDirectory: string,
    environment: NodeJS.ProcessEnv,
    log: vscode.OutputChannel,
    progress?: InstallProgress,
): Promise<void> {
    return new Promise((finished, failed) => {
        const commandProcess = spawn(command, commandArguments, {
            cwd: workingDirectory,
            env: environment,
        });

        const writeToTheLog = (output: Buffer): void => {
            const written = output.toString();
            log.append(written);
            const lastLine = written.trimEnd().split("\n").pop()?.trim();
            if (lastLine) {
                progress?.report({ message: lastLine });
            }
        };
        commandProcess.stdout.on("data", writeToTheLog);
        commandProcess.stderr.on("data", writeToTheLog);

        commandProcess.on("error", failed);
        commandProcess.on("close", (exitCode) =>
            exitCode === 0
                ? finished()
                : failed(new Error(`${command} exited with ${exitCode}`)),
        );
    });
}

async function fileExists(file: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(file);
        return true;
    } catch {
        return false;
    }
}
