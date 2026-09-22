import {
    AuthorshipPanelServingStatus,
    type ModelServingStatus,
} from "./AuthorshipPanelServingStatus";
import {
    AuthorshipPanelAsyncJobs,
    type AsyncJobStatus,
} from "./AuthorshipPanelAsyncJobs";
import "./AuthorshipPanelCanvas.css";

export type SendMessagesToVscode = (message: unknown) => void;

interface AuthorshipPanelCanvasProps {
    models?: ModelServingStatus[] | null;
    jobs?: AsyncJobStatus[] | null;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorshipPanelCanvas({
    models,
    jobs,
    sendMessagesToVscode,
}: AuthorshipPanelCanvasProps) {
    return (
        <>
            <details className="authorship-panel-drawer" open>
                <summary>Serving Status</summary>
                <div className="authorship-panel-drawer-body">
                    {models !== undefined && (
                        <AuthorshipPanelServingStatus models={models} />
                    )}
                </div>
            </details>
            <details className="authorship-panel-drawer" open>
                <summary>Jobs Status</summary>
                <div className="authorship-panel-drawer-body">
                    {jobs !== undefined && (
                        <AuthorshipPanelAsyncJobs
                            jobs={jobs}
                            sendMessagesToVscode={sendMessagesToVscode}
                        />
                    )}
                </div>
            </details>
        </>
    );
}
