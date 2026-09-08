import {
    AuthorshipPanelGeminiAccount,
    type GeminiAccountStatus,
} from "./AuthorshipPanelGeminiAccount";
import {
    AuthorshipPanelResourceManager,
    type ModelServingStatus,
} from "./AuthorshipPanelResourceManager";
import {
    AuthorshipPanelMemory,
    type MemoryInUse,
} from "./AuthorshipPanelMemory";
import {
    AuthorshipPanelAsyncJobs,
    type AsyncJobStatus,
} from "./AuthorshipPanelAsyncJobs";
import "./AuthorshipPanelCanvas.css";

export type SendMessagesToVscode = (message: unknown) => void;

interface AuthorshipPanelCanvasProps {
    account?: GeminiAccountStatus;
    models?: ModelServingStatus[] | null;
    memory?: MemoryInUse | null;
    jobs?: AsyncJobStatus[] | null;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorshipPanelCanvas({
    account,
    models,
    memory,
    jobs,
    sendMessagesToVscode,
}: AuthorshipPanelCanvasProps) {
    return (
        <>
            <details className="authorship-panel-drawer" open hidden={account?.off}>
                <summary>Account</summary>
                <div className="authorship-panel-drawer-body">
                    {account && (
                        <AuthorshipPanelGeminiAccount
                            account={account}
                            sendMessagesToVscode={sendMessagesToVscode}
                        />
                    )}
                </div>
            </details>
            <details className="authorship-panel-drawer" open>
                <summary>Serving Status</summary>
                <div className="authorship-panel-drawer-body">
                    {models !== undefined && (
                        <AuthorshipPanelResourceManager models={models} />
                    )}
                </div>
            </details>
            <details className="authorship-panel-drawer" open>
                <summary>Memory</summary>
                <div className="authorship-panel-drawer-body">
                    {memory !== undefined && (
                        <AuthorshipPanelMemory memory={memory} />
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
