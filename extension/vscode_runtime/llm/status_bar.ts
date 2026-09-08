import * as vscode from "vscode";

import { serverHealth, theServerTookTooLongToAnswer } from "../server/health";
import { phaseFor, renderStatus, type ServerPhase } from "./state";

const MILLISECONDS_BETWEEN_SERVER_PHASE_READINGS = 2_000;

export class ServerStatusBarItem implements vscode.Disposable {
    private readonly statusBarItem: vscode.StatusBarItem;
    private readonly phaseReadingTimer: NodeJS.Timeout;
    private serverPhase: ServerPhase = "offline";

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100,
        );
        this.showInTheStatusBar();
        this.statusBarItem.show();

        void this.readTheServerPhase();
        this.phaseReadingTimer = setInterval(
            () => void this.readTheServerPhase(),
            MILLISECONDS_BETWEEN_SERVER_PHASE_READINGS,
        );
    }

    private async readTheServerPhase(): Promise<void> {
        try {
            const health = await serverHealth();
            this.serverPhase = phaseFor(health.inference_server_status);
        } catch (unanswered) {
            if (!theServerTookTooLongToAnswer(unanswered)) {
                this.serverPhase = "offline";
            }
        }
        this.showInTheStatusBar();
    }

    private showInTheStatusBar(): void {
        const reading = renderStatus(this.serverPhase);
        this.statusBarItem.text = reading.text;
        this.statusBarItem.tooltip = reading.tooltip;
    }

    dispose(): void {
        clearInterval(this.phaseReadingTimer);
        this.statusBarItem.dispose();
    }
}
