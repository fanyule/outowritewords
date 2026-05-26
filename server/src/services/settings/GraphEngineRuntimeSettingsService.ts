import path from "node:path";
import { prisma } from "../../db/prisma";
import { resolveDataRoot, resolveWorkspaceRoot } from "../../runtime/appPaths";
import { isMissingTableError } from "./ragLegacyCompatibility";

export const GRAPH_ENGINE_REQUIRED_PYTHON_VERSION = "3.11";

const GRAPH_ENGINE_ENABLED_KEY = "graphEngine.enabled";
const GRAPH_ENGINE_AUTO_ANALYZE_KEY = "graphEngine.autoAnalyze";
const GRAPH_ENGINE_ROOT_KEY = "graphEngine.engineRoot";
const GRAPH_ENGINE_PROJECTS_ROOT_KEY = "graphEngine.projectsRoot";
const GRAPH_ENGINE_PYTHON_EXECUTABLE_KEY = "graphEngine.pythonExecutable";
const GRAPH_ENGINE_PYTHON_ARGS_KEY = "graphEngine.pythonArgs";
const GRAPH_ENGINE_PROVIDER_KEY = "graphEngine.provider";
const GRAPH_ENGINE_BASE_URL_KEY = "graphEngine.baseUrl";
const GRAPH_ENGINE_API_KEY_KEY = "graphEngine.apiKey";
const GRAPH_ENGINE_MODEL_KEY = "graphEngine.model";
const GRAPH_ENGINE_TEMPERATURE_KEY = "graphEngine.temperature";
const GRAPH_ENGINE_MAX_TOKENS_KEY = "graphEngine.maxTokens";

const GRAPH_ENGINE_RUNTIME_SETTING_KEYS = [
  GRAPH_ENGINE_ENABLED_KEY,
  GRAPH_ENGINE_AUTO_ANALYZE_KEY,
  GRAPH_ENGINE_ROOT_KEY,
  GRAPH_ENGINE_PROJECTS_ROOT_KEY,
  GRAPH_ENGINE_PYTHON_EXECUTABLE_KEY,
  GRAPH_ENGINE_PYTHON_ARGS_KEY,
  GRAPH_ENGINE_PROVIDER_KEY,
  GRAPH_ENGINE_BASE_URL_KEY,
  GRAPH_ENGINE_API_KEY_KEY,
  GRAPH_ENGINE_MODEL_KEY,
  GRAPH_ENGINE_TEMPERATURE_KEY,
  GRAPH_ENGINE_MAX_TOKENS_KEY,
] as const;

const DEFAULT_GRAPH_ENGINE_PROJECTS_DIR = "novel-graphs";
const DEFAULT_GRAPH_ENGINE_PROVIDER = "openai-compatible";
const DEFAULT_GRAPH_ENGINE_MAX_TOKENS = 15_000;
const DEFAULT_GRAPH_ENGINE_TEMPERATURE = 0;

export interface GraphEngineRuntimeSettings {
  enabled: boolean;
  autoAnalyze: boolean;
  engineRoot: string;
  projectsRoot: string;
  pythonExecutable: string;
  pythonArgs: string;
  provider: string;
  baseUrl: string;
  apiKeyConfigured: boolean;
  model: string;
  temperature: number;
  maxTokens: number;
  defaultEngineRoot: string;
  defaultProjectsRoot: string;
  defaultPythonExecutable: string;
  requiredPythonVersion: string;
}

export interface GraphEngineRuntimeSettingsInput {
  enabled: boolean;
  autoAnalyze: boolean;
  engineRoot: string;
  projectsRoot: string;
  pythonExecutable: string;
  pythonArgs: string;
  provider: string;
  baseUrl: string;
  apiKey?: string;
  clearApiKey?: boolean;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface GraphEngineRuntimeResolvedConfig extends GraphEngineRuntimeSettings {
  apiKey: string;
}

let cachedSettings: GraphEngineRuntimeResolvedConfig | null = null;

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function clampNumber(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function toAbsoluteOrFallback(input: string, fallback: string): string {
  const trimmed = input.trim();
  return trimmed ? path.resolve(trimmed) : fallback;
}

function buildDefaultSettings(): GraphEngineRuntimeResolvedConfig {
  const defaultProjectsRoot = path.join(resolveDataRoot(), DEFAULT_GRAPH_ENGINE_PROJECTS_DIR);
  const defaultEngineRoot = path.resolve(resolveWorkspaceRoot(), "..", "graph-every-novel-main");
  const defaultPythonExecutable = "python";
  const baseUrl = normalizeText(process.env.AI_NOVEL_GRAPH_ENGINE_BASE_URL)
    || normalizeText(process.env.OPENAI_BASE_URL);
  const apiKey = normalizeText(process.env.AI_NOVEL_GRAPH_ENGINE_API_KEY)
    || normalizeText(process.env.OPENAI_API_KEY);
  const model = normalizeText(process.env.AI_NOVEL_GRAPH_ENGINE_MODEL)
    || normalizeText(process.env.OPENAI_MODEL);
  const provider = normalizeText(process.env.AI_NOVEL_GRAPH_ENGINE_PROVIDER) || DEFAULT_GRAPH_ENGINE_PROVIDER;

  return {
    enabled: parseBoolean(process.env.AI_NOVEL_GRAPH_ENGINE_ENABLED, true),
    autoAnalyze: parseBoolean(process.env.AI_NOVEL_GRAPH_ENGINE_AUTO_ANALYZE, true),
    engineRoot: toAbsoluteOrFallback(normalizeText(process.env.AI_NOVEL_GRAPH_ENGINE_ROOT), defaultEngineRoot),
    projectsRoot: toAbsoluteOrFallback(normalizeText(process.env.AI_NOVEL_GRAPH_ENGINE_PROJECT_ROOT), defaultProjectsRoot),
    pythonExecutable: normalizeText(process.env.AI_NOVEL_GRAPH_PYTHON_EXECUTABLE) || defaultPythonExecutable,
    pythonArgs: normalizeText(process.env.AI_NOVEL_GRAPH_PYTHON_ARGS),
    provider,
    baseUrl,
    apiKey,
    apiKeyConfigured: Boolean(apiKey),
    model,
    temperature: clampNumber(Number(process.env.AI_NOVEL_GRAPH_ENGINE_TEMPERATURE), DEFAULT_GRAPH_ENGINE_TEMPERATURE, 0, 2),
    maxTokens: Math.floor(clampNumber(Number(process.env.AI_NOVEL_GRAPH_ENGINE_MAX_TOKENS), DEFAULT_GRAPH_ENGINE_MAX_TOKENS, 512, 128000)),
    defaultEngineRoot,
    defaultProjectsRoot,
    defaultPythonExecutable,
    requiredPythonVersion: GRAPH_ENGINE_REQUIRED_PYTHON_VERSION,
  };
}

function toPublicSettings(settings: GraphEngineRuntimeResolvedConfig): GraphEngineRuntimeSettings {
  return {
    enabled: settings.enabled,
    autoAnalyze: settings.autoAnalyze,
    engineRoot: settings.engineRoot,
    projectsRoot: settings.projectsRoot,
    pythonExecutable: settings.pythonExecutable,
    pythonArgs: settings.pythonArgs,
    provider: settings.provider,
    baseUrl: settings.baseUrl,
    apiKeyConfigured: settings.apiKeyConfigured,
    model: settings.model,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    defaultEngineRoot: settings.defaultEngineRoot,
    defaultProjectsRoot: settings.defaultProjectsRoot,
    defaultPythonExecutable: settings.defaultPythonExecutable,
    requiredPythonVersion: settings.requiredPythonVersion,
  };
}

function applySettingsToProcessEnv(settings: GraphEngineRuntimeResolvedConfig): void {
  process.env.AI_NOVEL_GRAPH_ENGINE_ENABLED = String(settings.enabled);
  process.env.AI_NOVEL_GRAPH_ENGINE_AUTO_ANALYZE = String(settings.autoAnalyze);
  process.env.AI_NOVEL_GRAPH_ENGINE_ROOT = settings.engineRoot;
  process.env.AI_NOVEL_GRAPH_ENGINE_PROJECT_ROOT = settings.projectsRoot;
  process.env.AI_NOVEL_GRAPH_PYTHON_EXECUTABLE = settings.pythonExecutable;
  process.env.AI_NOVEL_GRAPH_PYTHON_ARGS = settings.pythonArgs;
  process.env.AI_NOVEL_GRAPH_ENGINE_PROVIDER = settings.provider;
  process.env.AI_NOVEL_GRAPH_ENGINE_BASE_URL = settings.baseUrl;
  process.env.AI_NOVEL_GRAPH_ENGINE_MODEL = settings.model;
  process.env.AI_NOVEL_GRAPH_ENGINE_TEMPERATURE = String(settings.temperature);
  process.env.AI_NOVEL_GRAPH_ENGINE_MAX_TOKENS = String(settings.maxTokens);

  if (settings.apiKey) {
    process.env.AI_NOVEL_GRAPH_ENGINE_API_KEY = settings.apiKey;
  } else {
    delete process.env.AI_NOVEL_GRAPH_ENGINE_API_KEY;
  }
}

function buildSettingsFromValueMap(
  valueMap: Map<string, string>,
  defaults: GraphEngineRuntimeResolvedConfig,
): GraphEngineRuntimeResolvedConfig {
  const apiKey = normalizeText(valueMap.get(GRAPH_ENGINE_API_KEY_KEY)) || defaults.apiKey;

  return {
    ...defaults,
    enabled: parseBoolean(valueMap.get(GRAPH_ENGINE_ENABLED_KEY), defaults.enabled),
    autoAnalyze: parseBoolean(valueMap.get(GRAPH_ENGINE_AUTO_ANALYZE_KEY), defaults.autoAnalyze),
    engineRoot: toAbsoluteOrFallback(normalizeText(valueMap.get(GRAPH_ENGINE_ROOT_KEY)), defaults.engineRoot),
    projectsRoot: toAbsoluteOrFallback(normalizeText(valueMap.get(GRAPH_ENGINE_PROJECTS_ROOT_KEY)), defaults.projectsRoot),
    pythonExecutable: normalizeText(valueMap.get(GRAPH_ENGINE_PYTHON_EXECUTABLE_KEY)) || defaults.pythonExecutable,
    pythonArgs: normalizeText(valueMap.get(GRAPH_ENGINE_PYTHON_ARGS_KEY)) || defaults.pythonArgs,
    provider: normalizeText(valueMap.get(GRAPH_ENGINE_PROVIDER_KEY)) || defaults.provider,
    baseUrl: normalizeText(valueMap.get(GRAPH_ENGINE_BASE_URL_KEY)) || defaults.baseUrl,
    apiKey,
    apiKeyConfigured: Boolean(apiKey),
    model: normalizeText(valueMap.get(GRAPH_ENGINE_MODEL_KEY)) || defaults.model,
    temperature: clampNumber(
      Number(valueMap.get(GRAPH_ENGINE_TEMPERATURE_KEY)),
      defaults.temperature,
      0,
      2,
    ),
    maxTokens: Math.floor(clampNumber(
      Number(valueMap.get(GRAPH_ENGINE_MAX_TOKENS_KEY)),
      defaults.maxTokens,
      512,
      128000,
    )),
  };
}

async function getValueMap(): Promise<Map<string, string>> {
  const records = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [...GRAPH_ENGINE_RUNTIME_SETTING_KEYS],
      },
    },
  });
  return new Map(records.map((record) => [record.key, record.value]));
}

export function getGraphEngineRuntimeSettingsSnapshot(): GraphEngineRuntimeResolvedConfig | null {
  return cachedSettings;
}

export async function getGraphEngineRuntimeResolvedConfig(
  forceRefresh = false,
): Promise<GraphEngineRuntimeResolvedConfig> {
  if (!forceRefresh && cachedSettings) {
    return cachedSettings;
  }

  const defaults = buildDefaultSettings();
  try {
    const valueMap = await getValueMap();
    cachedSettings = buildSettingsFromValueMap(valueMap, defaults);
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
    cachedSettings = defaults;
  }

  applySettingsToProcessEnv(cachedSettings);
  return cachedSettings;
}

export async function getGraphEngineRuntimeSettings(): Promise<GraphEngineRuntimeSettings> {
  return toPublicSettings(await getGraphEngineRuntimeResolvedConfig());
}

export async function saveGraphEngineRuntimeSettings(
  input: GraphEngineRuntimeSettingsInput,
): Promise<GraphEngineRuntimeSettings> {
  const previous = await getGraphEngineRuntimeResolvedConfig(true);
  const nextApiKey = input.clearApiKey
    ? ""
    : normalizeText(input.apiKey) || previous.apiKey;

  const next: GraphEngineRuntimeResolvedConfig = {
    ...previous,
    enabled: Boolean(input.enabled),
    autoAnalyze: Boolean(input.autoAnalyze),
    engineRoot: toAbsoluteOrFallback(input.engineRoot, previous.defaultEngineRoot),
    projectsRoot: toAbsoluteOrFallback(input.projectsRoot, previous.defaultProjectsRoot),
    pythonExecutable: normalizeText(input.pythonExecutable) || previous.defaultPythonExecutable,
    pythonArgs: normalizeText(input.pythonArgs),
    provider: normalizeText(input.provider) || DEFAULT_GRAPH_ENGINE_PROVIDER,
    baseUrl: normalizeText(input.baseUrl),
    apiKey: nextApiKey,
    apiKeyConfigured: Boolean(nextApiKey),
    model: normalizeText(input.model),
    temperature: clampNumber(input.temperature, previous.temperature, 0, 2),
    maxTokens: Math.floor(clampNumber(input.maxTokens, previous.maxTokens, 512, 128000)),
  };

  const writeOperations = [
    prisma.appSetting.upsert({
      where: { key: GRAPH_ENGINE_ENABLED_KEY },
      update: { value: String(next.enabled) },
      create: { key: GRAPH_ENGINE_ENABLED_KEY, value: String(next.enabled) },
    }),
    prisma.appSetting.upsert({
      where: { key: GRAPH_ENGINE_AUTO_ANALYZE_KEY },
      update: { value: String(next.autoAnalyze) },
      create: { key: GRAPH_ENGINE_AUTO_ANALYZE_KEY, value: String(next.autoAnalyze) },
    }),
    prisma.appSetting.upsert({
      where: { key: GRAPH_ENGINE_ROOT_KEY },
      update: { value: next.engineRoot },
      create: { key: GRAPH_ENGINE_ROOT_KEY, value: next.engineRoot },
    }),
    prisma.appSetting.upsert({
      where: { key: GRAPH_ENGINE_PROJECTS_ROOT_KEY },
      update: { value: next.projectsRoot },
      create: { key: GRAPH_ENGINE_PROJECTS_ROOT_KEY, value: next.projectsRoot },
    }),
    prisma.appSetting.upsert({
      where: { key: GRAPH_ENGINE_PYTHON_EXECUTABLE_KEY },
      update: { value: next.pythonExecutable },
      create: { key: GRAPH_ENGINE_PYTHON_EXECUTABLE_KEY, value: next.pythonExecutable },
    }),
    prisma.appSetting.upsert({
      where: { key: GRAPH_ENGINE_PYTHON_ARGS_KEY },
      update: { value: next.pythonArgs },
      create: { key: GRAPH_ENGINE_PYTHON_ARGS_KEY, value: next.pythonArgs },
    }),
    prisma.appSetting.upsert({
      where: { key: GRAPH_ENGINE_PROVIDER_KEY },
      update: { value: next.provider },
      create: { key: GRAPH_ENGINE_PROVIDER_KEY, value: next.provider },
    }),
    prisma.appSetting.upsert({
      where: { key: GRAPH_ENGINE_BASE_URL_KEY },
      update: { value: next.baseUrl },
      create: { key: GRAPH_ENGINE_BASE_URL_KEY, value: next.baseUrl },
    }),
    prisma.appSetting.upsert({
      where: { key: GRAPH_ENGINE_MODEL_KEY },
      update: { value: next.model },
      create: { key: GRAPH_ENGINE_MODEL_KEY, value: next.model },
    }),
    prisma.appSetting.upsert({
      where: { key: GRAPH_ENGINE_TEMPERATURE_KEY },
      update: { value: String(next.temperature) },
      create: { key: GRAPH_ENGINE_TEMPERATURE_KEY, value: String(next.temperature) },
    }),
    prisma.appSetting.upsert({
      where: { key: GRAPH_ENGINE_MAX_TOKENS_KEY },
      update: { value: String(next.maxTokens) },
      create: { key: GRAPH_ENGINE_MAX_TOKENS_KEY, value: String(next.maxTokens) },
    }),
    ...(next.apiKey
      ? [prisma.appSetting.upsert({
        where: { key: GRAPH_ENGINE_API_KEY_KEY },
        update: { value: next.apiKey },
        create: { key: GRAPH_ENGINE_API_KEY_KEY, value: next.apiKey },
      })]
      : [prisma.appSetting.deleteMany({
        where: { key: GRAPH_ENGINE_API_KEY_KEY },
      })]),
  ];

  try {
    await prisma.$transaction(writeOperations);
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
  }

  cachedSettings = next;
  applySettingsToProcessEnv(next);
  return toPublicSettings(next);
}

void getGraphEngineRuntimeResolvedConfig().catch((error) => {
  console.warn("[graph-settings] failed to hydrate graph engine runtime settings", error);
});
