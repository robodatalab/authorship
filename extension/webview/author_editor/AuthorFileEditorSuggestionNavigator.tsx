import "./AuthorFileEditorSuggestionNavigator.css";

interface AuthorFileEditorSuggestionNavigatorProps {
    suggestionsLeft: number;
    goToThePreviousSuggestion: () => void;
    goToTheNextSuggestion: () => void;
}

export function AuthorFileEditorSuggestionNavigator({
    suggestionsLeft,
    goToThePreviousSuggestion,
    goToTheNextSuggestion,
}: AuthorFileEditorSuggestionNavigatorProps) {
    if (suggestionsLeft === 0) {
        return null;
    }
    return (
        <div className="author-file-editor-suggestion-navigator">
            <button
                type="button"
                className="author-file-editor-main-menu-tool"
                title="Bring the previous suggestion into view"
                aria-label="Previous suggestion"
                onClick={goToThePreviousSuggestion}
            >
                <i className="codicon codicon-arrow-up" />
            </button>
            <span className="author-file-editor-suggestion-navigator-count">
                {suggestionsLeft === 1
                    ? "1 suggestion"
                    : `${suggestionsLeft} suggestions`}
            </span>
            <button
                type="button"
                className="author-file-editor-main-menu-tool"
                title="Bring the next suggestion into view"
                aria-label="Next suggestion"
                onClick={goToTheNextSuggestion}
            >
                <i className="codicon codicon-arrow-down" />
            </button>
        </div>
    );
}
