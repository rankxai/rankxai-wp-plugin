import { useStore } from '../plan-context';
import type { StoreWords } from '../vocabulary';
import { useMemo, useState } from 'react';
import { APP_PATHS, contentItemHref } from '@/lib/shopify-app/app-routes-core';
import { api, toastSuccess } from '../api';
import { fmtNumber } from '../format';
import { act, creditsLabel, useLoad, usePagedRows, type PageError } from '../kit';
import { SkeletonSection } from '../components/Status';
import * as UI from '../ui';
type ContentType = 'article' | 'page' | 'product' | 'collection';
export interface ContentListData {
    items: Array<{
        type: ContentType;
        num: string;
        title: string;
        url: string | null;
        published: boolean | null;
        score: number;
        words: number;
        gapCount: number;
        topGaps: Array<{
            label: string;
            impact: 'high' | 'medium' | 'low';
        }>;
        canUpgrade: boolean;
        upgrade: {
            id: string;
            status: string;
            scoreBefore: number | null;
            scoreAfter: number | null;
            createdAt: string;
        } | null;
    }>;
    unread: ContentType[];
    truncated: ContentType[];
    limits: Record<ContentType, number>;
    prices: Record<ContentType, number | null>;
    canUpgrade: boolean;
}
function joinAnd(parts: string[]): string {
    return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
export function typeLabel(type: ContentType, words: StoreWords): string {
    return type === 'collection' ? words.collection.charAt(0).toUpperCase() + words.collection.slice(1) : TYPE_LABEL[type];
}
const TYPE_LABEL: Record<Exclude<ContentType, 'collection'>, string> = { article: 'Blog post', page: 'Page', product: 'Product' };
function typePlural(type: ContentType, words: StoreWords): string {
    return type === 'collection' ? words.collections : { article: 'blog posts', page: 'pages', product: 'products' }[type];
}
const FILTERS: ReadonlyArray<{
    id: 'all' | ContentType;
    label: string;
}> = [
    { id: 'all', label: 'All' },
    { id: 'article', label: 'Blog posts' },
    { id: 'page', label: 'Pages' },
    { id: 'product', label: 'Products' },
    { id: 'collection', label: 'Collections' },
];
function ContentFigure({ label, value }: {
    label: string;
    value: string;
}) {
    return (<UI.Box padding="small-300" border="base" borderRadius="base">
      <UI.Stack gap="small-100">
        <UI.Text color="subdued">{label}</UI.Text>
        <UI.Heading fontSize="large-300" accessibilityRole="presentation">{value}</UI.Heading>
      </UI.Stack>
    </UI.Box>);
}
export function ScoreBadge({ score }: {
    score: number;
}) {
    return <UI.Badge tone={score >= 90 ? 'success' : score >= 70 ? 'caution' : 'warning'}>{`${score}/100`}</UI.Badge>;
}
export function upgradeStateLabel(status: string): string | null {
    switch (status) {
        case 'queued':
        case 'writing':
            return 'Upgrade being written';
        case 'ready':
            return 'Upgrade ready to review';
        case 'applying':
            return 'Applying';
        case 'applied':
        case 'applied_unverified':
            return 'Upgrade applied';
        case 'failed':
            return 'Upgrade stopped';
        case 'undone':
            return 'Upgrade undone';
        default:
            return null;
    }
}
export function ContentTab({ setError }: {
    setError: (e: PageError | null) => void;
}) {
    const { words } = useStore();
    const load = useLoad<ContentListData>('content');
    const [filter, setFilter] = useState<'all' | ContentType>('all');
    const [busy, setBusy] = useState(false);
    const d = load.data;
    const items = useMemo(() => (d ? d.items.filter((i) => filter === 'all' || i.type === filter).sort((a, b) => a.score - b.score) : []), [d, filter]);
    const ready = d ? d.items.filter((i) => i.upgrade?.status === 'ready').length : 0;
    const paged = usePagedRows(items);
    async function applyAll() {
        const r = await act(() => api<{
            applied: number;
            failed: Array<{
                message: string;
            }>;
        }>('content/upgrades/apply-all', { method: 'POST' }), setBusy, setError);
        if (r.ok && r.data) {
            toastSuccess(r.data.applied === 1 ? 'One upgrade applied' : `${r.data.applied} upgrades applied`);
            if (r.data.failed.length > 0)
                setError({ message: `${r.data.failed.length} could not be applied: ${r.data.failed[0]!.message}`, planLink: false });
            await load.reload();
        }
    }
    if (!d)
        return load.error ? null : <SkeletonSection lines={6}/>;
    const weak = d.items.filter((i) => i.score < 90).length;
    const average = d.items.length > 0 ? Math.round(d.items.reduce((n, i) => n + i.score, 0) / d.items.length) : null;
    const gapCounts = new Map<string, number>();
    for (const i of d.items)
        for (const g of i.topGaps)
            gapCounts.set(g.label, (gapCounts.get(g.label) ?? 0) + 1);
    const commonGaps = [...gapCounts].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const countOf = (t: 'all' | ContentType) => (t === 'all' ? d.items.length : d.items.filter((i) => i.type === t).length);
    return (<UI.Section heading="Content">
      <UI.Stack gap="base">
        <UI.Paragraph>
          {`What stands between your content and Google and AI answers, checked for free: a short answer AI assistants can quote, questions as headings, an FAQ, enough detail, search titles and descriptions, and links to your products. ${weak === 0 ? 'Everything checked is in good shape.' : `${weak} of ${d.items.length} could do better.`}`}
        </UI.Paragraph>
        <UI.QueryContainer>
          <UI.Grid gridTemplateColumns="@container (inline-size > 640px) 1fr 1fr 1fr 1fr, 1fr 1fr" gap="small-200">
            <ContentFigure label="Average score" value={average === null ? '—' : `${average}/100`}/>
            <ContentFigure label="Items checked" value={fmtNumber(d.items.length)}/>
            <ContentFigure label="Could do better" value={fmtNumber(weak)}/>
            <ContentFigure label="Upgrades ready" value={fmtNumber(ready)}/>
          </UI.Grid>
        </UI.QueryContainer>
        {commonGaps.length > 0 ? (<UI.Stack gap="small-200">
            <UI.Text type="strong">Most common gaps</UI.Text>
            <UI.Stack direction="inline" gap="small-200">
              {commonGaps.map(([label, n]) => (<UI.Badge key={label} tone="caution">{`${label} · ${fmtNumber(n)}`}</UI.Badge>))}
            </UI.Stack>
          </UI.Stack>) : null}
        <UI.Text color="subdued">An upgrade rewrites one item from its own facts and yours, and nothing reaches your store until you approve it. Every change can be undone.</UI.Text>
        {ready > 0 ? (<UI.Stack direction="inline" gap="small-200" alignItems="center">
            <UI.Button variant="primary" loading={busy || undefined} disabled={busy} onClick={() => void applyAll()}>
              {ready === 1 ? 'Apply the ready upgrade' : `Apply all ${ready} ready upgrades`}
            </UI.Button>
            <UI.Link href={APP_PATHS.changes}>Changes and undo</UI.Link>
          </UI.Stack>) : null}
        <UI.Stack direction="inline" gap="small-200">
          {FILTERS.filter((f) => f.id === 'all' || f.id === filter || countOf(f.id) > 0).map((f) => (<UI.PressButton key={f.id} pressed={f.id === filter} onClick={() => setFilter(f.id)}>
              {`${f.id === 'collection' ? words.Collections : f.label} · ${fmtNumber(countOf(f.id))}`}
            </UI.PressButton>))}
        </UI.Stack>
        {d.unread.length > 0 ? <UI.Text color="subdued">{`We could not read your ${joinAnd(d.unread.map((t) => typePlural(t, words)))} just now, so they are not in this list.`}</UI.Text> : null}
        {d.truncated.length > 0 ? <UI.Text color="subdued">{`Showing the first ${joinAnd(d.truncated.map((t) => `${fmtNumber(d.limits[t])} ${typePlural(t, words)}`))} only.`}</UI.Text> : null}
        {items.length === 0 ? (<UI.Paragraph>Nothing to show here.</UI.Paragraph>) : (<UI.Table {...paged.tableProps}>
            <UI.TableHeaderRow>
              <UI.TableHeader listSlot="primary">Item</UI.TableHeader>
              <UI.TableHeader>Score</UI.TableHeader>
              <UI.TableHeader>What to fix</UI.TableHeader>
              <UI.TableHeader>Upgrade</UI.TableHeader>
            </UI.TableHeaderRow>
            <UI.TableBody>
              {paged.rows.map((i) => {
                const state = i.upgrade ? upgradeStateLabel(i.upgrade.status) : null;
                return (<UI.TableRow key={`${i.type}:${i.num}`}>
                    <UI.TableCell>
                      <UI.Stack gap="small-100">
                        <UI.Link href={contentItemHref(i.type, i.num)}>
                          {i.title}
                        </UI.Link>
                        <UI.Text color="subdued">{`${typeLabel(i.type, words)}${i.published === false ? ' · not published' : ''}`}</UI.Text>
                      </UI.Stack>
                    </UI.TableCell>
                    <UI.TableCell>
                      <ScoreBadge score={i.score}/>
                    </UI.TableCell>
                    <UI.TableCell>
                      {i.gapCount === 0 ? (<UI.Text color="subdued">Nothing</UI.Text>) : (<UI.Text>{`${i.topGaps[0]!.label}${i.gapCount > 1 ? ` and ${i.gapCount - 1} more` : ''}`}</UI.Text>)}
                    </UI.TableCell>
                    <UI.TableCell>
                      {state ? (<UI.Badge tone={i.upgrade!.status === 'ready' ? 'info' : 'neutral'}>{state}</UI.Badge>) : i.canUpgrade ? (<UI.Link href={contentItemHref(i.type, i.num)}>{d.prices[i.type] !== null ? `Upgrade · ${creditsLabel(d.prices[i.type])}` : 'Upgrade'}</UI.Link>) : (<UI.Text color="subdued">Not needed</UI.Text>)}
                    </UI.TableCell>
                  </UI.TableRow>);
            })}
            </UI.TableBody>
          </UI.Table>)}
      </UI.Stack>
    </UI.Section>);
}
