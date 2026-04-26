from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ParsedSource(BaseModel):
    filename: str
    source_type: str
    preview: str
    saved_path: str
    parsed_path: str | None = None
    parsed_text: str


class GenerateResponse(BaseModel):
    slug: str
    name: str
    model: str
    memories_analysis: str
    persona_analysis: str
    memories_markdown: str
    persona_markdown: str
    skill_markdown: str
    meta: dict[str, Any]
    skill_dir: str
    parsed_sources: list[ParsedSource] = Field(default_factory=list)


class ChatTurn(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    slug: str
    message: str
    history: list[ChatTurn] = Field(default_factory=list)


class ChatResponse(BaseModel):
    slug: str
    model: str
    reply: str


class ExSummary(BaseModel):
    slug: str
    name: str
    identity: str
    version: str
    updated_at: str
    corrections_count: int


class HealthResponse(BaseModel):
    status: str
    model: str
    available_models: list[str] = Field(default_factory=list)

