import type { Document } from "authordoc/storydoc";
import type { Suggestion } from "authordoc/suggestion";

export function withTheSuggestionApplied(
    document: Document,
    suggestion: Suggestion,
): Document {
    const diff = suggestion.diff();
    const documentSuggested = diff.applyTheDiff(document);
    return documentSuggested;
}

export function withEverySuggestionApplied(document: Document): Document {
    const documentSuggested = document.suggestions.reduce(
        withTheSuggestionApplied,
        document,
    );
    return documentSuggested;
}
