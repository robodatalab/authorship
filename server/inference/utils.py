import torch


def qwen_chat_prompt(system: str, user: str) -> str:
    """Render a turn the way Qwen's chat template does, with reasoning off."""
    return (
        f"<|im_start|>system\n{system}<|im_end|>\n"
        f"<|im_start|>user\n{user}<|im_end|>\n"
        f"<|im_start|>assistant\n<think>\n\n</think>\n\n"
    )


def coedit_prompt(instruction: str, text: str) -> str:
    return f"{instruction}: {text}"


def gpu_memory_used() -> float:
    if not torch.backends.mps.is_available():
        return 0.0
    return torch.mps.driver_allocated_memory() / 1e9


def gpu_tensors() -> float:
    if not torch.backends.mps.is_available():
        return 0.0
    return torch.mps.current_allocated_memory() / 1e9


def gpu_memory_limit() -> float:
    if not torch.backends.mps.is_available():
        return 0.0
    return torch.mps.recommended_max_memory() / 1e9
