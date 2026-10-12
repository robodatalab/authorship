import cortexgrid
from cortexgrid_infer import HuggingFaceImporter, Text2Text

LONG_CONTEXT_QWEN_ID = "Qwen/Qwen3-8B"

_NATIVE_CONTEXT_OF_QWEN3 = 32768
_YARN_STRETCH = 4

LONG_CONTEXT_QWEN = HuggingFaceImporter(LONG_CONTEXT_QWEN_ID, Text2Text)

LONG_CONTEXT_QWEN_DEPLOYMENT = cortexgrid.DeploymentConfig(
    family=LONG_CONTEXT_QWEN.family,
    suffix=LONG_CONTEXT_QWEN.suffix,
    run_name=cortexgrid.IMPORTED,
    config={
        "yarn_stretch": str(_YARN_STRETCH),
        "max_total_tokens": str(_NATIVE_CONTEXT_OF_QWEN3 * _YARN_STRETCH),
        "dtype": "bfloat16",
        "enable_thinking": "false",
    },
    serve_app=LONG_CONTEXT_QWEN.serve_app,
    source=LONG_CONTEXT_QWEN.source,
)
