import * as vscode from "vscode";

const SERVER_PORT_THE_EXTENSION_SHIPS_WITH = 8765;

const SERVER_PORT_FROM_THE_LAUNCH_CONFIGURATION =
    "AUTHORSHIP_MODEL_SERVER_PORT";

export function serverPort(): number {
    const portForThisWindow =
        process.env[SERVER_PORT_FROM_THE_LAUNCH_CONFIGURATION] ??
        vscode.workspace
            .getConfiguration("authorship")
            .get<number>("modelServerPort");
    return Number(portForThisWindow) || SERVER_PORT_THE_EXTENSION_SHIPS_WITH;
}

export function theLaunchConfigurationOwnsTheServer(): boolean {
    return process.env[SERVER_PORT_FROM_THE_LAUNCH_CONFIGURATION] !== undefined;
}

async function whyTheServerRefused(
    route: string,
    response: Response,
): Promise<string> {
    const refusal = (await response.json().catch(() => ({}))) as {
        detail?: string;
    };
    return refusal.detail ?? `${route} answered ${response.status}`;
}

export async function fetchFromServer<Answer>(
    route: string,
    requestBody?: unknown,
    millisecondsBeforeGivingUp?: number,
): Promise<Answer> {
    const response = await fetch(`http://127.0.0.1:${serverPort()}${route}`, {
        method: requestBody === undefined ? "GET" : "POST",
        headers:
            requestBody === undefined
                ? undefined
                : { "content-type": "application/json" },
        body:
            requestBody === undefined ? undefined : JSON.stringify(requestBody),
        signal:
            millisecondsBeforeGivingUp === undefined
                ? undefined
                : AbortSignal.timeout(millisecondsBeforeGivingUp),
    });
    if (!response.ok) {
        throw new Error(await whyTheServerRefused(route, response));
    }
    return (await response.json()) as Answer;
}
