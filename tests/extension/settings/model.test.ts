import { afterEach, describe, expect, it } from "vitest";

import {
    SETTINGS_FILE,
    SETTINGS_FOLDER,
    EMPTY_TEMPLATES,
    parseSettings,
    settingsText,
    templates,
    useTemplates,
} from "../../../extension/vscode_runtime/settings/model";

afterEach(() => useTemplates(EMPTY_TEMPLATES));

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

describe("parseSettings — reading what the author wrote", () => {
    it("takes what the file says", () => {
        const templates = parseSettings(
            JSON.stringify({
                templates: {
                    disclaimer: {
                        title: "A Word Before",
                        text: "All of it invented.",
                    },
                    about: {
                        text: "Writes at night.",
                        kdp: "https://amazon.com/author/x",
                        website: "https://example.com",
                        substack: "https://x.substack.com",
                    },
                    "title-page": { author: "A. Writer", publisher: "Nobody" },
                },
            }),
        );
        expect(templates.disclaimer).toEqual({
            title: "A Word Before",
            text: "All of it invented.",
        });
        expect(templates.about.text).toBe("Writes at night.");
        expect(templates["title-page"].author).toBe("A. Writer");
    });

    it("takes what the file mentions and leaves the rest empty", () => {
        const templates = parseSettings(
            '{"templates": {"disclaimer": {"title": "Warning"}}}',
        );
        expect(templates.disclaimer.title).toBe("Warning");
        expect(templates.disclaimer.text).toBe("");
        expect(templates.about).toEqual(EMPTY_TEMPLATES.about);
    });

    it("reads an empty file, and one with nothing of ours in it, as nothing said", () => {
        expect(parseSettings("{}")).toEqual(EMPTY_TEMPLATES);
        expect(parseSettings('{"templates": {}}')).toEqual(EMPTY_TEMPLATES);
        expect(parseSettings('{"something": "else"}')).toEqual(EMPTY_TEMPLATES);
    });

    it("ignores anything that is not text where text was expected", () => {
        const templates = parseSettings(
            '{"templates": {"disclaimer": {"text": 12}, "about": ["not an object"]}}',
        );
        expect(templates.disclaimer.text).toBe("");
        expect(templates.about).toEqual(EMPTY_TEMPLATES.about);
    });

    it("reads a paragraph written a line to a line", () => {
        const templates = parseSettings(
            JSON.stringify({
                templates: {
                    disclaimer: { text: ["All of it invented.", "", "Enjoy!"] },
                },
            }),
        );
        expect(templates.disclaimer.text).toBe("All of it invented.\n\nEnjoy!");
    });

    it("still reads a paragraph written as one string", () => {
        const templates = parseSettings(
            '{"templates": {"disclaimer": {"text": "A\\nB"}}}',
        );
        expect(templates.disclaimer.text).toBe("A\nB");
    });

    it("reads no lines as nothing said, not as a blank line", () => {
        expect(
            parseSettings('{"templates": {"about": {"text": []}}}').about.text,
        ).toBe("");
    });

    it("ignores a list with something in it that is not a line", () => {
        const templates = parseSettings(
            '{"templates": {"disclaimer": {"text": ["A", 2]}}}',
        );
        expect(templates.disclaimer.text).toBe("");
    });

    it("refuses a file that is not JSON at all, rather than quietly ignoring it", () => {
        expect(() => parseSettings("{ templates: ")).toThrow();
    });
});

describe("settingsText — writing the file out", () => {
    it("writes JSON a person can edit, and reads back what it wrote", () => {
        const text = settingsText(EMPTY_TEMPLATES);
        expect(text.startsWith('{\n  "templates"')).toBe(true);
        expect(text.endsWith("\n")).toBe(true);
        expect(parseSettings(text)).toEqual(EMPTY_TEMPLATES);
    });

    it("writes a page that has been written a line to a line", () => {
        const text = settingsText({
            ...EMPTY_TEMPLATES,
            disclaimer: {
                title: "Disclaimer",
                text: "All invented.\n\nEnjoy!",
            },
        });
        expect(text).toContain('"All invented."');
        expect(text).toContain('"Enjoy!"');
        expect(text).not.toContain("\\n");
    });

    it("writes a page nobody has written yet as an empty string, like every other empty slot", () => {
        const text = settingsText(EMPTY_TEMPLATES);
        expect(text).toContain('"text": ""');
        expect(text).not.toContain("[]");
    });

    it("names every template, so the file shows what there is to change", () => {
        const text = settingsText(EMPTY_TEMPLATES);
        for (const named of ["disclaimer", "about", "title-page"]) {
            expect(text, named).toContain(`"${named}"`);
        }
    });
});

describe("the templates in use", () => {
    it("is nothing at all until a workspace says otherwise", () => {
        expect(templates()).toEqual(EMPTY_TEMPLATES);
    });

    it("is whatever was last read", () => {
        const readFromTheFile = parseSettings(
            '{"templates": {"about": {"text": "Writes at night."}}}',
        );
        useTemplates(readFromTheFile);
        expect(templates().about.text).toBe("Writes at night.");
    });
});
