from server.inference.inference import (
    InferenceModel,
    InferenceModelResourceManager,
    ModelNotAvailable,
)
from server.inference.kinds import CausalModel, Seq2SeqModel
from server.inference.utils import coedit_prompt, machine_memory, qwen_chat_prompt
