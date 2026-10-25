import { useStore } from '../plan-context';
import { useEffect, useState } from 'react';
import { APP_PATHS, searchHref } from '@/lib/shopify-app/app-routes-core';
import { api, toastSuccess } from '../api';
import { fmtDateTime, fmtNumber } from '../format';
import { act, creditsLabel, GoButton, Loading, PagePrimaryAction, openAdmin, useLoad, type PageError } from '../kit';
import { isAdminLink } from '@/lib/store-app/admin-target-core';
import { useRouter } from '../router';
import { SkeletonCards, SkeletonSection } from '../components/Status';
import * as UI from '../ui';
type Severity = 'must' | 'should' | 'nice';
type Action = {
    label: string;
    href: string;
    credits: number | null;
};
interface Card {
    key: string;
    severity: Severity;
    line: string;
    why?: string;
    pages: number;
    points: number;
    pointsNote: string | null;
    effortLabel: string;
    examples: Array<{
        title: string | null;
        type: string;
        imageUrl: string | null;
    }>;
    more: number;
    actions: Action[];
}
export interface SeoOverviewData {
    state: 'ready' | 'first_check';
    refreshing: boolean;
    readFailed?: boolean;
    trust: string;
    readAt?: string;
    truncated?: boolean;
    failures?: string[];
    passwordProtected?: boolean | null;
    health?: {
        score: number | null;
        band: 'needs_work' | 'fair' | 'good' | 'excellent' | null;
        bandLabel: string | null;
        checked: number;
        mustPages: number;
        counts: Record<Severity, number>;
    };
    definition?: string;
    trend?: Array<{
        day: string;
        score: number | null;
    }>;
    note?: string | null;
    fixFirst?: Card[];
    totalProblems?: number;
    areas?: Array<{
        key: string;
        label: string;
        score: number | null;
        line: string;
        href: string;
        measures: string;
    }>;
    results?: {
        view: string;
        clicks: number | null;
        previousClicks: number | null;
        impressions: number | null;
        comparable: boolean;
        window: {
            from: string;
            to: string;
        } | null;
        fixes?: {
            measured: number;
            improved: number;
            declined: number;
            tooEarly: number;
            line: string | null;
        } | null;
    } | null;
    hero?: {
        key: string;
        line: string;
        points: number;
        scoreAfter: number;
        why: string | null;
        actions: Action[];
        examples: Card['examples'];
        more: number;
    } | null;
    holdingBack?: Array<{
        code: string;
        label: string;
        points: number;
        pages: number;
    }>;
    delta?: {
        fixed: number;
        added: number;
    } | null;
    coverage?: {
        product: number;
        collection: number;
        page: number;
        article: number;
        home: boolean;
    };
    notChecked?: Array<{
        area: string;
        reason: string;
    }>;
    passed?: string[];
    recentChanges?: Array<{
        id: string;
        label: string;
        kind: string;
        at: string;
        state: 'confirmed' | 'saved' | 'undone' | 'failed';
        result: {
            verdict: string;
            sentence: string;
        } | null;
    }>;
    googleConnected?: boolean;
}
const SEVERITY: Record<Severity, {
    label: string;
    tone: 'warning' | 'caution' | 'info';
}> = {
    must: { label: 'Must fix', tone: 'warning' },
    should: { label: 'Should fix', tone: 'caution' },
    nice: { label: 'Nice to have', tone: 'info' },
};
const BAND_TONE = { needs_work: 'warning', fair: 'caution', good: 'success', excellent: 'success' } as const;
const plural = (n: number, one: string, many: string) => `${fmtNumber(n)} ${n === 1 ? one : many}`;
const actionLabel = (a: Action) => (a.credits === null ? a.label : `${a.label} · ${creditsLabel(a.credits)}`);
function Meter({ value, faint = false }: {
    value: number | null;
    faint?: boolean;
}) {
    return (<svg width="100%" height="6" aria-hidden="true" focusable="false" style={{ display: 'block' }}>
      <rect x="0" y="0" width="100%" height="6" rx="3" fill="currentColor" fillOpacity={0.1}/>
      {value !== null && value > 0 ? <rect x="0" y="0" width={`${value}%`} height="6" rx="3" fill="currentColor" fillOpacity={faint ? 0.4 : 0.75}/> : null}
    </svg>);
}
function Trend({ points }: {
    points: Array<{
        day: string;
        score: number | null;
    }>;
}) {
    const known = points.filter((p): p is {
        day: string;
        score: number;
    } => p.score !== null);
    if (known.length < 2)
        return <UI.Text color="subdued">The trend appears after a second daily check.</UI.Text>;
    const w = 140;
    const h = 32;
    const step = w / (known.length - 1);
    const y = (s: number) => h - 2 - (s / 100) * (h - 4);
    const line = known.map((p, i) => `${(i * step).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ');
    const first = known[0]!;
    const last = known.at(-1)!;
    return (<UI.Stack direction="inline" gap="base" alignItems="center">
      <svg width={w} height={h} aria-hidden="true" focusable="false" style={{ display: 'block', overflow: 'visible' }}>
        <polyline points={line} fill="none" stroke="currentColor" strokeOpacity={0.75} strokeWidth="1.5" strokeLinejoin="round"/>
        <circle cx={(known.length - 1) * step} cy={y(last.score)} r="2.5" fill="currentColor"/>
      </svg>
      <UI.Text color="subdued">{first.score === last.score ? `Unchanged at ${last.score} over ${known.length} checks` : `From ${first.score} to ${last.score} over ${known.length} checks`}</UI.Text>
    </UI.Stack>);
}
function ScoreRing({ score }: {
    score: number;
}) {
    const r = 40;
    const c = 2 * Math.PI * r;
    return (<svg width="104" height="104" viewBox="0 0 104 104" aria-hidden="true" focusable="false" style={{ display: 'block', flex: 'none' }}>
      <circle cx="52" cy="52" r={r} fill="none" stroke="currentColor" strokeOpacity={0.1} strokeWidth="10"/>
      <circle cx="52" cy="52" r={r} fill="none" stroke="currentColor" strokeOpacity={0.8} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 52 52)"/>
      <text x="52" y="52" textAnchor="middle" dominantBaseline="central" fill="currentColor" style={{ fontSize: 30, fontWeight: 650 }}>
        {score}
      </text>
    </svg>);
}
function PointsBreakdown({ items, score }: {
    items: NonNullable<SeoOverviewData['holdingBack']>;
    score: number;
}) {
    if (items.length === 0)
        return null;
    return (<UI.Stack gap="small-200">
      <UI.Text type="strong">Where your points go</UI.Text>
      <UI.Stack gap="small-100">
        <UI.Stack direction="inline" gap="small-200" justifyContent="space-between">
          <UI.Text>Your score</UI.Text>
          <UI.Text type="strong">{`${score} of 100`}</UI.Text>
        </UI.Stack>
        <Meter value={score}/>
      </UI.Stack>
      {items.map((it) => (<UI.Stack key={it.code} gap="small-100">
          <UI.Stack direction="inline" gap="small-200" justifyContent="space-between">
            <UI.Text>{`${it.label} (${plural(it.pages, 'page', 'pages')})`}</UI.Text>
            <UI.Text type="strong">{`−${it.points} points`}</UI.Text>
          </UI.Stack>
          <Meter value={it.points} faint/>
        </UI.Stack>))}
    </UI.Stack>);
}
function Figure({ label, value }: {
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
function Hero({ d }: {
    d: SeoOverviewData;
}) {
    const [open, setOpen] = useState(false);
    const h = d.health!;
    const ready = h.checked - h.mustPages;
    const cov = d.coverage;
    const covered: Array<{
        icon: 'product' | 'collection' | 'page' | 'home';
        text: string;
    }> = cov
        ? [
            ...(cov.product ? [{ icon: 'product' as const, text: plural(cov.product, 'product', 'products') }] : []),
            ...(cov.collection ? [{ icon: 'collection' as const, text: plural(cov.collection, 'collection', 'collections') }] : []),
            ...(cov.page ? [{ icon: 'page' as const, text: plural(cov.page, 'page', 'pages') }] : []),
            ...(cov.article ? [{ icon: 'page' as const, text: plural(cov.article, 'blog post', 'blog posts') }] : []),
            ...(cov.home ? [{ icon: 'home' as const, text: 'Home page' }] : []),
        ]
        : [];
    const notChecked = [...new Map((d.notChecked ?? []).map((n) => [d.passwordProtected ? 'password' : n.area, n])).entries()].map(([k, n]) => k === 'password' ? { areas: (d.notChecked ?? []).map((x) => x.area).join(' and '), reason: 'your store has a password, so it cannot be read from outside.' } : { areas: n.area, reason: n.reason.charAt(0).toLowerCase() + n.reason.slice(1) });
    return (<UI.Section heading="SEO health">
      <UI.QueryContainer>
        <UI.Grid gridTemplateColumns="@container (inline-size > 760px) 3fr 2fr, 1fr" gap="large">
          <UI.Stack gap="base">
            
            <UI.Stack direction="inline" gap="base" alignItems="center">
              {h.score !== null ? <ScoreRing score={h.score}/> : null}
              <UI.Stack gap="small-200">
                <UI.Stack direction="inline" gap="small-200" alignItems="center">
                  <UI.Heading fontSize="large-200">{h.score === null ? 'Nothing in search yet' : `${fmtNumber(ready)} of ${fmtNumber(h.checked)} ${h.checked === 1 ? 'page' : 'pages'} ready for Google`}</UI.Heading>
                  {h.band && h.bandLabel ? <UI.Badge tone={BAND_TONE[h.band]}>{h.bandLabel}</UI.Badge> : null}
                </UI.Stack>
                <UI.Text color="subdued">{`Score ${h.score ?? 0} out of 100: the share of your pages with nothing that must be fixed.`}</UI.Text>
                {d.hero ? (<UI.Stack direction="inline" gap="small-200" alignItems="center">
                    <UI.Text type="strong">{`${h.score} `}</UI.Text>
                    <UI.Icon type="arrow-right" size="small"/>
                    <UI.Text type="strong">{`${d.hero.scoreAfter} when you fix the problem below`}</UI.Text>
                  </UI.Stack>) : null}
              </UI.Stack>
            </UI.Stack>

            {d.hero ? (<UI.Box padding="base" background="subdued" borderRadius="large">
                <UI.Stack gap="base">
                  <UI.Stack direction="inline" gap="small-200" alignItems="center" justifyContent="space-between">
                    <UI.Stack direction="inline" gap="small-200" alignItems="center">
                      <UI.Icon type="alert-triangle" tone="warning"/>
                      <UI.Heading>{d.hero.line.replace(/\.$/, '')}</UI.Heading>
                    </UI.Stack>
                    <UI.Badge tone="warning">{`−${d.hero.points} points`}</UI.Badge>
                  </UI.Stack>
                  {d.hero.why ? <UI.Text color="subdued">{d.hero.why}</UI.Text> : null}
                  <ExampleChips examples={d.hero.examples} more={d.hero.more}/>
                  <UI.Stack direction="inline" gap="small-200">
                    {d.hero.actions.map((a) => (<GoButton key={a.href + a.label} href={a.href} label={actionLabel(a)}/>))}
                  </UI.Stack>
                </UI.Stack>
              </UI.Box>) : h.score === 100 ? (<UI.Stack direction="inline" gap="small-200" alignItems="center">
                <UI.Icon type="check-circle" tone="success"/>
                <UI.Text>Nothing must be fixed. The suggestions below can still win more clicks.</UI.Text>
              </UI.Stack>) : null}

            <PointsBreakdown items={d.holdingBack ?? []} score={h.score ?? 0}/>
            {d.note ? <UI.Text>{d.note}</UI.Text> : null}
            <UI.Stack gap="small-200">
              <UI.Box>
                <UI.Button variant="tertiary" onClick={() => setOpen(!open)} accessibilityLabel="How this score is worked out">
                  {open ? 'Hide how this is worked out' : 'How this is worked out'}
                </UI.Button>
              </UI.Box>
              {open ? <UI.Text color="subdued">{d.definition}</UI.Text> : null}
            </UI.Stack>
          </UI.Stack>

          <UI.Stack gap="base">
            <UI.Grid gridTemplateColumns="1fr 1fr 1fr" gap="small-200">
              <Figure label="Pages checked" value={fmtNumber(h.checked)}/>
              <Figure label="Ready" value={fmtNumber(ready)}/>
              <Figure label="Must fix" value={fmtNumber(h.mustPages)}/>
            </UI.Grid>

            <UI.Stack gap="small-200">
              <UI.Text type="strong">What we checked</UI.Text>
              <UI.Stack direction="inline" gap="base">
                {covered.map((c) => (<UI.Stack key={c.text} direction="inline" gap="small-100" alignItems="center">
                    <UI.Icon type={c.icon} size="small"/>
                    <UI.Text>{c.text}</UI.Text>
                  </UI.Stack>))}
              </UI.Stack>
              <UI.Text color="subdued">Every page that is in search, read {fmtDateTime(d.readAt)}.</UI.Text>
              {notChecked.map((n) => (<UI.Grid key={n.areas} gridTemplateColumns="auto minmax(0, 1fr)" gap="small-200" alignItems="start">
                  <UI.Icon type="lock" size="small"/>
                  <UI.Text color="subdued">{`Not checked: ${n.areas}, because ${n.reason}`}</UI.Text>
                </UI.Grid>))}
              {d.truncated ? <UI.Text color="subdued">Your store is large: the first 2,000 of each kind of page are checked.</UI.Text> : null}
            </UI.Stack>

            <UI.Divider />
            <UI.Stack gap="small-200">
              <UI.Text type="strong">Since the last check</UI.Text>
              {d.delta ? (<>
                  <Trend points={d.trend ?? []}/>
                  <UI.Stack direction="inline" gap="small-200">
                    <UI.Badge tone={d.delta.fixed > 0 ? 'success' : 'neutral'}>{`${fmtNumber(d.delta.fixed)} fixed`}</UI.Badge>
                    <UI.Badge tone={d.delta.added > 0 ? 'warning' : 'neutral'}>{`${fmtNumber(d.delta.added)} new`}</UI.Badge>
                  </UI.Stack>
                </>) : (<UI.Text color="subdued">This is your first check. From tomorrow, this shows the trend and what was fixed or is new.</UI.Text>)}
            </UI.Stack>
          </UI.Stack>
        </UI.Grid>
      </UI.QueryContainer>
    </UI.Section>);
}
function ExampleChips({ examples, more }: {
    examples: Card['examples'];
    more: number;
}) {
    if (examples.length === 0)
        return null;
    return (<UI.Stack direction="inline" gap="small-200" alignItems="center">
      {examples.map((e, i) => (<UI.Box key={`${e.title}-${i}`} padding="small-200" background="base" border="base" borderRadius="base">
          <UI.Grid gridTemplateColumns="auto minmax(0, 1fr)" gap="small-200" alignItems="center">
            {e.imageUrl ? <UI.Thumbnail src={e.imageUrl} alt="" size="small-200"/> : <UI.Thumbnail alt="" size="small-200"/>}
            <UI.Text>{e.title ?? 'Untitled'}</UI.Text>
          </UI.Grid>
        </UI.Box>))}
      {more > 0 ? <UI.Badge>{`+${fmtNumber(more)} more`}</UI.Badge> : null}
    </UI.Stack>);
}
function ProblemCard({ c }: {
    c: Card;
}) {
    return (<UI.Box padding="base" border="base" borderRadius="large">
      <UI.Stack gap="small-200">
        <UI.Stack direction="inline" gap="small-200" alignItems="center" justifyContent="space-between">
          <UI.Text type="strong">{c.line}</UI.Text>
          <UI.Stack direction="inline" gap="small-200">
            <UI.Badge tone={SEVERITY[c.severity].tone}>{SEVERITY[c.severity].label}</UI.Badge>
            <UI.Badge tone={c.points > 0 ? 'info' : 'neutral'}>{c.points > 0 ? `+${c.points} points` : 'Not in score'}</UI.Badge>
          </UI.Stack>
        </UI.Stack>
        {c.why ? <UI.Text color="subdued">{c.why}</UI.Text> : null}
        <ExampleChips examples={c.examples} more={c.more}/>
        <UI.Stack direction="inline" gap="small-200">
          {c.actions.map((a) => (<GoButton key={a.href + a.label} href={a.href} label={actionLabel(a)}/>))}
        </UI.Stack>
      </UI.Stack>
    </UI.Box>);
}
function FixFirst({ d }: {
    d: SeoOverviewData;
}) {
    const cards = d.fixFirst ?? [];
    return (<UI.Section heading={d.hero ? 'Then fix these' : 'Fix these first'}>
      {cards.length === 0 ? (<UI.Text>{d.hero ? 'Nothing else to fix in what we checked.' : 'Nothing to fix in what we checked. We check your store again every day.'}</UI.Text>) : (<UI.Stack gap="base">
          {cards.some((c) => c.points === 0) ? (<UI.Text color="subdued">Only must-fix problems count toward the score. Those marked “Not in score” still help shoppers and Google.</UI.Text>) : null}
          {cards.map((c) => (<ProblemCard key={c.key} c={c}/>))}
          {(() => {
                const rest = (d.totalProblems ?? 0) - cards.length - (d.hero ? 1 : 0);
                return rest > 0 ? <UI.Text color="subdued">{`${plural(rest, 'smaller problem is', 'smaller problems are')} in the areas.`}</UI.Text> : null;
            })()}
        </UI.Stack>)}
    </UI.Section>);
}
function Areas({ d }: {
    d: SeoOverviewData;
}) {
    const { navigate } = useRouter();
    return (<UI.Section heading="Areas">
      <UI.Stack gap="small-200">
        <UI.Text color="subdued">Each area is scored on its own. Open one to see what it measures and fix it.</UI.Text>
        {(d.areas ?? []).map((a, i) => (<UI.Stack key={a.key} gap="small-200">
            {i > 0 ? <UI.Divider /> : null}
            <UI.Clickable onClick={() => (isAdminLink(a.href) ? openAdmin(a.href) : navigate(a.href))} accessibilityLabel={`${a.label}: ${a.score === null ? 'not checked' : `${a.score} out of 100`}. ${a.line} It measures: ${a.measures}`}>
              <UI.Stack gap="small-100">
                <UI.Stack direction="inline" gap="small-200" alignItems="center" justifyContent="space-between">
                  <UI.Text type="strong">{a.label}</UI.Text>
                  <UI.Text>{a.score === null ? 'Not checked' : `${a.score}/100`}</UI.Text>
                </UI.Stack>
                {a.score !== null ? <Meter value={a.score}/> : null}
                <UI.Text color="subdued">{a.line}</UI.Text>
              </UI.Stack>
            </UI.Clickable>
          </UI.Stack>))}
      </UI.Stack>
    </UI.Section>);
}
function Google({ d }: {
    d: SeoOverviewData;
}) {
    const r = d.results;
    if (!r || r.view !== 'ready' || r.clicks === null) {
        return (<UI.Section heading="Results from Google">
        <UI.Stack gap="small-200">
          <UI.Text>
            {r === null ? 'Your Google results could not be read just now.' : 'Connect Google Search Console (free) to see the clicks Google sends, and whether each fix brought more.'}
          </UI.Text>
          <UI.Box>
            <GoButton href={searchHref('google')} label={r === null ? 'Open Google' : 'Connect'}/>
          </UI.Box>
        </UI.Stack>
      </UI.Section>);
    }
    const change = r.comparable && r.previousClicks !== null ? r.clicks - r.previousClicks : null;
    return (<UI.Section heading="Results from Google">
      <UI.Stack gap="small-200">
        <UI.Stack direction="inline" gap="small-200" alignItems="baseline">
          <UI.Heading fontSize="large-100" accessibilityRole="presentation">{fmtNumber(r.clicks)}</UI.Heading>
          <UI.Text color="subdued">clicks in the last 28 days</UI.Text>
        </UI.Stack>
        <UI.Text color="subdued">
          {change === null ? 'No comparable 28 days before.' : change === 0 ? 'The same as the 28 days before.' : `${change > 0 ? 'Up' : 'Down'} ${fmtNumber(Math.abs(change))} on the 28 days before.`}
        </UI.Text>
        <UI.Text>{r.fixes?.line ?? 'Each fixed page is compared before and after, from 14 days after its change.'}</UI.Text>
        <UI.Box>
          <GoButton href={searchHref('google')} label="Open Google"/>
        </UI.Box>
      </UI.Stack>
    </UI.Section>);
}
const CHANGE_STATE: Record<string, {
    label: string;
    tone: 'success' | 'info' | 'neutral' | 'critical';
}> = {
    confirmed: { label: 'Confirmed on your store', tone: 'success' },
    saved: { label: 'Saved', tone: 'info' },
    undone: { label: 'Undone', tone: 'neutral' },
    failed: { label: 'Not saved', tone: 'critical' },
};
function RecentFixes({ d }: {
    d: SeoOverviewData;
}) {
    const items = d.recentChanges ?? [];
    return (<UI.Section heading="Your recent fixes">
      {items.length === 0 ? (<UI.Text color="subdued">Fixes you make here are listed with their result.</UI.Text>) : (<UI.Stack gap="small-200">
          {items.map((c, i) => (<UI.Stack key={c.id} gap="small-100">
              {i > 0 ? <UI.Divider /> : null}
              <UI.Text>{c.label}</UI.Text>
              <UI.Stack direction="inline" gap="small-200" alignItems="center">
                <UI.Badge tone={CHANGE_STATE[c.state]!.tone}>{CHANGE_STATE[c.state]!.label}</UI.Badge>
                <UI.Text color="subdued">{fmtDateTime(c.at)}</UI.Text>
              </UI.Stack>
              {c.result ? (<UI.Text color="subdued">{c.result.sentence}</UI.Text>) : c.kind === 'seo' && c.state !== 'undone' && c.state !== 'failed' ? (<UI.Text color="subdued">{d.googleConnected ? 'Its result in Google shows 14 days after the change.' : 'Connect Search Console to see its result in Google.'}</UI.Text>) : null}
            </UI.Stack>))}
          <UI.Link href={APP_PATHS.changes}>See every change and undo</UI.Link>
        </UI.Stack>)}
    </UI.Section>);
}
function AlreadyFine({ d }: {
    d: SeoOverviewData;
}) {
    const passed = d.passed ?? [];
    if (passed.length === 0)
        return null;
    return (<UI.Section heading={`What's already fine (${fmtNumber(passed.length)})`}>
      <UI.Stack gap="small-200">
        {passed.map((p) => (<UI.Grid key={p} gridTemplateColumns="auto minmax(0, 1fr)" gap="small-200" alignItems="center">
            <UI.Icon type="check-circle" tone="success" size="small"/>
            <UI.Text>{p}</UI.Text>
          </UI.Grid>))}
      </UI.Stack>
    </UI.Section>);
}
export function SeoOverview({ setError }: {
    setError: (e: PageError | null) => void;
}) {
    const { words } = useStore();
    const load = useLoad<SeoOverviewData>('seo/overview');
    const [busy, setBusy] = useState(false);
    const d = load.data;
    const refreshingNow = d?.refreshing === true;
    useEffect(() => {
        if (!refreshingNow)
            return;
        const id = setTimeout(() => void load.reload(), 4000);
        return () => clearTimeout(id);
    }, [refreshingNow, load]);
    async function checkAgain() {
        const r = await act(() => api<{
            started: boolean;
            refreshing: boolean;
        }>('seo/refresh', { method: 'POST' }), setBusy, setError);
        if (r.ok) {
            toastSuccess('Checking your store again');
            await load.reload();
        }
    }
    if (!d) {
        return load.error ? null : (<>
        <SkeletonSection />
        <SkeletonCards count={3}/>
      </>);
    }
    const action = (<PagePrimaryAction disabled={busy || refreshingNow} loading={busy} onClick={() => void checkAgain()}>
      {refreshingNow ? 'Checking now' : 'Check again'}
    </PagePrimaryAction>);
    if (d.state === 'first_check') {
        return (<>
        {action}
        <UI.Section heading={d.readFailed ? 'Your store could not be read' : 'Checking your store'}>
          {d.readFailed ? (<UI.Text>We could not read your products and pages just now, so there is nothing to show yet. Select Check again to try now; we also try again on our own.</UI.Text>) : (<UI.Stack gap="base">
              <Loading label={`Reading your products, ${words.collections}, pages and posts`}/>
              <UI.Text color="subdued">This takes under a minute. The page updates when it is done.</UI.Text>
            </UI.Stack>)}
        </UI.Section>
      </>);
    }
    return (<>
      {action}
      <UI.Stack gap="base">
        {refreshingNow ? (<UI.Stack direction="inline" gap="small-200" alignItems="center">
            <UI.Spinner accessibilityLabel="Checking your store" size="base"/>
            <UI.Text color="subdued">Checking your store again. Showing the check from {fmtDateTime(d.readAt)}.</UI.Text>
          </UI.Stack>) : d.readFailed ? (<UI.Text color="subdued">Showing the check from {fmtDateTime(d.readAt)}: your store could not be read just now. We try again on our own.</UI.Text>) : null}
        {d.failures && d.failures.length > 0 ? <UI.Text color="subdued">{`Your ${d.failures.join(', ')} could not be read in this check, so they are not counted.`}</UI.Text> : null}
        <Hero d={d}/>
        <UI.QueryContainer>
          <UI.Grid gridTemplateColumns="@container (inline-size > 900px) 2fr 1fr, 1fr" gap="base" alignItems="start">
            <FixFirst d={d}/>
            <UI.Stack gap="base">
              <Areas d={d}/>
              <Google d={d}/>
            </UI.Stack>
          </UI.Grid>
        </UI.QueryContainer>
        
        <UI.QueryContainer>
          <UI.Grid gridTemplateColumns="@container (inline-size > 900px) 1fr 1fr, 1fr" gap="base" alignItems="start">
            <RecentFixes d={d}/>
            <AlreadyFine d={d}/>
          </UI.Grid>
        </UI.QueryContainer>
        <UI.Text color="subdued">{d.trust}</UI.Text>
      </UI.Stack>
    </>);
}
