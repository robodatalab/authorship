import "./AuthorshipPanelResourceManager.css";

export interface ModelServingStatus {
    model: string;
    status: string;
    resident: boolean;
}

/** The server prefixes the model id onto its download progress; drop it here. */
function phaseText(status: string): string {
    const progress = status.match(/\d+% downloaded/);
    return progress ? progress[0] : status;
}

function phaseClass(status: string): string {
    if (status === "serving") {
        return "authorship-panel-model-serving";
    }
    if (status.includes("downloaded")) {
        return "authorship-panel-model-downloading";
    }
    return "authorship-panel-model-unloaded";
}

/** null means the server did not answer; a list is its models and which is resident. */
export function AuthorshipPanelResourceManager({
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
                <div
                    key={model.model}
                    className={
                        model.resident
                            ? "authorship-panel-model authorship-panel-model-resident"
                            : "authorship-panel-model"
                    }
                >
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
                        {phaseText(model.status)}
                    </span>
                </div>
            ))}
        </div>
    );
}
