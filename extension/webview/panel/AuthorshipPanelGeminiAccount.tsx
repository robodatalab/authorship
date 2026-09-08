import type { SendMessagesToVscode } from "./AuthorshipPanelCanvas";
import "./AuthorshipPanelGeminiAccount.css";

/** The Gemini account as the drawer draws it. */
export interface GeminiAccountStatus {
    /** Whether the experiment this account is for is switched off. */
    off: boolean;
    /** The key's masked tail, or null when nobody is signed in. */
    label: string | null;
    /** The model in force; empty is whichever one Authorship ships with. */
    model: string;
    /** What that one is called, so the default option can name it. */
    shipped: string;
    models: { model: string; label: string; detail: string }[];
}

interface AuthorshipPanelGeminiAccountProps {
    account: GeminiAccountStatus;
    sendMessagesToVscode: SendMessagesToVscode;
}

/**
 * The Gemini account, the model it will use, and the way in or out.
 *
 * `null` is signed out, which is the state this starts in and the state most
 * authors will stay in — so it says what the account is *for* rather than only
 * that there isn't one. Signed in, the model matters as much as the key does:
 * Google retires names and keeps the best models off the free tier, so which
 * one this is pointed at is a thing that goes wrong and has to be visible.
 */
export function AuthorshipPanelGeminiAccount({
    account,
    sendMessagesToVscode,
}: AuthorshipPanelGeminiAccountProps) {
    const { label } = account;

    return (
        <div className="authorship-panel-account">
            <div
                className={
                    label
                        ? "authorship-panel-account-row authorship-panel-account-signed-in"
                        : "authorship-panel-account-row"
                }
            >
                <span className="authorship-panel-account-name">
                    Google Gemini
                </span>
                <span
                    className="authorship-panel-account-phase"
                    title={
                        label
                            ? "Signed in. Fixing style and grammar will use this key."
                            : "Fixing style and grammar needs a Gemini API key."
                    }
                >
                    {label ?? "signed out"}
                </span>
            </div>
            <div className="authorship-panel-account-why">
                {label
                    ? "Fixing style and grammar sends chapters to Google. Everything else runs on this machine."
                    : "Only needed to fix style and grammar, which is the one tool that does not run on this machine."}
            </div>
            {label && (
                <GeminiModelChoice
                    account={account}
                    sendMessagesToVscode={sendMessagesToVscode}
                />
            )}
            <button
                type="button"
                className="authorship-panel-account-action"
                onClick={() =>
                    sendMessagesToVscode({
                        type: label ? "signOutGemini" : "signInGemini",
                    })
                }
            >
                {label ? "Sign out" : "Sign in"}
            </button>
        </div>
    );
}

/**
 * Which Gemini corrects the chapters, as a list of the ones this key can reach.
 *
 * The list comes from Google when the account is looked at, so it is what the
 * key can actually use today rather than anything written into this extension —
 * which is the part that kept going stale.
 *
 * The chosen model is always among the options even when the list does not have
 * it: a name typed into settings by hand, or a list that could not be fetched,
 * still has to be shown, because a dropdown displaying something other than what
 * is in force is worse than no dropdown at all.
 */
function GeminiModelChoice({
    account,
    sendMessagesToVscode,
}: AuthorshipPanelGeminiAccountProps) {
    const offered = account.models.map((one) => one.model);

    return (
        <div className="authorship-panel-account-model">
            <label
                className="authorship-panel-account-model-label"
                htmlFor="gemini-model"
            >
                Model
            </label>
            <select
                className="authorship-panel-account-model-select"
                id="gemini-model"
                value={account.model}
                onChange={(chosen) =>
                    sendMessagesToVscode({
                        type: "setGeminiModel",
                        model: chosen.target.value,
                    })
                }
            >
                <option value="">
                    {account.shipped
                        ? `Default (${account.shipped})`
                        : "Default"}
                </option>
                {account.model && !offered.includes(account.model) && (
                    <option value={account.model}>
                        {`${account.model} (not listed for this key)`}
                    </option>
                )}
                {account.models.map((one) => (
                    <option
                        key={one.model}
                        value={one.model}
                        title={one.detail || one.label}
                    >
                        {one.model}
                    </option>
                ))}
            </select>
            <button
                type="button"
                className="authorship-panel-account-refresh"
                title="Ask Gemini for the list of models again"
                onClick={() =>
                    sendMessagesToVscode({ type: "refreshGeminiModels" })
                }
            >
                {"↻"}
            </button>
            {account.models.length === 0 && (
                <div className="authorship-panel-account-why">
                    Could not list the models for this key. The default is still
                    used.
                </div>
            )}
        </div>
    );
}
