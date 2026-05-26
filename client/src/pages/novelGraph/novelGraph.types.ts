import type {
  NovelGraphDirectedEdge,
  NovelGraphNode,
  NovelGraphPairEdge,
  NovelGraphTier,
} from "@ai-novel/shared/types/novelGraph";

export type NovelGraphSource = "instant" | "precise";

export type NovelGraphSelection =
  | { kind: "node"; id: string }
  | { kind: "pair-edge"; id: string }
  | { kind: "directed-edge"; id: string }
  | null;

export type NovelGraphFilters = {
  search: string;
  tiers: NovelGraphTier[];
  pairTypes: string[];
  directedStances: string[];
  directedStructuralBases: string[];
  minDirectedStrength: number;
  showPairEdges: boolean;
  showDirectedEdges: boolean;
};

export const ALL_NOVEL_GRAPH_TIERS: NovelGraphTier[] = [
  "core",
  "active",
  "background",
  "transient",
];

export const NOVEL_GRAPH_TIER_LABELS: Record<NovelGraphTier, string> = {
  core: "核心角色",
  active: "活跃角色",
  background: "背景角色",
  transient: "临时角色",
};

export const NOVEL_GRAPH_TIER_COLORS: Record<NovelGraphTier, string> = {
  core: "#7dd3fc",
  active: "#fbbf24",
  background: "#94a3b8",
  transient: "#64748b",
};

export function defaultNovelGraphFilters(): NovelGraphFilters {
  return {
    search: "",
    tiers: [],
    pairTypes: [],
    directedStances: [],
    directedStructuralBases: [],
    minDirectedStrength: 0,
    showPairEdges: true,
    showDirectedEdges: true,
  };
}

export type SelectedGraphEntity = {
  node: NovelGraphNode | null;
  pairEdge: NovelGraphPairEdge | null;
  directedEdge: NovelGraphDirectedEdge | null;
};
