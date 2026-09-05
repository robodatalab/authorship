import {
    invokeAuthorDocumentCommand,
    type PostToHost,
} from "../../webview/author_editor/AuthorFileEditorCanvas";

export function replaceCellMarkdown(
    postToHost: PostToHost,
    at: number,
    markdown: string,
): void {
    invokeAuthorDocumentCommand(postToHost, "replaceMarkdown", {
        at,
        markdown,
    });
}

export function replaceCellAttribute(
    postToHost: PostToHost,
    at: number,
    name: string,
    value: string,
): void {
    invokeAuthorDocumentCommand(postToHost, "replaceAttribute", {
        at,
        name,
        value,
    });
}

export function fixProseError(postToHost: PostToHost, id: number): void {
    invokeAuthorDocumentCommand(postToHost, "fixProseError", { id });
}
