export function authorshipPathFor(mdPath: string): string {
    return mdPath.replace(/\.md$/i, "") + ".authorship.md";
}
