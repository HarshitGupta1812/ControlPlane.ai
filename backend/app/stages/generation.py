from collections.abc import AsyncIterator

from app.llm.router import ModelRouter


async def run(prompt: str, route: dict) -> AsyncIterator[str]:
    async for token in ModelRouter().stream(prompt, route):
        yield token
