// How a storydoc writes attributes, in a cell's marker and in a plot's events:
// `name="value"` on one line, a backslash in the value escaping the character
// after it, and `\n` standing for a line break.
export const WRITTEN_ATTRIBUTE = /([A-Za-z0-9][A-Za-z0-9_-]*)\s*=\s*"((?:[^"\\]|\\.)*)"/g;

export function attributesIn(text: string): Record<string, string> {
    return Object.fromEntries(
        Array.from(text.matchAll(WRITTEN_ATTRIBUTE), ([, name, value]) => [
            name,
            unescaped(value),
        ]),
    );
}

export function writtenAttributeValue(value: string): string {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n");
}

function unescaped(value: string): string {
    return value.replace(/\\(.)/g, (_, escaped: string) =>
        escaped === "n" ? "\n" : escaped,
    );
}
