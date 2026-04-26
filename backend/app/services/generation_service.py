from __future__ import annotations

import asyncio

from app.schemas import GenerateResponse, ParsedSource
from app.services.ai_client import AIClient
from app.services.prompt_loader import load_prompt
from app.services.storage_service import StorageService


class GenerationService:
    def __init__(self, ai_client: AIClient, storage: StorageService) -> None:
        self.ai_client = ai_client
        self.storage = storage

    async def generate(
        self,
        *,
        name: str,
        basic_info: str,
        personality_profile: str,
        parsed_sources: list[ParsedSource],
    ) -> GenerateResponse:
        materials_text = self._format_materials(parsed_sources)

        analysis_user_prompt = (
            f"人物昵称：{name}\n"
            f"基础信息：{basic_info or '（未提供）'}\n"
            f"性格画像：{personality_profile or '（未提供）'}\n\n"
            f"原材料如下：\n{materials_text}"
        )

        (model, memories_analysis), (_, persona_analysis) = await asyncio.gather(
            self.ai_client.complete(
                [
                    {"role": "system", "content": load_prompt("memories_analyzer.md")},
                    {"role": "user", "content": analysis_user_prompt},
                ],
                temperature=0.2,
            ),
            self.ai_client.complete(
                [
                    {"role": "system", "content": load_prompt("persona_analyzer.md")},
                    {"role": "user", "content": analysis_user_prompt},
                ],
                temperature=0.2,
            ),
        )

        (_, memories_markdown), (_, persona_markdown) = await asyncio.gather(
            self.ai_client.complete(
                [
                    {"role": "system", "content": load_prompt("memories_builder.md")},
                    {
                        "role": "user",
                        "content": (
                            f"请为 {name} 生成完整的 memories.md。\n"
                            f"基础信息：{basic_info or '（未提供）'}\n"
                            f"分析结果：\n{memories_analysis}\n\n"
                            "只输出 markdown 正文，不要加代码块。"
                        ),
                    },
                ],
                temperature=0.4,
            ),
            self.ai_client.complete(
                [
                    {"role": "system", "content": load_prompt("persona_builder.md")},
                    {
                        "role": "user",
                        "content": (
                            f"请为 {name} 生成完整的 persona.md。\n"
                            f"基础信息：{basic_info or '（未提供）'}\n"
                            f"性格画像：{personality_profile or '（未提供）'}\n"
                            f"分析结果：\n{persona_analysis}\n\n"
                            "只输出 markdown 正文，不要加代码块。"
                        ),
                    },
                ],
                temperature=0.45,
            ),
        )

        slug, skill_dir, meta, skill_markdown = self.storage.persist_skill(
            name=name,
            basic_info=basic_info,
            personality_profile=personality_profile,
            memories_markdown=memories_markdown,
            persona_markdown=persona_markdown,
            parsed_sources=parsed_sources,
        )

        return GenerateResponse(
            slug=slug,
            name=name,
            model=model,
            memories_analysis=memories_analysis,
            persona_analysis=persona_analysis,
            memories_markdown=memories_markdown,
            persona_markdown=persona_markdown,
            skill_markdown=skill_markdown,
            meta=meta,
            skill_dir=str(skill_dir),
            parsed_sources=parsed_sources,
        )

    @staticmethod
    def _format_materials(parsed_sources: list[ParsedSource]) -> str:
        sections: list[str] = []
        for index, source in enumerate(parsed_sources, start=1):
            sections.append(
                "\n".join(
                    [
                        f"## Source {index}",
                        f"Filename: {source.filename}",
                        f"Type: {source.source_type}",
                        source.parsed_text[:18000],
                    ]
                )
            )
        return "\n\n".join(sections)
