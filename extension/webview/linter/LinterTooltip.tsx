import type { ProseCheckError } from "../../vscode_runtime/commands/check_prose";
import "./LinterTooltip.css";

interface LinterTooltipProps {
    errors: ProseCheckError[];
    onFixAsked: (error: ProseCheckError) => void;
}

export function LinterTooltip({ errors, onFixAsked }: LinterTooltipProps) {
    return (
        <div className="linter-tooltip" role="tooltip">
            {errors.map((error) => (
                <div
                    key={`${error.cellId}:${error.startCharacterOffsetInCell}`}
                    className="linter-tooltip-error"
                >
                    <p
                        className={`linter-tooltip-kind linter-tooltip-${error.isAnErrorOf}`}
                    >
                        {error.isAnErrorOf}
                    </p>
                    <p className="linter-tooltip-said">
                        {error.reasonForError}
                    </p>
                    {error.correctVersion !== "" && (
                        <button
                            type="button"
                            className="linter-tooltip-fix"
                            onClick={() => onFixAsked(error)}
                        >
                            Fix It
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
}
