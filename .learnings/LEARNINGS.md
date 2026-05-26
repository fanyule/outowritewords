# Learnings

Corrections, insights, and knowledge gaps captured during development.

**Categories**: correction | insight | knowledge_gap | best_practice

---

## [LRN-20260509-001] best_practice

**Logged**: 2026-05-09T12:10:00+08:00
**Priority**: high
**Status**: pending
**Area**: frontend

### Summary
When a TSX page already contains legacy mojibake strings, it is safer to rebuild the presentation layer around the same queries and state than to keep patching the damaged file with bulk search-replace.

### Details
`client/src/pages/novelGraph/NovelGraphPage.tsx` had already accumulated malformed strings and broken JSX around user-facing copy. A later PowerShell bulk replace for theme colors made the file unrecoverable by incremental edits. The lowest-risk recovery was to preserve the existing data flow (`useQuery`, `useMutation`, filters, selection, graph adapter) and rewrite only the UI shell in a clean UTF-8 file, keeping business behavior intact while restoring compile safety.

### Suggested Action
For future UI overhauls on legacy mojibake-heavy TSX files in this repo, prefer a controlled presentation-layer rewrite over repeated inline text replacement once parser damage appears.

### Metadata
- Source: error
- Related Files: client/src/pages/novelGraph/NovelGraphPage.tsx
- Tags: frontend, tsx, encoding, recovery, ui
- Pattern-Key: frontend.mojibake.rewrite-view-layer

---

## 2026-05-08 - Local skill payload may be a pointer, not a real data directory

**Context**: Using the local `ui-ux-pro-max` skill for a large UI refactor
**Priority**: medium
**Status**: applied
**Area**: tooling

### Summary
Some locally installed skills only contain pointer files for `scripts` and `data` instead of real directories, so the workflow should fall back to `SKILL.md` guidance rather than assuming helper assets are available.

### Details
The local `C:\\Users\\Administrator\\.codex\\skills\\ui-ux-pro-max` package exposed `scripts` and `data` entries as tiny text files pointing at `../../../src/ui-ux-pro-max/...`, but the referenced directories did not exist on this machine. The safe path was to use the design-system rules and workflow described in `SKILL.md` directly, keep the refactor scoped to styles/layout only, and avoid inventing nonexistent helper commands or references.

### Suggested Action
Before relying on a skill's helper assets, verify whether referenced `scripts/` or `data/` paths are real directories. If they are only pointers and the target is missing, continue with the documented manual workflow and note the limitation explicitly.

### Metadata
- Source: ui-ux-pro-max
- Related Files: C:\\Users\\Administrator\\.codex\\skills\\ui-ux-pro-max\\SKILL.md
- Tags: skill, tooling, fallback, ui, workflow
- Pattern-Key: skills.pointer-payload-needs-manual-fallback

---
## [LRN-20260508-005] best_practice

**Logged**: 2026-05-08T18:30:00+08:00
**Priority**: high
**Status**: pending
**Area**: frontend

### Summary
Status badges that only poll when already in `queued/running` can miss the first transition after an asynchronous backend trigger.

### Details
The chapter edit page showed the precise graph badge as `已就绪` until the user manually opened the graph page. The edit page query only refetched when the current cached status was already `queued` or `running`, so it missed the first backend transition after `chapter:drafted` scheduled precise analysis. The safer UI-side fix was to start a short watch window after write/repair completion and invalidate the graph status cache immediately.

### Suggested Action
For status panels that reflect backend work triggered indirectly by another action, combine immediate cache invalidation with a short temporary polling window instead of relying only on “if current status is already running” logic.

### Metadata
- Source: simplify-and-harden
- Related Files: client/src/pages/novels/NovelEdit.tsx
- Tags: frontend, graph, polling, react-query, status-sync
- Pattern-Key: frontend.status-watch-window-after-indirect-trigger

---
## [LRN-20260508-004] best_practice

**Logged**: 2026-05-08T17:35:00+08:00
**Priority**: high
**Status**: pending
**Area**: frontend

### Summary
Long chapter-action loading states can come from serial query invalidation in `onSuccess`, even when the backend request itself already completed quickly.

### Details
The chapter plan generation route returned `200` in about 12.5 seconds for a real unplanned chapter, but the UI still looked stuck on “正在生成执行计划...”. The mutation kept `isPending` true because `onSuccess` awaited `invalidateNovelDetail()`, and that helper invalidated more than ten active queries one by one. Since React Query keeps the mutation pending until the async `onSuccess` promise settles, serial invalidation can make a successful action feel frozen.

### Suggested Action
When a success path needs to refresh many active queries, keep the same invalidation set but run them in `Promise.all(...)` unless ordering is actually required.

### Metadata
- Source: simplify-and-harden
- Related Files: client/src/pages/novels/NovelEdit.tsx, client/src/pages/novels/hooks/useNovelEditChapterRuntime.ts
- Tags: frontend, react-query, mutation, invalidateQueries, planner
- Pattern-Key: frontend.react-query.parallelize-independent-invalidations

---

## [LRN-20260508-022] best_practice

**Logged**: 2026-05-08T15:55:00+08:00
**Priority**: medium
**Status**: pending
**Area**: frontend

### Summary
章节写作入口也应和执行计划入口一样，默认走后端既有任务路由，不要被顶部全局模型选择器直接覆盖。

### Details
`useNovelEditChapterRuntime.ts` 里的“写本章”之前仍把 `llmStore` 的 `provider/model` 直接传给 `/chapters/:chapterId/generate`。当顶部选择器切到当前不可用的厂商时，后端本来健康的 `writer` 任务路由会被覆盖，导致写作按钮表面上“没反应”或直接报鉴权错误。最小修复是像“生成执行计划”一样，不默认传 `provider/model` override，让后端继续按 `writer` 路由配置执行。

### Suggested Action
继续检查章节修复、正文补写等同类入口，优先复用后端既有任务路由；只有用户明确指定时再传覆盖参数。

### Metadata
- Source: conversation
- Related Files: client/src/pages/novels/hooks/useNovelEditChapterRuntime.ts
- Tags: llm-routing, chapter-writing, frontend
- See Also: LRN-20260508-021

---

## [LRN-20260508-018] best_practice

**Logged**: 2026-05-08T15:01:46.0149070+08:00
**Priority**: medium
**Status**: pending
**Area**: frontend

### Summary
When a page can show both “live status” and multiple graph data sources, default to the source that matches the available result instead of always starting on the legacy/default source.

### Details
The graph page already surfaced precise-analysis status, progress, and readiness, but `graphSource` still initialized to `instant`. That created a misleading state where the header talked about precise analysis while the main canvas still rendered the instant graph, making it look as if the precise graph had no visualization at all. The least disruptive fix was to auto-switch to `precise` once `graphAvailable` becomes true, while preserving any explicit user source choice for the rest of the session.

### Suggested Action
For other multi-source workspaces in this repo, align the default visible pane with the freshest successful result unless the user has already made an explicit local choice.

### Metadata
- Source: simplify-and-harden
- Related Files: client/src/pages/novelGraph/NovelGraphPage.tsx
- Tags: frontend, graph, source-toggle, ux, state-sync
- Pattern-Key: frontend.default-source.follow-available-result

---

## [LRN-20260508-019] best_practice

**Logged**: 2026-05-08T15:01:46.0149070+08:00
**Priority**: medium
**Status**: pending
**Area**: frontend

### Summary
When a visual result is already available, keep verbose diagnostics out of the primary canvas area unless they are needed to explain a failure or missing result.

### Details
The precise graph page had valid snapshot data and visible node/edge counts, but the full readiness panel still rendered above the canvas in success states. On common desktop viewport heights, that diagnostics block consumed most or all of the center column, making it look as if precise graph visualization did not exist. The safer fix was to keep the compact status/progress summary visible, but only render the verbose readiness panel when there are runtime issues, query errors, or no precise graph snapshot yet.

### Suggested Action
For other “result + diagnostics” screens in this repo, let successful result content own the primary viewport and demote verbose diagnostics to exception states.

### Metadata
- Source: simplify-and-harden
- Related Files: client/src/pages/novelGraph/NovelGraphPage.tsx
- Tags: frontend, graph, diagnostics, viewport, ux
- Pattern-Key: frontend.result-first.diagnostics-on-exception

---

## [LRN-20260508-015] best_practice

**Logged**: 2026-05-08T10:58:00+08:00
**Priority**: medium
**Status**: pending
**Area**: backend

### Summary
When backend筛选规则依赖前端显示状态时，先回到共享状态映射确认真实枚举值，再在服务端直接按枚举过滤，避免“显示文案”和“持久化状态”脱节。

### Details
精确图谱的章节筛选最初只按“是否有正文内容”处理，用户明确要求“待准备”章节也不要参与分析。项目里“待准备”并不是独立文案判断，而是 `ChapterStatus.unplanned` 的展示标签。先核对 `chapterExecution.shared.tsx` 的状态文案映射，再回到 Prisma 枚举确认 `unplanned`，最后在 `NovelGraphPreciseAnalysisService.buildPreciseSourceBundle()` 里直接排除 `chapterStatus === "unplanned"`，这样业务规则才能和页面语义保持一致。

### Suggested Action
以后遇到“按页面状态做业务筛选”的需求，先找共享状态映射和后端枚举，再把过滤条件落到服务端真实状态值上，不要凭中文标签或局部 UI 文案写规则。

### Metadata
- Source: simplify-and-harden
- Related Files: server/src/services/novel/NovelGraphPreciseAnalysisService.ts, client/src/pages/novels/components/chapterExecution.shared.tsx, server/src/prisma/schema.prisma
- Tags: backend, status, enum, graph, business-rule
- Pattern-Key: backend.status-filter.from-shared-enum

---

## [LRN-20260507-017] best_practice

**Logged**: 2026-05-07T21:05:00+08:00
**Priority**: high
**Status**: pending
**Area**: graph-runtime

### Summary
When precise graph analysis fails after many generated chapters, first verify the graph-runtime provider balance and the actual runtime provider before suspecting chapter content or the Python bridge.

### Details
The failing novel `cmovg42wy001afsv7x8mpa5wq` produced a full Python traceback in `server/novel-graphs/.../status.json`, but the root cause was external billing rather than prompt parsing or chapter content. `GET /api/settings/graph-engine-runtime` showed the precise graph engine was still pointed at `DeepSeek`, and `GET /api/settings/api-keys/balances` showed `availableBalance = -0.15 CNY`. Re-running the job confirmed the upstream request failed with `402 Payment Required`. Trying to reuse `MiniMax` through the existing import flow then failed with `401 Unauthorized`, so the shortest path was to restore the graph runtime to the known DeepSeek-compatible shape and normalize the stored error into a clear user-facing message.

### Suggested Action
For future graph failures, inspect `status.json`, `graph-engine-runtime`, and provider balances together before changing analysis logic or chapter generation code.

### Metadata
- Source: error
- Related Files: server/src/services/novel/NovelGraphPreciseAnalysisService.ts
- Tags: graph, provider-balance, diagnostics, runtime
- Pattern-Key: graph.precise.provider-balance-first

---

## [LRN-20260507-015] best_practice

**Logged**: 2026-05-07T19:11:00+08:00
**Priority**: high
**Status**: pending
**Area**: backend

### Summary
When restoring provider credentials for a running local stack, prefer the existing `/api/settings/api-keys/:provider` configuration flow over writing `dev.db` directly.

### Details
Attempting to upsert the `DeepSeek` row straight into the live SQLite file produced a `disk I/O error` while the local server process still held the database. The project already has a first-class settings route that validates provider payloads, updates the same `APIKey` table, refreshes the in-memory secret cache, and keeps behavior aligned with the current architecture. Using that route restored the provider cleanly without inventing extra migration logic or bypassing business rules.

### Suggested Action
For future local credential recovery in this workspace, back up the database first, then replay the restore through the existing settings API instead of patching the SQLite file in place.

### Metadata
- Source: error
- Related Files: server/src/routes/settings.ts
- Tags: sqlite, restore, settings, provider, architecture
- Pattern-Key: backend.provider-restore.use-settings-api

---

## [LRN-20260507-016] correction

**Logged**: 2026-05-07T19:46:00+08:00
**Priority**: high
**Status**: pending
**Area**: frontend

### Summary
Do not tell users to look for provider API-key forms on `/settings/model-routes`; in the current UI those forms live on `/settings`.

### Details
I told the user to open `系统设置 -> 模型路由` and scroll to the top for the provider configuration area. The current code does not render provider key cards on `ModelRoutesPage.tsx`; that page only manages task-level route assignments, bulk route presets, structured fallback, and connectivity checks. Provider API-key editing, model list refresh, balances, and related vendor configuration live on `SettingsPage.tsx`. The user's screenshot correctly showed that no provider config section exists on the model-routes page.

### Suggested Action
When guiding provider key setup in this workspace, route the user to `系统设置` (`/settings`) for vendor/API-key configuration and to `模型路由` (`/settings/model-routes`) only for task-route assignment and connectivity review.

### Metadata
- Source: user_feedback
- Related Files: client/src/pages/settings/SettingsPage.tsx, client/src/pages/settings/ModelRoutesPage.tsx, client/src/router/index.tsx
- Tags: routing, settings, provider, ui, correction
- Pattern-Key: frontend.settings.provider-entry.correct-page

---

## [LRN-20260507-014] best_practice

**Logged**: 2026-05-07T18:05:00+08:00
**Priority**: high
**Status**: pending
**Area**: backend

### Summary
Legacy volume-workspace migration must never emit empty chapter summaries, because the editor loads `/api/novels/:id/volumes` before the user can repair missing fields manually.

### Details
The graph smoke-test novel only seeded base novel chapters and did not create any `volumePlan` or `volumePlanVersion` rows. On first load, the backend correctly fell back to `buildFallbackVolumesFromLegacy(...)`, but that fallback mapped `chapter.expectation ?? ""` into `chapter.summary`. For legacy novels whose chapter expectations are null, the strict volume draft schema rejected the synthesized workspace with `summary: cannot be empty`, which surfaced as repeated red toasts in the editor because React Query retried the failing GET request. Using the chapter title as a non-empty fallback keeps the migration valid without changing the visible workflow.

### Suggested Action
Whenever we synthesize volume workspace data from legacy chapters, always derive a non-empty summary fallback from stable chapter fields such as title before strict validation runs.

### Metadata
- Source: error
- Related Files: server/src/services/novel/volume/volumePlanUtils.ts
- Tags: legacy, migration, volumes, validation, editor
- Pattern-Key: backend.legacy-volume.non-empty-summary

---

## [LRN-20260506-001] best_practice

**Logged**: 2026-05-06T11:20:00+08:00
**Priority**: high
**Status**: pending
**Area**: frontend

### Summary
Novel graph viewer should be integrated as a protected full-screen route instead of being mounted inside the normal app shell.

### Details
The main app layout adds a fixed navbar, sidebar, workspace rail, and content paddings that fit editing flows but conflict with a 3D graph canvas. Reusing the full `novel-graph-viz-main` global stylesheet would also overwrite `html`, `body`, and `#root`, which would destabilize the rest of the client. The safer pattern is to reuse the graph interaction ideas and rendering layer while exposing the viewer at a standalone route such as `/novels/:id/graph`.

### Suggested Action
Keep graph visualization pages outside `AppLayout`, protect them with the existing auth guard, and avoid importing the viewer repo's global stylesheet wholesale.

### Metadata
- Source: conversation
- Related Files: client/src/router/index.tsx, client/src/components/layout/AppLayout.tsx
- Tags: graph, routing, layout, viewer
- Pattern-Key: frontend.graph.fullscreen-route

---

## [LRN-20260506-002] best_practice

**Logged**: 2026-05-06T11:22:00+08:00
**Priority**: high
**Status**: pending
**Area**: backend

### Summary
Graph-facing summaries must avoid mojibake because relationship text is surfaced directly in the commercial viewer UI.

### Details
The instant graph snapshot service generates human-readable summaries for nodes and relations. Several strings in that service were already garbled, which was mostly hidden before the graph page existed. Once the graph viewer uses those summaries directly, encoding issues become product-visible and make the visualization feel untrustworthy.

### Suggested Action
Treat graph summary text as product-facing copy, fix encoding issues in `NovelGraphSnapshotService`, and review adjacent graph/export surfaces before shipping.

### Metadata
- Source: conversation
- Related Files: server/src/services/novel/NovelGraphSnapshotService.ts
- Tags: graph, encoding, ux, commercial
- Pattern-Key: backend.graph.summary-encoding

---

## [LRN-20260506-003] best_practice

**Logged**: 2026-05-06T12:18:00+08:00
**Priority**: medium
**Status**: pending
**Area**: frontend

### Summary
When wrapping untyped JS graph libraries locally, custom TypeScript declarations must match whether the library is used as a constructor or a plain function.

### Details
The first local declaration for `3d-force-graph` exported a function signature, but the graph page instantiates it with `new ForceGraph3D(...)`. That mismatch only surfaced during client typecheck. For thin local declarations around third-party JS packages, runtime usage patterns are part of the type contract.

### Suggested Action
When adding local `.d.ts` shims, mirror the real usage form immediately and verify with typecheck before moving on to larger integration work.

### Metadata
- Source: error
- Related Files: client/src/types/3d-force-graph.d.ts, client/src/pages/novelGraph/ForceGraph3DCanvas.tsx
- Tags: typescript, declarations, graph, integration
- Pattern-Key: frontend.types.constructor-shim

---

## [LRN-20260507-001] best_practice

**Logged**: 2026-05-07T00:22:00+08:00
**Priority**: medium
**Status**: pending
**Area**: backend

### Summary
When normalizing third-party graph exports into shared TS interfaces, incremental object construction is safer than `map + filter(Boolean)` plus `satisfies`.

### Details
The precise graph bridge normalizes `graph-every-novel-main` export payloads into the main app's `NovelGraphSnapshot` contract. Several fields in that contract are optional, and assigning them as `undefined` inside a single object literal made TypeScript infer stricter intermediate shapes than the target shared interfaces. Rewriting the normalization into explicit `for...of` passes and only attaching optional fields when values actually exist removed the mismatch and made the conversion logic easier to audit.

### Suggested Action
For cross-repo payload normalization code, prefer explicit collectors and conditional property attachment over nullable mapping pipelines.

### Metadata
- Source: error
- Related Files: server/src/services/novel/NovelGraphPreciseAnalysisService.ts
- Tags: typescript, normalization, graph, integration
- See Also: ERR-20260507-001
- Pattern-Key: backend.normalization.optional-fields

---

## [LRN-20260507-002] best_practice

**Logged**: 2026-05-07T14:20:00+08:00
**Priority**: medium
**Status**: pending
**Area**: backend

### Summary
For local subprocess-backed features, expose a runtime readiness surface in addition to task status.

### Details
The precise graph pipeline depends on a local Python executable, a sibling graph engine repo, and model-provider settings. A plain queued/running/succeeded status is not enough when the real blocker is missing runtime prerequisites. Adding a dedicated readiness contract made it possible to distinguish "task is idle" from "feature cannot run yet because Python, engine path, or model config is missing", and that directly improved the graph page UX and future supportability.

### Suggested Action
For similar local integrations such as graph analysis, media generation, or offline NLP workers, pair execution status APIs with explicit readiness diagnostics that report missing dependencies and local paths.

### Metadata
- Source: conversation
- Related Files: server/src/services/novel/NovelGraphPreciseAnalysisService.ts, server/src/routes/novelGraphRoutes.ts, client/src/pages/novelGraph/NovelGraphPage.tsx
- Tags: diagnostics, runtime, graph, local-first
- Pattern-Key: backend.local-runtime.readiness-surface

---

## [LRN-20260507-003] best_practice

**Logged**: 2026-05-07T15:05:00+08:00
**Priority**: medium
**Status**: pending
**Area**: frontend

### Summary
For local worker features, the main workspace should expose readiness and a direct trigger instead of forcing users into a dedicated detail page first.

### Details
The precise graph feature originally required opening the graph page to understand whether Python, the local engine, and model configuration were ready, and only that page exposed the manual analysis trigger. Moving a compact readiness summary and "run now" entry into the desktop/mobile novel workspace made the feature feel integrated with the writing flow instead of hidden behind a secondary screen.

### Suggested Action
For similar local-first subsystems, surface "can run / why blocked / run now" controls in the primary workspace shell and keep the dedicated page for deep inspection rather than first-use discovery.

### Metadata
- Source: conversation
- Related Files: client/src/pages/novels/components/NovelEditView.tsx, client/src/pages/novels/mobile/MobileNovelEditView.tsx, client/src/pages/novels/NovelEdit.tsx
- Tags: ux, graph, workspace, local-first
- Pattern-Key: frontend.workspace.local-worker-entrypoint

---

## [LRN-20260507-004] best_practice

**Logged**: 2026-05-07T11:18:46+08:00
**Priority**: low
**Status**: pending
**Area**: docs

### Summary
On this Windows workspace, native PowerShell search commands are a safer fallback than relying on `rg` for quick code inspection.

### Details
While extending precise graph readiness, `rg.exe` failed with an `Access is denied` launcher error even though normal PowerShell file reads were allowed. Swapping immediately to `Select-String` and `Get-Content` kept the task moving and avoided wasting time on repeated external-command retries that were unrelated to the feature itself.

### Suggested Action
When repository search unexpectedly fails in this environment, prefer PowerShell-native inspection first and treat `rg` as an optimization rather than a hard dependency.

### Metadata
- Source: error
- Related Files: .learnings/LEARNINGS.md
- Tags: windows, powershell, tooling, inspection
- See Also: ERR-20260507-003
- Pattern-Key: tooling.windows.search-fallback

---

## [LRN-20260507-005] best_practice

**Logged**: 2026-05-07T11:45:00+08:00
**Priority**: medium
**Status**: pending
**Area**: backend

### Summary
For local Python sidecars, readiness should validate the interpreter against the dependency repo's declared `requires-python`, not just whether `python --version` returns successfully.

### Details
`graph-every-novel-main/pyproject.toml` declares `requires-python = ">=3.11"`. A plain runtime probe would treat any callable Python as ready, but that can still fail later when the worker imports code that expects a newer interpreter. Surfacing the version requirement directly in the main app's readiness response makes the failure earlier, clearer, and easier to support.

### Suggested Action
For other local engine integrations, read the child project's documented runtime floor and expose it in readiness APIs and UI diagnostics.

### Metadata
- Source: conversation
- Related Files: server/src/services/novel/NovelGraphPreciseAnalysisService.ts, shared/types/novelGraph.ts, graph-every-novel-main/pyproject.toml
- Tags: python, readiness, local-runtime, graph
- Pattern-Key: backend.local-runtime.python-version-floor

---

## [LRN-20260507-006] best_practice

**Logged**: 2026-05-07T19:05:00+08:00
**Priority**: medium
**Status**: pending
**Area**: frontend

### Summary
Local sidecar features should expose their own runtime settings surface instead of sending users to the app's generic model-route configuration.

### Details
The precise graph pipeline uses a sibling Python repo, local filesystem paths, and an OpenAI-compatible provider config that is separate from the main writing model routes. Reusing `/settings/model-routes` as the remediation target made the graph readiness UI misleading because users could fix regular writing routes and still leave the graph engine unconfigured. Adding a dedicated graph-engine runtime settings card and redirecting graph CTA buttons there makes the configuration path accurate and keeps local-worker concerns separate from shared LLM routing.

### Suggested Action
For future local worker integrations, add a dedicated settings card or page for runtime-specific paths and provider credentials, and keep global model-route screens focused on shared app inference routing.

### Metadata
- Source: conversation
- Related Files: client/src/pages/settings/components/GraphEngineRuntimeSettingsCard.tsx, client/src/pages/novelGraph/NovelGraphPage.tsx, client/src/pages/novels/NovelEdit.tsx
- Tags: settings, graph, local-runtime, ux
- Pattern-Key: frontend.local-runtime.dedicated-settings

---

## [LRN-20260507-007] best_practice

**Logged**: 2026-05-07T19:42:00+08:00
**Priority**: low
**Status**: pending
**Area**: frontend

### Summary
When legacy files already contain encoding-corrupted strings, additive overrides are often safer than trying to replace large blocks in one patch.

### Details
`NovelGraphPage.tsx` still carries older mojibake-heavy branches, and large `apply_patch` replacements were fragile because the on-disk string content no longer matched clean source text reliably. Adding clean helper constants, new formatting functions, and new settings-facing diagnostics allowed the visible UX to improve without depending on brittle full-block replacements in a partially corrupted file.

### Suggested Action
For similarly polluted files, prefer additive cleanup passes that introduce new display constants or wrapper helpers first, then remove dead code only after the file is normalized enough for reliable patching.

### Metadata
- Source: error
- Related Files: client/src/pages/novelGraph/NovelGraphPage.tsx
- Tags: encoding, patching, cleanup, frontend
- Pattern-Key: frontend.cleanup.additive-overrides

---

## [LRN-20260507-008] best_practice

**Logged**: 2026-05-07T20:05:00+08:00
**Priority**: medium
**Status**: pending
**Area**: frontend

### Summary
When a local integration exposes one shared readiness contract to several screens, normalize unstable backend messages once in the client API layer instead of patching each screen separately.

### Details
The precise graph runtime readiness is consumed by the navbar, novel workspace, graph page, and settings page. Because the legacy backend still contains mojibake-heavy messages, trying to fix each UI surface independently would duplicate logic and still leave inconsistencies. Adding a small normalization layer in the client API made every consumer receive the same clean issue text and fallback error wording without waiting for a full backend cleanup.

### Suggested Action
For other shared diagnostics payloads, prefer central normalization in the API adapter layer before the data fans out into multiple UI surfaces.

### Metadata
- Source: conversation
- Related Files: client/src/api/novel/graph.ts, client/src/api/settings.ts, client/src/lib/novelGraphRuntime.ts
- Tags: api, normalization, graph, ux
- Pattern-Key: frontend.api.shared-diagnostics-normalization

---

## [LRN-20260507-009] best_practice

**Logged**: 2026-05-07T20:28:00+08:00
**Priority**: medium
**Status**: pending
**Area**: product

### Summary
For local sidecar features that need a second model configuration, the settings UX should offer one-click import from the app's already configured provider records.

### Details
The graph engine only becomes useful after users fill Base URL, model, and API key, but in practice that information is often already present in the main provider settings. Requiring users to duplicate those values by hand creates avoidable friction and increases the chance of mismatched endpoints. Adding a server-side import route that reuses the saved provider secret and current model/base URL turns graph-engine setup into a short path instead of a second onboarding flow.

### Suggested Action
For future local worker modules that rely on LLM access, consider "import from current provider" as a default setup affordance rather than an optional enhancement.

### Metadata
- Source: conversation
- Related Files: server/src/routes/settings.ts, client/src/pages/settings/components/GraphEngineRuntimeSettingsCard.tsx
- Tags: onboarding, settings, graph, provider-reuse
- Pattern-Key: product.settings.provider-import

---

## [LRN-20260507-010] best_practice

**Logged**: 2026-05-07T13:58:00+08:00
**Priority**: medium
**Status**: pending
**Area**: backend

### Summary
Local projection services such as the instant graph snapshot should query the minimal Prisma tables they need instead of instantiating the full novel domain service.

### Details
`NovelGraphSnapshotService` originally created `new NovelService()` only to reuse `listCharacterRelations`. In practice that pulled a much heavier dependency graph into a read-only projection path and triggered a runtime `NovelService is not a constructor` failure through unrelated export/runtime modules when the snapshot service was loaded in isolation. Replacing that dependency with a narrow local Prisma query made the graph snapshot service independent, easier to validate from scripts, and less likely to break when the larger novel workflow stack changes.

### Suggested Action
For lightweight read models, reporting endpoints, and local worker bootstrap paths, prefer direct table queries or small dedicated repository helpers over full aggregate service construction.

### Metadata
- Source: error
- Related Files: server/src/services/novel/NovelGraphSnapshotService.ts
- Tags: backend, graph, dependency, runtime
- Pattern-Key: backend.read-model.thin-dependencies

---

## [LRN-20260507-011] best_practice

**Logged**: 2026-05-07T14:18:00+08:00
**Priority**: medium
**Status**: pending
**Area**: tooling

### Summary
On Windows machines with multiple Node/pnpm shims, local launchers should reuse the current `npm_execpath` instead of spawning a bare `pnpm.cmd`.

### Details
The first version of the local suite launcher spawned `pnpm.cmd` directly for the main workspace child process. On this machine, PowerShell itself resolved `pnpm` to the `nvm4w` installation, but child-process lookup still hit an older `C:\Program Files\nodejs\pnpm.cmd` shim that pointed at a missing `corepack/dist/pnpm.js`. Reusing `process.execPath + process.env.npm_execpath` keeps nested package-manager calls aligned with the exact pnpm instance that launched the script.

### Suggested Action
For future monorepo launchers and helper scripts on Windows, prefer `node <npm_execpath> ...` when invoked from an existing npm/pnpm lifecycle, and only fall back to PATH lookup when that variable is unavailable.

### Metadata
- Source: error
- Related Files: scripts/dev-local-suite.cjs
- Tags: windows, pnpm, launcher, tooling
- Pattern-Key: tooling.windows.npm-execpath-bridge

---

## [LRN-20260507-012] best_practice

**Logged**: 2026-05-07T15:22:00+08:00
**Priority**: high
**Status**: pending
**Area**: tooling

### Summary
One-command local launchers should fail fast when key ports are already occupied, otherwise users can unknowingly open stale frontends and stale backends.

### Details
The local suite successfully started a new Vite client, auth-center, and server process, but old long-running Node processes were already occupying port `3000` and `5173`. Because the dev workflow only waited for “some process” to exist on those ports, the browser opened a stale frontend while API calls hit an older backend that did not include the newer `/api/auth/*` routes. Adding a preflight port-availability check is much cheaper than debugging “interface not found” errors that are actually caused by old processes rather than the current code.

### Suggested Action
For local orchestration scripts, check critical ports before launch and ask the user to stop old processes first instead of silently starting a partial second stack.

### Metadata
- Source: error
- Related Files: scripts/dev-local-suite.cjs
- Tags: ports, launcher, local-dev, stale-process
- Pattern-Key: tooling.local-suite.port-preflight

---

## [LRN-20260507-013] best_practice

**Logged**: 2026-05-07T17:28:00+08:00
**Priority**: high
**Status**: pending
**Area**: backend

### Summary
On Windows, Node-to-Python bridge scripts that exchange JSON over stdio should explicitly read and write UTF-8 bytes instead of relying on Python's default pipe encoding.

### Details
The precise graph pipeline passed readiness checks and could import `source.txt`, but the Python bridge failed before analysis with a `PydanticSerializationError` complaining about surrogate characters. The root cause was not the novel text itself. `node:child_process.spawn()` wrote UTF-8 JSON into stdin, while Python 3.13 on this machine reported `sys.stdin.encoding == "gbk"` and `sys.stdin.errors == "surrogateescape"` for piped input. That corrupted Chinese fields such as the novel title when the bridge used `sys.stdin.read()` and `sys.stdout.write(...)`. Switching the bridge to `sys.stdin.buffer.read().decode("utf-8")`, `sys.stdout.buffer.write(...encode("utf-8"))`, and setting `PYTHONUTF8/PYTHONIOENCODING` in the spawn environment made the precise graph run complete successfully.

### Suggested Action
For all future local Python worker bridges in this workspace, treat stdio payloads as binary transport and decode/encode UTF-8 explicitly on both sides.

### Metadata
- Source: error
- Related Files: server/src/services/novel/NovelGraphPreciseAnalysisService.ts
- Tags: windows, python, encoding, graph, bridge
- Pattern-Key: backend.python-bridge.utf8-stdio

---

## [LRN-20260508-014] best_practice

**Logged**: 2026-05-08T02:03:00+08:00
**Priority**: high
**Status**: pending
**Area**: backend

### Summary
When graph auto-analysis receives a duplicate request during an active run, keep the visible status as `running` and ignore redundant whole-book reruns instead of overwriting the status back to `queued`.

### Details
The precise graph pipeline had already completed a successful export, but a follow-up `pipeline_completed` trigger arrived while the active run bookkeeping was still in flight. `requestAnalysis()` wrote a fresh `queued` status before it checked `runningNovelIds`, so the frontend looked as if the successful run had been replaced by a new queue entry. The fix was to check the in-memory running guard first, ignore redundant whole-book reruns triggered by `pipeline_completed`, and preserve the current `running` status for legitimate follow-up requests instead of downgrading it to `queued`.

### Suggested Action
For background pipelines that allow reruns, always treat the in-memory running guard as the source of truth before mutating persisted status, and avoid downgrading a visible status from `running/succeeded` to `queued` unless a brand-new run is actually being scheduled.

### Metadata
- Source: error
- Related Files: server/src/services/novel/NovelGraphPreciseAnalysisService.ts
- Tags: backend, graph, queue, status, auto-analysis
- Pattern-Key: backend.status.preserve-active-run

---

## [LRN-20260508-017] best_practice

**Logged**: 2026-05-08T14:22:00+08:00
**Priority**: medium
**Status**: pending
**Area**: backend

### Summary
Persisted long-running job statuses must be normalized against in-memory runtime state after a server restart, otherwise old `running/queued` records will mislead the UI.

### Details
The precise graph page kept showing `第 3 / 40 章` even though no Python worker existed anymore. The root cause was a persisted `status.json` from an older run that survived a dev-server restart, while the in-memory maps (`runningNovelIds`, `pendingRequests`, `scheduledRuns`) were empty. Because `getStatus()` only reconciled when the novel id was still in the in-memory running set, the stale `running` state leaked straight to the frontend. The fix was to downgrade orphaned `running/queued` states to a safe persisted state (`succeeded` when a graph export already exists, otherwise `idle`) and recompute the current analyzable chapter count from source-of-truth chapter data.

### Suggested Action
Any persisted background status in this repo should be cross-checked against the owning runtime’s in-memory guard before being trusted by the UI, especially in local-dev flows where hot reloads and restarts are common.

### Metadata
- Source: simplify-and-harden
- Related Files: server/src/services/novel/NovelGraphPreciseAnalysisService.ts
- Tags: backend, status, restart, graph, runtime
- Pattern-Key: backend.status.normalize-orphaned-running-state

---

## [LRN-20260508-016] best_practice

**Logged**: 2026-05-08T14:08:00+08:00
**Priority**: high
**Status**: pending
**Area**: backend

### Summary
When integrating `graph-every-novel` for precise graph analysis, build a real multi-chapter workspace/project instead of feeding the engine one merged `source.txt`.

### Details
The precise graph bridge had already filtered analyzable chapters correctly on the TypeScript side, but the embedded Python bridge still called `workspace.import_txt(source.txt)`. That flattened every eligible chapter into a single synthetic chapter named `全文`, which made progress reporting lie (`1/1`), prevented chapter-level interruption/rerun semantics from being testable, and caused “待准备立即不分析” to look ineffective even though the service-side chapter filtering had been added. The correct fix was to keep the exported `source.txt` only as a source artifact, then write each eligible chapter into `workspace/source/chapters`, save a real `project.json`, and let `workspace.analyze_project(...)` iterate over those chapters.

### Suggested Action
For future local-engine integrations in this repo, never collapse structured chapter data into a single text import if downstream features depend on per-chapter progress, selective reruns, or chapter eligibility rules.

### Metadata
- Source: simplify-and-harden
- Related Files: server/src/services/novel/NovelGraphPreciseAnalysisService.ts
- Tags: backend, graph, bridge, progress, chapter-model
- Pattern-Key: backend.graph.use-project-workspace-not-flat-text

---

## [LRN-20260508-015] best_practice

**Logged**: 2026-05-08T11:05:00+08:00
**Priority**: high
**Status**: pending
**Area**: backend

### Summary
When a running background analysis must react immediately to chapter eligibility changes, wire the check into the existing domain event bus instead of relying on UI polling.

### Details
The precise graph service already knew how to compare the currently analyzed chapter set against the latest eligible chapter set and interrupt/requeue the Python worker, but the check only ran when the graph page polled `getStatus()`. That made “待准备/空正文立即不分析” only appear immediate when the user stayed on the graph page. The safer fix was to keep the reconciliation logic inside `NovelGraphPreciseAnalysisService`, then trigger it from existing `chapter:updated` and `volume:updated` domain events. This preserves the current architecture, keeps source-of-truth logic in the service that owns the worker process, and makes status-driven exclusions take effect even when no graph page is open.

### Suggested Action
For other long-running workspace jobs in this repo, prefer emitting a narrow domain event from the mutation point and let the owning runtime service decide whether to interrupt/requeue work, rather than duplicating “is this still valid?” checks in routes or frontend polling code.

### Metadata
- Source: error
- Related Files: server/src/services/novel/NovelGraphPreciseAnalysisService.ts, server/src/services/novel/novelCoreCrudService.ts, server/src/events/handlers/registerNovelEventHandlers.ts
- Tags: backend, event-bus, graph, interruption, consistency
- Pattern-Key: backend.runtime.reconcile-via-domain-events

---

## [LRN-20260508-020] best_practice

**Logged**: 2026-05-08T15:26:00+08:00
**Priority**: medium
**Status**: pending
**Area**: frontend

### Summary
When one graph page renders both instant and precise datasets, keep a shared component shell but split layout-force tuning by source instead of forcing both through the same geometry parameters.

### Details
The precise graph had valid data and a visible canvas, but the inherited instant-graph force settings made isolated nodes drift too far out and labels feel undersized for the denser analysis result. The safer fix was not a second canvas implementation; it was to let `forceGraphAdapter` and `ForceGraph3DCanvas` read the graph source and apply a tighter profile for precise snapshots while leaving the instant graph behavior intact. This preserves the existing architecture and avoids accidental visual regressions in the lighter instant view.

### Suggested Action
For future visualization refinements in this repo, prefer source-specific layout profiles inside the existing adapter/canvas pipeline before introducing separate pages or duplicated renderers.

### Metadata
- Source: simplify-and-harden
- Related Files: client/src/pages/novelGraph/forceGraphAdapter.ts, client/src/pages/novelGraph/ForceGraph3DCanvas.tsx
- Tags: frontend, graph, layout, visualization, precise-graph
- Pattern-Key: frontend.graph.source-specific-layout-profile

---

## [LRN-20260508-021] best_practice

**Logged**: 2026-05-08T16:06:00+08:00
**Priority**: high
**Status**: pending
**Area**: frontend

### Summary
When a feature already has a dedicated task-route model configuration, the action entry should not blindly override it with the global page-level LLM selector.

### Details
The chapter execution "generate plan" action was sending the top-bar `llmStore` provider/model directly to `/chapters/:chapterId/plan/generate`, even though the backend already had a healthy `planner` task route configured. That made the action fail whenever the global selector pointed at a provider with bad auth or incompatible settings, while the underlying planner route itself still worked. The safer fix was to let chapter plan generation use the existing `planner` route by default and keep the global selector for actions that are intentionally user-overridable.

### Suggested Action
For future task-oriented actions in this repo, first decide whether the backend task-route table is the source of truth. If it is, avoid passing page-level LLM overrides unless the product explicitly wants per-click manual routing.

### Metadata
- Source: simplify-and-harden
- Related Files: client/src/pages/novels/hooks/useNovelEditChapterRuntime.ts, client/src/components/common/LLMSelector.tsx
- Tags: frontend, llm, routing, planner, override
- Pattern-Key: frontend.llm.respect-task-route-over-global-selector

---
