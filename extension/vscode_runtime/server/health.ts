import { fetchFromServer } from "./fetch";

const MILLISECONDS_BEFORE_A_PROBE_TIMES_OUT = 1_000;
const MILLISECONDS_BEFORE_A_HEALTH_READING_TIMES_OUT = 10_000;

export interface ServerHealth {
    inference_server_status?: string;
}

export async function somethingIsAnsweringOnTheServerPort(): Promise<boolean> {
    try {
        await fetchFromServer<ServerHealth>(
            "/health",
            undefined,
            MILLISECONDS_BEFORE_A_PROBE_TIMES_OUT,
        );
        return true;
    } catch {
        return false;
    }
}

export function serverHealth(): Promise<ServerHealth> {
    return fetchFromServer<ServerHealth>(
        "/health",
        undefined,
        MILLISECONDS_BEFORE_A_HEALTH_READING_TIMES_OUT,
    );
}

export function theServerTookTooLongToAnswer(failure: unknown): boolean {
    return failure instanceof Error && failure.name === "TimeoutError";
}
