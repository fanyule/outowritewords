import type { StyleBinding } from "@ai-novel/shared/types/styleEngine";
import { Button } from "@/components/ui/button";

interface BindingFormState {
  targetType: StyleBinding["targetType"];
  novelId: string;
  chapterId: string;
  taskTargetId: string;
  priority: number;
  weight: number;
}

interface TestWriteFormState {
  mode: "generate" | "rewrite";
  topic: string;
  sourceText: string;
  targetLength: number;
}

interface WritingFormulaWorkbenchPanelProps {
  selectedProfileId: string;
  bindingForm: BindingFormState;
  bindings: StyleBinding[];
  novelOptions: Array<{ id: string; title: string }>;
  chapterOptions: Array<{ id: string; order: number; title: string }>;
  createBindingPending: boolean;
  onBindingFormChange: (patch: Partial<BindingFormState>) => void;
  onCreateBinding: () => void;
  onDeleteBinding: (bindingId: string) => void;
  testWriteForm: TestWriteFormState;
  testWriteOutput: string;
  testWritePending: boolean;
  onTestWriteFormChange: (patch: Partial<TestWriteFormState>) => void;
  onRunTestWrite: () => void;
}

const fieldClassName =
  "w-full rounded-xl border border-border/70 bg-background/40 px-3 py-2.5 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-primary/45 focus:ring-2 focus:ring-primary/15";

const sectionClassName = "app-shell-panel-soft space-y-4 p-4 md:p-5";

const labelClassName = "text-sm font-medium text-foreground";

export default function WritingFormulaWorkbenchPanel(props: WritingFormulaWorkbenchPanelProps) {
  const {
    selectedProfileId,
    bindingForm,
    bindings,
    novelOptions,
    chapterOptions,
    createBindingPending,
    onBindingFormChange,
    onCreateBinding,
    onDeleteBinding,
    testWriteForm,
    testWriteOutput,
    testWritePending,
    onTestWriteFormChange,
    onRunTestWrite,
  } = props;

  return (
    <div className="app-shell-panel overflow-hidden">
      <div className="app-shell-divider border-b px-6 py-5">
        <div className="space-y-1">
          <div className="app-heading-section text-foreground">当前写法的应用与测试</div>
          <div className="app-caption-copy">
            这里单独处理写法绑定和试写验证，不进入写法规则编辑，也不混入去 AI 修订。
          </div>
        </div>
      </div>

      <div className="space-y-5 p-6">
        <div className="app-state-panel-muted px-4 py-3 text-sm leading-7 text-muted-foreground">
          这里只处理两件事：把这套写法绑定到小说、章节或任务，以及先试写一段看看效果。“去 AI 味”已经拆成独立入口，不再和这里混在一起。
        </div>

        <div className={sectionClassName}>
          <div className="space-y-1">
            <div className="app-heading-section text-foreground">绑定到目标</div>
            <div className="app-caption-copy">
              绑定后，这套写法会在对应小说、章节或任务里参与生成。优先级越高，影响越靠前；权重越高，参与程度越强。
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2">
              <div className={labelClassName}>绑定层级</div>
              <select
                className={fieldClassName}
                value={bindingForm.targetType}
                onChange={(event) => onBindingFormChange({ targetType: event.target.value as StyleBinding["targetType"] })}
              >
                <option value="novel">整本书</option>
                <option value="chapter">章节</option>
                <option value="task">本次任务</option>
              </select>
            </label>

            <label className="space-y-2">
              <div className={labelClassName}>所属小说</div>
              <select
                className={fieldClassName}
                value={bindingForm.novelId}
                onChange={(event) => onBindingFormChange({ novelId: event.target.value, chapterId: "" })}
              >
                {novelOptions.map((novel) => (
                  <option key={novel.id} value={novel.id}>
                    {novel.title}
                  </option>
                ))}
              </select>
            </label>

            {bindingForm.targetType === "chapter" ? (
              <label className="space-y-2">
                <div className={labelClassName}>选择章节</div>
                <select
                  className={fieldClassName}
                  value={bindingForm.chapterId}
                  onChange={(event) => onBindingFormChange({ chapterId: event.target.value })}
                >
                  <option value="">选择章节</option>
                  {chapterOptions.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      {chapter.order}. {chapter.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {bindingForm.targetType === "task" ? (
              <label className="space-y-2">
                <div className={labelClassName}>任务标识</div>
                <input
                  className={fieldClassName}
                  placeholder="例如：chapter-draft-001"
                  value={bindingForm.taskTargetId}
                  onChange={(event) => onBindingFormChange({ taskTargetId: event.target.value })}
                />
              </label>
            ) : null}

            <label className="space-y-2">
              <div className={labelClassName}>优先级</div>
              <input
                className={fieldClassName}
                type="number"
                min={0}
                max={99}
                value={bindingForm.priority}
                onChange={(event) => onBindingFormChange({ priority: Number(event.target.value) || 1 })}
              />
            </label>

            <label className="space-y-2">
              <div className={labelClassName}>权重</div>
              <input
                className={fieldClassName}
                type="number"
                min={0.3}
                max={1}
                step={0.1}
                value={bindingForm.weight}
                onChange={(event) => onBindingFormChange({ weight: Number(event.target.value) || 1 })}
              />
            </label>
          </div>

          <div className="app-action-row">
            <Button onClick={onCreateBinding} disabled={createBindingPending || !selectedProfileId}>
              创建绑定
            </Button>
          </div>

          <div className="space-y-2">
            {bindings.length > 0 ? (
              bindings.map((binding) => (
                <div
                  key={binding.id}
                  className="flex items-center justify-between gap-3 rounded-[calc(var(--radius)+2px)] border border-border/65 bg-background/28 px-3 py-3 text-sm text-foreground"
                >
                  <span>{binding.targetType} / {binding.targetId} / P{binding.priority} / W{binding.weight}</span>
                  <Button size="sm" variant="ghost" onClick={() => onDeleteBinding(binding.id)}>
                    删除
                  </Button>
                </div>
              ))
            ) : (
              <div className="app-state-panel-muted px-3 py-3 text-sm leading-6 text-muted-foreground">
                这套写法还没有绑定到任何目标。先绑定到小说或章节，后面的生成链路才会自动带上它。
              </div>
            )}
          </div>
        </div>

        <div className={sectionClassName}>
          <div className="space-y-1">
            <div className="app-heading-section text-foreground">先试写一段</div>
            <div className="app-caption-copy">
              不确定这套写法有没有真正落地时，先生成一段或改写一段，是最快的验证方式。
            </div>
          </div>

          <label className="space-y-2">
            <div className={labelClassName}>试写方式</div>
            <select
              className={fieldClassName}
              value={testWriteForm.mode}
              onChange={(event) => onTestWriteFormChange({ mode: event.target.value as "generate" | "rewrite" })}
            >
              <option value="generate">生成正文</option>
              <option value="rewrite">改写文本</option>
            </select>
          </label>

          {testWriteForm.mode === "generate" ? (
            <label className="space-y-2">
              <div className={labelClassName}>试写主题</div>
              <input
                className={fieldClassName}
                placeholder="例如：主角第一次公开翻盘"
                value={testWriteForm.topic}
                onChange={(event) => onTestWriteFormChange({ topic: event.target.value })}
              />
            </label>
          ) : (
            <label className="space-y-2">
              <div className={labelClassName}>待改写文本</div>
              <textarea
                className={`${fieldClassName} min-h-[140px]`}
                placeholder="粘贴你想用这套写法改写的正文"
                value={testWriteForm.sourceText}
                onChange={(event) => onTestWriteFormChange({ sourceText: event.target.value })}
              />
            </label>
          )}

          <div className="app-action-row">
            <Button onClick={onRunTestWrite} disabled={testWritePending || !selectedProfileId}>
              执行试写
            </Button>
          </div>

          {testWriteOutput ? (
            <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-[calc(var(--radius)+4px)] border border-border/65 bg-background/38 p-4 text-sm text-foreground">
              {testWriteOutput}
            </pre>
          ) : (
            <div className="app-state-panel-muted px-3 py-3 text-sm leading-6 text-muted-foreground">
              这里会显示试写结果。你可以用它判断这套写法的推进感、对白质感和整体语气是否已经到位。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
