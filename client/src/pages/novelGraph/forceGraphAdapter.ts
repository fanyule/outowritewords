import type {
  NovelGraphDirectedEdge,
  NovelGraphNode,
  NovelGraphPairEdge,
  NovelGraphSnapshot,
} from "@ai-novel/shared/types/novelGraph";
import {
  NOVEL_GRAPH_TIER_COLORS,
  type NovelGraphSource,
  type NovelGraphFilters,
} from "./novelGraph.types";

export type GraphCanvasNode = {
  id: string;
  name: string;
  source: NovelGraphSource;
  tier: NovelGraphNode["tier"];
  summary: string;
  val: number;
  color: string;
  degree: number;
  communityId: string;
  targetX: number;
  targetY: number;
  targetZ: number;
  x: number;
  y: number;
  z: number;
};

export type GraphCanvasLink = {
  id: string;
  source: string;
  target: string;
  label: string;
  kind: "pair" | "directed";
  color: string;
  lane: number;
  width: number;
  distance: number;
  raw: NovelGraphPairEdge | NovelGraphDirectedEdge;
};

export type GraphCanvasData = {
  source: NovelGraphSource;
  nodes: GraphCanvasNode[];
  links: GraphCanvasLink[];
};

type GraphLayoutProfile = {
  communityBaseRadius: number;
  communityRingGap: number;
  communityYScale: number;
  tierRadius: Record<NovelGraphNode["tier"], number>;
  tierDepth: Record<NovelGraphNode["tier"], number>;
  jitter: number;
  degreeOrbitBoost: number;
  componentSpreadBoost: number;
  pairDistanceBase: number;
  pairDistanceMin: number;
  pairSameCommunityBonus: number;
  pairCrossCommunityPenalty: number;
  directedDistanceBase: number;
  directedDistanceMin: number;
  directedSameCommunityBonus: number;
  directedCrossCommunityPenalty: number;
};

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableUnit(value: string): number {
  return ((stableHash(value) % 1000) / 1000 - 0.5) * 2;
}

function getLayoutProfile(source: NovelGraphSource): GraphLayoutProfile {
  if (source === "precise") {
    return {
      communityBaseRadius: 150,
      communityRingGap: 88,
      communityYScale: 0.88,
      tierRadius: {
        core: 18,
        active: 56,
        background: 94,
        transient: 126,
      },
      tierDepth: {
        core: -18,
        active: -4,
        background: 10,
        transient: 22,
      },
      jitter: 8,
      degreeOrbitBoost: 4.4,
      componentSpreadBoost: 1.8,
      pairDistanceBase: 148,
      pairDistanceMin: 96,
      pairSameCommunityBonus: -18,
      pairCrossCommunityPenalty: 16,
      directedDistanceBase: 168,
      directedDistanceMin: 102,
      directedSameCommunityBonus: -12,
      directedCrossCommunityPenalty: 16,
    };
  }

  return {
    communityBaseRadius: 182,
    communityRingGap: 106,
    communityYScale: 0.84,
    tierRadius: {
      core: 22,
      active: 70,
      background: 116,
      transient: 156,
    },
    tierDepth: {
      core: -26,
      active: -8,
      background: 14,
      transient: 30,
    },
    jitter: 12,
    degreeOrbitBoost: 5.4,
    componentSpreadBoost: 2.2,
    pairDistanceBase: 162,
    pairDistanceMin: 102,
    pairSameCommunityBonus: -20,
    pairCrossCommunityPenalty: 18,
    directedDistanceBase: 182,
    directedDistanceMin: 110,
    directedSameCommunityBonus: -16,
    directedCrossCommunityPenalty: 20,
  };
}

function normalizePercentish(value: number | undefined, fallback = 0.5): number {
  const next = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return next <= 1.5 ? Math.max(0, Math.min(1, next)) : Math.max(0, Math.min(1, next / 100));
}

function normalizeImportance(value: number): number {
  if (!Number.isFinite(value)) {
    return 40;
  }
  return value <= 5 ? value * 100 : value;
}

function nodeMatches(node: NovelGraphNode, filters: NovelGraphFilters): boolean {
  if (filters.tiers.length > 0 && !filters.tiers.includes(node.tier)) {
    return false;
  }

  const query = filters.search.trim().toLowerCase();
  if (!query) {
    return true;
  }

  return [node.name, ...node.aliases, node.summary]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function pairEdgeMatches(edge: NovelGraphPairEdge, filters: NovelGraphFilters): boolean {
  if (!filters.showPairEdges) {
    return false;
  }

  if (filters.pairTypes.length > 0 && !filters.pairTypes.includes(edge.type)) {
    return false;
  }

  return true;
}

function directedEdgeMatches(
  edge: NovelGraphDirectedEdge,
  filters: NovelGraphFilters,
): boolean {
  if (!filters.showDirectedEdges) {
    return false;
  }

  const strength = normalizePercentish(edge.strength, 0.55);
  if (strength < filters.minDirectedStrength) {
    return false;
  }

  if (
    filters.directedStances.length > 0 &&
    !filters.directedStances.includes(edge.stance)
  ) {
    return false;
  }

  if (
    filters.directedStructuralBases.length > 0 &&
    !filters.directedStructuralBases.includes(edge.structural_base)
  ) {
    return false;
  }

  return true;
}

function connectedComponents(
  nodeIds: string[],
  pairEdges: NovelGraphPairEdge[],
  directedEdges: NovelGraphDirectedEdge[],
): string[][] {
  const adjacency = new Map(nodeIds.map((id) => [id, new Set<string>()]));

  for (const edge of pairEdges) {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }

  for (const edge of directedEdges) {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }

  const seen = new Set<string>();
  const components: string[][] = [];

  for (const nodeId of nodeIds) {
    if (seen.has(nodeId)) {
      continue;
    }

    const stack = [nodeId];
    const component: string[] = [];
    seen.add(nodeId);

    while (stack.length > 0) {
      const current = stack.pop()!;
      component.push(current);

      for (const next of adjacency.get(current) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }

    components.push(component);
  }

  return components;
}

function communityCenter(
  index: number,
  profile: GraphLayoutProfile,
): { x: number; y: number } {
  if (index === 0) {
    return { x: 0, y: 0 };
  }

  const zeroBased = index - 1;
  const ring = Math.floor(zeroBased / 6) + 1;
  const slot = zeroBased % 6;
  const angle = (Math.PI * 2 * slot) / 6 - Math.PI / 2;
  const radius = profile.communityBaseRadius + ring * profile.communityRingGap;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius * profile.communityYScale,
  };
}

function tierOrbitRadius(
  tier: NovelGraphNode["tier"],
  profile: GraphLayoutProfile,
): number {
  return profile.tierRadius[tier];
}

function tierDepth(
  tier: NovelGraphNode["tier"],
  profile: GraphLayoutProfile,
): number {
  return profile.tierDepth[tier];
}

function pairDistance(
  edge: NovelGraphPairEdge,
  source: GraphCanvasNode,
  target: GraphCanvasNode,
  profile: GraphLayoutProfile,
): number {
  const confidence = normalizePercentish(edge.confidence, 0.58);
  const sharedIntensity = normalizePercentish(edge.shared_intensity_score, 0.5);
  const sameCommunity = source.communityId === target.communityId;
  return Math.max(
    profile.pairDistanceMin,
    profile.pairDistanceBase -
      confidence * 34 -
      sharedIntensity * 20 +
      (sameCommunity
        ? profile.pairSameCommunityBonus
        : profile.pairCrossCommunityPenalty),
  );
}

function directedDistance(
  edge: NovelGraphDirectedEdge,
  source: GraphCanvasNode,
  target: GraphCanvasNode,
  profile: GraphLayoutProfile,
): number {
  const strength = normalizePercentish(edge.strength, 0.55);
  const mentions = Math.min(6, edge.mention_count ?? 0);
  const sameCommunity = source.communityId === target.communityId;
  return Math.max(
    profile.directedDistanceMin,
    profile.directedDistanceBase -
      strength * 46 -
      mentions * 4 +
      (sameCommunity
        ? profile.directedSameCommunityBonus
        : profile.directedCrossCommunityPenalty),
  );
}

function unorderedKey(source: string, target: string): string {
  return source < target ? `${source}\u0000${target}` : `${target}\u0000${source}`;
}

export function toGraphCanvasData(
  snapshot: NovelGraphSnapshot,
  filters: NovelGraphFilters,
  source: NovelGraphSource = "instant",
): GraphCanvasData {
  const profile = getLayoutProfile(source);
  const visibleNodes = snapshot.nodes.filter((node) => nodeMatches(node, filters));
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));

  const pairEdges = snapshot.pair_edges.filter(
    (edge) =>
      visibleNodeIds.has(edge.source) &&
      visibleNodeIds.has(edge.target) &&
      pairEdgeMatches(edge, filters),
  );

  const directedEdges = snapshot.directed_edges.filter(
    (edge) =>
      visibleNodeIds.has(edge.source) &&
      visibleNodeIds.has(edge.target) &&
      directedEdgeMatches(edge, filters),
  );

  const degreeById = new Map(visibleNodes.map((node) => [node.id, 0]));
  for (const edge of pairEdges) {
    degreeById.set(edge.source, (degreeById.get(edge.source) ?? 0) + 1);
    degreeById.set(edge.target, (degreeById.get(edge.target) ?? 0) + 1);
  }
  for (const edge of directedEdges) {
    degreeById.set(edge.source, (degreeById.get(edge.source) ?? 0) + 1);
    degreeById.set(edge.target, (degreeById.get(edge.target) ?? 0) + 1);
  }

  const nodeById = new Map(visibleNodes.map((node) => [node.id, node]));
  const components = connectedComponents(
    visibleNodes.map((node) => node.id),
    pairEdges,
    directedEdges,
  ).sort((left, right) => {
    const leftScore = left.reduce(
      (sum, nodeId) => sum + normalizeImportance(nodeById.get(nodeId)?.importance ?? 0),
      0,
    );
    const rightScore = right.reduce(
      (sum, nodeId) => sum + normalizeImportance(nodeById.get(nodeId)?.importance ?? 0),
      0,
    );
    return rightScore - leftScore || right.length - left.length;
  });

  const graphNodes: GraphCanvasNode[] = [];
  const graphNodeById = new Map<string, GraphCanvasNode>();

  components.forEach((component, componentIndex) => {
    const center = communityCenter(componentIndex, profile);
    const sorted = [...component].sort((left, right) => {
      const leftNode = nodeById.get(left)!;
      const rightNode = nodeById.get(right)!;
      return (
        normalizeImportance(rightNode.importance) - normalizeImportance(leftNode.importance) ||
        (degreeById.get(right) ?? 0) - (degreeById.get(left) ?? 0)
      );
    });

    sorted.forEach((nodeId, nodeIndex) => {
      const node = nodeById.get(nodeId)!;
      const degree = degreeById.get(nodeId) ?? 0;
      const angle =
        (Math.PI * 2 * nodeIndex) / Math.max(sorted.length, 1) + stableUnit(nodeId) * 0.45;
      const orbit =
        tierOrbitRadius(node.tier, profile) +
        degree * profile.degreeOrbitBoost +
        Math.max(0, sorted.length - 1) * profile.componentSpreadBoost;
      const jitterX = stableUnit(`${nodeId}:x`) * profile.jitter;
      const jitterY = stableUnit(`${nodeId}:y`) * profile.jitter;
      const x = center.x + Math.cos(angle) * orbit + jitterX;
      const y = center.y + Math.sin(angle) * orbit + jitterY;
      const z = tierDepth(node.tier, profile) + stableUnit(`${nodeId}:z`) * (profile.jitter * 0.6);
      const val =
        5 +
        normalizeImportance(node.importance) / 22 +
        Math.sqrt(Math.max(0, degree)) * 1.6;

      const graphNode: GraphCanvasNode = {
        id: node.id,
        name: node.name,
        source,
        tier: node.tier,
        summary: node.summary,
        val,
        color: NOVEL_GRAPH_TIER_COLORS[node.tier],
        degree,
        communityId: `community-${componentIndex}`,
        targetX: x,
        targetY: y,
        targetZ: z,
        x,
        y,
        z,
      };

      graphNodes.push(graphNode);
      graphNodeById.set(nodeId, graphNode);
    });
  });

  const pairKeySet = new Set(
    pairEdges.map((edge) => unorderedKey(edge.source, edge.target)),
  );
  const directedKeySet = new Set(
    directedEdges.map((edge) => `${edge.source}\u0000${edge.target}`),
  );

  const links: GraphCanvasLink[] = [
    ...pairEdges.map((edge) => {
      const source = graphNodeById.get(edge.source)!;
      const target = graphNodeById.get(edge.target)!;
      const confidence = normalizePercentish(edge.confidence, 0.58);
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label || edge.type,
        kind: "pair" as const,
        color: "rgba(125, 211, 252, 0.58)",
        lane: 0,
        width: 1.6 + confidence * 2.2,
        distance: pairDistance(edge, source, target, profile),
        raw: edge,
      };
    }),
    ...directedEdges.map((edge) => {
      const source = graphNodeById.get(edge.source)!;
      const target = graphNodeById.get(edge.target)!;
      const strength = normalizePercentish(edge.strength, 0.55);
      const hasReverse = directedKeySet.has(`${edge.target}\u0000${edge.source}`);
      const hasPair = pairKeySet.has(unorderedKey(edge.source, edge.target));
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.display_relation,
        kind: "directed" as const,
        color: "rgba(251, 146, 60, 0.78)",
        lane: hasReverse ? (edge.source < edge.target ? 0.72 : -0.72) : hasPair ? 0.48 : 0,
        width: 1.35 + strength * 2.6,
        distance: directedDistance(edge, source, target, profile),
        raw: edge,
      };
    }),
  ];

  return {
    source,
    nodes: graphNodes,
    links,
  };
}
