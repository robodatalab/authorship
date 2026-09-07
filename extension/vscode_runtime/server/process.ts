import * as vscode from "vscode";
import { spawn, type ChildProcess } from "node:child_process";

import { provision } from "./install";

const MODEL_SERVER_PORT_THE_EXTENSION_SHIPS_WITH = 8765;

const MODEL_SERVER_PORT_FROM_THE_LAUNCH_CONFIGURATION =
    "AUTHORSHIP_MODEL_SERVER_PORT";

const MILLISECONDS_BEFORE_A_PROBE_TIMES_OUT = 1_000;

export function modelServerPort(): number {
    const portForThisWindow =
        process.env[MODEL_SERVER_PORT_FROM_THE_LAUNCH_CONFIGURATION] ??
        vscode.workspace
            .getConfiguration("authorship")
            .get<number>("modelServerPort");
    return (
        Number(portForThisWindow) || MODEL_SERVER_PORT_THE_EXTENSION_SHIPS_WITH
    );
}

function theLaunchConfigurationOwnsTheServer(): boolean {
    return (
        process.env[MODEL_SERVER_PORT_FROM_THE_LAUNCH_CONFIGURATION] !==
        undefined
    );
}

export class ModelServer implements vscode.Disposable {
    private serverProcess: ChildProcess | undefined;
    private disposed = false;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly port: number,
        private readonly log: vscode.OutputChannel,
    ) {
        void this.startTheServer();
    }

    private async startTheServer(): Promise<void> {
        if (theLaunchConfigurationOwnsTheServer()) {
            this.log.appendLine(
                `the launch configuration owns the server on ${this.port}`,
            );
            return;
        }

        if (await somethingIsListeningOn(this.port)) {
            this.log.appendLine(
                `a server is already listening on ${this.port}, so this window will use that one`,
            );
            return;
        }

        try {
            const python = (await provision(this.context, this.log)).python;
            if (this.disposed) {
                return;
            }
            this.spawnTheServer(python.fsPath);
        } catch (failure) {
            const message =
                failure instanceof Error ? failure.message : String(failure);
            this.log.appendLine(
                `the model server could not be started: ${message}`,
            );
            const answer = await vscode.window.showErrorMessage(
                `Authorship could not install the writing model: ${message}`,
                "Show Log",
            );
            if (answer === "Show Log") {
                this.log.show();
            }
        }
    }

    private spawnTheServer(pythonPath: string): void {
        this.log.appendLine(`starting the model server on ${this.port}`);
        const serverProcess = spawn(
            pythonPath,
            ["-m", "server", "--port", String(this.port)],
            {
                cwd: this.context.extensionUri.fsPath,
            },
        );

        const writeToTheLog = (output: Buffer): void =>
            this.log.append(output.toString());
        serverProcess.stdout.on("data", writeToTheLog);
        serverProcess.stderr.on("data", writeToTheLog);

        serverProcess.on("exit", (exitCode) => {
            if (!this.disposed) {
                this.log.appendLine(`the model server exited with ${exitCode}`);
            }
        });

        this.serverProcess = serverProcess;
    }

    dispose(): void {
        this.disposed = true;
        this.serverProcess?.kill();
    }
}

async function somethingIsListeningOn(port: number): Promise<boolean> {
    try {
        const response = await fetch(`http://127.0.0.1:${port}/health`, {
            signal: AbortSignal.timeout(MILLISECONDS_BEFORE_A_PROBE_TIMES_OUT),
        });
        return response.ok;
    } catch {
        return false;
    }
}
