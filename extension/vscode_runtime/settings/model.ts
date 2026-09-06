export const SETTINGS_FOLDER = ".author";

export const SETTINGS_FILE = "settings.json";

export interface Templates {
    disclaimer: { title: string; text: string };
    about: { text: string; kdp: string; website: string; substack: string };
    "title-page": { author: string; publisher: string };
}

export const EMPTY_TEMPLATES: Templates = {
    disclaimer: { title: "", text: "" },
    about: { text: "", kdp: "", website: "", substack: "" },
    "title-page": { author: "", publisher: "" },
};

let inUse: Templates = EMPTY_TEMPLATES;

export function templates(): Templates {
    return inUse;
}

export function useTemplates(said: Templates): void {
    inUse = said;
}

export function parseSettings(text: string): Templates {
    const said = within(JSON.parse(text) as unknown, "templates");
    const disclaimer = within(said, "disclaimer");
    const about = within(said, "about");
    const titlePage = within(said, "title-page");
    return {
        disclaimer: {
            title: worded(disclaimer, "title"),
            text: worded(disclaimer, "text"),
        },
        about: {
            text: worded(about, "text"),
            kdp: worded(about, "kdp"),
            website: worded(about, "website"),
            substack: worded(about, "substack"),
        },
        "title-page": {
            author: worded(titlePage, "author"),
            publisher: worded(titlePage, "publisher"),
        },
    };
}

export function settingsText(said: Templates): string {
    const written = {
        templates: {
            disclaimer: {
                title: said.disclaimer.title,
                text: prose(said.disclaimer.text),
            },
            about: {
                text: prose(said.about.text),
                kdp: said.about.kdp,
                website: said.about.website,
                substack: said.about.substack,
            },
            "title-page": said["title-page"],
        },
    };
    return JSON.stringify(written, null, 2) + "\n";
}

function prose(text: string): string | string[] {
    return text === "" ? "" : text.split("\n");
}

function within(said: unknown, name: string): unknown {
    return said !== null && typeof said === "object"
        ? (said as Record<string, unknown>)[name]
        : undefined;
}

function worded(said: unknown, name: string): string {
    const value = within(said, name);
    if (typeof value === "string") {
        return value;
    }
    if (
        Array.isArray(value) &&
        value.every((line) => typeof line === "string")
    ) {
        return (value as string[]).join("\n");
    }
    return "";
}
