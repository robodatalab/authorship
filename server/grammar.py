import re

from server.inference.completion import CompletionModel


GRAMMAR_SYSTEM = """\
You are a copy-editor working on one passage from a longer manuscript.

Correct the spelling, punctuation and grammar of the passage. Change nothing \
else: keep the wording, the tone, the meaning and the markdown exactly as they \
are. Do not add, remove, rephrase, explain or translate anything, and do not \
answer or continue the text. If the passage is already correct, repeat it back \
unchanged.

Reply with the corrected passage alone — no commentary, no quoting, no code \
fences.\
"""


# Blocks are runs of text separated by blank lines. Splitting on the separator
# while capturing it keeps those blank lines in the result, so the document can
# be put back together exactly as it came apart.
_SEPARATOR = re.compile(r"(\n[ \t]*\n)")

# Any letter, in any language. A piece without one is not prose.
_LETTER = re.compile(r"[^\W\d_]", re.UNICODE)


def fix_grammar(model: CompletionModel, markdown: str) -> str:
    """Return `markdown` with its prose corrected and its structure intact."""
    pieces: list[str] = []
    for piece in _SEPARATOR.split(markdown):
        # Only prose is corrected. The blank-line separators, and blocks with no
        # letters at all — a horizontal rule, a row of numbers — are left as they
        # are; there is nothing in them to spell wrong.
        if _LETTER.search(piece):
            pieces.append(_fix_block(model, piece))
        else:
            pieces.append(piece)
    return "".join(pieces)


def _fix_block(model: CompletionModel, block: str) -> str:
    # The corrected block should come back about as long as it went in; a budget
    # tied to its length leaves generous room without inviting a runaway.
    budget = max(64, len(block))
    reply = model.complete(GRAMMAR_SYSTEM, block, max_new_tokens=budget)
    # The block was split out from between blank lines and carried none of its
    # own; the model tends to frame its answer in one or two, so strip them back.
    return reply.strip("\n")
