import { useStore } from '../plan-context';
import { useEffect, useState, type ReactNode } from 'react';
import { api, toastSuccess } from '../api';
import { ErrorBanner, GoButton, act, formatDate, useLoad, usePageError } from '../kit';
import { fmtNumber, fmtPercent } from '../format';
import { MetricCard, MetricRow } from '../components/MetricCard';
import { ProductCell, SkeletonCards, SkeletonSection } from '../components/Status';
import { contentItemHref, searchHref } from '@/lib/shopify-app/app-routes-core';
import * as UI from '../ui';
type View = 'not_configured' | 'not_connected' | 'reconnect' | 'choose_property' | 'property_mismatch' | 'waiting_for_data' | 'ready';
interface PageItem {
    url: string;
    path: string;
    kind: 'product' | 'collection' | 'page' | 'article' | 'blog' | 'home' | 'other';
    clicks: number;
    impressions: number;
    ctr: number | null;
    position: number | null;
    previousClicks: number | null;
    clickChange: number | null;
    object: {
        type: 'product' | 'collection';
        id: string;
        title: string | null;
        imageUrl: string | null;
    } | null;
    topQueries: Array<{
        query: string;
        impressions: number;
    }>;
}
interface Totals {
    clicks: number;
    impressions: number;
    ctr: number | null;
    position: number | null;
}
interface GoogleData {
    connection: {
        view: View;
        account: string | null;
        property: {
            siteUrl: string;
            label: string;
        } | null;
        lastSyncedAt: string | null;
        syncFailing: boolean;
        storeAddress: string | null;
    };
    report: {
        windowDays: number;
        window: {
            from: string;
            to: string;
        };
        previousWindow: {
            from: string;
            to: string;
        };
        comparable: boolean;
        totals: Totals & {
            days: number;
        };
        previousTotals: Totals | null;
        topPages: PageItem[];
        lostClicks: PageItem[];
        noClicks: Array<PageItem & {
            onPageOne: boolean;
        }>;
        noClickFloor: number;
        truncated: boolean;
        objectsNamed: boolean;
        series?: Array<{
            date: string;
            clicks: number;
            impressions: number;
        }>;
        markers?: Array<{
            day: string;
            count: number;
        }>;
        queries?: Array<{
            query: string;
            clicks: number;
            impressions: number;
            ctr: number | null;
            position: number | null;
        }>;
        fixes?: FixResult[] | null;
        fixSummary?: {
            measured: number;
            improved: number;
            declined: number;
            tooEarly: number;
            line: string | null;
        } | null;
    } | null;
}
interface FixResult {
    id: string;
    label: string;
    day: string;
    verdict: 'improved' | 'declined' | 'no_change' | 'too_early' | 'too_little_data' | 'not_measured';
    windowDays: number;
    before: {
        clicks: number;
        impressions: number;
    } | null;
    after: {
        clicks: number;
        impressions: number;
    } | null;
    sentence: string;
}
const RANGES = [7, 28, 90] as const;
const VERDICT: Record<FixResult['verdict'], {
    label: string;
    tone: 'success' | 'warning' | 'info' | 'neutral';
}> = {
    improved: { label: 'More clicks', tone: 'success' },
    declined: { label: 'Fewer clicks', tone: 'warning' },
    no_change: { label: 'About the same', tone: 'neutral' },
    too_early: { label: 'Too early', tone: 'info' },
    too_little_data: { label: 'Too little data', tone: 'neutral' },
    not_measured: { label: 'Not measured', tone: 'neutral' },
};
interface Properties {
    options: Array<{
        siteUrl: string;
        label: string;
    }>;
    suggested: string | null;
    otherCount: number;
    selected: string | null;
    storeAddress: string | null;
}
function numericId(gid: string): string | null {
    const m = /\/(\d+)$/.exec(gid);
    return m ? m[1]! : null;
}
function defaultTitlesHref(productGid: string): string {
    const id = numericId(productGid);
    const base = searchHref('listings');
    return id ? `${base}${base.includes('?') ? '&' : '?'}product=${id}` : base;
}
const fmtPosition = (p: number | null) => (p === null ? '—' : p.toFixed(1));
const fmtCtr = (c: number | null) => (c === null ? '—' : fmtPercent(c));
function changeText(change: number | null): string {
    if (change === null)
        return 'Not comparable';
    if (change === 0)
        return 'No change';
    return change > 0 ? `+${fmtNumber(change)}` : `−${fmtNumber(Math.abs(change))}`;
}
function changeBasis(previous: number | null | undefined, comparable: boolean, days = 28): string {
    if (!comparable || previous === null || previous === undefined)
        return `No comparable previous ${days} days`;
    return `${fmtNumber(previous)} in the previous ${days} days`;
}
function ClicksChart({ series, markers }: {
    series: Array<{
        date: string;
        clicks: number;
    }>;
    markers: Array<{
        day: string;
        count: number;
    }>;
}) {
    if (series.length < 2)
        return <UI.Text color="subdued">Not enough days reported yet to draw a trend.</UI.Text>;
    const w = 640;
    const h = 120;
    const max = Math.max(1, ...series.map((p) => p.clicks));
    const x = (i: number) => (i / (series.length - 1)) * w;
    const y = (c: number) => h - 4 - (c / max) * (h - 12);
    const line = series.map((p, i) => `${x(i).toFixed(1)},${y(p.clicks).toFixed(1)}`).join(' ');
    const index = new Map(series.map((p, i) => [p.date, i]));
    const marks = markers.filter((m) => index.has(m.day));
    const total = series.reduce((n, p) => n + p.clicks, 0);
    return (<UI.Stack gap="small-200">
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" aria-hidden="true" focusable="false" style={{ display: 'block', overflow: 'visible' }}>
        <line x1="0" x2={w} y1={h - 4} y2={h - 4} stroke="currentColor" strokeOpacity={0.15}/>
        {marks.map((m) => (<line key={m.day} x1={x(index.get(m.day)!)} x2={x(index.get(m.day)!)} y1="0" y2={h - 4} stroke="currentColor" strokeOpacity={0.45} strokeDasharray="3 3"/>))}
        <polyline points={line} fill="none" stroke="currentColor" strokeOpacity={0.85} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
      </svg>
      <UI.Text color="subdued">
        {`${fmtNumber(total)} clicks from ${formatDate(series[0]!.date)} to ${formatDate(series.at(-1)!.date)}, at most ${fmtNumber(max)} in a day.`}
        {marks.length > 0
            ? ` Dashed lines: the ${marks.length === 1 ? 'day' : `${marks.length} days`} you changed search listings (${marks.map((m) => `${formatDate(m.day)}, ${m.count} ${m.count === 1 ? 'page' : 'pages'}`).join('; ')}).`
            : ' No search listings were changed in this range.'}
      </UI.Text>
    </UI.Stack>);
}
function PageCell({ item }: {
    item: PageItem;
}) {
    const title = item.object?.title ?? (item.kind === 'home' ? 'Home page' : item.path);
    const queries = item.topQueries.slice(0, 3).map((q) => `“${q.query}”`).join(', ');
    const sub = [item.object ? item.path : null, queries ? `Searches: ${queries}` : null].filter(Boolean).join(' · ');
    return item.kind === 'product' || item.kind === 'collection' ? (<ProductCell title={title} imageUrl={item.object?.imageUrl ?? null} sub={sub || null}/>) : (<UI.Stack gap="small-100">
      <UI.Text type="strong">{title}</UI.Text>
      {queries ? <UI.Text color="subdued">Searches: {queries}</UI.Text> : null}
    </UI.Stack>);
}
export function SearchPerformanceTab({ titlesHref = defaultTitlesHref }: {
    titlesHref?: (productGid: string) => string;
} = {}) {
    const { words, capabilities, platform } = useStore();
    const canConnect = capabilities ? capabilities.can.googleConnect : platform === 'shopify';
    const [days, setDays] = useState<(typeof RANGES)[number]>(28);
    const data = useLoad<GoogleData>(days === 28 ? 'google' : `google?days=${days}`);
    const [error, setError] = usePageError();
    const [busy, setBusy] = useState<string | null>(null);
    const [consentUrl, setConsentUrl] = useState<string | null>(null);
    const [confirmDisconnect, setConfirmDisconnect] = useState(false);
    const d = data.data;
    const view = d?.connection.view ?? null;
    const reload = data.reload;
    useEffect(() => {
        if (view === 'ready')
            return;
        const again = () => void reload();
        window.addEventListener('focus', again);
        return () => window.removeEventListener('focus', again);
    }, [view, reload]);
    async function connect() {
        const r = await act(() => api<{
            url: string;
        }>('google/connect', { method: 'POST' }), (b) => setBusy(b ? 'connect' : null), setError);
        if (!r.ok || !r.data)
            return;
        setConsentUrl(r.data.url);
        try {
            if (/^https:\/\//i.test(r.data.url))
                window.open(r.data.url, '_blank', 'noopener');
        }
        catch {
        }
    }
    async function disconnect() {
        const r = await act(() => api('google/disconnect', { method: 'POST' }), (b) => setBusy(b ? 'disconnect' : null), setError);
        setConfirmDisconnect(false);
        if (r.ok) {
            toastSuccess('Search Console disconnected');
            setConsentUrl(null);
            await reload();
        }
    }
    const connectBlock = (label: string) => !canConnect ? (<UI.Text color="subdued">{capabilities?.why.googleConnect ?? 'Connect Search Console in RankX AI on the web.'}</UI.Text>) : (<UI.Stack gap="small-200">
      <UI.Stack direction="inline" gap="base">
        <UI.Button variant="primary" loading={busy === 'connect' || undefined} disabled={busy !== null} onClick={() => void connect()}>
          {label}
        </UI.Button>
      </UI.Stack>
      {consentUrl ? (<UI.Paragraph>
          Google opens in a new tab. Finish there, then come back here. If no tab opened,{' '}
          <UI.Link href={consentUrl} target="_blank">
            open Google
          </UI.Link>
          .
        </UI.Paragraph>) : null}
    </UI.Stack>);
    const connectionFooter = d && d.connection.view !== 'not_connected' && d.connection.view !== 'not_configured' ? (<UI.Section heading="Connection">
      <UI.Stack gap="small-200">
        <UI.Text color="subdued">
          {d.connection.account ? `Google account: ${d.connection.account}.` : 'Google account connected.'}
          {d.connection.property ? ` Site: ${d.connection.property.label}.` : ''}
          {d.connection.lastSyncedAt ? ` Last updated ${formatDate(d.connection.lastSyncedAt)}.` : ''}
        </UI.Text>
        {d.connection.syncFailing ? <UI.Text color="subdued">The latest update from Google did not finish. RankX AI tries again every night.</UI.Text> : null}
        {confirmDisconnect ? (<UI.Stack direction="inline" gap="base" alignItems="center">
            <UI.Text>Disconnecting removes the Search Console data RankX AI has stored for this store.</UI.Text>
            <UI.Button tone="critical" loading={busy === 'disconnect' || undefined} disabled={busy !== null} onClick={() => void disconnect()}>
              Disconnect
            </UI.Button>
            <UI.Button variant="tertiary" disabled={busy !== null} onClick={() => setConfirmDisconnect(false)}>
              Keep connected
            </UI.Button>
          </UI.Stack>) : (<UI.Stack direction="inline" gap="base">
            <UI.Button variant="tertiary" disabled={busy !== null} onClick={() => setConfirmDisconnect(true)}>
              Disconnect Search Console
            </UI.Button>
          </UI.Stack>)}
      </UI.Stack>
    </UI.Section>) : null;
    return (<>
      <ErrorBanner error={error ?? data.error} onDismiss={error ? () => setError(null) : undefined}/>
      {!d && data.loading ? (<>
          <SkeletonCards count={4}/>
          <SkeletonSection lines={5}/>
        </>) : null}

      {view === 'not_configured' ? (<UI.Section heading="Google search">
          <UI.Paragraph>Connecting Google Search Console is not available just now. Please check again later.</UI.Paragraph>
        </UI.Section>) : null}

      {view === 'not_connected' ? (<UI.Section heading="See how Google search brings shoppers to your products">
          <UI.Stack gap="base">
            <UI.Paragraph>Connect Google Search Console, free on every plan, and this page shows:</UI.Paragraph>
            <UI.UnorderedList>
              <UI.ListItem>{`The clicks, times shown and searches behind each product and ${words.collection} page, over 7, 28 or 90 days.`}</UI.ListItem>
              <UI.ListItem>Which pages are losing clicks, with the content upgrade for each.</UI.ListItem>
              <UI.ListItem>Products Google shows that nobody clicks, and how to win the click.</UI.ListItem>
              <UI.ListItem>Whether each search listing you fix brings more clicks, with the day of each change marked on the chart.</UI.ListItem>
            </UI.UnorderedList>
            <UI.Text color="subdued">RankX AI only reads your Search Console data. It never changes anything in your Google account.</UI.Text>
            {connectBlock('Connect Search Console')}
          </UI.Stack>
        </UI.Section>) : null}

      {view === 'reconnect' ? (<UI.Section heading="Reconnect Search Console">
          <UI.Stack gap="base">
            <UI.Paragraph>Google no longer accepts RankX AI’s access to your Search Console. Connect again to keep your data up to date.</UI.Paragraph>
            {connectBlock('Connect Search Console')}
          </UI.Stack>
        </UI.Section>) : null}

      {view === 'choose_property' || view === 'property_mismatch' ? (<PropertyPicker mismatch={view === 'property_mismatch'} account={d?.connection.account ?? null} onChosen={async () => {
                toastSuccess('Site saved');
                await reload();
            }} setError={setError} connectBlock={connectBlock('Use a different Google account')}/>) : null}

      {view === 'waiting_for_data' ? (<UI.Section heading="Getting your data from Google">
          <UI.Stack gap="base">
            <UI.Paragraph>
              Connected to {d?.connection.property?.label ?? 'your site'}. The first data usually arrives within a few minutes. Search Console reports
              about two days late, so the most recent days fill in later.
            </UI.Paragraph>
            <UI.Stack direction="inline" gap="base">
              <UI.Button disabled={data.loading || undefined} onClick={() => void reload()}>
                Check again
              </UI.Button>
            </UI.Stack>
          </UI.Stack>
        </UI.Section>) : null}

      {view === 'ready' && d?.report ? <Report report={d.report} titlesHref={titlesHref} days={days} setDays={setDays}/> : null}

      {connectionFooter}
    </>);
}
function PropertyPicker(props: {
    mismatch: boolean;
    account: string | null;
    onChosen: () => Promise<void>;
    setError: ReturnType<typeof usePageError>[1];
    connectBlock: ReactNode;
}) {
    const list = useLoad<Properties>('google/properties');
    const [choice, setChoice] = useState<string>('');
    const [saving, setSaving] = useState(false);
    const p = list.data;
    const value = choice || p?.suggested || '';
    async function save() {
        const r = await act(() => api('google/property', { method: 'POST', body: { siteUrl: value } }), setSaving, props.setError);
        if (r.ok)
            await props.onChosen();
    }
    return (<UI.Section heading={props.mismatch ? 'Choose the site for this store' : 'Choose your store’s site'}>
      {list.error ? <UI.Paragraph>{list.error}</UI.Paragraph> : null}
      {!p && list.loading ? <UI.Text color="subdued">Reading your Search Console sites…</UI.Text> : null}
      {p ? (<UI.Stack gap="base">
          {props.mismatch ? <UI.Paragraph>The site connected before does not cover your store’s address, so its data cannot be matched to your products.</UI.Paragraph> : null}
          {p.options.length === 0 ? (<UI.Paragraph>
              None of the sites in {props.account ?? 'this Google account'} cover {p.storeAddress ?? 'your store’s address'}. Add your store to Search
              Console with the same Google account, or connect a different account.
            </UI.Paragraph>) : (<>
              <UI.Select label="Search Console site" value={value} onChange={(e) => setChoice(e.currentTarget.value)}>
                {p.options.map((o) => (<UI.Option key={o.siteUrl} value={o.siteUrl}>
                    {o.siteUrl === p.suggested ? `${o.label} (suggested)` : o.label}
                  </UI.Option>))}
              </UI.Select>
              <UI.Stack direction="inline" gap="base">
                <UI.Button variant="primary" loading={saving || undefined} disabled={saving || !value} onClick={() => void save()}>
                  Use this site
                </UI.Button>
              </UI.Stack>
            </>)}
          {p.otherCount > 0 ? (<UI.Text color="subdued">
              {p.otherCount === 1 ? '1 other site in this Google account is' : `${fmtNumber(p.otherCount)} other sites in this Google account are`} not listed
              because {p.otherCount === 1 ? 'it does' : 'they do'} not cover your store’s address.
            </UI.Text>) : null}
          {props.connectBlock}
        </UI.Stack>) : null}
    </UI.Section>);
}
export function Report({ report: r, titlesHref, days, setDays }: {
    report: NonNullable<GoogleData['report']>;
    titlesHref: (productGid: string) => string;
    days: number;
    setDays: (d: (typeof RANGES)[number]) => void;
}) {
    const { words } = useStore();
    const range = `${formatDate(r.window.from)} to ${formatDate(r.window.to)}`;
    const prev = r.comparable ? r.previousTotals : null;
    return (<>
      <UI.Section>
        <UI.Stack gap="base">
          <UI.Stack direction="inline" gap="small-200">
            {RANGES.map((n) => (<UI.PressButton key={n} pressed={n === days} onClick={() => setDays(n)}>
                {`${n} days`}
              </UI.PressButton>))}
          </UI.Stack>
          <UI.Paragraph>
            Google search, {range}, compared with the {r.windowDays} days before. Search Console reports about two days late, so this ends on the
            latest day it has reported.
          </UI.Paragraph>
          <MetricRow>
            <MetricCard label="Clicks from Google" value={fmtNumber(r.totals.clicks)} basis={changeBasis(prev?.clicks, r.comparable, r.windowDays)}/>
            <MetricCard label="Times shown in Google" value={fmtNumber(r.totals.impressions)} basis={changeBasis(prev?.impressions, r.comparable, r.windowDays)}/>
            <MetricCard label="Clicked when shown" value={r.totals.ctr === null ? null : fmtCtr(r.totals.ctr)} empty="Not shown yet" basis={r.comparable && prev?.ctr !== null && prev?.ctr !== undefined ? `${fmtCtr(prev.ctr)} in the previous ${r.windowDays} days` : `No comparable previous ${r.windowDays} days`}/>
            <MetricCard label="Average position" value={r.totals.position === null ? null : fmtPosition(r.totals.position)} empty="Not shown yet" basis={r.comparable && prev?.position !== null && prev?.position !== undefined ? `${fmtPosition(prev.position)} in the previous ${r.windowDays} days (lower is better)` : 'Lower is better'}/>
          </MetricRow>
          {r.truncated ? <UI.Text color="subdued">Your store has more than 1,000 pages in Google search, so the lists below cover the 1,000 busiest.</UI.Text> : null}
          {!r.objectsNamed ? <UI.Text color="subdued">Product names could not be read from your store just now, so pages are listed by address.</UI.Text> : null}
        </UI.Stack>
      </UI.Section>

      {r.series ? (<UI.Section heading="Clicks by day">
          <ClicksChart series={r.series} markers={r.markers ?? []}/>
        </UI.Section>) : null}

      <UI.Section heading="Results of your search listing fixes">
        <UI.Stack gap="base">
          <UI.Paragraph>
            Each page whose search title or description you changed, compared over equal windows before and after the change (up to 28 days each), from
            14 days after it. Google, the season and your store change too, so this shows what happened, not proof of cause.
          </UI.Paragraph>
          {r.fixes === null || r.fixes === undefined ? (<UI.Text color="subdued">The results could not be read just now.</UI.Text>) : r.fixes.length === 0 ? (<UI.Text color="subdued">No search listing changes in the last 120 days. Changes you make in Listings appear here.</UI.Text>) : (<>
              {r.fixSummary?.line ? <UI.Text type="strong">{r.fixSummary.line}</UI.Text> : null}
              <UI.Table variant="auto">
                <UI.TableHeaderRow>
                  <UI.TableHeader listSlot="primary">Change</UI.TableHeader>
                  <UI.TableHeader listSlot="inline">Result</UI.TableHeader>
                  <UI.TableHeader listSlot="secondary">Clicks before → after</UI.TableHeader>
                </UI.TableHeaderRow>
                <UI.TableBody>
                  {r.fixes.map((f) => (<UI.TableRow key={f.id}>
                      <UI.TableCell>
                        <UI.Stack gap="small-100">
                          <UI.Text>{f.label}</UI.Text>
                          <UI.Text color="subdued">{formatDate(f.day)}</UI.Text>
                        </UI.Stack>
                      </UI.TableCell>
                      <UI.TableCell>
                        <UI.Badge tone={VERDICT[f.verdict].tone}>{VERDICT[f.verdict].label}</UI.Badge>
                      </UI.TableCell>
                      <UI.TableCell>
                        <UI.Stack gap="small-100">
                          {f.before && f.after ? <UI.Text>{`${fmtNumber(f.before.clicks)} → ${fmtNumber(f.after.clicks)} (${f.windowDays} days each)`}</UI.Text> : null}
                          <UI.Text color="subdued">{f.sentence}</UI.Text>
                        </UI.Stack>
                      </UI.TableCell>
                    </UI.TableRow>))}
                </UI.TableBody>
              </UI.Table>
            </>)}
        </UI.Stack>
      </UI.Section>

      {r.queries ? (<UI.Section heading="Top searches">
          {r.queries.length === 0 ? (<UI.Paragraph>No searches reported in these {r.windowDays} days.</UI.Paragraph>) : (<UI.Table variant="auto">
              <UI.TableHeaderRow>
                <UI.TableHeader listSlot="primary">Search</UI.TableHeader>
                <UI.TableHeader format="numeric">Clicks</UI.TableHeader>
                <UI.TableHeader format="numeric">Times shown</UI.TableHeader>
                <UI.TableHeader format="numeric">Position</UI.TableHeader>
              </UI.TableHeaderRow>
              <UI.TableBody>
                {r.queries.map((q) => (<UI.TableRow key={q.query}>
                    <UI.TableCell>{q.query}</UI.TableCell>
                    <UI.TableCell>{fmtNumber(q.clicks)}</UI.TableCell>
                    <UI.TableCell>{fmtNumber(q.impressions)}</UI.TableCell>
                    <UI.TableCell>{fmtPosition(q.position)}</UI.TableCell>
                  </UI.TableRow>))}
              </UI.TableBody>
            </UI.Table>)}
        </UI.Section>) : null}

      <UI.Section heading={`Top product and ${words.collection} pages`}>
        {r.topPages.length === 0 ? (<UI.Paragraph>{`No product or ${words.collection} page was shown in Google search in these ${r.windowDays} days.`}</UI.Paragraph>) : (<PageTable rows={r.topPages} comparable={r.comparable}/>)}
      </UI.Section>

      <UI.Section heading="Pages that lost the most clicks">
        {!r.comparable ? (<UI.Paragraph>There is not yet a full previous {r.windowDays} days to compare with. This list fills in once there is.</UI.Paragraph>) : r.lostClicks.length === 0 ? (<UI.Paragraph>No page got fewer clicks from Google than in the previous {r.windowDays} days.</UI.Paragraph>) : (<UI.Table variant="auto">
            <UI.TableHeaderRow>
              <UI.TableHeader listSlot="primary">Page</UI.TableHeader>
              <UI.TableHeader format="numeric">Before</UI.TableHeader>
              <UI.TableHeader format="numeric">Now</UI.TableHeader>
              <UI.TableHeader format="numeric">Change</UI.TableHeader>
              <UI.TableHeader listSlot="inline">What to do</UI.TableHeader>
            </UI.TableHeaderRow>
            <UI.TableBody>
              {r.lostClicks.map((p) => {
                const num = p.object ? numericId(p.object.id) : null;
                return (<UI.TableRow key={p.url}>
                    <UI.TableCell>
                      <PageCell item={p}/>
                    </UI.TableCell>
                    <UI.TableCell>{p.previousClicks === null ? '—' : fmtNumber(p.previousClicks)}</UI.TableCell>
                    <UI.TableCell>{fmtNumber(p.clicks)}</UI.TableCell>
                    <UI.TableCell>{changeText(p.clickChange)}</UI.TableCell>
                    <UI.TableCell>
                      {p.object && num ? (<GoButton href={contentItemHref(p.object.type, num)} label="Upgrade this page" accessibilityLabel={`Upgrade the content of ${p.object.title ?? 'this page'}`}/>) : (<UI.Text color="subdued">—</UI.Text>)}
                    </UI.TableCell>
                  </UI.TableRow>);
            })}
            </UI.TableBody>
          </UI.Table>)}
      </UI.Section>

      <UI.Section heading="Products Google shows that nobody clicks">
        <UI.Stack gap="base">
          <UI.Paragraph>
            Products shown at least {fmtNumber(r.noClickFloor)} times in these {r.windowDays} days without a single click. On the first page of results,
            a clearer title and description in search can win the click.
          </UI.Paragraph>
          {r.noClicks.length === 0 ? (<UI.Paragraph>None. Every product Google showed this often got at least one click.</UI.Paragraph>) : (<UI.Table variant="auto">
              <UI.TableHeaderRow>
                <UI.TableHeader listSlot="primary">Product</UI.TableHeader>
                <UI.TableHeader format="numeric">Times shown</UI.TableHeader>
                <UI.TableHeader format="numeric">Position</UI.TableHeader>
                <UI.TableHeader>What to do</UI.TableHeader>
              </UI.TableHeaderRow>
              <UI.TableBody>
                {r.noClicks.map((p) => (<UI.TableRow key={p.url}>
                    <UI.TableCell>
                      <PageCell item={p}/>
                    </UI.TableCell>
                    <UI.TableCell>{fmtNumber(p.impressions)}</UI.TableCell>
                    <UI.TableCell>{fmtPosition(p.position)}</UI.TableCell>
                    <UI.TableCell>
                      {p.onPageOne && p.object ? (<GoButton href={titlesHref(p.object.id)} label="Improve title and description" accessibilityLabel={`Improve the search title and description of ${p.object.title ?? 'this product'}`}/>) : p.onPageOne ? (<UI.Text color="subdued">Improve its title and description in the Titles tab</UI.Text>) : (<UI.Text color="subdued">Shown mostly below the first page, where few people click. A better title alone is unlikely to change that.</UI.Text>)}
                    </UI.TableCell>
                  </UI.TableRow>))}
              </UI.TableBody>
            </UI.Table>)}
        </UI.Stack>
      </UI.Section>
    </>);
}
function PageTable({ rows, comparable }: {
    rows: PageItem[];
    comparable: boolean;
}) {
    return (<UI.Table variant="auto">
      <UI.TableHeaderRow>
        <UI.TableHeader listSlot="primary">Page</UI.TableHeader>
        <UI.TableHeader format="numeric">Clicks</UI.TableHeader>
        <UI.TableHeader format="numeric">Times shown</UI.TableHeader>
        <UI.TableHeader format="numeric">Clicked</UI.TableHeader>
        <UI.TableHeader format="numeric">Position</UI.TableHeader>
        {comparable ? <UI.TableHeader format="numeric">Clicks change</UI.TableHeader> : null}
      </UI.TableHeaderRow>
      <UI.TableBody>
        {rows.map((p) => (<UI.TableRow key={p.url}>
            <UI.TableCell>
              <PageCell item={p}/>
            </UI.TableCell>
            <UI.TableCell>{fmtNumber(p.clicks)}</UI.TableCell>
            <UI.TableCell>{fmtNumber(p.impressions)}</UI.TableCell>
            <UI.TableCell>{fmtCtr(p.ctr)}</UI.TableCell>
            <UI.TableCell>{fmtPosition(p.position)}</UI.TableCell>
            {comparable ? <UI.TableCell>{changeText(p.clickChange)}</UI.TableCell> : null}
          </UI.TableRow>))}
      </UI.TableBody>
    </UI.Table>);
}
