import {
    Fragment,
    useRef,
    useState,
    type MouseEvent as ReactMouseEvent,
    type ReactNode,
} from "react";
import "./AuthorshipPanelSections.css";

// The least a section can be squeezed to by dragging the sash beside it.
const SECTION_HEIGHT_LEAST = 48;

export interface AuthorshipPanelSection {
    // What the section is, so that its share of the height stays with it when
    // a section above or below it comes or goes.
    name: string;
    content: ReactNode;
}

interface AuthorshipPanelSectionsProps {
    sections: AuthorshipPanelSection[];
}

/**
 * Sections stacked one above the other, sharing the panel's height, with a sash
 * between every two of them that the author drags to give one more of it and
 * the other less. A section not yet resized takes a share as large as any other.
 */
export function AuthorshipPanelSections({
    sections,
}: AuthorshipPanelSectionsProps) {
    const [shareOfEach, shareTheHeight] = useState<Record<string, number>>({});
    const sectionsDrawn = useRef<Record<string, HTMLDivElement | null>>({});

    function shareOf(name: string): number {
        return shareOfEach[name] ?? 1;
    }

    function startResizing(
        above: string,
        below: string,
        pressed: ReactMouseEvent,
    ): void {
        const aboveDrawn = sectionsDrawn.current[above];
        const belowDrawn = sectionsDrawn.current[below];
        if (!aboveDrawn || !belowDrawn) {
            return;
        }
        pressed.preventDefault();
        const yPressed = pressed.clientY;
        const aboveHeight = aboveDrawn.getBoundingClientRect().height;
        const belowHeight = belowDrawn.getBoundingClientRect().height;
        const bothHeight = aboveHeight + belowHeight;
        const bothShare = shareOf(above) + shareOf(below);

        function resize(moved: MouseEvent): void {
            const aboveHeightNow = Math.min(
                Math.max(
                    aboveHeight + moved.clientY - yPressed,
                    SECTION_HEIGHT_LEAST,
                ),
                bothHeight - SECTION_HEIGHT_LEAST,
            );
            const aboveShare = (bothShare * aboveHeightNow) / bothHeight;
            shareTheHeight((shares) => ({
                ...shares,
                [above]: aboveShare,
                [below]: bothShare - aboveShare,
            }));
        }

        function stopResizing(): void {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
        }

        window.addEventListener("mousemove", resize);
        window.addEventListener("mouseup", stopResizing);
    }

    return (
        <>
            {sections.map((section, index) => (
                <Fragment key={section.name}>
                    {index > 0 && (
                        <div
                            className="authorship-panel-sash"
                            role="separator"
                            aria-orientation="horizontal"
                            onMouseDown={(pressed) =>
                                startResizing(
                                    sections[index - 1].name,
                                    section.name,
                                    pressed,
                                )
                            }
                        />
                    )}
                    <div
                        ref={(drawn) => {
                            sectionsDrawn.current[section.name] = drawn;
                        }}
                        className="authorship-panel-section"
                        style={{ flex: `${shareOf(section.name)} 1 0` }}
                    >
                        {section.content}
                    </div>
                </Fragment>
            ))}
        </>
    );
}
