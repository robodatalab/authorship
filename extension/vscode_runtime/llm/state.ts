export type ModelServerPhase =
    | "offline"
    | "unloaded"
    | "downloading"
    | "ready"
    | "building"
    | "fixing"
    | "scoring";

export interface StatusBarReading {
    text: string;
    tooltip: string;
}

export function phaseFor(serverStatus: string | undefined): ModelServerPhase {
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

export function renderStatus(phase: ModelServerPhase): StatusBarReading {
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
        case "building":
            return {
                text: "$(sync~spin) Authorship: building",
                tooltip: "Reading the manuscript.",
            };
        case "fixing":
            return {
                text: "$(sync~spin) Authorship: fixing grammar",
                tooltip:
                    "Correcting the selected lines, or the section the cursor is in.",
            };
        case "scoring":
            return {
                text: "$(sync~spin) Authorship: scoring",
                tooltip: "Weighing the lines of the section the cursor is in.",
            };
    }
}
