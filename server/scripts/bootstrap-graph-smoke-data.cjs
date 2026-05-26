const { prisma } = require("../dist/db/prisma.js");

const SAMPLE_TITLE = "\u56fe\u8c31\u8054\u8c03\u6837\u672c\u5c0f\u8bf4";

const SAMPLE_CHAPTERS = [
  {
    title: "\u7b2c\u4e00\u7ae0 \u96e8\u591c\u63a5\u7ad9",
    content: [
      "\u4e34\u6d77\u57ce\u7684\u96e8\u4e0b\u5f97\u5f88\u6025\uff0c\u5468\u5c9a\u62d6\u7740\u65e7\u884c\u674e\u7bb1\u8d70\u51fa\u8f66\u7ad9\u65f6\uff0c\u770b\u89c1\u6c88\u781a\u7ad9\u5728\u8def\u706f\u4e0b\u4e3e\u7740\u4e00\u628a\u9ed1\u4f1e\u3002",
      "\u6c88\u781a\u8868\u9762\u51b7\u9759\uff0c\u5176\u5b9e\u4e00\u76f4\u5728\u89c2\u5bdf\u5468\u5c9a\u7684\u53cd\u5e94\uff0c\u56e0\u4e3a\u4ed6\u6000\u7591\u5979\u5e26\u56de\u6765\u7684\u65e7\u6863\u6848\u4f1a\u7275\u51fa\u6e2f\u533a\u5931\u706b\u6848\u7684\u771f\u76f8\u3002",
      "\u4e24\u4eba\u521a\u4e0a\u8f66\uff0c\u8bb0\u8005\u6797\u82d2\u5c31\u53d1\u6765\u6d88\u606f\uff0c\u63d0\u9192\u4ed6\u4eec\u4eca\u665a\u4e0d\u8981\u56de\u65e7\u7801\u5934\uff0c\u8bf4\u90a3\u91cc\u6709\u4eba\u63d0\u524d\u6e05\u7406\u8fc7\u73b0\u573a\u3002",
    ].join("\n"),
  },
  {
    title: "\u7b2c\u4e8c\u7ae0 \u65e7\u7801\u5934\u706b\u75d5",
    content: [
      "\u7b2c\u4e8c\u5929\u51cc\u6668\uff0c\u5468\u5c9a\u8fd8\u662f\u6267\u610f\u53bb\u4e86\u65e7\u7801\u5934\uff0c\u6c88\u781a\u53ea\u80fd\u8ddf\u7740\u5979\u4e00\u8d77\u5192\u96e8\u67e5\u770b\u4ed3\u5e93\u6b8b\u7559\u7684\u706b\u707e\u75d5\u8ff9\u3002",
      "\u6797\u82d2\u6bd4\u4ed6\u4eec\u5148\u4e00\u6b65\u8d76\u5230\uff0c\u5e76\u628a\u81ea\u5df1\u5077\u62cd\u5230\u7684\u76d1\u63a7\u622a\u56fe\u9012\u7ed9\u5468\u5c9a\u3002\u622a\u56fe\u91cc\uff0c\u4e00\u4e2a\u6234\u5e3d\u5b50\u7684\u7537\u4eba\u6b63\u628a\u4e00\u53ea\u94c1\u76d2\u4ea4\u7ed9\u964c\u751f\u53f8\u673a\u3002",
      "\u5468\u5c9a\u56e0\u6b64\u66f4\u52a0\u4fe1\u4efb\u6797\u82d2\uff0c\u4f46\u6c88\u781a\u5f00\u59cb\u6000\u7591\u6797\u82d2\u9690\u7792\u4e86\u6d88\u606f\u6765\u6e90\u3002\u4e09\u4eba\u4e4b\u95f4\u7684\u5408\u4f5c\u7b2c\u4e00\u6b21\u51fa\u73b0\u88c2\u7f1d\u3002",
    ].join("\n"),
  },
  {
    title: "\u7b2c\u4e09\u7ae0 \u94c1\u76d2\u4e0e\u540d\u5355",
    content: [
      "\u56de\u5230\u4e34\u65f6\u4f4f\u5904\u540e\uff0c\u5468\u5c9a\u6253\u5f00\u94c1\u76d2\uff0c\u53d1\u73b0\u91cc\u9762\u662f\u4e00\u4efd\u88ab\u6c34\u6d78\u8fc7\u7684\u540d\u5355\uff0c\u540d\u5355\u4e0a\u540c\u65f6\u51fa\u73b0\u4e86\u6c88\u781a\u7236\u4eb2\u548c\u6797\u82d2\u5bfc\u5e08\u7684\u540d\u5b57\u3002",
      "\u6797\u82d2\u627f\u8ba4\u81ea\u5df1\u65e9\u5c31\u77e5\u9053\u540d\u5355\u7684\u5b58\u5728\uff0c\u53ea\u662f\u62c5\u5fc3\u6c88\u781a\u4f1a\u56e0\u4e3a\u7236\u4eb2\u7275\u6d89\u5176\u4e2d\u800c\u9000\u7f29\u3002",
      "\u6c88\u781a\u56e0\u6b64\u4e0e\u6797\u82d2\u6fc0\u70c8\u4e89\u6267\uff0c\u4f46\u6700\u540e\u8fd8\u662f\u51b3\u5b9a\u548c\u5468\u5c9a\u4e00\u8d77\u7ee7\u7eed\u67e5\u4e0b\u53bb\uff0c\u56e0\u4e3a\u4ed6\u610f\u8bc6\u5230\u7236\u4eb2\u53ef\u80fd\u4e0d\u662f\u7eb5\u706b\u8005\uff0c\u800c\u662f\u66fe\u7ecf\u8bd5\u56fe\u963b\u6b62\u771f\u76f8\u88ab\u6392\u57cb\u7684\u4eba\u3002",
    ].join("\n"),
  },
];

const SAMPLE_CHARACTERS = [
  {
    name: "\u5468\u5c9a",
    role: "\u4e3b\u89d2",
    castRole: "protagonist",
    storyFunction: "\u8c03\u67e5\u8005",
    relationToProtagonist: "\u81ea\u6211",
    personality: "\u51b7\u9759\uff0c\u6267\u62d7\uff0c\u64c5\u957f\u4ece\u788e\u7247\u7ebf\u7d22\u91cc\u62fc\u51fa\u771f\u76f8\u3002",
    background: "\u79bb\u5f00\u4e34\u6d77\u57ce\u591a\u5e74\u540e\u8fd4\u4e61\u8c03\u67e5\u65e7\u6848\u7684\u6863\u6848\u4fee\u590d\u5e08\u3002",
    development: "\u4ece\u72ec\u81ea\u8ffd\u67e5\u771f\u76f8\uff0c\u9010\u6e10\u5b66\u4f1a\u91cd\u65b0\u4fe1\u4efb\u540c\u4f34\u3002",
    currentState: "\u91cd\u65b0\u56de\u5230\u4e34\u6d77\u57ce\uff0c\u51c6\u5907\u91cd\u542f\u65e7\u6848\u8c03\u67e5\u3002",
    currentGoal: "\u627e\u5230\u6e2f\u533a\u5931\u706b\u6848\u88ab\u6389\u5305\u7684\u5173\u952e\u8bc1\u636e\u3002",
  },
  {
    name: "\u6c88\u781a",
    role: "\u7537\u4e3b",
    castRole: "ally",
    storyFunction: "\u672c\u5730\u5b88\u95e8\u4eba",
    relationToProtagonist: "\u65e7\u8bc6\u642d\u6863",
    personality: "\u514b\u5236\uff0c\u8b66\u89c9\uff0c\u5bf9\u4eb2\u8fd1\u7684\u4eba\u6709\u5f3a\u70c8\u4fdd\u62a4\u6b32\u3002",
    background: "\u6e2f\u533a\u5b89\u4fdd\u987e\u95ee\uff0c\u7236\u4eb2\u66fe\u5377\u5165\u65e7\u7801\u5934\u5931\u706b\u6848\u3002",
    development: "\u4ece\u56de\u907f\u7236\u4eb2\u65e7\u6848\uff0c\u8f6c\u5411\u4e3b\u52a8\u5bfb\u627e\u771f\u76f8\u3002",
    currentState: "\u8bd5\u56fe\u5728\u4fdd\u62a4\u5bb6\u4eba\u4e0e\u914d\u5408\u8c03\u67e5\u4e4b\u95f4\u627e\u5230\u5e73\u8861\u3002",
    currentGoal: "\u786e\u8ba4\u7236\u4eb2\u5f53\u5e74\u5230\u5e95\u5f00\u542f\u4e86\u4ec0\u4e48\u3002",
  },
  {
    name: "\u6797\u82d2",
    role: "\u5173\u952e\u914d\u89d2",
    castRole: "pressure_source",
    storyFunction: "\u7ebf\u7d22\u63d0\u4f9b\u8005",
    relationToProtagonist: "\u7ebf\u7d22\u540c\u76df",
    personality: "\u654f\u9510\uff0c\u5192\u9669\uff0c\u5634\u786c\u5fc3\u8f6f\u3002",
    background: "\u672c\u5730\u8c03\u67e5\u8bb0\u8005\uff0c\u957f\u671f\u8ffd\u8e2a\u6e2f\u533a\u5229\u76ca\u94fe\u3002",
    development: "\u5728\u5229\u7528\u7ebf\u7d22\u548c\u5766\u8bda\u5408\u4f5c\u4e4b\u95f4\u4e0d\u65ad\u6447\u6446\u3002",
    currentState: "\u62ff\u7740\u63d0\u524d\u62cd\u5230\u7684\u76d1\u63a7\u622a\u56fe\u8bd5\u63a2\u4e24\u4eba\u7684\u5e95\u7ebf\u3002",
    currentGoal: "\u7528\u771f\u51ed\u5b9e\u636e\u6362\u53d6\u5bf9\u5931\u706b\u6848\u5185\u5e55\u7684\u53d1\u8a00\u6743\u3002",
  },
];

const SAMPLE_RELATIONS = [
  {
    source: "\u5468\u5c9a",
    target: "\u6c88\u781a",
    surfaceRelation: "\u65e7\u8bc6\u642d\u6863",
    hiddenTension: "\u5468\u5c9a\u9700\u8981\u6c88\u781a\u7684\u672c\u5730\u8d44\u6e90\uff0c\u4f46\u4e5f\u62c5\u5fc3\u4ed6\u4f1a\u56e0\u4e3a\u7236\u4eb2\u800c\u9690\u7792\u771f\u76f8\u3002",
    dynamicLabel: "\u4fe1\u4efb\u4e0e\u8bd5\u63a2\u5e76\u884c",
    conflictSource: "\u5bf9\u6c88\u7236\u4e0e\u65e7\u6848\u7684\u7acb\u573a\u4e0d\u540c",
    trustScore: 64,
    conflictScore: 51,
    intimacyScore: 47,
    dependencyScore: 72,
  },
  {
    source: "\u5468\u5c9a",
    target: "\u6797\u82d2",
    surfaceRelation: "\u7ebf\u7d22\u540c\u76df",
    hiddenTension: "\u5468\u5c9a\u6b23\u8d4f\u6797\u82d2\u7684\u884c\u52a8\u529b\uff0c\u5374\u9010\u6e10\u53d1\u73b0\u5979\u5e76\u6ca1\u6709\u5b8c\u5168\u4ea4\u5e95\u3002",
    dynamicLabel: "\u5408\u4f5c\u8868\u9762\u4e0b\u7684\u76f8\u4e92\u8bc4\u4f30",
    conflictSource: "\u7ebf\u7d22\u6765\u6e90\u4e0d\u900f\u660e",
    secretAsymmetry: "\u6797\u82d2\u66f4\u65e9\u77e5\u9053\u540d\u5355\u7ebf\u7d22\u7684\u5b58\u5728",
    trustScore: 58,
    conflictScore: 43,
    intimacyScore: 36,
    dependencyScore: 61,
  },
  {
    source: "\u6c88\u781a",
    target: "\u6797\u82d2",
    surfaceRelation: "\u4e92\u76f8\u63d0\u9632",
    hiddenTension: "\u6c88\u781a\u6000\u7591\u6797\u82d2\u5229\u7528\u5468\u5c9a\u63a5\u8fd1\u6838\u5fc3\u6848\u60c5\uff0c\u800c\u6797\u82d2\u5219\u6000\u7591\u6c88\u781a\u4f1a\u5305\u5eb7\u5bb6\u4eba\u3002",
    dynamicLabel: "\u9519\u4f4d\u76d1\u89c6",
    conflictSource: "\u5bf9\u5bf9\u65b9\u52a8\u673a\u7684\u4e0d\u4fe1\u4efb",
    nextTurnPoint: "\u94c1\u76d2\u6253\u5f00\u540e\u5fc5\u987b\u5171\u4eab\u66f4\u5b8c\u6574\u7684\u60c5\u62a5",
    trustScore: 31,
    conflictScore: 78,
    intimacyScore: 22,
    dependencyScore: 48,
  },
];

async function main() {
  const existing = await prisma.novel.findFirst({
    where: { title: SAMPLE_TITLE },
    select: { id: true, title: true },
  });

  if (existing) {
    await prisma.novel.delete({
      where: { id: existing.id },
    });
  }

  const novel = await prisma.novel.create({
    data: {
      title: SAMPLE_TITLE,
      description: "\u7528\u4e8e\u9a8c\u8bc1\u5373\u65f6\u56fe\u8c31\u4e0e\u7cbe\u786e\u56fe\u8c31\u94fe\u8def\u7684\u672c\u5730\u6837\u672c\u5c0f\u8bf4\u3002",
      status: "draft",
      writingMode: "original",
      outline: "\u56f4\u7ed5\u65e7\u7801\u5934\u5931\u706b\u6848\u5c55\u5f00\u7684\u60ac\u7591\u8c03\u67e5\u6545\u4e8b\u3002",
    },
    select: { id: true, title: true },
  });

  await prisma.chapter.createMany({
    data: SAMPLE_CHAPTERS.map((chapter, index) => ({
      novelId: novel.id,
      title: chapter.title,
      content: chapter.content,
      order: index + 1,
      generationState: "drafted",
      chapterStatus: "completed",
      hook: index === 0
        ? "\u8f66\u7ad9\u63a5\u7ad9\u80cc\u540e\u663e\u7136\u8fd8\u85cf\u7740\u66f4\u5927\u7684\u5904\u7406\u75d5\u8ff9\u3002"
        : null,
    })),
  });

  const createdCharacters = new Map();
  for (const character of SAMPLE_CHARACTERS) {
    const created = await prisma.character.create({
      data: {
        novelId: novel.id,
        name: character.name,
        role: character.role,
        castRole: character.castRole,
        storyFunction: character.storyFunction,
        relationToProtagonist: character.relationToProtagonist,
        personality: character.personality,
        background: character.background,
        development: character.development,
        currentState: character.currentState,
        currentGoal: character.currentGoal,
      },
      select: { id: true, name: true },
    });
    createdCharacters.set(created.name, created.id);
  }

  for (const relation of SAMPLE_RELATIONS) {
    const sourceCharacterId = createdCharacters.get(relation.source);
    const targetCharacterId = createdCharacters.get(relation.target);

    if (!sourceCharacterId || !targetCharacterId) {
      continue;
    }

    await prisma.characterRelation.create({
      data: {
        novelId: novel.id,
        sourceCharacterId,
        targetCharacterId,
        surfaceRelation: relation.surfaceRelation,
        hiddenTension: relation.hiddenTension,
        dynamicLabel: relation.dynamicLabel,
        conflictSource: relation.conflictSource,
        secretAsymmetry: relation.secretAsymmetry,
        nextTurnPoint: relation.nextTurnPoint,
        trustScore: relation.trustScore,
        conflictScore: relation.conflictScore,
        intimacyScore: relation.intimacyScore,
        dependencyScore: relation.dependencyScore,
      },
    });
  }

  console.log(JSON.stringify({
    created: true,
    message: "\u56fe\u8c31\u8054\u8c03\u6837\u672c\u5c0f\u8bf4\u5df2\u521b\u5efa\u3002",
    novel,
    chapterCount: SAMPLE_CHAPTERS.length,
    characterCount: SAMPLE_CHARACTERS.length,
    relationCount: SAMPLE_RELATIONS.length,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error("\u56fe\u8c31\u8054\u8c03\u6837\u672c\u5c0f\u8bf4\u521b\u5efa\u5931\u8d25\u3002", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
