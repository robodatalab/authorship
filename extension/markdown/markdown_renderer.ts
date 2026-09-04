const HTML_ESCAPES: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
};

function escapeHtml(text: string): string {
    return text.replace(/[&<>"]/g, (character) => HTML_ESCAPES[character]);
}

function safeUrl(url: string): string {
    if (/^https?:\/\//i.test(url)) {
        return url;
    }
    return /^[a-z][a-z0-9+.-]*:/i.test(url) ? "#" : url;
}

function inline(text: string): string {
    let out = escapeHtml(text);
    out = out.replace(
        /!\[([^\]]*)\]\(([^)\s]+)\)/g,
        (_match, alt, src) => `<img src="${safeUrl(src)}" alt="${alt}">`,
    );
    out = out.replace(
        /\[([^\]]+)\]\(([^)\s]+)\)/g,
        (_match, label, url) => `<a href="${safeUrl(url)}">${label}</a>`,
    );
    out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
    out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
    out = out.replace(/(?<!\w)_(?!_)(.+?)(?<!_)_(?!\w)/g, "<em>$1</em>");
    return out;
}

export function renderMarkdown(source: string): string {
    const blocks: string[] = [];
    let paragraph: string[] = [];
    let list: string[] | null = null;
    let ordered = false;

    const flushParagraph = (): void => {
        if (paragraph.length > 0) {
            blocks.push(`<p>${inline(paragraph.join(" "))}</p>`);
            paragraph = [];
        }
    };
    const flushList = (): void => {
        if (list) {
            const tag = ordered ? "ol" : "ul";
            blocks.push(`<${tag}>${list.join("")}</${tag}>`);
            list = null;
        }
    };
    const flush = (): void => {
        flushParagraph();
        flushList();
    };

    for (const raw of source.split("\n")) {
        const line = raw.trim();
        const heading = /^(#{1,6})\s+(.*)$/.exec(line);
        const bullet = /^[-*+]\s+(.*)$/.exec(line);
        const numbered = /^\d+[.)]\s+(.*)$/.exec(line);

        if (!line) {
            flush();
        } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
            flush();
            blocks.push("<hr>");
        } else if (heading) {
            flush();
            const level = heading[1].length;
            blocks.push(`<h${level}>${inline(heading[2])}</h${level}>`);
        } else if (line.startsWith("> ")) {
            flush();
            blocks.push(`<blockquote>${inline(line.slice(2))}</blockquote>`);
        } else if (bullet || numbered) {
            flushParagraph();
            const wantsOrdered = numbered !== null;
            if (list && ordered !== wantsOrdered) {
                flushList();
            }
            ordered = wantsOrdered;
            if (!list) {
                list = [];
            }
            list.push(`<li>${inline((bullet ?? numbered)![1])}</li>`);
        } else {
            flushList();
            paragraph.push(line);
        }
    }
    flush();
    return blocks.join("\n");
}
