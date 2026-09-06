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

let templatesInUse: Templates = EMPTY_TEMPLATES;

export function templates(): Templates {
    return templatesInUse;
}

export function useTemplates(templates: Templates): void {
    templatesInUse = templates;
}

export function parseSettings(settingsJson: string): Templates {
    const templates = fieldOf(JSON.parse(settingsJson) as unknown, "templates");
    const disclaimer = fieldOf(templates, "disclaimer");
    const about = fieldOf(templates, "about");
    const titlePage = fieldOf(templates, "title-page");
    return {
        disclaimer: {
            title: textOf(disclaimer, "title"),
            text: textOf(disclaimer, "text"),
        },
        about: {
            text: textOf(about, "text"),
            kdp: textOf(about, "kdp"),
            website: textOf(about, "website"),
            substack: textOf(about, "substack"),
        },
        "title-page": {
            author: textOf(titlePage, "author"),
            publisher: textOf(titlePage, "publisher"),
        },
    };
}

export function settingsText(templates: Templates): string {
    const settings = {
        templates: {
            disclaimer: {
                title: templates.disclaimer.title,
                text: asLines(templates.disclaimer.text),
            },
            about: {
                text: asLines(templates.about.text),
                kdp: templates.about.kdp,
                website: templates.about.website,
                substack: templates.about.substack,
            },
            "title-page": templates["title-page"],
        },
    };
    return JSON.stringify(settings, null, 2) + "\n";
}

function asLines(text: string): string | string[] {
    return text === "" ? "" : text.split("\n");
}

function fieldOf(settings: unknown, fieldName: string): unknown {
    return settings !== null && typeof settings === "object"
        ? (settings as Record<string, unknown>)[fieldName]
        : undefined;
}

function textOf(settings: unknown, fieldName: string): string {
    const written = fieldOf(settings, fieldName);
    if (typeof written === "string") {
        return written;
    }
    if (
        Array.isArray(written) &&
        written.every((line) => typeof line === "string")
    ) {
        return (written as string[]).join("\n");
    }
    return "";
}
