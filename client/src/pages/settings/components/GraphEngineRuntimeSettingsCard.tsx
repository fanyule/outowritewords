import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAPIKeySettings,
  getGraphEngineRuntimeReadiness,
  getGraphEngineRuntimeSettings,
  importGraphEngineRuntimeFromProvider,
  saveGraphEngineRuntimeSettings,
} from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

type FormState = {
  enabled: boolean;
  autoAnalyze: boolean;
  engineRoot: string;
  projectsRoot: string;
  pythonExecutable: string;
  pythonArgs: string;
  provider: string;
  baseUrl: string;
  apiKey: string;
  clearApiKey: boolean;
  model: string;
  temperature: string;
  maxTokens: string;
};

const DEFAULT_FORM: FormState = {
  enabled: true,
  autoAnalyze: true,
  engineRoot: "",
  projectsRoot: "",
  pythonExecutable: "python",
  pythonArgs: "",
  provider: "openai-compatible",
  baseUrl: "",
  apiKey: "",
  clearApiKey: false,
  model: "",
  temperature: "0",
  maxTokens: "15000",
};

export default function GraphEngineRuntimeSettingsCard() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [feedback, setFeedback] = useState("");

  const settingsQuery = useQuery({
    queryKey: queryKeys.settings.graphEngineRuntime,
    queryFn: getGraphEngineRuntimeSettings,
  });

  const providerSettingsQuery = useQuery({
    queryKey: queryKeys.settings.apiKeys,
    queryFn: getAPIKeySettings,
  });

  const readinessQuery = useQuery({
    queryKey: queryKeys.settings.graphEngineRuntimeReadiness,
    queryFn: getGraphEngineRuntimeReadiness,
    staleTime: 10_000,
    retry: false,
  });

  const settings = settingsQuery.data?.data;
  const readiness = readinessQuery.data?.data;
  const importableProviders = (providerSettingsQuery.data?.data ?? []).filter((provider) =>
    provider.isConfigured
    && provider.apiKeyConfigured
    && provider.provider !== "anthropic"
    && Boolean(provider.currentBaseURL.trim())
    && Boolean(provider.currentModel.trim()),
  );

  useEffect(() => {
    if (!settings) {
      return;
    }

    setForm({
      enabled: settings.enabled,
      autoAnalyze: settings.autoAnalyze,
      engineRoot: settings.engineRoot,
      projectsRoot: settings.projectsRoot,
      pythonExecutable: settings.pythonExecutable,
      pythonArgs: settings.pythonArgs,
      provider: settings.provider,
      baseUrl: settings.baseUrl,
      apiKey: "",
      clearApiKey: false,
      model: settings.model,
      temperature: String(settings.temperature),
      maxTokens: String(settings.maxTokens),
    });
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const temperature = Number(form.temperature);
      const maxTokens = Number(form.maxTokens);
      return saveGraphEngineRuntimeSettings({
        enabled: form.enabled,
        autoAnalyze: form.autoAnalyze,
        engineRoot: form.engineRoot.trim(),
        projectsRoot: form.projectsRoot.trim(),
        pythonExecutable: form.pythonExecutable.trim(),
        pythonArgs: form.pythonArgs.trim(),
        provider: form.provider.trim(),
        baseUrl: form.baseUrl.trim(),
        apiKey: form.apiKey.trim() || undefined,
        clearApiKey: form.clearApiKey && !form.apiKey.trim(),
        model: form.model.trim(),
        temperature,
        maxTokens,
      });
    },
    onSuccess: async (response) => {
      setFeedback(response.message ?? "图谱引擎运行设置保存成功。");
      setForm((prev) => ({
        ...prev,
        apiKey: "",
        clearApiKey: false,
      }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.graphEngineRuntime }),
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.graphEngineRuntimeReadiness }),
        queryClient.invalidateQueries({ queryKey: ["novels", "graph", "precise-readiness"] }),
        queryClient.invalidateQueries({ queryKey: ["novels", "graph", "precise-status"] }),
      ]);
    },
    onError: (error) => {
      setFeedback(error instanceof Error ? error.message : "图谱引擎运行设置保存失败。");
    },
  });

  const importProviderMutation = useMutation({
    mutationFn: (provider: string) => importGraphEngineRuntimeFromProvider(provider),
    onSuccess: async (response) => {
      setFeedback(response.message ?? "图谱模型配置已导入。");
      setForm((prev) => ({
        ...prev,
        provider: response.data?.settings.provider ?? prev.provider,
        baseUrl: response.data?.settings.baseUrl ?? prev.baseUrl,
        model: response.data?.settings.model ?? prev.model,
        apiKey: "",
        clearApiKey: false,
      }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.graphEngineRuntime }),
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.graphEngineRuntimeReadiness }),
        queryClient.invalidateQueries({ queryKey: ["novels", "graph", "precise-readiness"] }),
        queryClient.invalidateQueries({ queryKey: ["novels", "graph", "precise-status"] }),
      ]);
    },
    onError: (error) => {
      setFeedback(error instanceof Error ? error.message : "导入主模型配置失败。");
    },
  });

  const parsedTemperature = Number(form.temperature);
  const parsedMaxTokens = Number(form.maxTokens);
  const isValidTemperature = Number.isFinite(parsedTemperature) && parsedTemperature >= 0 && parsedTemperature <= 2;
  const isValidMaxTokens = Number.isInteger(parsedMaxTokens) && parsedMaxTokens >= 512 && parsedMaxTokens <= 128000;
  const hasRequiredPaths = Boolean(
    form.engineRoot.trim()
    && form.projectsRoot.trim()
    && form.pythonExecutable.trim(),
  );
  const canSave = hasRequiredPaths && isValidTemperature && isValidMaxTokens;

  const applyRecommendedPaths = () => {
    if (!settings) {
      return;
    }

    setFeedback("");
    setForm((prev) => ({
      ...prev,
      engineRoot: settings.defaultEngineRoot,
      projectsRoot: settings.defaultProjectsRoot,
      pythonExecutable: settings.defaultPythonExecutable,
    }));
  };

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <CardTitle>图谱引擎运行设置</CardTitle>
            <CardDescription className={`break-words [overflow-wrap:anywhere] ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
              配置本地精确人物图谱所需的 Python、引擎路径和模型接入参数。保存后，图谱页和小说工作台会直接复用这套配置。
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Python {settings?.requiredPythonVersion ?? "3.11"}+</Badge>
            <Badge variant={settings?.apiKeyConfigured ? "default" : "secondary"}>
              {settings?.apiKeyConfigured ? "已保存密钥" : "未保存密钥"}
            </Badge>
            <Badge variant={form.enabled ? "default" : "secondary"}>
              {form.enabled ? "已启用" : "已停用"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border p-3 md:col-span-2">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={readiness?.engineDetected ? "default" : "secondary"}>
                  {readiness?.engineDetected ? "引擎目录已检测" : "引擎目录待确认"}
                </Badge>
                <Badge variant={readiness?.pythonAvailable && readiness?.pythonVersionSupported ? "default" : "secondary"}>
                  {readiness?.pythonAvailable
                    ? readiness?.pythonVersionSupported
                      ? "Python 就绪"
                      : `Python 需 ${readiness.requiredPythonVersion}+`
                    : "Python 未就绪"}
                </Badge>
                <Badge variant={readiness?.engineImportAvailable ? "default" : "secondary"}>
                  {readiness?.engineImportAvailable ? "引擎依赖可导入" : "引擎依赖待检查"}
                </Badge>
                <Badge variant={readiness?.providerConfigured ? "default" : "secondary"}>
                  {readiness?.providerConfigured ? "模型配置已完成" : "模型配置未完成"}
                </Badge>
              </div>
              <div className={`text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                {readinessQuery.isLoading
                  ? "正在检查图谱引擎运行条件..."
                  : readinessQuery.error
                    ? (readinessQuery.error instanceof Error ? readinessQuery.error.message : "图谱运行诊断读取失败。")
                    : readiness?.ready
                      ? "当前配置已经满足精确图谱运行条件。保存后可直接回到小说工作台或图谱页运行分析。"
                      : readiness?.issues[0]?.message ?? "保存后会自动重新检查图谱引擎运行条件。"}
              </div>
            </div>
          </div>

          <div className="rounded-lg border p-3 md:col-span-2">
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="text-sm font-medium">快捷导入主模型配置</div>
                <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                  直接复用当前应用里已经配置好的厂商地址、模型名和 API Key，省去重复填写。
                </div>
              </div>
              {importableProviders.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {importableProviders.map((provider) => (
                    <Button
                      key={provider.provider}
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={importProviderMutation.isPending}
                      onClick={() => {
                        setFeedback("");
                        importProviderMutation.mutate(provider.provider);
                      }}
                    >
                      {importProviderMutation.isPending && importProviderMutation.variables === provider.provider
                        ? "导入中..."
                        : `从 ${provider.displayName ?? provider.name} 导入`}
                    </Button>
                  ))}
                </div>
              ) : (
                <div className={`text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                  还没有可复用的主模型配置。先在本页下方或厂商设置里完成至少一套可用模型接入。
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium">启用精确图谱引擎</div>
                <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                  关闭后，图谱功能只保留即时图谱，不再允许精确分析任务运行。
                </div>
              </div>
              <Switch
                checked={form.enabled}
                onCheckedChange={(checked) => {
                  setFeedback("");
                  setForm((prev) => ({ ...prev, enabled: Boolean(checked) }));
                }}
              />
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium">章节完成后自动分析</div>
                <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                  保持开启后，章节生成完成和主要流水线结束时会自动排队精确图谱任务。
                </div>
              </div>
              <Switch
                checked={form.autoAnalyze}
                onCheckedChange={(checked) => {
                  setFeedback("");
                  setForm((prev) => ({ ...prev, autoAnalyze: Boolean(checked) }));
                }}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-sm font-medium">图谱引擎目录</div>
            <Input
              value={form.engineRoot}
              onChange={(event) => {
                setFeedback("");
                setForm((prev) => ({ ...prev, engineRoot: event.target.value }));
              }}
              placeholder={settings?.defaultEngineRoot ?? "F:\\workspaceAIxiaoshuo\\graph-every-novel-main"}
            />
            <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
              默认推荐：{settings?.defaultEngineRoot ?? "等待加载推荐路径"}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">图谱项目输出目录</div>
            <Input
              value={form.projectsRoot}
              onChange={(event) => {
                setFeedback("");
                setForm((prev) => ({ ...prev, projectsRoot: event.target.value }));
              }}
              placeholder={settings?.defaultProjectsRoot ?? "本地图谱数据目录"}
            />
            <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
              精确图谱工作区、导出文件和运行状态都会保存在这里。
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Python 可执行文件</div>
            <Input
              value={form.pythonExecutable}
              onChange={(event) => {
                setFeedback("");
                setForm((prev) => ({ ...prev, pythonExecutable: event.target.value }));
              }}
              placeholder={settings?.defaultPythonExecutable ?? "python"}
            />
            <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
              可以填写 `python`，也可以指定虚拟环境内的完整 Python 路径。
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Python 启动参数</div>
            <Input
              value={form.pythonArgs}
              onChange={(event) => {
                setFeedback("");
                setForm((prev) => ({ ...prev, pythonArgs: event.target.value }));
              }}
              placeholder="-X utf8"
            />
            <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
              可选。留空即可，多个参数用空格分隔。
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">模型提供商标识</div>
            <Input
              value={form.provider}
              onChange={(event) => {
                setFeedback("");
                setForm((prev) => ({ ...prev, provider: event.target.value }));
              }}
              placeholder="openai-compatible"
            />
            <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
              默认使用 `openai-compatible`，与 `graph-every-novel` 的兼容客户端保持一致。
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">模型 API 地址</div>
            <Input
              value={form.baseUrl}
              onChange={(event) => {
                setFeedback("");
                setForm((prev) => ({ ...prev, baseUrl: event.target.value }));
              }}
              placeholder="https://api.openai.com/v1"
            />
            <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
              可留空后稍后再配，图谱运行前会在 readiness 里提示模型未就绪。
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">模型名称</div>
            <Input
              value={form.model}
              onChange={(event) => {
                setFeedback("");
                setForm((prev) => ({ ...prev, model: event.target.value }));
              }}
              placeholder="gpt-4.1-mini"
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">API Key</div>
            <Input
              type="password"
              value={form.apiKey}
              onChange={(event) => {
                setFeedback("");
                setForm((prev) => ({
                  ...prev,
                  apiKey: event.target.value,
                  clearApiKey: event.target.value.trim() ? false : prev.clearApiKey,
                }));
              }}
              placeholder={settings?.apiKeyConfigured ? "已保存，留空表示沿用当前密钥" : "在这里输入新的 API Key"}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={form.clearApiKey ? "destructive" : "outline"}
                disabled={!settings?.apiKeyConfigured}
                onClick={() => {
                  setFeedback("");
                  setForm((prev) => ({
                    ...prev,
                    apiKey: "",
                    clearApiKey: !prev.clearApiKey,
                  }));
                }}
              >
                {form.clearApiKey ? "将清空已保存密钥" : "清空已保存密钥"}
              </Button>
              <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                留空不覆盖当前密钥；如果要移除旧密钥，请点左侧按钮后再保存。
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">温度</div>
            <Input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={form.temperature}
              onChange={(event) => {
                setFeedback("");
                setForm((prev) => ({ ...prev, temperature: event.target.value }));
              }}
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">最大输出 Token</div>
            <Input
              type="number"
              min={512}
              max={128000}
              step={1}
              value={form.maxTokens}
              onChange={(event) => {
                setFeedback("");
                setForm((prev) => ({ ...prev, maxTokens: event.target.value }));
              }}
            />
          </div>
        </div>

        {!hasRequiredPaths ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            请先补全图谱引擎目录、图谱项目输出目录和 Python 可执行文件。
          </div>
        ) : null}

        {!isValidTemperature ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            温度需要填写 0 到 2 之间的数字。
          </div>
        ) : null}

        {!isValidMaxTokens ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            最大输出 Token 需要填写 512 到 128000 之间的整数。
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={applyRecommendedPaths}
            disabled={!settings}
          >
            恢复推荐路径
          </Button>
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() => saveMutation.mutate()}
            disabled={settingsQuery.isLoading || saveMutation.isPending || !canSave}
          >
            {saveMutation.isPending ? "保存中..." : "保存图谱引擎设置"}
          </Button>
        </div>

        {feedback ? (
          <div className={`text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            {feedback}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
