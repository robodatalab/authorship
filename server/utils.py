AVG_CHARS_PER_TOKEN = 4


def estimate_num_tokens_in_text(text: str) -> int:
    return len(text) // AVG_CHARS_PER_TOKEN
