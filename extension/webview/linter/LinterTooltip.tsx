import "./LinterTooltip.css";

interface LinterTooltipProps {
    issues: string[];
}

export function LinterTooltip({ issues }: LinterTooltipProps) {
    return (
        <div className="linter-tooltip" role="tooltip">
            {issues.map((issue) => (
                <p key={issue} className="linter-tooltip-issue">
                    {issue}
                </p>
            ))}
        </div>
    );
}
