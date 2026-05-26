# Feature Requests

Capabilities requested by the user.

---

## [FEAT-20260506-001] integrated-novel-graph-viewer

**Logged**: 2026-05-06T11:24:00+08:00
**Priority**: high
**Status**: in_progress
**Area**: frontend

### Requested Capability
Integrate the `novel-graph-viz-main` experience into the main desktop client so a novel can open its own relationship graph directly in-app.

### User Context
The project is being turned into a commercial local-first product. The graph viewer is intended to become a product-facing feature rather than a separate utility.

### Complexity Estimate
medium

### Suggested Implementation
Add a protected route such as `/novels/:id/graph`, feed it from `/api/novels/:id/graph/instant` first, then later layer in the Python heavy-analysis output as a higher-fidelity graph source.

### Metadata
- Frequency: recurring
- Related Features: instant-graph-api

---

## [FEAT-20260506-002] realtime-novel-graph-recognition

**Logged**: 2026-05-06T11:26:00+08:00
**Priority**: high
**Status**: pending
**Area**: backend

### Requested Capability
Recognize and refresh character graph information in near real time as the novel is being generated.

### User Context
The user wants the commercial product to surface relationship changes quickly while chapters are produced, ideally without waiting for a full offline export/import cycle.

### Complexity Estimate
complex

### Suggested Implementation
Use a dual-layer graph pipeline: a fast local instant snapshot emitted after chapter save/generation, plus a background precise analysis job driven by `graph-every-novel-main`.

### Metadata
- Frequency: recurring
- Related Features: chapter-events, graph-every-novel integration

---
