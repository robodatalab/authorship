import type { WorkProgress } from "../../vscode_runtime/server/jobs";
import { onTheClock } from "../elapsed_time";
import "./AuthorFileEditorWorkProgress.css";

interface AuthorFileEditorWorkProgressProps {
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
        const left = (step.seconds / step.done) * (step.of - step.done);
        return `${onTheClock(step.seconds)} / ${onTheClock(step.seconds + left)}`;
    }
    return onTheClock(step.seconds);
}

function AuthorFileEditorWorkProgressBar({ step }: { step: WorkProgress }) {
    const filled = Math.round(howFarAlong(step) * 100);
    const counted = howManyDone(step);
    return (
        <div
            className={`author-file-editor-work-progress-step author-file-editor-work-progress-step-${step.state}`}
        >
            <span className="author-file-editor-work-progress-step-dot" />
            <span className="author-file-editor-work-progress-step-bar">
                <span
                    className="author-file-editor-work-progress-step-bar-fill"
                    style={{ width: `${filled}%` }}
                />
                <span className="author-file-editor-work-progress-step-counted">
                    {counted}
                </span>
                <span
                    className="author-file-editor-work-progress-step-counted author-file-editor-work-progress-step-counted-filled"
                    style={{ clipPath: `inset(0 ${100 - filled}% 0 0)` }}
                    aria-hidden
                >
                    {counted}
                </span>
            </span>
            <span className="author-file-editor-work-progress-step-says">
                <span>{step.doing}</span>
                <span className="author-file-editor-work-progress-step-took">
                    {timeOnTheStep(step)}
                </span>
            </span>
        </div>
    );
}

function AuthorFileEditorWorkProgressStep({ step }: { step: WorkProgress }) {
    if (step.steps.length === 0) {
        return <AuthorFileEditorWorkProgressBar step={step} />;
    }
    return (
        <details
            className="author-file-editor-work-progress-steps"
            open={step.state === "running"}
        >
            <summary>
                <AuthorFileEditorWorkProgressBar step={step} />
            </summary>
            {step.steps.map((inner, index) => (
                <AuthorFileEditorWorkProgressStep key={index} step={inner} />
            ))}
        </details>
    );
}

export function AuthorFileEditorWorkProgress({
    progress,
}: AuthorFileEditorWorkProgressProps) {
    return (
        <div className="author-file-editor-work-progress">
            {progress.steps.map((step, index) => (
                <AuthorFileEditorWorkProgressStep key={index} step={step} />
            ))}
        </div>
    );
}
