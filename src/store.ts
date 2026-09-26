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
    { id: 'i2', type: 'derivation', statement: '$P(1)$ 成立', rule: '代入', references: ['i3'], note: '归纳基例；引用了排在后面的步骤 i3，顺序颠倒。', counterexample: '', alternative: '' },
    { id: 'i3', type: 'derivation', statement: '若 $P(k)$ 成立，则 $P(k+1)$ 也成立', rule: '数学归纳', references: ['i1', 'missing-step'], note: '这里故意保留一个失效引用，用于演示检查。', counterexample: '', alternative: '' },
    { id: 'i4', type: 'derivation', statement: '$P(n)$ 对所有正整数 $n$ 成立', rule: '等式变形', references: [], note: '这一步没有填写任何引用依据。', counterexample: '', alternative: '' },
    { id: 'i5', type: 'goal', statement: '$P(n+1)$ 对所有正整数 $n$ 成立', rule: '结论', references: ['i4'], note: '依据链在 i4 处断掉，且结论式与证明目标并不一致。', counterexample: '', alternative: '' },
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

export function normalizeFormula(text: string): string {
  return text
    .replace(/\$+/g, ' ')
    .replace(/\\(?:quad|qquad|,|;|:|!|hspace\{[^}]*\}|space|enspace)\b/g, ' ')
    .replace(/\\(?:left|right|big|Big|displaystyle|limits|nolimits|mathrm|mathbf)\b/g, ' ')
    .replace(/\\[A-Za-z]+/g, ' ')
    .replace(/[\s{}]+/g, '')
    .trim();
}

export function validate(document: ProofDocument): ProofCheck[] {
  const checks: ProofCheck[] = [];
  const ids = new Set(document.steps.map((step) => step.id));
  const symbolKeys = new Set(Object.keys(document.symbols));
  const ignored = new Set(['a', 'A', 'b', 'B', 'n', 'k', 'P', 'Q', 'R', 'x', 'y', 'to', 'text', 'frac', 'sqrt']);
  const stepNumber = new Map(document.steps.map((step, index) => [step.id, index + 1]));

  // 未定义符号；同时收集结构层面的引用问题。
  document.steps.forEach((step, index) => {
    const tokens = stripLatexCommands(step.statement).match(/\b[A-Za-z][A-Za-z0-9']*\b/g) ?? [];
    const unknown = [...new Set(tokens.filter((token) => !symbolKeys.has(token) && !ignored.has(token)))];
    if (unknown.length) {
      checks.push({ id: `symbol-${step.id}`, severity: 'warning', title: '发现未定义符号', detail: `步骤 ${index + 1} 使用了：${unknown.join('、')}`, stepId: step.id });
    }

    step.references.forEach((reference) => {
      if (!ids.has(reference)) {
        checks.push({ id: `missing-${step.id}-${reference}`, severity: 'error', title: '引用步骤不存在', detail: `步骤 ${index + 1} 引用了已删除的步骤 ${reference}`, stepId: step.id });
      }
    });
  });

  // 有效引用图：剔除指向不存在步骤的引用。
  const graph = new Map(document.steps.map((step) => [step.id, step.references.filter((id) => ids.has(id))]));

  // ① 推导步骤一条依据都不填。
  document.steps.forEach((step, index) => {
    if (step.type === 'derivation' && step.references.length === 0) {
      checks.push({ id: `no-justification-${step.id}`, severity: 'error', title: '推导未填写依据', detail: `步骤 ${index + 1} 是推导步骤，却没有引用任何前置步骤。`, stepId: step.id });
    }
  });

  // ② 引用了排在自己后面的步骤（前瞻引用）。
  document.steps.forEach((step, index) => {
    const forward = step.references
      .filter((reference) => ids.has(reference) && (stepNumber.get(reference) ?? 0) > index + 1)
      .map((reference) => `步骤 ${stepNumber.get(reference)}`);
    if (forward.length) {
      checks.push({ id: `forward-ref-${step.id}`, severity: 'error', title: '引用了后面的步骤', detail: `步骤 ${index + 1} 引用了排在其后的 ${forward.join('、')}，依据必须来自先前步骤。`, stepId: step.id });
    }
  });

  const cycleStep = detectCycle(graph);
  if (cycleStep.size) {
    checks.push({ id: 'cycle', severity: 'error', title: '检测到循环引用', detail: '引用链形成闭环，请调整步骤关系。', stepId: [...cycleStep][0] });
  }

  // 前提天然有据；其余步骤的依据可沿引用链回溯到前提才算有据。
  const grounded = new Set<string>();
  document.steps.forEach((step) => {
    if (step.type === 'premise') grounded.add(step.id);
  });
  let changed = true;
  while (changed) {
    changed = false;
    document.steps.forEach((step) => {
      if (grounded.has(step.id)) return;
      const deps = graph.get(step.id) ?? [];
      if (deps.length > 0 && deps.every((dep) => grounded.has(dep))) {
        grounded.add(step.id);
        changed = true;
      }
    });
  }

  const goalSteps = document.steps.filter((step) => step.type === 'goal');
  if (goalSteps.length === 0) {
    checks.push({ id: 'goal-missing', severity: 'error', title: '目标未被证明', detail: '请添加“结论”类型的最终步骤。' });
  }

  goalSteps.forEach((goal) => {
    const number = stepNumber.get(goal.id) ?? 0;

    // ③ 结论顺着依据回不到前提：找出结论所依赖、但无法落地到前提的环节。
    const closure = new Set<string>();
    const stack = [goal.id];
    while (stack.length) {
      const current = stack.pop() ?? '';
      if (closure.has(current)) continue;
      closure.add(current);
      (graph.get(current) ?? []).forEach((dep) => stack.push(dep));
    }
    closure.delete(goal.id);
    const broken = [...closure].filter((id) => !grounded.has(id));
    if (!grounded.has(goal.id) && broken.length) {
      const labels = broken
        .sort((a, b) => (stepNumber.get(b) ?? 0) - (stepNumber.get(a) ?? 0))
        .map((id) => `步骤 ${stepNumber.get(id)}`)
        .join('、');
      checks.push({
        id: `ungrounded-${goal.id}`,
        severity: 'error',
        title: '依据链回不到前提',
        detail: `步骤 ${number} 的依据链在 ${labels} 处中断，无法沿引用回溯到任何前提。`,
        stepId: goal.id,
      });
    }

    // ④ 结论式与证明目标不一致；即使依据链完整也单独报告。
    if (normalizeFormula(goal.statement) !== normalizeFormula(document.goal)) {
      checks.push({
        id: `goal-mismatch-${goal.id}`,
        severity: 'error',
        title: '结论式与证明目标不一致',
        detail: `步骤 ${number} 推出的结论与声明的证明目标“${document.goal}”不一致。`,
        stepId: goal.id,
      });
    }
  });

  if (!checks.some((check) => check.severity === 'error')) {
    checks.push({ id: 'proof-ok', severity: 'info', title: '结构检查通过', detail: '未发现缺失依据、失效引用或目标偏差。' });
  }
  return checks;
}

function detectCycle(graph: Map<string, string[]>): Set<string> {
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
  return cycleStep;
}

// 步骤的“内容指纹”：同一条步骤内容是否被编辑过（位置变化不计入）。
function stepSignature(step: ProofStep): string {
  return JSON.stringify([
    step.type,
    step.statement,
    step.rule,
    [...step.references].sort(),
    step.note,
    step.counterexample,
    step.alternative,
  ]);
}

export function compareVersion(document: ProofDocument, version: ProofVersion): ProofDiff[] {
  const beforeMap = new Map(version.steps.map((step, index) => [step.id, { step, index }]));
  const afterMap = new Map(document.steps.map((step, index) => [step.id, { step, index }]));
  const rows: ProofDiff[] = [];

  // 以当前版本顺序为主线：未变 / 修改 / 挪动。
  document.steps.forEach((step, afterIndex) => {
    const previous = beforeMap.get(step.id);
    if (!previous) {
      rows.push({ kind: 'added', label: `步骤 ${afterIndex + 1}（新增）`, before: '', after: step.statement, afterIndex });
      return;
    }
    const moved = previous.index !== afterIndex;
    const changedContent = stepSignature(previous.step) !== stepSignature(step);
    if (changedContent) {
      rows.push({ kind: 'changed', label: `步骤 ${afterIndex + 1}（修改）`, before: previous.step.statement, after: step.statement, beforeIndex: previous.index, afterIndex });
    } else if (moved) {
      rows.push({ kind: 'moved', label: `步骤 ${afterIndex + 1}（挪动自步骤 ${previous.index + 1}）`, before: previous.step.statement, after: step.statement, beforeIndex: previous.index, afterIndex });
    } else {
      rows.push({ kind: 'same', label: `步骤 ${afterIndex + 1}`, before: step.statement, after: step.statement, afterIndex });
    }
  });

  // 旧版本有、当前没有的：删除。
  version.steps.forEach((step, beforeIndex) => {
    if (!afterMap.has(step.id)) {
      rows.push({ kind: 'removed', label: `原步骤 ${beforeIndex + 1}（删除）`, before: step.statement, after: '', beforeIndex });
    }
  });

  return rows;
}

export function createId(prefix: string): string {
  return uid(prefix);
}
