from __future__ import annotations

from typing import Any

import httpx

from app.config import Settings


class AIClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.base_url = settings.ai_base_url.rstrip("/")
        self.headers = {
            "Authorization": f"Bearer {settings.ai_api_key}",
            "Content-Type": "application/json",
        }

    async def list_models(self) -> list[str]:
        async with httpx.AsyncClient(timeout=self.settings.ai_timeout) as client:
            response = await client.get(f"{self.base_url}/models", headers=self.headers)
            response.raise_for_status()
            payload = response.json()
        models = payload.get("data", [])
        return [item["id"] for item in models if item.get("supported_endpoint_types")]

    async def resolve_model(self) -> str:
        if self.settings.ai_model:
            return self.settings.ai_model

        models = await self.list_models()
        preferred_order = [
            "gpt-4.1-mini",
            "gpt-5-mini",
            "gpt-4o-mini",
            "gpt-4.1",
        ]
        for model in preferred_order:
            if model in models:
                return model
        if not models:
            raise RuntimeError("当前 AI 接口未返回可用模型，请检查接口地址或密钥配置。")
        return models[0]

    async def complete(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float | None = None,
        max_tokens: int = 4000,
    ) -> tuple[str, str]:
        model = await self.resolve_model()
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": self.settings.ai_temperature if temperature is None else temperature,
            "max_tokens": max_tokens,
        }

        async with httpx.AsyncClient(timeout=self.settings.ai_timeout) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers=self.headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

        message = data["choices"][0]["message"]["content"]
        if isinstance(message, list):
            text = "".join(
                part.get("text", "")
                for part in message
                if isinstance(part, dict)
            )
        else:
            text = str(message)
        return model, text.strip()
