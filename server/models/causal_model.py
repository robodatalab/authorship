from __future__ import annotations

import asyncio

from cortexgrid_infer import ServedCompletingModel


def complete(
    model: ServedCompletingModel, instruction: str, said: str, max_new_tokens: int
) -> str:
    return asyncio.run(_streamed_answer(model, instruction, said, max_new_tokens))


async def _streamed_answer(
    model: ServedCompletingModel, instruction: str, said: str, max_new_tokens: int
) -> str:
    return "".join(
        [
            chunk.content
            async for chunk in model.complete(
                [
                    {"role": "system", "content": instruction},
                    {"role": "user", "content": said},
                ],
                max_new_tokens=max_new_tokens,
                temperature=0.0,
            )
        ]
    )
