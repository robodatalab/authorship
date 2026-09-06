import {
    invokeAuthorDocumentCommand,
    type PostToHost,
} from "../../webview/author_editor/AuthorFileEditorCanvas";

export function replaceCellMarkdown(
    postToHost: PostToHost,
    cellIndex: number,
    markdown: string,
): void {
    invokeAuthorDocumentCommand(postToHost, "replaceMarkdown", {
        cellIndex,
        markdown,
    });
}

export function replaceCellAttribute(
    postToHost: PostToHost,
    cellIndex: number,
    attributeName: string,
    attributeValue: string,
): void {
    invokeAuthorDocumentCommand(postToHost, "replaceAttribute", {
        cellIndex,
        attributeName,
        attributeValue,
    });
}
