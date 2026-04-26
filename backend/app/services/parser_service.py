from __future__ import annotations

import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from app.config import Settings
from app.schemas import ParsedSource


class ParserService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def collect_sources(
        self,
        *,
        files: list[UploadFile],
        raw_text: str,
        source_type: str,
        target_name: str,
        social_platform: str,
    ) -> list[ParsedSource]:
        session_id = datetime.now().strftime("%Y%m%d%H%M%S") + "-" + uuid4().hex[:8]
        upload_dir = self.settings.uploads_dir / session_id
        parsed_dir = self.settings.parsed_dir / session_id
        upload_dir.mkdir(parents=True, exist_ok=True)
        parsed_dir.mkdir(parents=True, exist_ok=True)

        parsed_sources: list[ParsedSource] = []

        for file in files:
            if not file.filename:
                continue

            saved_path = upload_dir / Path(file.filename).name
            with saved_path.open("wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            parsed_text, parsed_path = self._parse_saved_file(
                saved_path=saved_path,
                parsed_dir=parsed_dir,
                source_type=source_type,
                target_name=target_name,
                social_platform=social_platform,
            )
            parsed_sources.append(
                ParsedSource(
                    filename=saved_path.name,
                    source_type=source_type,
                    preview=parsed_text[:1200],
                    saved_path=str(saved_path),
                    parsed_path=str(parsed_path) if parsed_path else None,
                    parsed_text=parsed_text,
                )
            )

        if raw_text.strip():
            manual_path = upload_dir / "manual_input.txt"
            manual_path.write_text(raw_text.strip(), encoding="utf-8")
            parsed_sources.append(
                ParsedSource(
                    filename="manual_input.txt",
                    source_type="text",
                    preview=raw_text.strip()[:1200],
                    saved_path=str(manual_path),
                    parsed_path=None,
                    parsed_text=raw_text.strip(),
                )
            )

        if not parsed_sources:
            raise ValueError("请至少上传一个文件，或直接粘贴文本内容。")

        return parsed_sources

    def _parse_saved_file(
        self,
        *,
        saved_path: Path,
        parsed_dir: Path,
        source_type: str,
        target_name: str,
        social_platform: str,
    ) -> tuple[str, Path | None]:
        if source_type == "text":
            return self._read_text(saved_path), None

        output_path = parsed_dir / f"{saved_path.stem}.parsed.txt"
        script_map = {
            "wechat": "wechat_parser.py",
            "imessage": "imessage_parser.py",
            "sms": "sms_parser.py",
            "social": "social_media_parser.py",
        }
        script_name = script_map.get(source_type)
        if not script_name:
            raise ValueError(f"暂不支持的文件类型：{source_type}")

        command = [
            sys.executable,
            str(self.settings.tools_dir / script_name),
            "--file",
            str(saved_path),
            "--output",
            str(output_path),
        ]

        if source_type == "social":
            command.extend(["--platform", social_platform, "--target", target_name or ""])
        else:
            if not target_name:
                raise ValueError("解析聊天记录时，必须填写目标名称。")
            command.extend(["--target", target_name])

        result = subprocess.run(
            command,
            cwd=self.settings.project_root,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        if result.returncode != 0:
            message = result.stderr.strip() or result.stdout.strip() or "文件解析失败，请检查上传内容是否符合格式。"
            raise RuntimeError(message)

        if not output_path.exists():
            raise RuntimeError(f"解析完成，但未生成结果文件：{output_path.name}。")
        return output_path.read_text(encoding="utf-8"), output_path

    @staticmethod
    def _read_text(path: Path) -> str:
        encodings = ("utf-8", "utf-8-sig", "gbk", "gb18030", "latin-1")
        for encoding in encodings:
            try:
                return path.read_text(encoding=encoding)
            except UnicodeDecodeError:
                continue
        return path.read_text(encoding="utf-8", errors="ignore")
