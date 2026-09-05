import { MODEL_SERVER_PORT } from "./process";

const POLL_MS = 400;
const TIMEOUT_MS = 180_000;
/** A poll that went astray is not a job that stopped; a run of them is. */
const POLLS_UNANSWERED = 5;

/** What every job on the model server says about itself. */
export interface ModelServerJob {
    running: boolean;
    error: string | null;
    cancelled?: boolean;
}

export async function startModelServerJob(
    route: string,
    asked: unknown,
): Promise<string> {
    const started = await fetch(
        `http://127.0.0.1:${MODEL_SERVER_PORT}${route}`,
        {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(asked),
        },
    );
    if (!started.ok) {
        throw new Error(`${route} answered ${started.status}`);
    }
    return ((await started.json()) as { id: string }).id;
}

export async function awaitModelServerJob<Job extends ModelServerJob>(
    route: string,
    id: string,
): Promise<Job> {
    const deadline = Date.now() + TIMEOUT_MS;
    let unanswered = 0;
    while (Date.now() < deadline) {
        await new Promise((wake) => setTimeout(wake, POLL_MS));
        let response: Response;
        try {
            response = await fetch(
                `http://127.0.0.1:${MODEL_SERVER_PORT}${route}?id=${encodeURIComponent(id)}`,
            );
        } catch (err: unknown) {
            if ((unanswered += 1) > POLLS_UNANSWERED) {
                throw err;
            }
            continue;
        }
        unanswered = 0;
        if (!response.ok) {
            throw new Error(`${route} answered ${response.status}`);
        }
        const job = (await response.json()) as Job;
        if (job.error) {
            throw new Error(job.error);
        }
        if (!job.running) {
            return job;
        }
    }
    throw new Error("the job is taking longer than expected");
}
