def qwen_chat_prompt(system: str, user: str) -> str:
    """Render a turn the way Qwen's chat template does, with reasoning off."""
    return (
        f"<|im_start|>system\n{system}<|im_end|>\n"
        f"<|im_start|>user\n{user}<|im_end|>\n"
        f"<|im_start|>assistant\n<think>\n\n</think>\n\n"
    )
