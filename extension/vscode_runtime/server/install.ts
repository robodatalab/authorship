import * as vscode from "vscode";
import { spawn } from "node:child_process";
import { chmod } from "node:fs/promises";

const UV_RELEASE = "latest/download";

export interface Environment {
    python: vscode.Uri;
}

type Report = vscode.Progress<{ message?: string }>;

export async function provision(
    context: vscode.ExtensionContext,
    log: vscode.OutputChannel,
): Promise<Environment> {
    const home = context.globalStorageUri;
    const venv = vscode.Uri.joinPath(home, "venv");
    const python =
        process.platform === "win32"
            ? vscode.Uri.joinPath(venv, "Scripts", "python.exe")
            : vscode.Uri.joinPath(venv, "bin", "python");

    const version = context.extension.packageJSON.version as string;
    const stamp = vscode.Uri.joinPath(home, `installed-${version}`);
    if (await exists(stamp)) {
        return { python };
    }

    await vscode.workspace.fs.createDirectory(home);

    const env: NodeJS.ProcessEnv = {
        ...process.env,
        UV_PROJECT_ENVIRONMENT: venv.fsPath,
        UV_CACHE_DIR: vscode.Uri.joinPath(home, "cache").fsPath,
        UV_PYTHON_INSTALL_DIR: vscode.Uri.joinPath(home, "python").fsPath,
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
            const uv = await installer(home, log, progress);
            log.appendLine(
                `installing the model environment into ${venv.fsPath}`,
            );
            await run(
                uv.fsPath,
                ["sync", "--frozen", "--no-dev"],
                context.extensionUri.fsPath,
                env,
                log,
                progress,
            );
        },
    );

    await vscode.workspace.fs.writeFile(stamp, new Uint8Array());
    return { python };
}

async function installer(
    home: vscode.Uri,
    log: vscode.OutputChannel,
    progress: Report,
): Promise<vscode.Uri> {
    const windows = process.platform === "win32";
    const into = vscode.Uri.joinPath(home, "uv");
    const uv = vscode.Uri.joinPath(into, windows ? "uv.exe" : "uv");
    if (await exists(uv)) {
        return uv;
    }

    const name = `uv-${target()}${windows ? ".zip" : ".tar.gz"}`;
    const url = `https://github.com/astral-sh/uv/releases/${UV_RELEASE}/${name}`;
    log.appendLine(`fetching ${url}`);
    progress.report({ message: "fetching the installer" });

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`${url} answered ${response.status}`);
    }
    const archive = vscode.Uri.joinPath(home, name);
    await vscode.workspace.fs.writeFile(
        archive,
        new Uint8Array(await response.arrayBuffer()),
    );
    await vscode.workspace.fs.createDirectory(into);

    const strip = windows ? [] : ["--strip-components=1"];
    await run(
        "tar",
        ["-xf", archive.fsPath, "-C", into.fsPath, ...strip],
        home.fsPath,
        process.env,
        log,
    );
    await vscode.workspace.fs.delete(archive);

    if (!windows) {
        await chmod(uv.fsPath, 0o755);
    }
    return uv;
}

function target(): string {
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

function run(
    command: string,
    args: readonly string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
    log: vscode.OutputChannel,
    progress?: Report,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd, env });

        const write = (chunk: Buffer): void => {
            const text = chunk.toString();
            log.append(text);
            const last = text.trimEnd().split("\n").pop()?.trim();
            if (last) {
                progress?.report({ message: last });
            }
        };
        child.stdout.on("data", write);
        child.stderr.on("data", write);

        child.on("error", reject);
        child.on("close", (code) =>
            code === 0
                ? resolve()
                : reject(new Error(`${command} exited with ${code}`)),
        );
    });
}

async function exists(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch {
        return false;
    }
}
