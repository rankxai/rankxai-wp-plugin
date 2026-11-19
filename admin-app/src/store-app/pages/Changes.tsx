import { useState } from 'react';
import { APP_PATHS } from '@/lib/shopify-app/app-routes-core';
import { CHANGES_STEP } from '@/lib/shopify-app/undo-core';
import { imageChangeText } from '@/lib/shopify-app/image-studio-choices';
import { api, toastSuccess } from '../api';
import { fmtCount, fmtDate, fmtNumber } from '../format';
import { BackLink, ErrorBanner, ViewTabs, act, useLoad, usePagedRows, usePageError } from '../kit';
import { changeValueText } from '../change-text';
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
    articleHref?: string;
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
interface BatchGroup {
    batchId: string;
    createdAt: string;
    changes: Change[];
    open: number;
    total: number;
}
type BatchCounts = Record<string, {
    total: number;
    open: number;
}>;
interface ChangeList {
    changes: Change[];
    hasMore?: boolean;
    batchCounts?: BatchCounts;
}
function groups(list: Change[], counts: BatchCounts): BatchGroup[] {
    const by = new Map<string, BatchGroup>();
    for (const c of list) {
        const g = by.get(c.batchId) ?? { batchId: c.batchId, createdAt: c.createdAt, changes: [], open: 0, total: 0 };
        g.changes.push(c);
        if (c.canUndo)
            g.open++;
        g.total++;
        by.set(c.batchId, g);
    }
    return [...by.values()].map((g) => ({ ...g, ...(counts[g.batchId] ?? {}) }));
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
    const changes = useLoad<ChangeList>('changes');
    const data = changes.data;
    const [limit, setLimit] = useState(CHANGES_STEP);
    const [readingMore, setReadingMore] = useState(false);
    const [error, setError] = usePageError();
    const [busy, setBusy] = useState<string | null>(null);
    const [picked, setPicked] = useState<View | null>(null);
    async function readTo(n: number) {
        setReadingMore(true);
        const r = await api<ChangeList>(`changes?limit=${n}`);
        setReadingMore(false);
        if (r.ok && r.data) {
            changes.replace(r.data);
            setLimit(n);
        }
        else
            setError({ message: r.error ?? 'We could not read your changes just now.', planLink: false });
    }
    const refresh = () => (limit === CHANGES_STEP ? changes.reload() : readTo(limit));
    const batch = useBatch(() => void refresh());
    const list = data?.changes ?? [];
    const batches = groups(list, data?.batchCounts ?? {});
    const several = batches.filter((g) => g.changes.length > 1 || g.changes.some((c) => c.treatsProduct));
    const view: View = picked ?? (several.length > 0 ? 'fixes' : 'all');
    const fixesPage = usePagedRows(several);
    const allPage = usePagedRows(list);
    async function undoOne(c: Change) {
        const r = await act(() => api(`changes/${c.id}/undo`, { method: 'POST' }), (b) => setBusy(b ? c.id : null), setError);
        if (r.ok)
            toastSuccess('Change undone');
        await refresh();
    }
    async function undoBatch(g: BatchGroup) {
        const r = await act(() => api(`changes/batches/${g.batchId}/undo`, { method: 'POST' }), (b) => setBusy(b ? `batch:${g.batchId}` : null), setError);
        if (r.ok)
            batch.begin(r.data, 'undo');
    }
    return (<UI.Page heading="Changes" inlineSize="large">
      
      <BackLink href={APP_PATHS.settings} label="Settings"/>
      <ErrorBanner error={error ?? changes.error} onDismiss={error ? () => setError(null) : undefined}/>
      {!data && changes.loading ? <SkeletonSection lines={5} label="Loading your changes"/> : null}
      {batch.state ? (<UI.Section>
          <BatchProgress handle={batch} setError={setError} heading="Undo all"/>
        </UI.Section>) : null}
      {data && list.length === 0 ? (<UI.Section>
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
                const onlyOpen = g.open === 1 ? g.changes.find((c) => c.canUndo) : undefined;
                return (<UI.TableRow key={g.batchId}>
                    <UI.TableCell>
                      <UI.Stack gap="small-100">
                        <UI.Text type="strong">{g.changes.length === 1 ? g.changes[0]!.label : `${g.changes[0]!.label} and ${fmtCount(g.changes.length - 1, 'more', 'more')}`}</UI.Text>
                        
                        <UI.Text color="subdued">{g.open === 0 && !outcomeOn ? fmtCount(g.total, 'change', 'changes') : `${fmtCount(g.total, 'change', 'changes')}, ${fmtCount(g.open, 'can be undone', 'can be undone')}`}</UI.Text>
                      </UI.Stack>
                    </UI.TableCell>
                    <UI.TableCell>{fmtDate(g.createdAt)}</UI.TableCell>
                    <UI.TableCell>{outcomeOn ? <FixOutcome batchId={g.batchId}/> : <UI.Badge>{noOutcomeReason(g.changes)}</UI.Badge>}</UI.TableCell>
                    <UI.TableCell>
                      {g.open > 1 ? (<UI.Button disabled={busy !== null || undefined} loading={busy === `batch:${g.batchId}` || undefined} onClick={() => void undoBatch(g)}>
                          {`Undo all ${g.open}`}
                        </UI.Button>) : onlyOpen ? (<UI.Button disabled={busy !== null || undefined} loading={busy === onlyOpen.id || undefined} accessibilityLabel={`Undo: ${onlyOpen.label}`} onClick={() => void undoOne(onlyOpen)}>
                          Undo
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
                      
                      {c.kind === 'attribute' && c.canUndo ? <UI.Text color="subdued">Undo takes this off the product. A value added to your store’s list stays there.</UI.Text> : null}
                    </UI.Stack>
                  </UI.TableCell>
                  <UI.TableCell>{c.kind === 'image_add' ? imageChangeText(c.before, 'before') : changeValueText(c.before, c.kind)}</UI.TableCell>
                  <UI.TableCell>{c.kind === 'image_add' ? imageChangeText(c.after, 'after') : changeValueText(c.after, c.kind)}</UI.TableCell>
                  <UI.TableCell>
                    <StatusBadge status={STATUS[c.status].status} label={STATUS[c.status].label}/>
                  </UI.TableCell>
                  <UI.TableCell>
                    {c.canUndo ? (<UI.Button variant="tertiary" disabled={busy !== null || undefined} loading={busy === c.id || undefined} onClick={() => void undoOne(c)}>
                        Undo
                      </UI.Button>) : c.articleHref ? (<UI.Link href={c.articleHref}>Open article</UI.Link>) : null}
                  </UI.TableCell>
                </UI.TableRow>))}
            </UI.TableBody>
          </UI.Table>
        </UI.Section>) : null}
      {data?.hasMore ? (<UI.Section>
          <UI.Button disabled={readingMore || undefined} loading={readingMore || undefined} onClick={() => void readTo(limit + CHANGES_STEP)}>
            Show earlier changes
          </UI.Button>
        </UI.Section>) : null}
    </UI.Page>);
}
