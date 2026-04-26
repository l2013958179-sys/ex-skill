from __future__ import annotations

from app.schemas import ChatRequest, ChatResponse
from app.services.ai_client import AIClient
from app.services.storage_service import StorageService


class ChatService:
    def __init__(self, ai_client: AIClient, storage: StorageService) -> None:
        self.ai_client = ai_client
        self.storage = storage

    async def reply(self, request: ChatRequest) -> ChatResponse:
        meta, memories, persona = self.storage.load_skill_documents(request.slug)
        name = meta.get("name", request.slug)

        messages = [
            {
                "role": "system",
                "content": (
                    f"你现在扮演 {name}。必须严格遵守下面的 persona 和 memories。\n\n"
                    "【Persona】\n"
                    f"{persona}\n\n"
                    "【Memories】\n"
                    f"{memories}\n\n"
                    "规则：\n"
                    "1. 始终用 persona 中的说话方式回答。\n"
                    "2. 优先遵守 Layer 0 和 Correction 记录。\n"
                    "3. 回答要像真实聊天，不要解释你是 AI，也不要引用文档标题。\n"
                    "4. 尽量简洁自然，必要时可分成多条短句风格的内容。\n"
                ),
            }
        ]

        for turn in request.history[-12:]:
            if turn.role not in {"user", "assistant"}:
                continue
            messages.append({"role": turn.role, "content": turn.content})
        messages.append({"role": "user", "content": request.message})

        model, reply = await self.ai_client.complete(
            messages,
            temperature=0.8,
            max_tokens=1200,
        )
        return ChatResponse(slug=request.slug, model=model, reply=reply)
