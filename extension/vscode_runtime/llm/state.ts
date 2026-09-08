export type ServerPhase = "offline" | "unloaded" | "downloading" | "ready";

export interface StatusBarReading {
    text: string;
    tooltip: string;
}

export function phaseFor(serverStatus: string | undefined): ServerPhase {
    if (serverStatus === "serving") {
        return "ready";
    }
    if (serverStatus === "unloaded") {
        return "unloaded";
    }
    if (serverStatus !== undefined && /\d+% downloaded$/.test(serverStatus)) {
        return "downloading";
    }
    return "offline";
}

export function renderStatus(phase: ServerPhase): StatusBarReading {
    switch (phase) {
        case "offline":
            return {
                text: "$(book) Authorship: offline",
                tooltip:
                    "No model server is answering. Start it from the debugger.",
            };
        case "unloaded":
            return {
                text: "$(book) Authorship: idle",
                tooltip:
                    "The model server is up; the model loads on first use.",
            };
        case "downloading":
            return {
                text: "$(book) Authorship: downloading",
                tooltip: "Fetching the model. This takes a while on first run.",
            };
        case "ready":
            return {
                text: "$(book) Authorship: ok",
                tooltip: "The model is loaded and serving.",
            };
    }
}
