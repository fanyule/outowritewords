import type { CharacterRelation } from "@ai-novel/shared/types/novel";
import type {
  NovelGraphDirectedEdge,
  NovelGraphNode,
  NovelGraphPairEdge,
  NovelGraphSnapshot,
  NovelGraphTier,
} from "@ai-novel/shared/types/novelGraph";
import { prisma } from "../../db/prisma";

type GraphCharacterRecord = {
  id: string;
  name: string;
  role: string;
  castRole: string | null;
  storyFunction: string | null;
  relationToProtagonist: string | null;
  personality: string | null;
  currentState: string | null;
  currentGoal: string | null;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function takeNonEmpty(parts: Array<string | null | undefined>, limit = 4): string[] {
  return parts
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function buildCharacterSummary(character: GraphCharacterRecord): string {
  return takeNonEmpty(
    [
      character.role,
      character.storyFunction,
      character.relationToProtagonist,
      character.personality,
      character.currentState ? `当前状态：${character.currentState}` : null,
      character.currentGoal ? `当前目标：${character.currentGoal}` : null,
    ],
    6,
  ).join("；");
}

function resolveNodeTier(character: GraphCharacterRecord, relationCount: number): NovelGraphTier {
  if (character.castRole === "protagonist" || character.castRole === "antagonist") {
    return "core";
  }

  if (
    relationCount >= 3
    || ["ally", "mentor", "love_interest", "pressure_source"].includes(character.castRole ?? "")
  ) {
    return "active";
  }

  if (relationCount >= 1) {
    return "background";
  }

  return "transient";
}

function resolveNodeImportance(character: GraphCharacterRecord, relationCount: number): number {
  const castBoost =
    character.castRole === "protagonist"
      ? 0.4
      : character.castRole === "antagonist"
        ? 0.35
        : character.castRole
          ? 0.15
          : 0;

  return Number((0.25 + Math.min(relationCount, 6) * 0.08 + castBoost).toFixed(2));
}

function normalizeRelationStrength(relation: CharacterRelation): number {
  const scores = [
    relation.trustScore,
    relation.conflictScore,
    relation.intimacyScore,
    relation.dependencyScore,
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (scores.length === 0) {
    return 0.55;
  }

  return clamp01(Math.max(...scores) / 100);
}

function normalizeRelationConfidence(relation: CharacterRelation): number {
  const scores = [
    relation.trustScore,
    relation.conflictScore,
    relation.intimacyScore,
    relation.dependencyScore,
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (scores.length === 0) {
    return 0.6;
  }

  const average = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  return clamp01(average / 100);
}

function buildRelationSummary(relation: CharacterRelation): string {
  return takeNonEmpty(
    [
      relation.surfaceRelation,
      relation.dynamicLabel,
      relation.hiddenTension ? `暗线张力：${relation.hiddenTension}` : null,
      relation.conflictSource ? `冲突来源：${relation.conflictSource}` : null,
      relation.secretAsymmetry ? `信息差：${relation.secretAsymmetry}` : null,
      relation.nextTurnPoint ? `下一转折：${relation.nextTurnPoint}` : null,
    ],
    6,
  ).join("；");
}

function buildPairEdge(relation: CharacterRelation): NovelGraphPairEdge {
  const confidence = Number(normalizeRelationConfidence(relation).toFixed(2));
  const intensity = Number(normalizeRelationStrength(relation).toFixed(2));

  return {
    id: relation.id,
    source: relation.sourceCharacterId,
    target: relation.targetCharacterId,
    type: relation.surfaceRelation,
    label: relation.dynamicLabel || relation.surfaceRelation,
    summary: buildRelationSummary(relation),
    confidence,
    co_event_count: 1,
    co_appearance_count: 1,
    inferred: false,
    shared_intensity_score: intensity,
    stable_graph_eligible: confidence >= 0.45,
    stable_graph_eligibility_score: confidence,
    stable_graph_eligibility_reason:
      confidence >= 0.45 ? "existing_character_relation" : "low_signal_relation",
  };
}

function buildDirectedEdge(relation: CharacterRelation): NovelGraphDirectedEdge {
  const strength = Number(normalizeRelationStrength(relation).toFixed(2));
  const displayRelation = relation.dynamicLabel || relation.surfaceRelation;

  return {
    id: `directed:${relation.id}`,
    source: relation.sourceCharacterId,
    target: relation.targetCharacterId,
    raw_label: relation.dynamicLabel || undefined,
    structural_base: relation.surfaceRelation,
    structural_label: relation.surfaceRelation,
    stance: relation.dynamicLabel || "connected",
    stance_label: relation.dynamicLabel || "关系已建立",
    display_relation: displayRelation,
    summary: buildRelationSummary(relation),
    strength,
    mention_count: 1,
    stable_graph_eligible: strength >= 0.45,
    stable_graph_eligibility_score: strength,
    stable_graph_eligibility_reason:
      strength >= 0.45 ? "existing_character_relation" : "low_signal_relation",
  };
}

async function listCharacterRelations(novelId: string): Promise<CharacterRelation[]> {
  const rows = await prisma.characterRelation.findMany({
    where: { novelId },
    include: {
      sourceCharacter: { select: { name: true } },
      targetCharacter: { select: { name: true } },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    novelId: row.novelId,
    sourceCharacterId: row.sourceCharacterId,
    targetCharacterId: row.targetCharacterId,
    sourceCharacterName: row.sourceCharacter.name,
    targetCharacterName: row.targetCharacter.name,
    surfaceRelation: row.surfaceRelation,
    hiddenTension: row.hiddenTension,
    conflictSource: row.conflictSource,
    secretAsymmetry: row.secretAsymmetry,
    dynamicLabel: row.dynamicLabel,
    nextTurnPoint: row.nextTurnPoint,
    trustScore: row.trustScore,
    conflictScore: row.conflictScore,
    intimacyScore: row.intimacyScore,
    dependencyScore: row.dependencyScore,
    evidence: row.evidence,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export class NovelGraphSnapshotService {
  async buildInstantSnapshot(novelId: string): Promise<NovelGraphSnapshot> {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: {
        id: true,
        title: true,
        createdAt: true,
      },
    });

    if (!novel) {
      throw new Error("Novel not found.");
    }

    const [characters, relations] = await Promise.all([
      prisma.character.findMany({
        where: { novelId },
        orderBy: [{ createdAt: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          role: true,
          castRole: true,
          storyFunction: true,
          relationToProtagonist: true,
          personality: true,
          currentState: true,
          currentGoal: true,
        },
      }),
      listCharacterRelations(novelId),
    ]);

    const relationCountByCharacterId = new Map<string, number>();
    for (const relation of relations) {
      relationCountByCharacterId.set(
        relation.sourceCharacterId,
        (relationCountByCharacterId.get(relation.sourceCharacterId) ?? 0) + 1,
      );
      relationCountByCharacterId.set(
        relation.targetCharacterId,
        (relationCountByCharacterId.get(relation.targetCharacterId) ?? 0) + 1,
      );
    }

    const nodes: NovelGraphNode[] = characters.map((character) => {
      const relationCount = relationCountByCharacterId.get(character.id) ?? 0;
      return {
        id: character.id,
        name: character.name,
        aliases: [],
        tier: resolveNodeTier(character, relationCount),
        importance: resolveNodeImportance(character, relationCount),
        summary: buildCharacterSummary(character),
        appearance_count: Math.max(1, relationCount),
      };
    });

    return {
      project: {
        id: novel.id,
        title: novel.title,
        language: "zh-CN",
        schema_version: 1,
        created_at: novel.createdAt.toISOString(),
      },
      chapters: [],
      nodes,
      pair_edges: relations.map((relation) => buildPairEdge(relation)),
      directed_edges: relations.map((relation) => buildDirectedEdge(relation)),
    };
  }
}

export const novelGraphSnapshotService = new NovelGraphSnapshotService();
