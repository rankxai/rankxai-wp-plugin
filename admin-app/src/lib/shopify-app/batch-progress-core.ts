export const BATCH_POLL_MS = 2000;
export interface BatchItem {
    ok: boolean;
    verified: boolean;
    message: string;
    label: string | null;
    changeId: string | null;
}
export interface BatchCountsView {
    applied: number;
    unconfirmed: number;
    failed: number;
}
export interface BatchState {
    batchId: string | null;
    status: 'running' | 'done' | 'failed';
    total: number;
    processed: number;
    counts: BatchCountsView;
    sentence: string | null;
    results: BatchItem[];
    freeAllowanceUsed: boolean | null;
}
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
function items(v: unknown): BatchItem[] {
    if (!Array.isArray(v))
        return [];
    return v.map((x) => {
        const r = rec(x);
        return {
            ok: r.ok === true,
            verified: r.verified === true,
            message: typeof r.message === 'string' ? r.message : '',
            label: typeof r.label === 'string' ? r.label : null,
            changeId: typeof r.changeId === 'string' ? r.changeId : null,
        };
    });
}
export function batchFromStart(raw: unknown): BatchState | null {
    const r = rec(raw);
    const batchId = typeof r.batchId === 'string' ? r.batchId : null;
    if (r.queued === true) {
        if (!batchId)
            return null;
        const total = num(r.total);
        return { batchId, status: 'running', total, processed: 0, counts: { applied: 0, unconfirmed: 0, failed: 0 }, sentence: null, results: [], freeAllowanceUsed: null };
    }
    const results = items(r.results);
    const applied = 'applied' in r ? num(r.applied) : num(r.undone);
    const counts = { applied, unconfirmed: num(r.unconfirmed), failed: num(r.failed) };
    const total = 'total' in r ? num(r.total) : Math.max(results.length, applied + counts.unconfirmed + counts.failed);
    return {
        batchId,
        status: 'done',
        total,
        processed: total,
        counts,
        sentence: typeof r.sentence === 'string' ? r.sentence : null,
        results,
        freeAllowanceUsed: typeof r.freeAllowanceUsed === 'boolean' ? r.freeAllowanceUsed : null,
    };
}
export function batchFromView(raw: unknown): BatchState | null {
    const b = rec(rec(raw).batch);
    if (typeof b.id !== 'string')
        return null;
    const status = b.status === 'done' ? 'done' : b.status === 'failed' ? 'failed' : 'running';
    const c = rec(b.counts);
    const total = num(b.total);
    return {
        batchId: b.id,
        status,
        total,
        processed: Math.min(num(b.processed), total),
        counts: { applied: num(c.applied), unconfirmed: num(c.unconfirmed), failed: num(c.failed) },
        sentence: typeof b.sentence === 'string' ? b.sentence : null,
        results: items(b.results),
        freeAllowanceUsed: typeof b.allowanceReleased === 'boolean' ? !b.allowanceReleased : null,
    };
}
export function batchSummary(s: BatchState, verb: 'saved' | 'put back', fmt: (n: number) => string = String): string {
    if (s.sentence)
        return s.sentence;
    if (s.status === 'failed')
        return `This stopped after ${fmt(s.processed)} of ${fmt(s.total)}. Every change that was made is listed in Changes.`;
    if (s.total === 0)
        return verb === 'put back' ? 'There was nothing left to put back.' : 'Nothing was changed.';
    const done = s.counts.applied + s.counts.unconfirmed;
    const parts = [`${fmt(done)} of ${fmt(s.total)} ${verb}`];
    if (s.counts.unconfirmed > 0)
        parts.push(`${fmt(s.counts.unconfirmed)} not yet confirmed on your store`);
    if (s.counts.failed > 0)
        parts.push(`${fmt(s.counts.failed)} not changed`);
    return `${parts.join(', ')}.`;
}
export function canUndoBatch(s: BatchState, kind: 'apply' | 'undo'): boolean {
    return kind === 'apply' && s.status !== 'running' && s.batchId !== null && s.counts.applied + s.counts.unconfirmed > 0;
}
export function failedItems(s: BatchState): BatchItem[] {
    return s.results.filter((r) => !r.ok);
}
