export type ServerPhase = "offline" | "ready";

export interface StatusBarReading {
    text: string;
    tooltip: string;
}

export function renderStatus(phase: ServerPhase): StatusBarReading {
    switch (phase) {
        case "offline":
            return {
                text: "$(book) Authorship: offline",
                tooltip:
                    "No model server is answering. Start it from the debugger.",
            };
        case "ready":
            return {
                text: "$(book) Authorship: ok",
                tooltip: "The model is loaded and serving.",
            };
    }
}
