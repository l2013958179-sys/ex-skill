from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from app.config import get_settings


@lru_cache
def load_prompt(name: str) -> str:
    prompts_dir = get_settings().prompts_dir
    prompt_path = Path(prompts_dir) / name
    return prompt_path.read_text(encoding="utf-8")

