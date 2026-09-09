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

export const BLANK_SETTINGS = `{
  "templates": {
    "disclaimer": {
      "title": "",
      "file": "disclaimer.md"
    },
    "about": {
      "file": "about.md",
      "kdp": "",
      "website": "",
      "substack": ""
    },
    "title-page": {
      "author": "",
      "publisher": ""
    }
  }
}
`;

let templatesInUse: Templates = EMPTY_TEMPLATES;

export function templates(): Templates {
    return templatesInUse;
}

export function useTemplates(templates: Templates): void {
    templatesInUse = templates;
}

export type ProseInFile = (fileName: string) => Promise<string>;

export async function readSettings(
    settingsJson: string,
    proseInFile: ProseInFile,
): Promise<Templates> {
    const templates = fieldOf(JSON.parse(settingsJson) as unknown, "templates");
    const disclaimer = fieldOf(templates, "disclaimer");
    const about = fieldOf(templates, "about");
    const titlePage = fieldOf(templates, "title-page");
    return {
        disclaimer: {
            title: textOf(disclaimer, "title"),
            text: await proseWrittenFor(disclaimer, proseInFile),
        },
        about: {
            text: await proseWrittenFor(about, proseInFile),
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

async function proseWrittenFor(
    template: unknown,
    proseInFile: ProseInFile,
): Promise<string> {
    const fileName = textOf(template, "file");
    return fileName === "" ? "" : await proseInFile(fileName);
}

function fieldOf(settings: unknown, fieldName: string): unknown {
    return settings !== null && typeof settings === "object"
        ? (settings as Record<string, unknown>)[fieldName]
        : undefined;
}

function textOf(settings: unknown, fieldName: string): string {
    const written = fieldOf(settings, fieldName);
    return typeof written === "string" ? written : "";
}
