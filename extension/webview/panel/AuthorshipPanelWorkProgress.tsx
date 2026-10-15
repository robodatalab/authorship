import type { WorkProgress } from "../../vscode_runtime/server/jobs";
import { onTheClock } from "../elapsed_time";
import "./AuthorshipPanelWorkProgress.css";

interface AuthorshipPanelWorkProgressProps {
    progress: WorkProgress;
}

function howFarAlong(step: WorkProgress): number {
    if (step.of !== null && step.of > 0) {
        return step.done / step.of;
    }
    return step.state === "done" ? 1 : 0;
}

function howManyDone(step: WorkProgress): string {
    if (step.of === null) {
        return step.done > 0 ? `${step.done}` : "";
    }
    return step.of > 1 ? `${step.done} of ${step.of}` : "";
}

function timeOnTheStep(step: WorkProgress): string {
    if (step.state === "waiting") {
        return "";
    }
    if (step.state === "running" && step.of !== null && step.done > 0) {
        const secondsPerItem = step.secondsPerItem ?? step.seconds / step.done;
        const left = secondsPerItem * (step.of - step.done);
        return `${onTheClock(step.seconds)} / ${onTheClock(step.seconds + left)}`;
    }
    return onTheClock(step.seconds);
}

function howFast(step: WorkProgress): string {
    if (step.secondsPerItem === null || step.secondsPerItem <= 0) {
        return "";
    }
    return step.secondsPerItem >= 1
        ? `${step.secondsPerItem.toFixed(1)} s/it`
        : `${(1 / step.secondsPerItem).toFixed(1)} it/s`;
}

function AuthorshipPanelWorkProgressBar({ step }: { step: WorkProgress }) {
    const filled = Math.round(howFarAlong(step) * 100);
    const counted = howManyDone(step);
    return (
        <div
            className={`authorship-panel-work-progress-step authorship-panel-work-progress-step-${step.state}`}
        >
            <span className="authorship-panel-work-progress-step-dot" />
            <span className="authorship-panel-work-progress-step-bar">
                <span
                    className="authorship-panel-work-progress-step-bar-fill"
                    style={{ width: `${filled}%` }}
                />
                <span className="authorship-panel-work-progress-step-counted">
                    {counted}
                </span>
                <span
                    className="authorship-panel-work-progress-step-counted authorship-panel-work-progress-step-counted-filled"
                    style={{ clipPath: `inset(0 ${100 - filled}% 0 0)` }}
                    aria-hidden
                >
                    {counted}
                </span>
            </span>
            <span className="authorship-panel-work-progress-step-says">
                <span>{step.doing}</span>
                <span className="authorship-panel-work-progress-step-took">
                    {timeOnTheStep(step)}
                </span>
                <span className="authorship-panel-work-progress-step-rate">
                    {howFast(step)}
                </span>
            </span>
        </div>
    );
}

function AuthorshipPanelWorkProgressStep({ step }: { step: WorkProgress }) {
    if (step.steps.length === 0) {
        return <AuthorshipPanelWorkProgressBar step={step} />;
    }
    return (
        <details
            className="authorship-panel-work-progress-steps"
            open={step.state === "running"}
        >
            <summary>
                <AuthorshipPanelWorkProgressBar step={step} />
            </summary>
            {step.steps.map((inner, index) => (
                <AuthorshipPanelWorkProgressStep key={index} step={inner} />
            ))}
        </details>
    );
}

export function AuthorshipPanelWorkProgress({
    progress,
}: AuthorshipPanelWorkProgressProps) {
    return (
        <div className="authorship-panel-work-progress">
            {progress.steps.map((step, index) => (
                <AuthorshipPanelWorkProgressStep key={index} step={step} />
            ))}
        </div>
    );
}
