"""The readme as the extension pane can read it: screenshots carried inside it.

VS Code renders an extension's readme in a webview whose policy is

    default-src 'none'; img-src https: data:; ...

so an image is loadable only over https or as a `data:` URI. A screenshot
shipped in the VSIX has neither — the pane will not read a file out of the
extension folder, however the link is written — and an https link would have to
point at a public host, which a private repository is not.

That leaves `data:`. This writes a copy of the readme with every local image
folded into it, and packaging points vsce at the copy. `README.md` itself keeps
its relative links, so it stays a file a person can read and diff, and it is
what renders wherever the images can simply be fetched.
"""

from __future__ import annotations

import base64
import mimetypes
import re
import sys
from pathlib import Path

IMAGE = re.compile(r"!\[([^\]]*)\]\(([^)\s]+)\)")


def inlined(readme: Path) -> str:
    """The readme with every image that exists beside it carried in the text.

    A link to a file that is not there is left exactly as it is: it is either a
    URL already, or an example inside a code fence, and neither is ours to
    rewrite.
    """

    def carry(match: re.Match[str]) -> str:
        alt, link = match.group(1), match.group(2)
        image = readme.parent / link
        if "://" in link or link.startswith("data:") or not image.is_file():
            return match.group(0)
        kind = mimetypes.guess_type(image.name)[0] or "application/octet-stream"
        payload = base64.b64encode(image.read_bytes()).decode("ascii")
        return f"![{alt}](data:{kind};base64,{payload})"

    return IMAGE.sub(carry, readme.read_text(encoding="utf-8"))


def main() -> None:
    readme, target = Path(sys.argv[1]), Path(sys.argv[2])
    text = inlined(readme)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")
    print(f"{target}: {len(text.encode('utf-8')) / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    main()
