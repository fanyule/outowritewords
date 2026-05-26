# Errors

Command failures and integration errors.

---

## [ERR-20260509-001] powershell-bulk-replace-corrupted-novel-graph-page

**Logged**: 2026-05-09T12:08:00+08:00
**Priority**: high
**Status**: pending
**Area**: frontend

### Summary
PowerShell bulk color-token replacement on a mojibake-heavy TSX file caused widespread unterminated-string and JSX parser errors.

### Error
```text
src/pages/novelGraph/NovelGraphPage.tsx(...): error TS1002: Unterminated string literal.
src/pages/novelGraph/NovelGraphPage.tsx(...): error TS17008: JSX element ... has no corresponding closing tag.
```

### Context
- Operation attempted: global color-class replacement on `client/src/pages/novelGraph/NovelGraphPage.tsx`
- Goal: convert hardcoded deep-slate classes to theme-semantic classes for the new multi-theme system
- Outcome: legacy mojibake content and malformed text nodes were rewritten as UTF-8 text, which exposed/broke existing string delimiters and made the page uncompilable

### Suggested Fix
Do not run blind `Get-Content -Raw` + `Set-Content` replacements on mojibake-heavy TSX pages. If the file is already text-damaged, recover by rewriting the presentation layer around the existing logic instead of continuing inline replacements.

### Metadata
- Reproducible: yes
- Related Files: client/src/pages/novelGraph/NovelGraphPage.tsx
- See Also: ERR-20260508-005, LRN-20260509-001

---

## [ERR-20260508-004] inline-node-prisma

**Logged**: 2026-05-08T10:40:00+08:00
**Priority**: medium
**Status**: pending
**Area**: tooling

### Summary
Using `node -` with a direct `require("@prisma/client")` was not a reliable way to inspect runtime novel data in this workspace.

### Error
```text
PrismaClientInitializationError: `PrismaClient` needs to be constructed with a non-empty, valid `PrismaClientOptions`
```

### Context
- Attempted to inspect chapter counts for a live novel directly from an inline Node shell script.
- The generated Prisma client in this workspace depends on the server's existing initialization path rather than a bare default constructor in an arbitrary stdin script.

### Suggested Fix
Prefer existing local HTTP APIs or the server's established Prisma wrapper when checking live runtime data, instead of constructing a raw Prisma client from an ad hoc stdin script.

### Metadata
- Reproducible: yes
- Related Files: server/src/db/prisma.ts

---

## [ERR-20260507-007] powershell-convertfromjson-local-session

**Logged**: 2026-05-07T18:06:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: tooling

### Summary
Directly piping `server/storage/auth/local-session.json` into `ConvertFrom-Json` failed in this workspace because the session payload contains a very large inline brand logo data URL.

### Error
```text
ConvertFrom-Json : Invalid object passed in, ':' or '}' expected.
```

### Context
- Operation attempted: extract the local `sessionToken` to call authenticated backend endpoints during debugging
- Observation: the session file included a massive `brand_logo_url` base64 data URL, and PowerShell JSON parsing failed before the API probe could run
- Workaround that succeeded: parse only the `sessionToken` field with a targeted regex and then call the endpoint normally

### Suggested Fix
For local debugging helpers in this workspace, avoid full JSON deserialization of oversized session payloads when only a single token field is needed.

### Metadata
- Reproducible: yes
- Related Files: server/storage/auth/local-session.json
- See Also: LRN-20260507-014

---

## [ERR-20260506-001] pnpm-typecheck

**Logged**: 2026-05-06T11:16:00+08:00
**Priority**: high
**Status**: pending
**Area**: config

### Summary
Initial typecheck could not run cleanly before workspace dependencies and Prisma runtime assets were installed.

### Error
```text
Typecheck failed before dependencies were installed and Prisma client/runtime assets were available.
```

### Context
- Command attempted: `pnpm typecheck`
- Environment: fresh local checkout of the monorepo
- Impact: verification could not proceed until `pnpm install` completed
- Relevant behavior: this repo depends on generated/runtime Prisma pieces during normal validation flows

### Suggested Fix
Run `pnpm install` before the first verification pass in a fresh workspace, especially before server-side typecheck/build commands.

### Metadata
- Reproducible: yes
- Related Files: pnpm-lock.yaml, server/package.json

---

## [ERR-20260506-002] pnpm-build

**Logged**: 2026-05-06T11:18:00+08:00
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
Client build hit a sandbox-related `spawn EPERM` and needed elevated execution to complete.

### Error
```text
spawn EPERM
```

### Context
- Command attempted: `pnpm build`
- Environment: Codex desktop sandbox on Windows
- Impact: normal in-sandbox build verification did not complete
- Resolution path: rerunning the build with approved elevated permissions succeeded

### Suggested Fix
When this workspace build fails with `spawn EPERM`, rerun `pnpm build` with approved escalation instead of assuming the code change itself is broken.

### Metadata
- Reproducible: unknown
- Related Files: client/package.json
- See Also: LRN-20260506-001

---

## [ERR-20260507-001] pnpm-typecheck

**Logged**: 2026-05-07T00:20:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: backend

### Summary
Precise graph snapshot normalization failed typecheck when optional graph fields were emitted inside `map(...).filter(Boolean)` chains.

### Error
```text
Type '(... | null)[]' is not assignable to type 'NovelGraphNode[]'
```

### Context
- Command attempted: `pnpm typecheck`
- Area: `server/src/services/novel/NovelGraphPreciseAnalysisService.ts`
- Cause: the first implementation constructed arrays with nullable entries and object literals that assigned optional fields as `undefined`, which widened the intermediate element types enough for TypeScript to reject the final `NovelGraph*[]` assignments.

### Suggested Fix
Prefer explicit `for...of` normalization passes for shared graph contracts and only assign optional properties when values actually exist.

### Metadata
- Reproducible: yes
- Related Files: server/src/services/novel/NovelGraphPreciseAnalysisService.ts
- See Also: LRN-20260506-003

---

## [ERR-20260507-002] git-diff

**Logged**: 2026-05-07T14:24:00+08:00
**Priority**: low
**Status**: pending
**Area**: docs

### Summary
`git diff --stat` could not be used for change summarization because the target project directory is not currently a valid git working tree.

### Error
```text
warning: Not a git repository. Use --no-index to compare two paths outside a working tree
```

### Context
- Command attempted: `git -C 'F:\workspaceAIxiaoshuo\AI-Novel-Writing-Assistant-main' diff --stat`
- Goal: quickly summarize the current round of local changes
- Outcome: fallback to direct file-level verification instead of git-based diff stats

### Suggested Fix
Do not assume this workspace is inside a valid git repository when preparing change summaries; verify repo state first or use direct file inspection.

### Metadata
- Reproducible: unknown
- Related Files: .learnings/ERRORS.md

---

## [ERR-20260507-003] ripgrep-access-denied

**Logged**: 2026-05-07T11:18:46+08:00
**Priority**: low
**Status**: resolved
**Area**: docs

### Summary
`rg` could not be used for repo inspection in this Windows workspace because the executable was blocked with `Access is denied`.

### Error
```text
Program 'rg.exe' failed to run: Access is denied
```

### Context
- Command attempted: `rg -n ...`
- Goal: inspect graph readiness types and service methods quickly
- Outcome: switched to `Select-String` plus `Get-Content` and continued without blocking the task

### Suggested Fix
When ripgrep is blocked in this environment, fall back to native PowerShell search commands instead of retrying the same external binary.

### Metadata
- Reproducible: unknown
- Related Files: .learnings/ERRORS.md
- See Also: LRN-20260507-004

---

## [ERR-20260507-004] sqlite-ioerr-delete

**Logged**: 2026-05-07T13:42:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: backend

### Summary
Writing the graph smoke-data seed into the local SQLite database failed inside the sandbox with `SQLITE_IOERR_DELETE`, but succeeded when rerun outside the sandbox.

### Error
```text
PrismaClientKnownRequestError:
disk I/O error
code: 'SQLITE_IOERR_DELETE'
```

### Context
- Command attempted: `pnpm --filter @ai-novel/server db:seed-graph-smoke`
- Goal: create a local sample novel, chapters, characters, and relations for graph smoke testing
- Outcome: the first in-sandbox run failed during `prisma.novel.create()`, while the rerun with escalated permissions completed successfully

### Suggested Fix
When local SQLite seed or rebuild flows fail with `SQLITE_IOERR_DELETE` in this Codex Windows environment, retry the write operation outside the sandbox before treating it as an application-level data bug.

### Metadata
- Reproducible: unknown
- Related Files: server/scripts/bootstrap-graph-smoke-data.cjs
- See Also: LRN-20260507-010

---

## [ERR-20260507-005] windows-corepack-shim-mismatch

**Logged**: 2026-05-07T14:12:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: tooling

### Summary
The first local suite launcher spawned the wrong Windows `pnpm.cmd` shim and crashed with `Cannot find module ... corepack/dist/pnpm.js`.

### Error
```text
Error: Cannot find module 'C:\Program Files\nodejs\node_modules\corepack\dist\pnpm.js'
```

### Context
- Command attempted: `pnpm dev:full-local`
- Goal: one-command startup for the main monorepo plus auth-center
- Root cause: the parent PowerShell session resolved `pnpm` from `C:\nvm4w\nodejs\pnpm.ps1`, but the child launcher process looked up a different `pnpm.cmd` under `C:\Program Files\nodejs\`, where the corepack shim was broken

### Suggested Fix
When a launcher is itself started by npm/pnpm, reuse `process.execPath` plus `process.env.npm_execpath` for nested package-manager calls instead of spawning a bare `pnpm.cmd`.

### Metadata
- Reproducible: yes
- Related Files: scripts/dev-local-suite.cjs
- See Also: LRN-20260507-011

---

## [ERR-20260507-006] precise-graph-python-stdio-encoding

**Logged**: 2026-05-07T17:27:00+08:00
**Priority**: high
**Status**: resolved
**Area**: backend

### Summary
The first real precise-graph run failed because the Windows Python bridge decoded piped JSON with `gbk + surrogateescape` instead of UTF-8.

### Error
```text
pydantic_core._pydantic_core.PydanticSerializationError: Error serializing to JSON:
UnicodeEncodeError: 'utf-8' codec can't encode characters in position 11-12: surrogates not allowed
```

### Context
- Command attempted: local `POST /api/novels/:id/graph/precise/analyze` after readiness had already passed
- Goal: run the first end-to-end precise graph analysis against the sample novel
- Observation: `source.txt` and `read_txt()` were healthy, but Python reported `sys.stdin.encoding == "gbk"` and `sys.stdin.errors == "surrogateescape"` for the bridge process, so Chinese fields from the JSON payload were corrupted before `workspace.import_txt(...)`

### Suggested Fix
When Node and Python exchange JSON over stdio on Windows, read stdin from `sys.stdin.buffer`, decode as UTF-8 explicitly, write stdout via `sys.stdout.buffer`, and set `PYTHONUTF8/PYTHONIOENCODING` in the child process environment.

### Metadata
- Reproducible: yes
- Related Files: server/src/services/novel/NovelGraphPreciseAnalysisService.ts
- See Also: LRN-20260507-013

---

## [ERR-20260508-005] powershell-inline-rewrite-corrupted-ts

**Logged**: 2026-05-08T12:35:00+08:00
**Area**: backend
**Tool**: powershell / Set-Content

### Summary
When a TypeScript file already contains mojibake text, using PowerShell Get-Content + Set-Content or regex-based inline rewrites can corrupt template-string delimiters and quote closers across the file, causing widespread parser errors.

### Impact
server/src/services/novel/NovelGraphPreciseAnalysisService.ts became syntactically invalid while implementing immediate rerun for precise graph analysis. The safe recovery path is to restore from a last-known-good source version before reapplying the targeted logic.

### Suggested Safeguard
Avoid bulk PowerShell rewrites on mojibake-heavy TS files. Prefer small pply_patch edits, or restore from a known-good source snapshot first and then reapply focused changes.
