export function authorshipPathFor(markdownPath: string): string {
    return markdownPath.replace(/\.md$/i, "") + ".authorship.md";
}
