import { fetchFromServer } from "./fetch";

const MILLISECONDS_BETWEEN_POLLS = 400;
const MILLISECONDS_BEFORE_GIVING_UP = 180_000;
const UNANSWERED_POLLS_BEFORE_GIVING_UP = 5;

export interface ServerJob {
    running: boolean;
    error: string | null;
    cancelled?: boolean;
}

export async function startServerJob(
    route: string,
    requestBody: unknown,
): Promise<string> {
    return (await fetchFromServer<{ id: string }>(route, requestBody)).id;
}

export async function awaitServerJob<Job extends ServerJob>(
    route: string,
    jobId: string,
): Promise<Job> {
    const givingUpAt = Date.now() + MILLISECONDS_BEFORE_GIVING_UP;
    let pollsUnanswered = 0;
    while (Date.now() < givingUpAt) {
        await new Promise((wake) =>
            setTimeout(wake, MILLISECONDS_BETWEEN_POLLS),
        );
        let job: Job;
        try {
            job = await fetchFromServer<Job>(
                `${route}?id=${encodeURIComponent(jobId)}`,
            );
        } catch (unanswered: unknown) {
            if ((pollsUnanswered += 1) > UNANSWERED_POLLS_BEFORE_GIVING_UP) {
                throw unanswered;
            }
            continue;
        }
        pollsUnanswered = 0;
        if (job.error) {
            throw new Error(job.error);
        }
        if (!job.running) {
            return job;
        }
    }
    throw new Error("the job is taking longer than expected");
}
