import { useEffect, useState } from 'react';
import { APP_PATHS, searchHref } from '@/lib/shopify-app/app-routes-core';
import { api, toastSuccess } from '../api';
import { usePlan, useStore } from '../plan-context';
import { act, ErrorBanner, formatDate, PricedButton, useLoad, usePageError, type LockInfo } from '../kit';
import { SkeletonSection } from '../components/Status';
import { PageColumns } from '../components/PageColumns';
import { ARTICLE_PREVIEW_CSS } from './Article';
import { ScoreBadge, typeLabel } from './ContentTab';
import * as UI from '../ui';
type ContentType = 'article' | 'page' | 'product' | 'collection';
interface Gap {
    code: string;
    impact: 'high' | 'medium' | 'low';
    label: string;
    why: string;
    how: string;
    fix: 'upgrade' | 'search_fields' | 'manual';
}
interface ItemData {
    item: {
        type: ContentType;
        num: string;
        title: string;
        url: string | null;
        published: boolean | null;
        score: number;
        words: number;
        gaps: Gap[];
        canUpgrade: boolean;
        seoTitle: string | null;
        seoDescription: string | null;
    };
    upgrade: {
        id: string;
        status: string;
    } | null;
    prices: Record<ContentType, number | null>;
    canUpgrade: boolean;
}
interface UpgradeView {
    upgrade: {
        id: string;
        status: string;
        error: string | null;
        ownerNotes: string | null;
        scoreBefore: number | null;
        scoreAfter: number | null;
        gapsBefore: Gap[];
        gapsAfter: Gap[];
        warnings: string[];
        changes: string[];
        before: {
            html: string;
            seoTitle: string | null;
            seoDescription: string | null;
        };
        after: {
            html: string;
            seoTitle: string | null;
            seoDescription: string | null;
        } | null;
        credits: number | null;
        appliedAt: string | null;
    };
}
const IMPACT_LABEL: Record<Gap['impact'], string> = { high: 'High impact', medium: 'Medium impact', low: 'Low impact' };
const FIX_NOTE: Record<Gap['fix'], string> = {
    upgrade: 'An upgrade fixes this.',
    search_fields: 'An upgrade writes these too, or edit them in SEO › Listings for free.',
    manual: 'You fix this yourself, by editing the page.',
};
const ERROR_TEXT: Record<string, string> = {
    invalid_response: 'The upgrade came back in a shape we could not use. Nothing was charged. Try again.',
    writer_failed: 'The upgrade could not be written just now. Nothing was charged. Try again.',
    store_unreadable: 'We could not read your store just now. Nothing was charged. Try again.',
    not_dispatched: 'The upgrade did not start. Nothing was charged. Try again.',
    stale: 'The upgrade did not finish. Nothing was charged. Try again.',
    unavailable: 'Upgrades are not available right now. Nothing was charged.',
    not_saved: 'The upgrade could not be saved. Nothing was charged. Try again.',
};
function notesCopy(type: ContentType): {
    label: string;
    details: string;
} {
    return type === 'product' || type === 'collection'
        ? { label: 'Details to include (optional)', details: 'Materials, sizes, what is included, care, who it is for. The upgrade only uses facts already on the page and the ones you write here.' }
        : { label: 'What you know (optional)', details: 'What you recommend, what you have seen, what customers ask. The upgrade builds on it and never claims experience you did not describe.' };
}
export function ContentItemPage({ type, num }: {
    type: ContentType;
    num: string;
}) {
    const { words } = useStore();
    const load = useLoad<ItemData>(`content/items/${type}/${num}`);
    const { plan, ready: planReady } = usePlan();
    const [error, setError] = usePageError();
    const [upgradeId, setUpgradeId] = useState<string | null>(null);
    const [view, setView] = useState<UpgradeView['upgrade'] | null>(null);
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const [showCurrent, setShowCurrent] = useState(false);
    const d = planReady ? load.data : null;
    const id = upgradeId ?? (d?.upgrade && d.upgrade.status !== 'discarded' ? d.upgrade.id : null);
    useEffect(() => {
        if (!id)
            return;
        let stop = false;
        const tick = async () => {
            const r = await api<UpgradeView>(`content/upgrades/${id}`);
            if (stop)
                return;
            if (r.ok && r.data) {
                setView(r.data.upgrade);
                if (r.data.upgrade.status === 'queued' || r.data.upgrade.status === 'writing' || r.data.upgrade.status === 'applying')
                    setTimeout(() => void tick(), 4000);
            }
        };
        void tick();
        return () => {
            stop = true;
        };
    }, [id]);
    async function start() {
        const r = await act(() => api<{
            upgradeId: string;
        }>('content/upgrades', { method: 'POST', body: { type, num, ownerNotes: notes.trim() || null } }), (b) => setBusy(b ? 'start' : null), setError);
        if (r.ok && r.data) {
            setView(null);
            setUpgradeId(r.data.upgradeId);
        }
    }
    async function apply() {
        if (!view)
            return;
        const r = await act(() => api<{
            status: string;
            message: string | null;
        }>(`content/upgrades/${view.id}/apply`, { method: 'POST' }), (b) => setBusy(b ? 'apply' : null), setError);
        if (r.ok && r.data) {
            toastSuccess(r.data.status === 'applied' ? 'Upgrade applied to your store' : 'Upgrade written; check it on your store');
            if (r.data.message)
                setError({ message: r.data.message, planLink: false });
            const v = await api<UpgradeView>(`content/upgrades/${view.id}`);
            if (v.ok && v.data)
                setView(v.data.upgrade);
            await load.reload();
        }
    }
    async function discard() {
        if (!view)
            return;
        const r = await act(() => api(`content/upgrades/${view.id}/discard`, { method: 'POST' }), (b) => setBusy(b ? 'discard' : null), setError);
        if (r.ok) {
            setView(null);
            setUpgradeId(null);
            await load.reload();
        }
    }
    const access = plan?.locks.access ?? null;
    const lock: LockInfo | null = access ?? (d && !d.canUpgrade ? { locked: true, reason: 'Upgrades are included in every paid plan.', planNeeded: null } : null);
    const status = view?.status ?? null;
    const writing = status === 'queued' || status === 'writing';
    const ready = status === 'ready';
    const applied = status === 'applied' || status === 'applied_unverified';
    const showStart = !writing && !ready && status !== 'applying';
    const copy = notesCopy(type);
    return (<UI.Page heading={d?.item.title ?? 'Content'} inlineSize="large">
      <UI.Link slot="breadcrumb-actions" href={searchHref('content')}>
        SEO
      </UI.Link>
      <ErrorBanner error={error ?? load.error} onDismiss={error ? () => setError(null) : undefined}/>
      {!d ? (load.error && planReady ? null : <SkeletonSection lines={6}/>) : (<PageColumns main={<>
                <UI.Section heading="Upgrade">
                  <UI.Stack gap="base">
                    {status === 'failed' && view ? <UI.Text>{ERROR_TEXT[view.error ?? ''] ?? 'The upgrade stopped. Nothing was charged. Try again.'}</UI.Text> : null}
                    {status === 'undone' ? <UI.Text>The last upgrade was undone in Changes, so your store has its earlier text. You can write a new one.</UI.Text> : null}
                    {applied && view ? (<UI.Stack gap="small-200">
                        <UI.Text>{`Applied ${formatDate(view.appliedAt)}${view.scoreBefore !== null && view.scoreAfter !== null ? `: score ${view.scoreBefore} to ${view.scoreAfter}` : ''}.`}</UI.Text>
                        <UI.Link href={APP_PATHS.changes}>Undo it in Changes</UI.Link>
                      </UI.Stack>) : null}
                    {showStart ? (<UI.Stack gap="base">
                        {d.item.canUpgrade ? (<UI.Paragraph>
                            {type === 'article' || type === 'page'
                            ? 'An upgrade rewrites this for search and AI answers: a short answer on top, questions as headings, an FAQ, links to your products, and the search title and description. Your images, tables and links stay. Nothing reaches your store until you approve it.'
                            : 'An upgrade rewrites the description so it opens with what this is and who it is for, lists the details buyers compare, and writes the search title and description. No price goes into the text: ' + words.livePrice + '. Nothing reaches your store until you approve it.'}
                          </UI.Paragraph>) : (<UI.Paragraph>The check found nothing to fix here. To have it rewritten with new details, add them below.</UI.Paragraph>)}
                          <UI.TextArea label={copy.label} details={copy.details} value={notes} rows={4} maxLength={1500} onInput={(e) => setNotes(e.currentTarget.value)}/>
                          {(type === 'product' || type === 'collection') && d.item.words < 30 && !notes.trim() ? (<UI.Text color="subdued">This has very little text to work from, so the details you add above make the biggest difference.</UI.Text>) : null}
                          {d.item.canUpgrade || notes.trim() ? (<>
                              <PricedButton label={applied ? 'Write another upgrade' : 'Write upgrade'} variant="primary" credits={d.prices[type]} lock={lock} busy={busy === 'start'} onClick={() => void start()}/>
                              <UI.Text color="subdued">You are charged only when the upgrade is written. If it fails, nothing is charged.</UI.Text>
                            </>) : null}
                      </UI.Stack>) : null}
                    {writing ? <UI.Text>Writing your upgrade. This takes about a minute for a blog post or page, and under half a minute for a description.</UI.Text> : null}
                    {ready && view && view.after ? (<UI.Stack gap="base">
                        <UI.Stack direction="inline" gap="small-200" alignItems="center">
                          <UI.Text type="strong">Score</UI.Text>
                          {view.scoreBefore !== null ? <ScoreBadge score={view.scoreBefore}/> : null}
                          <UI.Text>to</UI.Text>
                          {view.scoreAfter !== null ? <ScoreBadge score={view.scoreAfter}/> : null}
                        </UI.Stack>
                        {view.warnings.length > 0 ? (<UI.Banner tone="warning" heading="Check before applying">
                            <UI.Stack gap="small-200">
                              {view.warnings.map((w) => (<UI.Text key={w}>{w}</UI.Text>))}
                            </UI.Stack>
                          </UI.Banner>) : null}
                        {view.changes.length > 0 ? (<UI.Stack gap="small-200">
                            <UI.Text type="strong">What changed</UI.Text>
                            <UI.UnorderedList>
                              {view.changes.map((c) => (<UI.ListItem key={c}>{c}</UI.ListItem>))}
                            </UI.UnorderedList>
                          </UI.Stack>) : null}
                        {view.gapsAfter.length > 0 ? <UI.Text color="subdued">{`Still to fix: ${view.gapsAfter.map((g) => g.label).join('; ')}.`}</UI.Text> : null}
                        <UI.Stack gap="small-200">
                          <UI.Text type="strong">Search result</UI.Text>
                          <UI.Text>{`Title: ${view.after.seoTitle ?? '(unchanged)'}`}</UI.Text>
                          <UI.Text>{`Description: ${view.after.seoDescription ?? '(unchanged)'}`}</UI.Text>
                          {view.before.seoTitle !== view.after.seoTitle || view.before.seoDescription !== view.after.seoDescription ? (<UI.Text color="subdued">{`Now: ${view.before.seoTitle ?? '(no search title)'} · ${view.before.seoDescription ?? '(no search description)'}`}</UI.Text>) : null}
                        </UI.Stack>
                        <UI.Stack direction="inline" gap="small-200">
                          <UI.PressButton pressed={!showCurrent} onClick={() => setShowCurrent(false)}>
                            New version
                          </UI.PressButton>
                          <UI.PressButton pressed={showCurrent} onClick={() => setShowCurrent(true)}>
                            Current version
                          </UI.PressButton>
                        </UI.Stack>
                        <UI.Box padding="base" border="base" borderRadius="base">
                          <style>{ARTICLE_PREVIEW_CSS}</style>
                          <div className="rx-article" dangerouslySetInnerHTML={{ __html: showCurrent ? view.before.html || '<p>(no text)</p>' : view.after.html }}/>
                        </UI.Box>
                        <UI.Stack direction="inline" gap="small-200">
                          <UI.Button variant="primary" loading={busy === 'apply' || undefined} disabled={busy !== null} onClick={() => void apply()}>
                            Apply to my store
                          </UI.Button>
                          <UI.Button loading={busy === 'discard' || undefined} disabled={busy !== null} onClick={() => void discard()}>
                            Discard
                          </UI.Button>
                        </UI.Stack>
                        <UI.Text color="subdued">Applying replaces the text and search fields on your live store. You can undo it in Changes.</UI.Text>
                      </UI.Stack>) : null}
                  </UI.Stack>
                </UI.Section>
            </>} side={<>
                <UI.Section heading="Content check">
                  <UI.Stack gap="base">
                    <UI.Stack direction="inline" gap="small-200" alignItems="center">
                      <ScoreBadge score={d.item.score}/>
                      <UI.Text color="subdued">{`${typeLabel(type, words)} · ${d.item.words} words${d.item.published === false ? ' · not published' : ''}`}</UI.Text>
                      {d.item.url ? <UI.Link href={d.item.url} target="_blank">View on your store</UI.Link> : null}
                    </UI.Stack>
                    {d.item.gaps.length === 0 ? (<UI.Paragraph>Nothing to fix: this already does what Google and AI assistants look for.</UI.Paragraph>) : (d.item.gaps.map((g) => (<UI.Box key={g.code} padding="base" border="base" borderRadius="base">
                          <UI.Stack gap="small-200">
                            <UI.Stack direction="inline" gap="small-200" alignItems="center">
                              <UI.Text type="strong">{g.label}</UI.Text>
                              <UI.Badge tone={g.impact === 'high' ? 'warning' : 'neutral'}>{IMPACT_LABEL[g.impact]}</UI.Badge>
                            </UI.Stack>
                            <UI.Text color="subdued">{g.why}</UI.Text>
                            <UI.Text>{g.how}</UI.Text>
                            <UI.Text color="subdued">{FIX_NOTE[g.fix]}</UI.Text>
                          </UI.Stack>
                        </UI.Box>)))}
                  </UI.Stack>
                </UI.Section>
            </>}/>)}
    </UI.Page>);
}
