import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
    AuthorshipPanelSections,
    type AuthorshipPanelSection,
} from "../../../extension/webview/panel/AuthorshipPanelSections";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const THREE_SECTIONS: AuthorshipPanelSection[] = [
    { name: "plots", content: <p>The plots</p> },
    { name: "plot", content: <p>The plot</p> },
    { name: "event", content: <p>The event</p> },
];

describe("sections of a panel", () => {
    let root: Root;

    afterEach(() => {
        act(() => root.unmount());
        vi.restoreAllMocks();
    });

    async function mountSections(sections: AuthorshipPanelSection[]): Promise<void> {
        document.body.innerHTML = "";
        const container = document.createElement("div");
        document.body.append(container);
        root = createRoot(container);
        await act(async () => {
            root.render(<AuthorshipPanelSections sections={sections} />);
        });
    }

    function sharesOfTheHeight(): string[] {
        return [
            ...document.querySelectorAll<HTMLElement>(".authorship-panel-section"),
        ].map((section) => section.style.flex);
    }

    // The test's page lays nothing out, so every section is drawn this tall.
    function everySectionDrawn(height: number): void {
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
            new DOMRect(0, 0, 100, height),
        );
    }

    async function drag(sash: Element, fromY: number, toY: number): Promise<void> {
        await act(async () => {
            sash.dispatchEvent(
                new MouseEvent("mousedown", { bubbles: true, clientY: fromY }),
            );
        });
        await act(async () => {
            window.dispatchEvent(new MouseEvent("mousemove", { clientY: toY }));
        });
        await act(async () => {
            window.dispatchEvent(new MouseEvent("mouseup"));
        });
    }

    it("share the height alike, with a sash between every two of them", async () => {
        await mountSections(THREE_SECTIONS);

        const sashes = document.querySelectorAll(".authorship-panel-sash");
        expect(sharesOfTheHeight()).toEqual(["1 1 0px", "1 1 0px", "1 1 0px"]);
        expect(sashes).toHaveLength(2);
    });

    it("give the section above a sash more of the height, and the one below less, as it is dragged down", async () => {
        await mountSections(THREE_SECTIONS);
        everySectionDrawn(100);
        const [, secondSash] = document.querySelectorAll(".authorship-panel-sash");

        await drag(secondSash, 200, 250);

        expect(sharesOfTheHeight()).toEqual(["1 1 0px", "1.5 1 0px", "0.5 1 0px"]);
    });

    it("leave a section no smaller than it can be read in", async () => {
        await mountSections(THREE_SECTIONS);
        everySectionDrawn(100);
        const [firstSash] = document.querySelectorAll(".authorship-panel-sash");

        await drag(firstSash, 100, 500);

        expect(sharesOfTheHeight()).toEqual(["1.52 1 0px", "0.48 1 0px", "1 1 0px"]);
    });

    it("stop resizing once the sash is let go", async () => {
        await mountSections(THREE_SECTIONS);
        everySectionDrawn(100);
        const [firstSash] = document.querySelectorAll(".authorship-panel-sash");
        await drag(firstSash, 100, 120);

        await act(async () => {
            window.dispatchEvent(new MouseEvent("mousemove", { clientY: 180 }));
        });

        expect(sharesOfTheHeight()).toEqual(["1.2 1 0px", "0.8 1 0px", "1 1 0px"]);
    });

    it("keep each section's share when a section comes or goes", async () => {
        await mountSections(THREE_SECTIONS);
        everySectionDrawn(100);
        const [firstSash] = document.querySelectorAll(".authorship-panel-sash");
        await drag(firstSash, 100, 120);

        await mountSectionsAgain(THREE_SECTIONS.slice(0, 2));

        expect(sharesOfTheHeight()).toEqual(["1.2 1 0px", "0.8 1 0px"]);
    });

    async function mountSectionsAgain(sections: AuthorshipPanelSection[]): Promise<void> {
        await act(async () => {
            root.render(<AuthorshipPanelSections sections={sections} />);
        });
    }
});
