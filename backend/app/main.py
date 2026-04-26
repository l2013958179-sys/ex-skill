from __future__ import annotations

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.schemas import ChatRequest, ChatResponse, ExSummary, GenerateResponse, HealthResponse
from app.services.ai_client import AIClient
from app.services.chat_service import ChatService
from app.services.generation_service import GenerationService
from app.services.parser_service import ParserService
from app.services.storage_service import StorageService


settings = get_settings()
ai_client = AIClient(settings)
storage_service = StorageService(settings)
parser_service = ParserService(settings)
generation_service = GenerationService(ai_client, storage_service)
chat_service = ChatService(ai_client, storage_service)

app = FastAPI(title=settings.app_name)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get(f"{settings.api_prefix}/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    model = settings.ai_model or "未配置"
    return HealthResponse(status="服务正常", model=model, available_models=[])


@app.get(f"{settings.api_prefix}/exes", response_model=list[ExSummary])
async def list_exes() -> list[ExSummary]:
    return [ExSummary(**item) for item in storage_service.list_skills()]


@app.post(f"{settings.api_prefix}/generate", response_model=GenerateResponse)
async def generate(
    name: str = Form(...),
    basic_info: str = Form(""),
    personality_profile: str = Form(""),
    target_name: str = Form(""),
    source_type: str = Form("wechat"),
    social_platform: str = Form("text"),
    raw_text: str = Form(""),
    files: list[UploadFile] | None = File(default=None),
) -> GenerateResponse:
    if not settings.ai_api_key:
        raise HTTPException(status_code=500, detail="后端未配置 AI_API_KEY，请检查 backend/.env。")

    target = target_name.strip() or name.strip()

    try:
        parsed_sources = await parser_service.collect_sources(
            files=files or [],
            raw_text=raw_text,
            source_type=source_type,
            target_name=target,
            social_platform=social_platform,
        )
        return await generation_service.generate(
            name=name.strip(),
            basic_info=basic_info.strip(),
            personality_profile=personality_profile.strip(),
            parsed_sources=parsed_sources,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post(f"{settings.api_prefix}/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    if not settings.ai_api_key:
        raise HTTPException(status_code=500, detail="后端未配置 AI_API_KEY，请检查 backend/.env。")

    try:
        return await chat_service.reply(request)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=str(exc)) from exc
