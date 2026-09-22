import "./AuthorshipPanelServingStatus.css";

export interface ModelServingStatus {
    model: string;
    status: string;
}

function phaseClass(status: string): string {
    if (status === "running") {
        return "authorship-panel-model-running";
    }
    if (status === "not_started" || status === "deploying") {
        return "authorship-panel-model-deploying";
    }
    return "authorship-panel-model-stopped";
}

/** null means the server did not answer; a list is its models. */
export function AuthorshipPanelServingStatus({
    models,
}: {
    models: ModelServingStatus[] | null;
}) {
    if (models === null) {
        return (
            <div className="authorship-panel-models">
                <div className="authorship-panel-offline">
                    Model server offline
                </div>
            </div>
        );
    }

    return (
        <div className="authorship-panel-models">
            {models.map((model) => (
                <div key={model.model} className="authorship-panel-model">
                    <span
                        className="authorship-panel-model-name"
                        title={model.model}
                    >
                        {model.model}
                    </span>
                    <span
                        className={`authorship-panel-model-phase ${phaseClass(
                            model.status,
                        )}`}
                    >
                        {model.status}
                    </span>
                </div>
            ))}
        </div>
    );
}
