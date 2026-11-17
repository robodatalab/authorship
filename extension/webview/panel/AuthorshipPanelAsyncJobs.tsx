import { Fragment } from "react";
import type { SendMessagesToVscode } from "./AuthorshipPanelCanvas";
import { timeItHasTaken } from "../elapsed_time";
import "./AuthorshipPanelAsyncJobs.css";

export interface AsyncJobStatus {
    kind: string;
    /** What the server keys the job by, and what stopping it names. */
    path: string;
    /** The same file, said short enough for the panel. */
    name: string;
    status: string;
    secondsRunning: number;
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
                <Fragment key={job.path}>
                    <div className="authorship-panel-job-what" title={job.name}>
                        <span className="authorship-panel-job-kind">
                            {job.kind}
                        </span>
                        <span className="authorship-panel-job-name">
                            {job.name}
                        </span>
                    </div>
                    <span
                        className={`authorship-panel-job-elapsed authorship-panel-job-${job.status}`}
                        title={job.status}
                    >
                        {timeItHasTaken(job.secondsRunning)}
                    </span>
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
                </Fragment>
            ))}
        </div>
    );
}
