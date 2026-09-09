import { afterEach, describe, expect, it } from "vitest";

import {
    SETTINGS_FILE,
    SETTINGS_FOLDER,
    BLANK_SETTINGS,
    EMPTY_TEMPLATES,
    readSettings,
    templates,
    useTemplates,
} from "../../../extension/vscode_runtime/settings/model";

afterEach(() => useTemplates(EMPTY_TEMPLATES));

function folder(written: Record<string, string> = {}) {
    return (fileName: string) => Promise.resolve(written[fileName] ?? "");
}

describe("where a workspace keeps its templates", () => {
    it("keeps them beside the stories, in the workspace itself", () => {
        expect(`${SETTINGS_FOLDER}/${SETTINGS_FILE}`).toBe(
            ".author/settings.json",
        );
    });
});

describe("what Authorship starts a workspace with", () => {
    it("has no words of its own for any of these pages", () => {
        expect(EMPTY_TEMPLATES).toEqual({
            disclaimer: { title: "", text: "" },
            about: { text: "", kdp: "", website: "", substack: "" },
            "title-page": { author: "", publisher: "" },
        });
    });

    it("names every page an author may fill in, so the file shows the shape of it", () => {
        expect(Object.keys(EMPTY_TEMPLATES)).toEqual([
            "disclaimer",
            "about",
            "title-page",
        ]);
    });
});

describe("readSettings — reading what the author wrote", () => {
    it("takes what the file says", async () => {
        const written = await readSettings(
            JSON.stringify({
                templates: {
                    disclaimer: {
                        title: "A Word Before",
                        file: "disclaimer.md",
                    },
                    about: {
                        file: "about.md",
                        kdp: "https://amazon.com/author/x",
                        website: "https://example.com",
                        substack: "https://x.substack.com",
                    },
                    "title-page": { author: "A. Writer", publisher: "Nobody" },
                },
            }),
            folder({
                "disclaimer.md": "All of it invented.",
                "about.md": "Writes at night.",
            }),
        );
        expect(written.disclaimer).toEqual({
            title: "A Word Before",
            text: "All of it invented.",
        });
        expect(written.about.text).toBe("Writes at night.");
        expect(written["title-page"].author).toBe("A. Writer");
    });

    it("reads the page out of the file the template names, whatever it is called", async () => {
        const written = await readSettings(
            '{"templates": {"about": {"file": "pages/who I am.md"}}}',
            folder({ "pages/who I am.md": "Writes at night." }),
        );
        expect(written.about.text).toBe("Writes at night.");
    });

    it("takes what the file mentions and leaves the rest empty", async () => {
        const written = await readSettings(
            '{"templates": {"disclaimer": {"title": "Warning"}}}',
            folder(),
        );
        expect(written.disclaimer.title).toBe("Warning");
        expect(written.disclaimer.text).toBe("");
        expect(written.about).toEqual(EMPTY_TEMPLATES.about);
    });

    it("reads a page nobody has written yet as nothing said", async () => {
        const written = await readSettings(
            '{"templates": {"about": {"file": "about.md"}}}',
            folder(),
        );
        expect(written.about.text).toBe("");
    });

    it("reads an empty file, and one with nothing of ours in it, as nothing said", async () => {
        expect(await readSettings("{}", folder())).toEqual(EMPTY_TEMPLATES);
        expect(await readSettings('{"templates": {}}', folder())).toEqual(
            EMPTY_TEMPLATES,
        );
        expect(await readSettings('{"something": "else"}', folder())).toEqual(
            EMPTY_TEMPLATES,
        );
    });

    it("ignores anything that is not text where text was expected", async () => {
        const written = await readSettings(
            '{"templates": {"disclaimer": {"file": 12}, "about": ["not an object"]}}',
            folder({ "12": "never asked for" }),
        );
        expect(written.disclaimer.text).toBe("");
        expect(written.about).toEqual(EMPTY_TEMPLATES.about);
    });

    it("refuses a file that is not JSON at all, rather than quietly ignoring it", async () => {
        await expect(readSettings("{ templates: ", folder())).rejects.toThrow();
    });
});

describe("BLANK_SETTINGS — what a workspace is started with", () => {
    it("is JSON a person can edit, and reads back as nothing said", async () => {
        expect(BLANK_SETTINGS.startsWith('{\n  "templates"')).toBe(true);
        expect(BLANK_SETTINGS.endsWith("\n")).toBe(true);
        expect(await readSettings(BLANK_SETTINGS, folder())).toEqual(
            EMPTY_TEMPLATES,
        );
    });

    it("names the markdown files those pages are written in", () => {
        expect(BLANK_SETTINGS).toContain('"file": "disclaimer.md"');
        expect(BLANK_SETTINGS).toContain('"file": "about.md"');
    });

    it("names every template, so the file shows what there is to change", () => {
        for (const named of ["disclaimer", "about", "title-page"]) {
            expect(BLANK_SETTINGS, named).toContain(`"${named}"`);
        }
    });
});

describe("the templates in use", () => {
    it("is nothing at all until a workspace says otherwise", () => {
        expect(templates()).toEqual(EMPTY_TEMPLATES);
    });

    it("is whatever was last read", async () => {
        useTemplates(
            await readSettings(
                '{"templates": {"about": {"file": "about.md"}}}',
                folder({ "about.md": "Writes at night." }),
            ),
        );
        expect(templates().about.text).toBe("Writes at night.");
    });
});
