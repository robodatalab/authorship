import {
    invokeAuthorDocumentCommand,
    type PostToHost,
} from "../../webview/author_editor/AuthorFileEditorCanvas";
import type { ProseCheckError } from "./check_prose";

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

export function fixProseError(
    postToHost: PostToHost,
    proseError: ProseCheckError,
): void {
    invokeAuthorDocumentCommand(postToHost, "fixProse", { ...proseError });
}
