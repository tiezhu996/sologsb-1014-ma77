import { redraw } from 'mithril';
import type { ProofCheck, ProofDiff, ProofDocument, ProofStep, ProofVersion } from './types';

const STORAGE_KEY = 'sologsb-1014-proof-workspace-v1';
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const clone = <T>(value: T): T => structuredClone(value);

export const RULES = ['前提', '定义展开', '代入', '等式变形', '分配律', '同类项合并', '数学归纳', '反证法', '构造法', '结论'];

function sampleSteps(): ProofStep[] {
  return [
    { id: 's1', type: 'premise', statement: '$a,b$ 是实数', rule: '前提', references: [], note: '采用实数域中的交换律与分配律。', counterexample: '', alternative: '' },
    { id: 's2', type: 'derivation', statement: '$(a+b)^2=(a+b)(a+b)$', rule: '定义展开', references: ['s1'], note: '把平方写成两个相同因式之积。', counterexample: '', alternative: '' },
    { id: 's3', type: 'derivation', statement: '$(a+b)(a+b)=a^2+ab+ba+b^2$', rule: '分配律', references: ['s2'], note: '', counterexample: '', alternative: '也可先展开后半部分。' },
    { id: 's4', type: 'derivation', statement: '$a^2+ab+ba+b^2=a^2+2ab+b^2$', rule: '同类项合并', references: ['s3'], note: '由实数的交换律，$ab=ba$。', counterexample: '', alternative: '' },
    { id: 's5', type: 'goal', statement: '$(a+b)^2=a^2+2ab+b^2$', rule: '结论', references: ['s4'], note: '目标已由步骤 1 至 4 逐项推出。', counterexample: '', alternative: '' },
  ];
}

function issueSteps(): ProofStep[] {
  return [
    { id: 'i1', type: 'premise', statement: '$n$ 是正整数', rule: '前提', references: [], note: '', counterexample: '', alternative: '' },
    { id: 'i2', type: 'derivation', statement: '$P(1)$ 成立', rule: '前提', references: [], note: '归纳基例，但漏填了依据。', counterexample: '', alternative: '' },
    { id: 'i3', type: 'derivation', statement: '若 $P(k)$ 成立，则 $P(k+1)$ 也成立', rule: '数学归纳', references: ['missing-step'], note: '这里故意保留一个失效引用，用于演示检查。', counterexample: '', alternative: '' },
    { id: 'i4', type: 'goal', statement: '$P(n)$ 对所有整数 $n$ 成立', rule: '结论', references: ['i3'], note: '结论写成了“整数”，与证明目标“正整数”对不上。', counterexample: '', alternative: '' },
  ];
}

function initialDocuments(): ProofDocument[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'doc-algebra',
      title: '完全平方公式证明',
      author: '数学组',
      goal: '$(a+b)^2=a^2+2ab+b^2$',
      symbols: { a: '实数', b: '实数', P: '关于正整数的命题', n: '正整数', k: '正整数' },
      steps: sampleSteps(),
      versions: [],
      updatedAt: now,
    },
    {
      id: 'doc-induction',
      title: '数学归纳法待核对稿',
      author: '学生工作区',
      goal: '$P(n)$ 对所有正整数 $n$ 成立',
      symbols: { P: '关于正整数的命题', n: '正整数', k: '正整数' },
      steps: issueSteps(),
      versions: [],
      updatedAt: now,
    },
  ];
}

function loadDocuments(): ProofDocument[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialDocuments();
    const parsed = JSON.parse(raw) as ProofDocument[];
    return Array.isArray(parsed) && parsed.length ? parsed : initialDocuments();
  } catch {
    return initialDocuments();
  }
}

export class ProofStore {
  documents = loadDocuments();
  activeId = this.documents[0]?.id ?? '';
  selectedStepId = this.documents[0]?.steps[0]?.id ?? '';
  compareVersionId = '';
  dragStepId = '';
  lastInput: HTMLTextAreaElement | HTMLInputElement | null = null;
  undoStack: ProofDocument[][] = [];
  redoStack: ProofDocument[][] = [];
  toast = '';

  get current(): ProofDocument {
    return this.documents.find((item) => item.id === this.activeId) ?? this.documents[0];
  }

  get selectedStep(): ProofStep | undefined {
    return this.current?.steps.find((step) => step.id === this.selectedStepId);
  }

  get checks(): ProofCheck[] {
    if (!this.current) return [];
    return validate(this.current);
  }

  save(): void {
    this.current.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.documents));
  }

  update(mutator: (document: ProofDocument) => void): void {
    this.undoStack.push(clone(this.documents));
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack = [];
    mutator(this.current);
    this.save();
  }

  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(clone(this.documents));
    this.documents = previous;
    this.ensureSelection();
    this.save();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(clone(this.documents));
    this.documents = next;
    this.ensureSelection();
    this.save();
  }

  selectDocument(id: string): void {
    this.activeId = id;
    this.compareVersionId = '';
    this.selectedStepId = this.current?.steps[0]?.id ?? '';
  }

  selectStep(id: string): void {
    this.selectedStepId = id;
  }

  ensureSelection(): void {
    if (!this.documents.some((item) => item.id === this.activeId)) this.activeId = this.documents[0]?.id ?? '';
    if (!this.current?.steps.some((step) => step.id === this.selectedStepId)) {
      this.selectedStepId = this.current?.steps[0]?.id ?? '';
    }
  }

  addDocument(): void {
    const id = uid('doc');
    const document: ProofDocument = {
      id,
      title: '未命名证明',
      author: '本地用户',
      goal: '$A=B$',
      symbols: { A: '待定义对象', B: '待定义对象' },
      steps: [{ id: uid('step'), type: 'premise', statement: '在这里输入前提', rule: '前提', references: [], note: '', counterexample: '', alternative: '' }],
      versions: [],
      updatedAt: new Date().toISOString(),
    };
    this.undoStack.push(clone(this.documents));
    this.documents.unshift(document);
    this.activeId = id;
    this.selectedStepId = document.steps[0].id;
    this.save();
  }

  removeDocument(id: string): void {
    if (this.documents.length <= 1) {
      this.notify('至少保留一个证明文档');
      return;
    }
    this.undoStack.push(clone(this.documents));
    this.documents = this.documents.filter((item) => item.id !== id);
    this.ensureSelection();
    this.save();
  }

  addStep(type: ProofStep['type'] = 'derivation'): void {
    const step: ProofStep = {
      id: uid('step'),
      type,
      statement: type === 'goal' ? '$A=B$' : '输入新的推导式',
      rule: type === 'goal' ? '结论' : '等式变形',
      references: this.selectedStepId ? [this.selectedStepId] : [],
      note: '',
      counterexample: '',
      alternative: '',
    };
    this.update((document) => {
      const selectedIndex = document.steps.findIndex((item) => item.id === this.selectedStepId);
      document.steps.splice(type === 'goal' ? document.steps.length : selectedIndex + 1, 0, step);
    });
    this.selectedStepId = step.id;
  }

  removeStep(id: string): void {
    this.update((document) => {
      document.steps = document.steps.filter((step) => step.id !== id);
      document.steps.forEach((step) => {
        step.references = step.references.filter((reference) => reference !== id);
      });
    });
    this.ensureSelection();
  }

  moveStep(sourceId: string, targetId: string): void {
    if (sourceId === targetId) return;
    this.update((document) => {
      const from = document.steps.findIndex((step) => step.id === sourceId);
      const to = document.steps.findIndex((step) => step.id === targetId);
      if (from < 0 || to < 0) return;
      const [moved] = document.steps.splice(from, 1);
      document.steps.splice(to, 0, moved);
    });
  }

  updateStep(patch: Partial<ProofStep>): void {
    const id = this.selectedStepId;
    this.update((document) => {
      const step = document.steps.find((item) => item.id === id);
      if (step) Object.assign(step, patch);
    });
  }

  createVersion(): void {
    this.update((document) => {
      const version: ProofVersion = {
        id: uid('version'),
        name: `版本 ${document.versions.length + 1}`,
        createdAt: new Date().toISOString(),
        steps: clone(document.steps),
        goal: document.goal,
      };
      document.versions.unshift(version);
      this.compareVersionId = version.id;
    });
    this.notify('已保存当前证明快照');
  }

  notify(message: string): void {
    this.toast = message;
    window.setTimeout(() => {
      if (this.toast === message) {
        this.toast = '';
        redraw();
      }
    }, 2200);
  }
}

function stripLatexCommands(text: string): string {
  return text.replace(/\\[A-Za-z]+/g, ' ').replace(/[{}_^]/g, ' ');
}

function normalizeFormula(text: string): string {
  // 用于结论与目标的语义比对：去掉 $、分组括号与 LaTeX 间距命令后再忽略空白
  return text.replace(/[${}]/g, '').replace(/\\[,;:!]/g, '').replace(/\s+/g, '');
}

export function validate(document: ProofDocument): ProofCheck[] {
  const checks: ProofCheck[] = [];
  const ids = new Set(document.steps.map((step) => step.id));
  const indexOf = new Map(document.steps.map((step, index) => [step.id, index]));
  const symbolKeys = new Set(Object.keys(document.symbols));
  const ignored = new Set(['a', 'A', 'b', 'B', 'n', 'k', 'P', 'Q', 'R', 'x', 'y', 'to', 'text', 'frac', 'sqrt']);

  document.steps.forEach((step, index) => {
    const tokens = stripLatexCommands(step.statement).match(/\b[A-Za-z][A-Za-z0-9']*\b/g) ?? [];
    const unknown = [...new Set(tokens.filter((token) => !symbolKeys.has(token) && !ignored.has(token)))];
    if (unknown.length) {
      checks.push({ id: `symbol-${step.id}`, severity: 'warning', title: '发现未定义符号', detail: `步骤 ${index + 1} 使用了：${unknown.join('、')}`, stepId: step.id });
    }

    if (step.type === 'derivation' && step.references.length === 0) {
      checks.push({ id: `no-basis-${step.id}`, severity: 'error', title: '推导未填写依据', detail: `步骤 ${index + 1} 是推导步骤，却没有引用任何前置步骤作为依据。`, stepId: step.id });
    }

    step.references.forEach((reference) => {
      if (!ids.has(reference)) {
        checks.push({ id: `missing-${step.id}-${reference}`, severity: 'error', title: '引用步骤不存在', detail: `步骤 ${index + 1} 引用了已删除的步骤 ${reference}`, stepId: step.id });
        return;
      }
      const referenceIndex = indexOf.get(reference)!;
      if (referenceIndex > index) {
        checks.push({ id: `forward-${step.id}-${reference}`, severity: 'error', title: '引用了靠后的步骤', detail: `步骤 ${index + 1} 引用了步骤 ${referenceIndex + 1}，依据必须出现在当前步骤之前。`, stepId: step.id });
      }
    });
  });

  const graph = new Map(document.steps.map((step) => [step.id, step.references.filter((id) => ids.has(id))]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycleStep = new Set<string>();
  const visit = (id: string, path: string[]): boolean => {
    if (visiting.has(id)) {
      path.slice(path.indexOf(id)).forEach((item) => cycleStep.add(item));
      return true;
    }
    if (visited.has(id)) return false;
    visiting.add(id);
    const hasCycle = (graph.get(id) ?? []).some((next) => visit(next, [...path, id]));
    visiting.delete(id);
    visited.add(id);
    return hasCycle;
  };
  [...graph.keys()].forEach((id) => visit(id, []));
  if (cycleStep.size) {
    checks.push({ id: 'cycle', severity: 'error', title: '检测到循环引用', detail: '引用链形成闭环，请调整步骤关系。', stepId: [...cycleStep][0] });
  }

  const goalStep = document.steps.find((step) => step.type === 'goal' && step.rule === '结论');
  if (!goalStep) {
    checks.push({ id: 'goal-missing', severity: 'error', title: '目标未被证明', detail: '请添加“结论”类型的最终步骤。' });
  } else {
    if (goalStep.references.length === 0) {
      checks.push({ id: 'goal-unlinked', severity: 'warning', title: '结论尚无推导支撑', detail: '最终步骤没有引用任何前置步骤。', stepId: goalStep.id });
    } else {
      // 从结论沿引用链回溯，检查能否回到至少一个前提
      const reachable = new Set<string>();
      const stack = [...goalStep.references];
      while (stack.length) {
        const id = stack.pop()!;
        if (reachable.has(id)) continue;
        reachable.add(id);
        (graph.get(id) ?? []).forEach((previous) => stack.push(previous));
      }
      const hasPremiseRoot = document.steps.some((step) => step.type === 'premise' && reachable.has(step.id));
      if (!hasPremiseRoot) {
        checks.push({ id: 'goal-detached', severity: 'error', title: '结论回不到前提', detail: '从结论沿依据链回溯不到任何前提，推导链与出发点断开。', stepId: goalStep.id });
      }
    }

    // 结论式与证明目标逐字比对：即使依据链完整，也要单独提出
    if (normalizeFormula(goalStep.statement) !== normalizeFormula(document.goal)) {
      checks.push({ id: 'goal-mismatch', severity: 'error', title: '结论与证明目标不一致', detail: `结论步骤写作「${goalStep.statement.replace(/\$/g, '')}」，证明目标是「${document.goal.replace(/\$/g, '')}」。`, stepId: goalStep.id });
    }
  }

  if (!checks.some((check) => check.severity === 'error')) {
    checks.push({ id: 'proof-ok', severity: 'info', title: '结构检查通过', detail: '未发现缺失引用、循环引用或未证明目标。' });
  }
  return checks;
}

function stepSignature(step: ProofStep): string {
  return JSON.stringify([step.type, step.statement, step.rule, step.references, step.note, step.counterexample, step.alternative]);
}

// 求两个步骤序列（仅含共有步骤）的最长公共子序列，其中的步骤视为相对顺序未变。
// 这样在中间插入或删除一步时，其余步骤只会平移、不会被误报为挪动。
function longestCommonSubsequence(before: string[], after: string[]): Set<string> {
  const rows = before.length;
  const cols = after.length;
  const table: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(cols + 1).fill(0));
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      table[i][j] = before[i] === after[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const kept = new Set<string>();
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (before[i] === after[j]) {
      kept.add(before[i]);
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return kept;
}

export function compareVersion(document: ProofDocument, version: ProofVersion): ProofDiff[] {
  const result: ProofDiff[] = [];
  const beforeSteps = version.steps;
  const afterSteps = document.steps;
  const beforeById = new Map(beforeSteps.map((step, index) => [step.id, { step, index }]));
  const afterById = new Map(afterSteps.map((step, index) => [step.id, { step, index }]));

  const commonBefore = beforeSteps.filter((step) => afterById.has(step.id)).map((step) => step.id);
  const commonAfter = afterSteps.filter((step) => beforeById.has(step.id)).map((step) => step.id);
  const stable = longestCommonSubsequence(commonBefore, commonAfter);
  const movedIds = new Set(commonAfter.filter((id) => !stable.has(id)));

  // 去掉的步骤单独成组，按旧版本顺序列出
  beforeSteps.forEach((step, index) => {
    if (!afterById.has(step.id)) {
      result.push({ kind: 'removed', label: `步骤 ${index + 1}`, before: step.statement, after: '' });
    }
  });

  afterSteps.forEach((step, index) => {
    const previous = beforeById.get(step.id);
    if (!previous) {
      result.push({ kind: 'added', label: `步骤 ${index + 1}`, before: '', after: step.statement });
      return;
    }
    const moved = movedIds.has(step.id);
    const label = moved ? `步骤 ${previous.index + 1} → ${index + 1}` : `步骤 ${index + 1}`;
    if (stepSignature(previous.step) !== stepSignature(step)) {
      // 命题文字没变但规则/引用等变了，在右侧补一条提示，避免看起来像未改动
      const afterText = previous.step.statement === step.statement
        ? `${step.statement}（规则或引用有调整）`
        : step.statement;
      result.push({ kind: 'changed', label, before: previous.step.statement, after: afterText });
    } else if (moved) {
      result.push({ kind: 'moved', label, before: previous.step.statement, after: step.statement });
    } else {
      result.push({ kind: 'same', label: `步骤 ${index + 1}`, before: previous.step.statement, after: step.statement });
    }
  });

  if (version.goal !== document.goal) {
    result.push({ kind: 'changed', label: '证明目标', before: version.goal, after: document.goal });
  }
  return result;
}

export function createId(prefix: string): string {
  return uid(prefix);
}
