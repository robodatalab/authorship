import type { SendMessagesToVscode } from "./AuthorshipPanelCanvas";
import "./AuthorshipPanelAsyncJobs.css";

export interface AsyncJobStatus {
    kind: string;
    /** What the server keys the job by, and what stopping it names. */
    path: string;
    /** The same file, said short enough for the panel. */
    name: string;
    status: string;
    cancelled: boolean;
    secondsRunning: number;
}

function timeTheJobHasRun(secondsRunning: number): string {
    const seconds = Math.max(0, Math.round(secondsRunning));
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
        return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
    }
    if (minutes > 0) {
        return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
    }
    return `${seconds}s`;
}

interface AuthorshipPanelAsyncJobsProps {
    jobs: AsyncJobStatus[] | null;
    sendMessagesToVscode: SendMessagesToVscode;
}

/** null means the server did not answer; a list is the work it has in hand. */
export function AuthorshipPanelAsyncJobs({
    jobs,
    sendMessagesToVscode,
}: AuthorshipPanelAsyncJobsProps) {
    if (jobs === null) {
        return (
            <div className="authorship-panel-jobs">
                <div className="authorship-panel-offline">
                    Model server offline
                </div>
            </div>
        );
    }
    if (jobs.length === 0) {
        return (
            <div className="authorship-panel-jobs">
                <div className="authorship-panel-idle">Nothing queued</div>
            </div>
        );
    }

    return (
        <div className="authorship-panel-jobs">
            {jobs.map((job) => (
                <div key={job.path} className="authorship-panel-job">
                    {/* What the job does, and where it is, on one line; the file
                        it works on beneath, where a long path has the width to
                        read. */}
                    <div className="authorship-panel-job-head">
                        <span className="authorship-panel-job-kind">
                            {job.kind}
                        </span>
                        <span className="authorship-panel-job-elapsed">
                            {timeTheJobHasRun(job.secondsRunning)}
                        </span>
                        {/* A job stops between the pieces of work it is made of,
                            so on a long one there is a stretch where it has been
                            told and is still going. Saying so is the difference
                            between a slow button and a broken one. */}
                        <span
                            className={
                                job.cancelled
                                    ? "authorship-panel-job-phase authorship-panel-job-stopping"
                                    : `authorship-panel-job-phase authorship-panel-job-${job.status}`
                            }
                        >
                            {job.cancelled ? "stopping" : job.status}
                        </span>
                        {/* Only a job nobody has stopped yet: pressing it twice
                            asks the server for something it is already doing. */}
                        {!job.cancelled && (
                            <button
                                type="button"
                                className="authorship-panel-job-stop"
                                title={`Stop this ${job.kind}`}
                                onClick={() =>
                                    sendMessagesToVscode({
                                        type: "stopJob",
                                        path: job.path,
                                    })
                                }
                            >
                                <i />
                            </button>
                        )}
                    </div>
                    <div
                        className="authorship-panel-job-name"
                        title={job.name}
                    >
                        {job.name}
                    </div>
                </div>
            ))}
        </div>
    );
}
