import {
    invokeAuthorDocumentCommand,
    type SendMessagesToVscode,
} from "../../webview/author_editor/AuthorFileEditorCanvas";
import type { ProseCheckError } from "./check_prose";

export function replaceCellMarkdown(
    sendMessagesToVscode: SendMessagesToVscode,
    cellIndex: number,
    markdown: string,
): void {
    invokeAuthorDocumentCommand(sendMessagesToVscode, "replaceMarkdown", {
        cellIndex,
        markdown,
    });
}

export function replaceCellAttribute(
    sendMessagesToVscode: SendMessagesToVscode,
    cellIndex: number,
    attributeName: string,
    attributeValue: string,
): void {
    invokeAuthorDocumentCommand(sendMessagesToVscode, "replaceAttribute", {
        cellIndex,
        attributeName,
        attributeValue,
    });
}

export function writeBlurb(
    sendMessagesToVscode: SendMessagesToVscode,
    cellIndex: number,
): void {
    invokeAuthorDocumentCommand(sendMessagesToVscode, "writeBlurb", {
        cellIndex,
    });
}

export function writeTableOfContents(
    sendMessagesToVscode: SendMessagesToVscode,
    cellIndex: number,
): void {
    invokeAuthorDocumentCommand(sendMessagesToVscode, "writeTableOfContents", {
        cellIndex,
    });
}

export function writeStorySoFar(
    sendMessagesToVscode: SendMessagesToVscode,
    cellIndex: number,
): void {
    invokeAuthorDocumentCommand(sendMessagesToVscode, "writeStorySoFar", {
        cellIndex,
    });
}

export function fixProseError(
    sendMessagesToVscode: SendMessagesToVscode,
    proseError: ProseCheckError,
): void {
    invokeAuthorDocumentCommand(sendMessagesToVscode, "fixProse", {
        ...proseError,
    });
}
