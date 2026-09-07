import * as vscode from "vscode";

import { serverHealth, theServerTookTooLongToAnswer } from "../server/health";
import { phaseFor, renderStatus, type ModelServerPhase } from "./state";

const MILLISECONDS_BETWEEN_SERVER_PHASE_READINGS = 2_000;

export class ModelHealth implements vscode.Disposable {
    private readonly statusBarItem: vscode.StatusBarItem;
    private readonly phaseReadingTimer: NodeJS.Timeout;
    private serverPhase: ModelServerPhase = "offline";
    private building = false;
    private fixing = false;
    private scoring = false;

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

    setBuilding(building: boolean): void {
        this.building = building;
        this.showInTheStatusBar();
    }

    setFixing(fixing: boolean): void {
        this.fixing = fixing;
        this.showInTheStatusBar();
    }

    setScoring(scoring: boolean): void {
        this.scoring = scoring;
        this.showInTheStatusBar();
    }

    private showInTheStatusBar(): void {
        const reading = renderStatus(this.phaseNow());
        this.statusBarItem.text = reading.text;
        this.statusBarItem.tooltip = reading.tooltip;
    }

    private phaseNow(): ModelServerPhase {
        if (this.building) {
            return "building";
        }
        if (this.fixing) {
            return "fixing";
        }
        return this.scoring ? "scoring" : this.serverPhase;
    }

    dispose(): void {
        clearInterval(this.phaseReadingTimer);
        this.statusBarItem.dispose();
    }
}
