import { Fragment } from "react";
import type { AuthorDocumentCommand } from "./author_document_command";
import "./AuthorFileEditorMainMenu.css";

interface AuthorFileEditorMainMenuProps {
    commands: AuthorDocumentCommand[];
}

export function AuthorFileEditorMainMenu({
    commands,
}: AuthorFileEditorMainMenuProps) {
    const categories = [
        ...new Set(commands.map((command) => command.category)),
    ];

    return (
        <nav className="author-file-editor-main-menu">
            {categories.map((category, categoryIndex) => (
                <Fragment key={category}>
                    {categoryIndex > 0 && (
                        <span className="author-file-editor-main-menu-divider" />
                    )}
                    {commands
                        .filter((command) => command.category === category)
                        .map((command) => (
                            <button
                                key={command.iconClassName}
                                type="button"
                                className="author-file-editor-main-menu-tool"
                                title={command.tooltip}
                                aria-label={command.tooltip}
                                onClick={command.invoke}
                            >
                                <i className={command.iconClassName} />
                            </button>
                        ))}
                </Fragment>
            ))}
        </nav>
    );
}
