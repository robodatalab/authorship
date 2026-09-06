import * as vscode from "vscode";
import { spawn, type ChildProcess } from "node:child_process";

import { provision } from "./install";

export const MODEL_SERVER_PORT = 8765;

const PROBE_TIMEOUT_MS = 1_000;

export class ModelServer implements vscode.Disposable {
    private child: ChildProcess | undefined;
    private stopped = false;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly port: number,
        private readonly log: vscode.OutputChannel,
    ) {
        void this.start();
    }

    private async start(): Promise<void> {
        if (this.context.extensionMode === vscode.ExtensionMode.Development) {
            this.log.appendLine(
                "development host: leaving the server to the launch configuration",
            );
            return;
        }

        if (await answers(this.port)) {
            this.log.appendLine(
                `a server is already listening on ${this.port}`,
            );
            return;
        }

        try {
            const python = (await provision(this.context, this.log)).python;
            if (this.stopped) {
                return;
            }
            this.run(python.fsPath);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.log.appendLine(
                `the model server could not be started: ${message}`,
            );
            const shown = await vscode.window.showErrorMessage(
                `Authorship could not install the writing model: ${message}`,
                "Show Log",
            );
            if (shown === "Show Log") {
                this.log.show();
            }
        }
    }

    private run(python: string): void {
        this.log.appendLine(`starting the model server on ${this.port}`);
        const child = spawn(
            python,
            ["-m", "server", "--port", String(this.port)],
            {
                cwd: this.context.extensionUri.fsPath,
            },
        );

        const write = (chunk: Buffer): void =>
            this.log.append(chunk.toString());
        child.stdout.on("data", write);
        child.stderr.on("data", write);

        child.on("exit", (code) => {
            if (!this.stopped) {
                this.log.appendLine(`the model server exited with ${code}`);
            }
        });

        this.child = child;
    }

    dispose(): void {
        this.stopped = true;
        this.child?.kill();
    }
}

async function answers(port: number): Promise<boolean> {
    try {
        const response = await fetch(`http://127.0.0.1:${port}/health`, {
            signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        });
        return response.ok;
    } catch {
        return false;
    }
}
