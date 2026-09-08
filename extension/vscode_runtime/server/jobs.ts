import { fetchFromServer } from "./fetch";

const MILLISECONDS_BETWEEN_POLLS = 400;

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
    whileTheJobRuns: (job: Job) => void = () => undefined,
): Promise<Job> {
    for (;;) {
        await new Promise((wake) =>
            setTimeout(wake, MILLISECONDS_BETWEEN_POLLS),
        );
        let job: Job;
        try {
            job = await fetchFromServer<Job>(
                `${route}?id=${encodeURIComponent(jobId)}`,
            );
        } catch {
            continue;
        }
        if (job.error) {
            throw new Error(job.error);
        }
        if (!job.running) {
            return job;
        }
        whileTheJobRuns(job);
    }
}
