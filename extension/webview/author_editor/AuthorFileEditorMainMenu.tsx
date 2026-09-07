import { Fragment } from "react";
import {
    invokeAuthorDocumentCommand,
    type SendMessagesToVscode,
    type WebviewAuthorDocumentCommandCard,
} from "./AuthorFileEditorCanvas";
import "./AuthorFileEditorMainMenu.css";

interface AuthorFileEditorMainMenuProps {
    commands: WebviewAuthorDocumentCommandCard[];
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorFileEditorMainMenu({
    commands,
    sendMessagesToVscode,
}: AuthorFileEditorMainMenuProps) {
    const buttonGroups = [
        ...new Set(commands.map((command) => command.buttonGroup)),
    ];

    return (
        <nav className="author-file-editor-main-menu">
            {buttonGroups.map((buttonGroup, buttonGroupIndex) => (
                <Fragment key={buttonGroup}>
                    {buttonGroupIndex > 0 && (
                        <span className="author-file-editor-main-menu-divider" />
                    )}
                    {commands
                        .filter(
                            (command) => command.buttonGroup === buttonGroup,
                        )
                        .map((command) => (
                            <button
                                key={command.iconClassName}
                                type="button"
                                className="author-file-editor-main-menu-tool"
                                title={command.tooltip}
                                aria-label={command.tooltip}
                                onClick={() =>
                                    invokeAuthorDocumentCommand(
                                        sendMessagesToVscode,
                                        command.commandName,
                                        {},
                                    )
                                }
                            >
                                <i className={command.iconClassName} />
                            </button>
                        ))}
                </Fragment>
            ))}
        </nav>
    );
}
