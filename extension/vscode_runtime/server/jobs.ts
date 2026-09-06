import { MODEL_SERVER_PORT } from "./process";

const MILLISECONDS_BETWEEN_POLLS = 400;
const MILLISECONDS_BEFORE_GIVING_UP = 180_000;
const UNANSWERED_POLLS_BEFORE_GIVING_UP = 5;

export interface ModelServerJob {
    running: boolean;
    error: string | null;
    cancelled?: boolean;
}

export async function startModelServerJob(
    route: string,
    requestBody: unknown,
): Promise<string> {
    const startedJob = await fetch(
        `http://127.0.0.1:${MODEL_SERVER_PORT}${route}`,
        {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(requestBody),
        },
    );
    if (!startedJob.ok) {
        throw new Error(`${route} answered ${startedJob.status}`);
    }
    return ((await startedJob.json()) as { id: string }).id;
}

export async function awaitModelServerJob<Job extends ModelServerJob>(
    route: string,
    jobId: string,
): Promise<Job> {
    const givingUpAt = Date.now() + MILLISECONDS_BEFORE_GIVING_UP;
    let pollsUnanswered = 0;
    while (Date.now() < givingUpAt) {
        await new Promise((wake) =>
            setTimeout(wake, MILLISECONDS_BETWEEN_POLLS),
        );
        let response: Response;
        try {
            response = await fetch(
                `http://127.0.0.1:${MODEL_SERVER_PORT}${route}?id=${encodeURIComponent(jobId)}`,
            );
        } catch (unanswered: unknown) {
            if ((pollsUnanswered += 1) > UNANSWERED_POLLS_BEFORE_GIVING_UP) {
                throw unanswered;
            }
            continue;
        }
        pollsUnanswered = 0;
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
