from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path
from typing import Any

from app.config import Settings
from app.schemas import ParsedSource


PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from tools import skill_writer  # noqa: E402


class StorageService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def persist_skill(
        self,
        *,
        name: str,
        basic_info: str,
        personality_profile: str,
        memories_markdown: str,
        persona_markdown: str,
        parsed_sources: list[ParsedSource],
    ) -> tuple[str, Path, dict[str, Any], str]:
        slug = self._next_slug(skill_writer.slugify(name))
        meta = self._build_meta(
            name=name,
            slug=slug,
            basic_info=basic_info,
            personality_profile=personality_profile,
            parsed_sources=parsed_sources,
        )

        skill_dir = skill_writer.create_skill(
            self.settings.exes_dir,
            slug,
            meta,
            memories_markdown,
            persona_markdown,
        )
        self._copy_sources(skill_dir, parsed_sources)

        skill_markdown = (skill_dir / "SKILL.md").read_text(encoding="utf-8")
        meta_data = json.loads((skill_dir / "meta.json").read_text(encoding="utf-8"))
        return slug, skill_dir, meta_data, skill_markdown

    def list_skills(self) -> list[dict[str, Any]]:
        return skill_writer.list_exes(self.settings.exes_dir)

    def load_skill_documents(self, slug: str) -> tuple[dict[str, Any], str, str]:
        skill_dir = self.settings.exes_dir / slug
        if not skill_dir.exists():
            raise FileNotFoundError(f"未找到标识为“{slug}”的人物档案。")

        meta = json.loads((skill_dir / "meta.json").read_text(encoding="utf-8"))
        memories = (skill_dir / "memories.md").read_text(encoding="utf-8")
        persona = (skill_dir / "persona.md").read_text(encoding="utf-8")
        return meta, memories, persona

    def _copy_sources(self, skill_dir: Path, parsed_sources: list[ParsedSource]) -> None:
        folder_map = {
            "wechat": "chats",
            "imessage": "chats",
            "sms": "chats",
            "social": "social",
            "text": "chats",
        }

        for source in parsed_sources:
            category = folder_map.get(source.source_type, "chats")
            destination_dir = skill_dir / "knowledge" / category
            destination_dir.mkdir(parents=True, exist_ok=True)

            saved_path = Path(source.saved_path)
            if saved_path.exists():
                shutil.copy2(saved_path, destination_dir / saved_path.name)

            if source.parsed_path:
                parsed_path = Path(source.parsed_path)
                if parsed_path.exists():
                    shutil.copy2(parsed_path, destination_dir / parsed_path.name)

    def _next_slug(self, base_slug: str) -> str:
        slug = base_slug
        index = 2
        while (self.settings.exes_dir / slug).exists():
            slug = f"{base_slug}_{index}"
            index += 1
        return slug

    def _build_meta(
        self,
        *,
        name: str,
        slug: str,
        basic_info: str,
        personality_profile: str,
        parsed_sources: list[ParsedSource],
    ) -> dict[str, Any]:
        duration = self._match(
            basic_info,
            [
                r"(在一起[^\s，。,；;]{1,12})",
                r"(一起[^\s，。,；;]{1,12})",
                r"([一二两三四五六七八九十\d]+年半?)",
            ],
        )
        how_met = self._match(
            basic_info,
            [
                r"((?:通过|因为|在).{0,12}(?:认识|相识|遇见))",
                r"((?:大学同学|高中同学|同事|朋友介绍|网友|校友))",
            ],
        )
        time_since_breakup = self._match(
            basic_info,
            [
                r"(分手[^\s，。,；;]{1,12})",
                r"(分开[^\s，。,；;]{1,12})",
            ],
        )
        occupation = self._match(
            basic_info,
            [
                r"(?:她做|她是|做)\s*([^\s，。,；;]{1,16})",
            ],
            group=1,
        )
        mbti = self._match(
            personality_profile.upper(),
            [r"\b([IE][NS][FT][PJ])\b"],
            group=1,
        )

        return {
            "name": name,
            "slug": slug,
            "profile": {
                "duration": duration,
                "how_met": how_met,
                "time_since_breakup": time_since_breakup,
                "occupation": occupation,
                "gender": "女",
                "mbti": mbti,
                "basic_info": basic_info,
                "personality_profile": personality_profile,
            },
            "tags": {
                "personality": [tag for tag in re.split(r"[\s,，、]+", personality_profile) if tag],
                "attachment": self._match(
                    personality_profile,
                    [r"(焦虑型|回避型|安全型|混乱型)"],
                ),
            },
            "impression": personality_profile,
            "knowledge_sources": [
                {
                    "filename": source.filename,
                    "source_type": source.source_type,
                    "saved_path": source.saved_path,
                    "parsed_path": source.parsed_path,
                }
                for source in parsed_sources
            ],
        }

    @staticmethod
    def _match(text: str, patterns: list[str], group: int = 1) -> str:
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(group)
        return ""
