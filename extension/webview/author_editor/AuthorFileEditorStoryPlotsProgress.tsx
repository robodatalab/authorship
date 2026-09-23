import type { StoryPlotsStep } from "../../vscode_runtime/commands/identify_story_plots";
import { onTheClock } from "../elapsed_time";
import "./AuthorFileEditorStoryPlotsProgress.css";

interface AuthorFileEditorStoryPlotsProgressProps {
    steps: StoryPlotsStep[];
}

const WHAT_A_PASS_DOES: { doing: StoryPlotsStep["doing"]; says: string }[] = [
    { doing: "plots", says: "finding plots" },
    { doing: "paragraphs", says: "attributing passages" },
    { doing: "events", says: "updating plots" },
];

function howFarAlong(steps: (StoryPlotsStep | undefined)[]): number {
    const counted = steps.filter(
        (step): step is StoryPlotsStep => step !== undefined && step.of > 0,
    );
    if (counted.length === 0) {
        return steps.some((step) => step?.state === "done") ? 1 : 0;
    }
    return (
        counted.reduce((sofar, step) => sofar + step.done, 0) /
        counted.reduce((sofar, step) => sofar + step.of, 0)
    );
}

function secondsLeft(steps: (StoryPlotsStep | undefined)[]): number | null {
    let left = 0;
    for (const step of steps) {
        if (step === undefined || step.state === "waiting") {
            return null;
        }
        if (step.state === "running") {
            if (step.done === 0) {
                return null;
            }
            left += (step.seconds / step.done) * (step.of - step.done);
        }
    }
    return left;
}

function stateOf(
    steps: (StoryPlotsStep | undefined)[],
): StoryPlotsStep["state"] {
    if (steps.some((step) => step?.state === "running")) {
        return "running";
    }
    if (steps.every((step) => step?.state === "done")) {
        return "done";
    }
    return steps.some((step) => step !== undefined) ? "running" : "waiting";
}

function timeOnTheStep(
    state: StoryPlotsStep["state"],
    seconds: number,
    left: number | null,
): string {
    if (state === "waiting") {
        return "";
    }
    if (state === "running" && left !== null) {
        return `${onTheClock(seconds)} / ${onTheClock(seconds + left)}`;
    }
    return onTheClock(seconds);
}

function AuthorFileEditorStoryPlotsStep({
    says,
    steps,
    counted,
}: {
    says: string;
    steps: (StoryPlotsStep | undefined)[];
    counted?: StoryPlotsStep;
}) {
    const state = stateOf(steps);
    const seconds = steps.reduce(
        (sofar, step) => sofar + (step?.seconds ?? 0),
        0,
    );
    const filled = Math.round(howFarAlong(steps) * 100);
    const howMany =
        counted && counted.of > 1 ? `${counted.done} of ${counted.of}` : "";
    return (
        <div
            className={`author-file-editor-story-plots-step author-file-editor-story-plots-step-${state}`}
        >
            <span className="author-file-editor-story-plots-step-dot" />
            <span className="author-file-editor-story-plots-step-bar">
                <span
                    className="author-file-editor-story-plots-step-bar-fill"
                    style={{ width: `${filled}%` }}
                />
                <span className="author-file-editor-story-plots-step-counted">
                    {howMany}
                </span>
                <span
                    className="author-file-editor-story-plots-step-counted author-file-editor-story-plots-step-counted-filled"
                    style={{ clipPath: `inset(0 ${100 - filled}% 0 0)` }}
                    aria-hidden
                >
                    {howMany}
                </span>
            </span>
            <span className="author-file-editor-story-plots-step-says">
                <span>{says}</span>
                <span className="author-file-editor-story-plots-step-took">
                    {timeOnTheStep(state, seconds, secondsLeft(steps))}
                </span>
            </span>
        </div>
    );
}

export function AuthorFileEditorStoryPlotsProgress({
    steps,
}: AuthorFileEditorStoryPlotsProgressProps) {
    const passes = [...new Set(steps.map((step) => step.passes))];
    const running = passes.length > 0 ? Math.max(...passes) : 0;
    return (
        <div className="author-file-editor-story-plots-progress">
            {passes.map((pass) => {
                const inThisPass = WHAT_A_PASS_DOES.map(({ doing, says }) => ({
                    says,
                    step: steps.find(
                        (step) => step.passes === pass && step.doing === doing,
                    ),
                }));
                return (
                    <details
                        key={pass}
                        className="author-file-editor-story-plots-pass"
                        open={pass === running}
                    >
                        <summary>
                            <AuthorFileEditorStoryPlotsStep
                                says={`Pass ${pass}`}
                                steps={inThisPass.map(({ step }) => step)}
                            />
                        </summary>
                        {inThisPass.map(({ says, step }) => (
                            <AuthorFileEditorStoryPlotsStep
                                key={says}
                                says={says}
                                steps={[step]}
                                counted={step}
                            />
                        ))}
                    </details>
                );
            })}
        </div>
    );
}
