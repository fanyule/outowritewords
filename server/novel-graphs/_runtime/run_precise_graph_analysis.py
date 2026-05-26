from __future__ import annotations

import asyncio
import json
import shutil
import sys
from pathlib import Path


def _require_text(value: object, name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name} is required")
    return value.strip()


def _require_dict(value: object, name: str) -> dict[str, object]:
    if not isinstance(value, dict):
        raise ValueError(f"{name} must be an object")
    return value


def _require_list(value: object, name: str) -> list[object]:
    if not isinstance(value, list):
        raise ValueError(f"{name} must be a list")
    return value


def _read_payload() -> dict[str, object]:
    raw = sys.stdin.buffer.read()
    if not raw.strip():
        raise ValueError("stdin payload is empty")
    parsed = json.loads(raw.decode("utf-8"))
    if not isinstance(parsed, dict):
        raise ValueError("payload root must be an object")
    return parsed


async def _main() -> None:
    payload = _read_payload()
    engine_root = Path(_require_text(payload.get("engine_root"), "engine_root"))
    workspace_path = Path(_require_text(payload.get("workspace_path"), "workspace_path"))
    source_txt_path = Path(_require_text(payload.get("source_txt_path"), "source_txt_path"))
    novel_id = _require_text(payload.get("novel_id"), "novel_id")
    title = _require_text(payload.get("title"), "title")
    provider_payload = _require_dict(payload.get("provider"), "provider")
    chapters_payload = _require_list(payload.get("chapters"), "chapters")
    chapter_ids_value = payload.get("chapter_ids")
    chapter_ids = []
    if isinstance(chapter_ids_value, list):
        chapter_ids = [str(item).strip() for item in chapter_ids_value if str(item).strip()]
    force = bool(payload.get("force"))

    src_dir = engine_root / "src"
    if not src_dir.exists():
        raise FileNotFoundError(f"graph engine src directory not found: {src_dir}")
    if str(src_dir) not in sys.path:
        sys.path.insert(0, str(src_dir))

    from novel_graph_engine.ai.openai_compatible_client import AiProviderConfig
    from novel_graph_engine.project.settings import AiSettings
    from novel_graph_engine.project.workspace import ProjectWorkspace
    from novel_graph_engine.schema.project import BookProject, Chapter

    provider = AiProviderConfig(
        provider=_require_text(provider_payload.get("provider"), "provider.provider"),
        base_url=_require_text(provider_payload.get("base_url"), "provider.base_url"),
        api_key=_require_text(provider_payload.get("api_key"), "provider.api_key"),
        model=_require_text(provider_payload.get("model"), "provider.model"),
        temperature=float(provider_payload.get("temperature") or 0.0),
        max_tokens=int(provider_payload.get("max_tokens") or 15000),
    )

    workspace = ProjectWorkspace(workspace_path)
    workspace.init()
    workspace.save_ai_settings(
        AiSettings(
            provider=provider.provider,
            base_url=provider.base_url,
            api_key=provider.api_key,
            model=provider.model,
            temperature=provider.temperature,
            max_response_tokens=provider.max_tokens,
        )
    )

    source_copy_path = workspace.source_dir / source_txt_path.name
    if source_txt_path.exists() and source_txt_path.resolve() != source_copy_path.resolve():
        shutil.copy2(source_txt_path, source_copy_path)
    elif source_txt_path.exists():
        source_copy_path = source_txt_path

    if workspace.chapters_dir.exists():
        shutil.rmtree(workspace.chapters_dir)
    workspace.chapters_dir.mkdir(parents=True, exist_ok=True)

    chapters: list[Chapter] = []
    for index, chapter_payload in enumerate(chapters_payload):
        chapter_record = _require_dict(chapter_payload, f"chapters[{index}]")
        chapter_id = _require_text(chapter_record.get("id"), f"chapters[{index}].id")
        chapter_title = _require_text(chapter_record.get("title"), f"chapters[{index}].title")
        chapter_content = _require_text(chapter_record.get("content"), f"chapters[{index}].content")
        order_value = chapter_record.get("order")
        if isinstance(order_value, bool) or not isinstance(order_value, int):
            raise ValueError(f"chapters[{index}].order must be an integer")
        chapter_text_path = workspace.chapters_dir / f"{chapter_id}.txt"
        chapter_text_path.write_text(chapter_content, encoding="utf-8")
        chapters.append(
            Chapter(
                id=chapter_id,
                title=chapter_title,
                order=order_value,
                source_href=f"novel:{novel_id}/chapter:{chapter_id}",
                text_path=chapter_text_path.relative_to(workspace.root).as_posix(),
            )
        )

    project = BookProject(
        id=novel_id,
        title=title,
        source_txt_path=source_copy_path.relative_to(workspace.root).as_posix() if source_copy_path.exists() else None,
        source_format="txt",
        chapters=chapters,
    )
    workspace.save_project(project)
    analyzed_count = await workspace.analyze_project(
        provider=provider,
        chapter_ids=chapter_ids or None,
        force=force,
    )
    export_path = await workspace.export_character_graph_async()
    result = {
        "analyzed_count": analyzed_count,
        "export_path": str(export_path),
        "workspace_path": str(workspace.root),
    }
    sys.stdout.buffer.write(json.dumps(result, ensure_ascii=False).encode("utf-8"))


if __name__ == "__main__":
    asyncio.run(_main())
