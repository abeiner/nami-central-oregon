import type { Benefit, BenefitItem, Selection, SiteContent, Tier } from './contract';

export const money = (n: number, plus = false) =>
  '$' + n.toLocaleString('en-US') + (plus ? '+' : '');

export const fmtDate = (iso: string | null | undefined, opts?: Intl.DateTimeFormatOptions) =>
  iso
    ? new Date(iso).toLocaleDateString('en-US', opts ?? { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

export const addDays = (iso: string, days: number) => {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
};

export const daysUntil = (iso: string) =>
  Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);

/** All benefits of an annual tier, lowest level first, including inherited ones. */
export function tierBenefits(content: SiteContent, tierId: string): Benefit[] {
  const chain: Tier[] = [];
  let t = content.tiers.find((x) => x.id === tierId);
  while (t) {
    chain.unshift(t);
    t = t.includes ? content.tiers.find((x) => x.id === t!.includes) : undefined;
  }
  return chain.flatMap((x) => x.benefits);
}

export function selectionBenefits(content: SiteContent, sel: Selection): Benefit[] {
  if (sel.kind === 'annual') return tierBenefits(content, sel.id);
  const [projectId, levelId] = sel.id.split(':');
  const level = content.projects.find((p) => p.id === projectId)?.levels.find((l) => l.id === levelId);
  return level?.benefits ?? [];
}

/** Checklist generated at commitment time. Mirrors what the API does. */
export function buildChecklist(content: SiteContent, selections: Selection[], fromIso: string): BenefitItem[] {
  const seen = new Set<string>();
  const out: BenefitItem[] = [];
  for (const sel of selections) {
    for (const b of selectionBenefits(content, sel)) {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      out.push({ id: b.id, label: b.label, dueAt: addDays(fromIso, b.dueInDays), doneAt: null, staffMinutes: b.staffMinutes });
    }
  }
  return out.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

/** Resolve a selection id ("sustaining" or "resource-guide:presenting") against content. */
export function resolveSelection(content: SiteContent, id: string): Selection | null {
  if (id.includes(':')) {
    const [projectId, levelId] = id.split(':');
    const project = content.projects.find((p) => p.id === projectId);
    const level = project?.levels.find((l) => l.id === levelId);
    if (!project || !level) return null;
    return {
      kind: project.kind === 'namiwalks' ? 'namiwalks' : 'project',
      id,
      label: project.kind === 'namiwalks' ? level.name : `${project.name}: ${level.name}`,
      amount: level.amount,
    };
  }
  const tier = content.tiers.find((t) => t.id === id);
  return tier ? { kind: 'annual', id, label: tier.name, amount: tier.amount } : null;
}

export const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? '';

export function mergeTemplate(text: string, vars: Record<string, string>) {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, k: string) => vars[k] ?? m);
}

export const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
