import "./LinterTooltip.css";

/** One thing a check found, where it is in a text, and what could go there. */
export interface ProseError {
    readonly id: number;
    /** What sort of fault it is, which is what it is drawn in. */
    readonly kind: string;
    readonly at: number;
    readonly end: number;
    readonly message: string;
    readonly detail: string;
    readonly replacements: string[];
}

interface LinterTooltipProps {
    errors: ProseError[];
    onFixAsked: (error: ProseError) => void;
}

export function LinterTooltip({ errors, onFixAsked }: LinterTooltipProps) {
    return (
        <div className="linter-tooltip" role="tooltip">
            {errors.map((error) => (
                <div key={error.id} className="linter-tooltip-error">
                    <p
                        className={`linter-tooltip-kind linter-tooltip-${error.kind}`}
                    >
                        {error.kind}
                    </p>
                    <p className="linter-tooltip-said">{error.message}</p>
                    {error.detail && (
                        <p className="linter-tooltip-why">{error.detail}</p>
                    )}
                    {error.replacements.length > 0 && (
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
