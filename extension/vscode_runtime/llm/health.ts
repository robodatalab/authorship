import * as vscode from "vscode";

import { phaseFor, renderStatus, type Phase } from "./state";

const POLL_INTERVAL_MS = 2_000;

const REQUEST_TIMEOUT_MS = 10_000;

export class ModelHealth implements vscode.Disposable {
    private readonly status: vscode.StatusBarItem;
    private readonly timer: NodeJS.Timeout;
    private phase: Phase = "offline";
    private building = false;
    private fixing = false;
    private scoring = false;

    constructor(private readonly port: number) {
        this.status = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100,
        );
        this.render();
        this.status.show();

        void this.poll();
        this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
    }

    private async poll(): Promise<void> {
        try {
            const response = await fetch(
                `http://127.0.0.1:${this.port}/health`,
                {
                    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                },
            );
            const body = (await response.json()) as {
                inference_server_status?: string;
            };
            this.phase = phaseFor(body.inference_server_status);
        } catch (err) {
            if (!isTimeout(err)) {
                this.phase = "offline";
            }
        }
        this.render();
    }

    setBuilding(building: boolean): void {
        this.building = building;
        this.render();
    }

    setFixing(fixing: boolean): void {
        this.fixing = fixing;
        this.render();
    }

    setScoring(scoring: boolean): void {
        this.scoring = scoring;
        this.render();
    }

    private render(): void {
        const display = renderStatus(this.current());
        this.status.text = display.text;
        this.status.tooltip = display.tooltip;
    }

    private current(): Phase {
        if (this.building) {
            return "building";
        }
        if (this.fixing) {
            return "fixing";
        }
        return this.scoring ? "scoring" : this.phase;
    }

    dispose(): void {
        clearInterval(this.timer);
        this.status.dispose();
    }
}

function isTimeout(err: unknown): boolean {
    return err instanceof Error && err.name === "TimeoutError";
}
