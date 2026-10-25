import { useState } from 'react';
import { APP_PATHS } from '@/lib/shopify-app/app-routes-core';
import { imageChangeText } from '@/lib/shopify-app/image-studio-choices';
import { api, toastSuccess } from '../api';
import { fmtCount, fmtDate, fmtNumber } from '../format';
import { BackLink, ErrorBanner, ViewTabs, act, useLoad, usePagedRows, usePageError } from '../kit';
import { BatchProgress, useBatch } from '../components/BatchProgress';
import { SkeletonSection, StatusBadge, type StatusKey } from '../components/Status';
import { FixOutcome } from './FixOutcome';
import * as UI from '../ui';
interface Change {
    id: string;
    batchId: string;
    kind: string;
    label: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    status: 'applied' | 'applied_unverified' | 'failed' | 'undone' | 'undo_failed';
    message: string | null;
    undoMessage: string | null;
    createdAt: string;
    undoneAt: string | null;
    canUndo: boolean;
    treatsProduct: boolean;
}
const STATUS: Record<Change['status'], {
    status: StatusKey;
    label?: string;
}> = {
    applied: { status: 'saved' },
    applied_unverified: { status: 'saved_unconfirmed', label: 'Saved, not confirmed' },
    failed: { status: 'not_saved' },
    undone: { status: 'undone' },
    undo_failed: { status: 'not_saved', label: 'Undo did not complete' },
};
const LABEL: Record<string, string> = {
    seoTitle: 'Search title', seoDescription: 'Search description', alt: 'Alt text', description: 'Description', score: 'Content score',
    path: 'From', target: 'To', categoryName: 'Category', barcode: 'Barcode', values: 'Values',
};
const HIDDEN = new Set(['category', 'productId']);
function show(v: Record<string, unknown> | null, kind: string): string {
    if (kind === 'visibility')
        return v && v.seoHidden === true ? 'Hidden from search engines' : 'Shown to search engines';
    const empty = kind === 'category' ? 'No category' : kind === 'gtin' ? 'No barcode' : '(empty)';
    if (!v)
        return empty;
    const parts = Object.entries(v)
        .filter(([k, x]) => !HIDDEN.has(k) && x !== null && x !== undefined && x !== '')
        .map(([k, x]) => `${LABEL[k] ?? k}: ${(Array.isArray(x) ? x.join(', ') : String(x)).slice(0, 200)}`);
    return parts.length ? parts.join(' · ') : empty;
}
interface BatchGroup {
    batchId: string;
    createdAt: string;
    changes: Change[];
    open: number;
}
function groups(list: Change[]): BatchGroup[] {
    const by = new Map<string, BatchGroup>();
    for (const c of list) {
        const g = by.get(c.batchId) ?? { batchId: c.batchId, createdAt: c.createdAt, changes: [], open: 0 };
        g.changes.push(c);
        if (c.canUndo)
            g.open++;
        by.set(c.batchId, g);
    }
    return [...by.values()];
}
function noOutcomeReason(changes: Change[]): string {
    if (changes.every((c) => c.status === 'failed'))
        return 'Not applied';
    if (changes.every((c) => c.status === 'undone' || c.status === 'failed'))
        return 'Undone';
    return 'Not a product change';
}
type View = 'fixes' | 'all';
export function ChangesPage() {
    const changes = useLoad<{
        changes: Change[];
    }>('changes');
    const [error, setError] = usePageError();
    const [busy, setBusy] = useState<string | null>(null);
    const [picked, setPicked] = useState<View | null>(null);
    const batch = useBatch(() => void changes.reload());
    const list = changes.data?.changes ?? [];
    const batches = groups(list);
    const several = batches.filter((g) => g.changes.length > 1 || g.changes.some((c) => c.treatsProduct));
    const view: View = picked ?? (several.length > 0 ? 'fixes' : 'all');
    const fixesPage = usePagedRows(several);
    const allPage = usePagedRows(list);
    async function undoBatch(g: BatchGroup) {
        const r = await act(() => api(`changes/batches/${g.batchId}/undo`, { method: 'POST' }), (b) => setBusy(b ? `batch:${g.batchId}` : null), setError);
        if (r.ok)
            batch.begin(r.data, 'undo');
    }
    return (<UI.Page heading="Changes" inlineSize="large">
      
      <BackLink href={APP_PATHS.settings} label="Settings"/>
      <ErrorBanner error={error ?? changes.error} onDismiss={error ? () => setError(null) : undefined}/>
      {!changes.data && changes.loading ? <SkeletonSection lines={5} label="Loading your changes"/> : null}
      {batch.state ? (<UI.Section>
          <BatchProgress handle={batch} setError={setError} heading="Undo all"/>
        </UI.Section>) : null}
      {changes.data && list.length === 0 ? (<UI.Section>
          <UI.EmptyState heading="No changes yet">
            <UI.Paragraph>Every change RankX AI makes to your store is listed here, with what it was before, so you can undo it.</UI.Paragraph>
            <UI.Button slot="primary-action" href={APP_PATHS.products}>
              Go to Products
            </UI.Button>
          </UI.EmptyState>
        </UI.Section>) : null}
      {list.length > 0 ? (<ViewTabs>
          <UI.PressButton pressed={view === 'fixes'} disabled={several.length === 0 || undefined} onClick={() => setPicked('fixes')}>
            {`Fixes and results (${fmtNumber(several.length)})`}
          </UI.PressButton>
          <UI.PressButton pressed={view === 'all'} onClick={() => setPicked('all')}>
            {`Every change (${fmtNumber(list.length)})`}
          </UI.PressButton>
        </ViewTabs>) : null}
      
      {view === 'fixes' && several.length > 0 ? (<UI.Section heading="Fixes and results">
          <UI.Table variant="auto" {...fixesPage.tableProps}>
            <UI.TableHeaderRow>
              <UI.TableHeader listSlot="primary">Changes</UI.TableHeader>
              <UI.TableHeader listSlot="labeled">When</UI.TableHeader>
              <UI.TableHeader listSlot="secondary">Did it work?</UI.TableHeader>
              <UI.TableHeader listSlot="inline">Action</UI.TableHeader>
            </UI.TableHeaderRow>
            <UI.TableBody>
              {fixesPage.rows.map((g) => {
                const outcomeOn = g.changes.find((c) => c.treatsProduct && c.status !== 'failed' && c.status !== 'undone');
                return (<UI.TableRow key={g.batchId}>
                    <UI.TableCell>
                      <UI.Stack gap="small-100">
                        <UI.Text type="strong">{g.changes.length === 1 ? g.changes[0]!.label : `${g.changes[0]!.label} and ${fmtCount(g.changes.length - 1, 'more', 'more')}`}</UI.Text>
                        
                        <UI.Text color="subdued">{g.open === 0 && !outcomeOn ? fmtCount(g.changes.length, 'change', 'changes') : `${fmtCount(g.changes.length, 'change', 'changes')}, ${fmtCount(g.open, 'can be undone', 'can be undone')}`}</UI.Text>
                      </UI.Stack>
                    </UI.TableCell>
                    <UI.TableCell>{fmtDate(g.createdAt)}</UI.TableCell>
                    <UI.TableCell>{outcomeOn ? <FixOutcome batchId={g.batchId}/> : <UI.Badge>{noOutcomeReason(g.changes)}</UI.Badge>}</UI.TableCell>
                    <UI.TableCell>
                      {g.open > 1 ? (<UI.Button disabled={busy !== null || undefined} loading={busy === `batch:${g.batchId}` || undefined} onClick={() => void undoBatch(g)}>
                          {`Undo all ${g.open}`}
                        </UI.Button>) : null}
                    </UI.TableCell>
                  </UI.TableRow>);
            })}
            </UI.TableBody>
          </UI.Table>
        </UI.Section>) : null}
      {view === 'all' && list.length > 0 ? (<UI.Section heading="Every change">
          
          <UI.Table variant="auto" {...allPage.tableProps}>
            <UI.TableHeaderRow>
              <UI.TableHeader listSlot="primary">Change</UI.TableHeader>
              <UI.TableHeader listSlot="labeled">Before</UI.TableHeader>
              <UI.TableHeader listSlot="labeled">After</UI.TableHeader>
              <UI.TableHeader listSlot="inline">Status</UI.TableHeader>
              <UI.TableHeader listSlot="inline">Action</UI.TableHeader>
            </UI.TableHeaderRow>
            <UI.TableBody>
              {allPage.rows.map((c) => (<UI.TableRow key={c.id}>
                  <UI.TableCell>
                    <UI.Stack gap="small-100">
                      <UI.Text type="strong">{c.label}</UI.Text>
                      <UI.Text color="subdued">{fmtDate(c.createdAt)}</UI.Text>
                      {c.status === 'undo_failed' && c.undoMessage ? <UI.Text color="subdued">{c.undoMessage}</UI.Text> : null}
                    </UI.Stack>
                  </UI.TableCell>
                  <UI.TableCell>{c.kind === 'image_add' ? imageChangeText(c.before, 'before') : show(c.before, c.kind)}</UI.TableCell>
                  <UI.TableCell>{c.kind === 'image_add' ? imageChangeText(c.after, 'after') : show(c.after, c.kind)}</UI.TableCell>
                  <UI.TableCell>
                    <StatusBadge status={STATUS[c.status].status} label={STATUS[c.status].label}/>
                  </UI.TableCell>
                  <UI.TableCell>
                    {c.canUndo ? (<UI.Button variant="tertiary" disabled={busy !== null || undefined} loading={busy === c.id || undefined} onClick={() => void act(() => api(`changes/${c.id}/undo`, { method: 'POST' }), (b) => setBusy(b ? c.id : null), setError).then(async (r) => {
                        if (r.ok)
                            toastSuccess('Change undone');
                        await changes.reload();
                    })}>
                        Undo
                      </UI.Button>) : null}
                  </UI.TableCell>
                </UI.TableRow>))}
            </UI.TableBody>
          </UI.Table>
        </UI.Section>) : null}
    </UI.Page>);
}
