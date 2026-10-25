import { useEffect, useState } from 'react';
import { APP_PATHS, aiVisibilityHref, answerQuestionHref, shoppingQuestionHref } from '@/lib/shopify-app/app-routes-core';
import { cameFromPlanPage, NO_HOME_CARDS_PUT_AWAY, type HomeCard, type HomeCardsState, type PlanCard } from '@/lib/shopify-app/home-core';
import type { ShopifyAccountData } from '@/lib/shopify-app/home-types';
import { headlineShare } from '@/lib/shopify-app/share-bars-core';
import { GUIDE_COVERS, setupGuide } from '@/lib/shopify-app/setup-guide-core';
import { api } from '../api';
import { host } from '../host';
import { planToName, usePlan, useStore } from '../plan-context';
import { fmtDate, fmtNumber, fmtPercent } from '../format';
import { ErrorBanner, GoButton, act, formatDate, useLoad, usePageError } from '../kit';
import { MetricCard, MetricRow } from '../components/MetricCard';
import { rateText } from '../components/ShareBars';
import { SkeletonCards, SkeletonSection, StatusBadge } from '../components/Status';
import { SetupCard, SetupProgress, type SetupView } from './Setup';
import { EmbedStatusLine, embedActivateLink, useEmbedStatus, type EmbedReading } from '../shopify-views/EmbedStatus';
import type { PresentedSurface } from './BuyerQueries';
import { FreePhotoCard } from '../components/ImageStudio';
import * as UI from '../ui';
interface Overview {
    shop: {
        name: string | null;
        domain: string;
        primaryHost: string | null;
    };
    setup: {
        onboardingStatus: string | null;
        brandName: string | null;
        products: number;
        shoppingQuestions: number;
        brandQuestions: number;
    };
    numbers: Array<{
        key: string;
        label: string;
        value: string | null;
        basis: string;
        pending?: boolean;
    }>;
    hero: {
        state: string;
        headline: string;
        subline: string | null;
    } | null;
    actions: Array<{
        key: string;
        title: string;
        detail: string;
        href: string;
        admin: boolean;
        button?: string;
    }>;
    verdict?: {
        line: string;
        named: boolean;
        promptId: string;
        shoppingId?: string | null;
        checkedAt: string;
    } | null;
    sinceStart?: {
        since: string | null;
        lines: string[];
    } | null;
    firstResult: {
        kind: 'own_store' | 'other_stores' | 'no_products';
        headline: string;
        detail: string;
        question: string;
        surfaceLabel: string;
        whoAppeared: Array<{
            title: string | null;
            merchant: string | null;
            price: string | null;
            position: number | null;
            isOwnStore: boolean;
        }>;
        basis: string;
        offerDiagnosis: boolean;
    } | null;
    readiness: {
        state: string;
        title: string;
        body: string;
        tone: 'warning' | 'info' | 'success';
    };
    catalogue: {
        checkedAt: string;
        lead: string;
        detail: string | null;
        details: string | null;
        topFixes: Array<{
            code: string;
            products: number;
            title: string;
            fix: string;
        }>;
        measures?: {
            products: number;
            canBeShown: number;
            cantBeShown: number;
            cantTell: number;
            missingDetails: number;
        };
        gapCounts?: Partial<Record<string, number>>;
        passwordProtected?: boolean | null;
    } | null;
    hasPlan: boolean;
    freeSnapshot?: {
        line: string;
        lastAt: string | null;
        nextAt: string | null;
    } | null;
    storeShare: PresentedSurface[] | null;
    plan: {
        card: PlanCard;
        account: ShopifyAccountData | null;
        schedule: Array<{
            key: string;
            label: string;
            text: string;
            date: string | null;
        }>;
        keepLine: string | null;
    };
    connection: {
        status: string | null;
        needsReopen: boolean;
    } | null;
    setupCard: SetupView | null;
    homeCards?: HomeCardsState | null;
    storeKnowledge?: {
        brand: string;
        asked: boolean;
        lastCheckedAt: string | null;
        freeAvailable: boolean;
    } | null;
}
type ConfirmState = 'idle' | 'confirming' | 'confirmed' | 'pending';
const CONFIRM_TRIES = 5;
const CONFIRM_DELAY_MS = 1500;
const PLAN_BADGE: Record<PlanCard['kind'], {
    tone: 'success' | 'info' | 'neutral' | 'warning';
    label: (name: string | null) => string;
}> = {
    choose: { tone: 'neutral', label: () => 'No plan chosen' },
    free: { tone: 'neutral', label: () => 'Free plan' },
    trial: { tone: 'info', label: (n) => (n ? `${n}, free trial` : 'Free trial') },
    active: { tone: 'success', label: (n) => n ?? 'Plan active' },
    paused: { tone: 'warning', label: () => 'Plan paused' },
    lapsed: { tone: 'warning', label: () => 'Plan ended' },
    unknown: { tone: 'neutral', label: () => 'Plan' },
};
export function HomePage() {
    const { words, platform, capabilities } = useStore();
    const themeEmbed = capabilities ? capabilities.can.themeEmbed : platform === 'shopify';
    const setupStart = capabilities ? capabilities.can.setupStart : platform === 'shopify';
    const setupGuide = platform === 'shopify';
    const overview = useLoad<Overview>('overview');
    const { plan, reload: reloadPlan } = usePlan();
    const [confirm, setConfirm] = useState<ConfirmState>(() => (cameFromPlanPage(host.location().search) ? 'confirming' : 'idle'));
    useEffect(() => {
        if (confirm !== 'confirming')
            return;
        let cancelled = false;
        void (async () => {
            for (let attempt = 0; attempt < CONFIRM_TRIES && !cancelled; attempt++) {
                const r = await api<{
                    confirmed: boolean;
                    overview?: Overview;
                }>('billing/confirm', { method: 'POST' });
                if (r.ok && r.data?.confirmed) {
                    if (!cancelled) {
                        setConfirm('confirmed');
                        if (r.data.overview)
                            overview.replace(r.data.overview);
                        else
                            void overview.reload();
                        void reloadPlan();
                    }
                    return;
                }
                await new Promise((res) => setTimeout(res, CONFIRM_DELAY_MS));
            }
            if (!cancelled)
                setConfirm('pending');
        })();
        return () => {
            cancelled = true;
        };
    }, [confirm]);
    const o = overview.data;
    const heading = o?.shop.name ?? 'RankX AI';
    const setup = o?.setupCard ?? null;
    const setupOpen = setup !== null && setup.phase !== 'done' && !(setup.phase === 'not_started' && (o?.hasPlan !== true || !setupStart));
    const [setupKey, setSetupKey] = useState(0);
    const unlockPlan = planToName(plan) ?? 'a paid plan';
    const embed = useEmbedStatus();
    const [cardsChanged, setCardsChanged] = useState<HomeCardsState | null>(null);
    const [cardError, setCardError] = usePageError();
    const cards = cardsChanged ?? o?.homeCards ?? NO_HOME_CARDS_PUT_AWAY;
    async function changeCard(card: HomeCard, state: 'dismissed' | 'collapsed' | 'expanded') {
        const before = cards;
        setCardsChanged({
            dismissed: state === 'dismissed' ? [...before.dismissed, card] : before.dismissed,
            collapsed: state === 'collapsed' ? [...before.collapsed, card] : state === 'expanded' ? before.collapsed.filter((c) => c !== card) : before.collapsed,
        });
        const r = await act(() => api<{
            homeCards: HomeCardsState;
        }>('settings/home-cards', { method: 'POST', body: { card, state } }), () => undefined, setCardError);
        setCardsChanged(r.ok && r.data ? r.data.homeCards : before);
    }
    const guideShown = !!o && !o.hasPlan && !!o.catalogue && setupGuide && !cards.dismissed.includes('setup_guide');
    const showPromo = !!o && !o.hasPlan && !cards.dismissed.includes('plan_promo');
    return (<UI.Page heading={heading} inlineSize="large">
      <UI.Button slot="secondary-actions" href={APP_PATHS.notifications}>
        Notifications
      </UI.Button>
      {overview.error || cardError ? (<ErrorBanner error={cardError ?? overview.error} onDismiss={cardError ? () => setCardError(null) : undefined}/>) : o?.connection?.needsReopen ? (<UI.Banner tone="warning" heading="Reconnect your store">
          <UI.Paragraph>{words.reconnectBanner}</UI.Paragraph>
        </UI.Banner>) : null}
      {!o && overview.loading ? (<>
          <SkeletonCards count={3}/>
          <SkeletonSection lines={3} label="Loading your next actions"/>
        </>) : null}
      {o ? (<UI.Stack gap="base">
          
          <UI.Stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
            <StatusLine o={o} confirming={confirm === 'confirming'}/>
            {themeEmbed ? <EmbedStatusLine status={embed} withLink={!guideShown}/> : null}
          </UI.Stack>
          {confirm === 'pending' ? <UI.Paragraph>{`${words.platform} is still confirming your plan. Reload this page in a minute to see it.`}</UI.Paragraph> : null}

          
          {setup && setup.phase === 'not_started' && o.hasPlan && setupStart ? (<SetupCard onTrial={o.plan.account?.status === 'trial'} onStarted={() => {
                    void overview.reload();
                    setSetupKey((k) => k + 1);
                }}/>) : setupOpen && setup ? (<SetupProgress key={`${setupKey}-${setup.status ?? 'none'}`} initial={setup} onSettled={() => void overview.reload()}/>) : null}

          {!o.hasPlan && o.catalogue && setupGuide && !cards.dismissed.includes('setup_guide') ? (<SetupGuide catalogue={o.catalogue} embed={themeEmbed ? embed : null} collapsed={cards.collapsed.includes('setup_guide')} onChange={(state) => void changeCard('setup_guide', state)}/>) : null}

          
          <FreePhotoCard />

          <Verdict o={o}/>

          {o.storeKnowledge ? <StoreKnowledgeCard k={o.storeKnowledge}/> : null}

          <HomeMetrics o={o} unlockPlan={unlockPlan}/>

          {setupOpen && setup?.phase !== 'checking' ? null : <NextActions actions={(guideShown ? o.actions.filter((a) => !coveredByGuide(a.key)) : o.actions).slice(0, 3)} primary={!showPromo}/>}

          {o.hasPlan && o.storeShare ? <WhoWins surfaces={o.storeShare}/> : null}

          {o.sinceStart ? (<UI.Section heading="Did it work?">
              <UI.Stack gap="small-200">
                {o.sinceStart.since ? <UI.Text color="subdued">{`Since your first product check on ${fmtDate(o.sinceStart.since)}:`}</UI.Text> : null}
                {o.sinceStart.lines.map((l) => (<UI.Text key={l}>{l}</UI.Text>))}
                <UI.Link href={APP_PATHS.changes}>See every change and its result</UI.Link>
              </UI.Stack>
            </UI.Section>) : null}

          {showPromo ? (<UI.Section heading="See whether ChatGPT and Google actually show your products">
              <UI.Stack gap="small-200">
                
                <UI.Paragraph>
                  {o.plan.account?.trialUsed === false
                    ? words.trialPromo
                    : 'And which stores win. Choose a plan to start checking.'}
                </UI.Paragraph>
                {o.plan.keepLine ? <UI.Text color="subdued">{o.plan.keepLine}</UI.Text> : null}
                <UI.Stack direction="inline" gap="small-200">
                  <UI.Button variant="primary" href={APP_PATHS.plan}>
                    See plans
                  </UI.Button>
                  
                  <UI.Button variant="tertiary" onClick={() => void changeCard('plan_promo', 'dismissed')}>
                    Dismiss
                  </UI.Button>
                </UI.Stack>
              </UI.Stack>
            </UI.Section>) : null}
        </UI.Stack>) : null}
    </UI.Page>);
}
function StatusLine({ o, confirming }: {
    o: Overview;
    confirming: boolean;
}) {
    const { words } = useStore();
    const b = PLAN_BADGE[o.plan.card.kind] ?? PLAN_BADGE.unknown;
    return (<UI.Stack direction="inline" gap="small-200" alignItems="center">
      <UI.Badge tone={b.tone}>{confirming ? 'Confirming your plan' : o.plan.card.kind === 'paused' ? words.pausedBadge : b.label(o.plan.account?.planName ?? null)}</UI.Badge>
      <UI.Text color="subdued">{o.catalogue ? `Products checked ${fmtDate(o.catalogue.checkedAt)}` : 'Checking your products now'}</UI.Text>
    </UI.Stack>);
}
function SetupGuide({ catalogue, embed, collapsed, onChange }: {
    catalogue: NonNullable<Overview['catalogue']>;
    embed: EmbedReading | null;
    collapsed: boolean;
    onChange: (state: 'dismissed' | 'collapsed' | 'expanded') => void;
}) {
    if (!catalogue.gapCounts)
        return null;
    const guide = setupGuide({ passwordProtected: catalogue.passwordProtected ?? null, gapCounts: catalogue.gapCounts, products: catalogue.measures?.products ?? null, ...(embed ? { embed: { status: embed, activateLink: embedActivateLink() } } : {}) }, fmtNumber);
    if (guide.complete)
        return null;
    return (<UI.Section heading="Get your products into AI shopping">
      <UI.Stack gap="base">
        
        <UI.Stack direction="inline" gap="small-200" alignItems="center" justifyContent="space-between">
          <UI.Text color="subdued">{`${guide.done} of ${guide.total} done`}</UI.Text>
          <UI.Stack direction="inline" gap="small-200">
            <UI.Button variant="tertiary" onClick={() => onChange(collapsed ? 'expanded' : 'collapsed')}>
              {collapsed ? 'Show steps' : 'Hide steps'}
            </UI.Button>
            <UI.Button variant="tertiary" onClick={() => onChange('dismissed')}>
              Dismiss guide
            </UI.Button>
          </UI.Stack>
        </UI.Stack>
        <UI.Progress value={guide.done} max={guide.total} accessibilityLabel={`${guide.done} of ${guide.total} setup steps done`}/>
        {collapsed ? null : guide.steps.map((s) => (<UI.Box key={s.key} padding="small-200" borderRadius="base" background={s.done === false ? 'base' : 'subdued'}>
            <UI.Stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
              <UI.Stack gap="small-100">
                <UI.Stack direction="inline" gap="small-200" alignItems="center">
                  {s.done === true ? <UI.Badge tone="success">Done</UI.Badge> : s.done === null ? <StatusBadge status="cant_tell"/> : <UI.Badge tone="warning">To do</UI.Badge>}
                  <UI.Text type="strong">{s.title}</UI.Text>
                </UI.Stack>
                <UI.Text color="subdued">{s.detail}</UI.Text>
              </UI.Stack>
              {s.action && s.done !== true ? (<GoButton href={s.action.href} label={s.action.label}/>) : null}
            </UI.Stack>
          </UI.Box>))}
      </UI.Stack>
    </UI.Section>);
}
function HomeMetrics({ o, unlockPlan }: {
    o: Overview;
    unlockPlan: string;
}) {
    const m = o.catalogue?.measures ?? null;
    const eligibility = o.numbers.find((n) => n.key === 'eligibility');
    const answers = o.numbers.find((n) => n.key === 'answers');
    const freeShopping = o.numbers.find((n) => n.key === 'shopping');
    const share = o.hasPlan && o.storeShare ? headlineShare(o.storeShare) : null;
    const checked = o.catalogue ? `From your product check on ${fmtDate(o.catalogue.checkedAt)}` : 'Being checked now';
    return (<MetricRow>
      <MetricCard label="Can be shown" value={m ? `${fmtNumber(m.canBeShown)} of ${fmtNumber(m.products)}` : (eligibility?.value ?? null)} unit="products" empty="Being checked" basis={m && m.cantTell > 0 ? `${checked}. For ${fmtNumber(m.cantTell)} we can’t tell.` : checked} badge={m && m.products > 0 ? (m.cantBeShown > 0 ? (<StatusBadge status="cant_be_shown" label={o.catalogue?.passwordProtected ? 'Blocked by your store password' : `${fmtNumber(m.cantBeShown)} can’t be shown`}/>) : (<StatusBadge status="can_be_shown" label="Nothing blocking"/>)) : null} href={APP_PATHS.products}/>
      {o.hasPlan ? (<MetricCard label="Your store in AI shopping answers" value={share && share.rate.shown ? `${fmtNumber(share.rate.k)} of ${fmtNumber(share.rate.n)}` : null} unit={share && share.rate.shown ? 'answers' : undefined} empty="Not enough checks yet" basis={share
                ? share.rate.shown
                    ? `${share.surfaceLabel} answers that showed products, last 30 days. ${fmtPercent(share.rate.p)}, likely ${fmtPercent(share.rate.lo)}–${fmtPercent(share.rate.hi)}.`
                    : `${share.surfaceLabel}: ${rateText(share.rate)}`
                : 'A rate is shown from 10 checks of a question.'} badge={share && share.rate.shown ? null : <StatusBadge status="measuring"/>} href={aiVisibilityHref('shopping')}/>) : o.freeSnapshot ? (<MetricCard label="Your store in AI shopping answers" value={freeShopping?.value ?? null} unit={freeShopping?.value ? 'checks showed yours' : undefined} empty={o.freeSnapshot.lastAt ? 'No answers to count yet' : 'First free check soon'} basis={o.freeSnapshot.line} badge={<StatusBadge status="measuring" label="Free check"/>} href={aiVisibilityHref('shopping')}/>) : (<MetricCard label="Your store in AI shopping answers" value={null} empty="Measured on a paid plan" basis="" locked={`See how often ChatGPT and Google show your store, and who wins instead. Available on ${unlockPlan}.`} badge={<StatusBadge status="locked"/>}/>)}
      {o.hasPlan && answers ? (<MetricCard label="AI answers that named your store" value={answers.value} empty={answers.pending ? 'First results are in' : 'Not measured yet'} basis={answers.basis} badge={answers.value ? null : <StatusBadge status="measuring"/>} href={aiVisibilityHref('shopping')}/>) : null}
    </MetricRow>);
}
function NextActions({ actions, primary = true }: {
    actions: Overview['actions'];
    primary?: boolean;
}) {
    if (actions.length === 0)
        return null;
    return (<UI.Section heading="Fix next">
      
      <UI.Stack gap="base">
        {actions.map((a, i) => (<UI.Stack key={a.key} gap="base">
            {i > 0 ? <UI.Divider /> : null}
            <UI.Stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
              <UI.Stack gap="small-100">
                <UI.Text type="strong">{a.title}</UI.Text>
                <UI.Text color="subdued">{a.detail}</UI.Text>
              </UI.Stack>
              <GoButton variant={i === 0 && primary ? 'primary' : 'secondary'} href={a.href} label={a.button ?? 'Open'}/>
            </UI.Stack>
          </UI.Stack>))}
      </UI.Stack>
    </UI.Section>);
}
function WhoWins({ surfaces }: {
    surfaces: PresentedSurface[];
}) {
    const measured = surfaces.filter((s) => s.triggerLabel === 'measured' && s.stores.length > 0);
    if (measured.length === 0)
        return null;
    return (<UI.Section heading="Who wins your shopper questions">
      <UI.Stack gap="base">
        {measured.length === 0 ? (<UI.Paragraph>Not enough checks yet to say which stores win. A rate is shown from 10 checks of a query.</UI.Paragraph>) : (<UI.Grid gridTemplateColumns="repeat(auto-fit, minmax(min(260px, 100%), 1fr))" gap="base">
            {measured.map((s) => {
                const own = s.own ?? s.stores.find((st) => st.isOwn) ?? null;
                const rows = [...s.stores.filter((st) => !st.isOwn).slice(0, 3).map((st) => ({ label: st.label, rate: st.rate, isOwn: false })), ...(own ? [{ label: own.label, rate: own.rate, isOwn: true }] : [])];
                return (<UI.Box key={s.surface} padding="base" border="base" borderRadius="base">
                  <UI.Stack gap="small-200">
                    <UI.Text type="strong">{s.label}</UI.Text>
                    {rows.map((r) => (<UI.Stack key={`${r.label}-${r.isOwn ? 'own' : 'x'}`} gap="small-100">
                        <UI.Stack direction="inline" gap="small-200" alignItems="center" justifyContent="space-between">
                          <UI.Stack direction="inline" gap="small-200" alignItems="center">
                            <UI.Text type={r.isOwn ? 'strong' : undefined}>{r.label}</UI.Text>
                            {r.isOwn ? <UI.Badge tone="info">You</UI.Badge> : null}
                          </UI.Stack>
                          <UI.Text color="subdued">{r.rate.shown ? `${fmtPercent(r.rate.p)} of ${fmtNumber(r.rate.n)}` : 'Not rated yet'}</UI.Text>
                        </UI.Stack>
                        
                        <svg width="100%" height="4" aria-hidden="true" focusable="false" style={{ display: 'block' }}>
                          <rect x="0" y="0" width="100%" height="4" rx="2" fill="currentColor" fillOpacity={0.1}/>
                          {r.rate.shown && r.rate.p > 0 ? <rect x="0" y="0" width={`${Math.min(1, r.rate.p) * 100}%`} height="4" rx="2" fill="currentColor" fillOpacity={0.7}/> : null}
                        </svg>
                      </UI.Stack>))}
                  </UI.Stack>
                </UI.Box>);
            })}
          </UI.Grid>)}
        <UI.Text color="subdued">Share of the answers that showed products, last 28 days.</UI.Text>
        <UI.Link href={aiVisibilityHref('competitors')}>See competing stores</UI.Link>
      </UI.Stack>
    </UI.Section>);
}
function StoreKnowledgeCard({ k }: {
    k: NonNullable<Overview['storeKnowledge']>;
}) {
    return (<UI.Section heading={`What AI tells shoppers about ${k.brand}`}>
      <UI.Stack gap="small-200">
        <UI.Paragraph>
          {k.lastCheckedAt
            ? `ChatGPT, Gemini and Perplexity were asked what ${k.brand} is and what customers say about it, on ${fmtDate(k.lastCheckedAt)}. See what they told shoppers, and anything they got wrong.`
            : k.asked
                ? 'ChatGPT, Gemini and Perplexity are being asked about your store. Their answers appear within minutes.'
                : `Shoppers ask AI about your store by name. See what ChatGPT, Gemini and Perplexity tell them, and anything they get wrong.${k.freeAvailable ? ' Free the first time.' : ''}`}
        </UI.Paragraph>
        <UI.Stack direction="inline">
          <UI.Button href={aiVisibilityHref('store')}>See what AI says about you</UI.Button>
        </UI.Stack>
      </UI.Stack>
    </UI.Section>);
}
function Verdict({ o }: {
    o: Overview;
}) {
    const v = o.verdict ?? null;
    const r = o.firstResult;
    const schedule = o.hasPlan ? o.plan.schedule : [];
    if (!v && !r && !o.hasPlan && !o.freeSnapshot)
        return null;
    return (<UI.Section heading="Do AI assistants recommend your store?">
      <UI.Stack gap="base">
        {v ? (<UI.Stack gap="small-200">
            <UI.Stack direction="inline" gap="small-200" alignItems="center">
              <UI.Badge tone={v.named ? 'success' : 'warning'}>{v.named ? 'Named you' : 'Not named'}</UI.Badge>
              <UI.Text color="subdued">{`Checked ${fmtDate(v.checkedAt)}`}</UI.Text>
            </UI.Stack>
            <UI.Text type="strong">{v.line}</UI.Text>
            <UI.Stack direction="inline" gap="base" alignItems="center">
              <UI.Button href={v.shoppingId ? shoppingQuestionHref(v.shoppingId) : answerQuestionHref(v.promptId)}>Read the answer</UI.Button>
              <UI.Link href={aiVisibilityHref('shopping')}>See every question</UI.Link>
            </UI.Stack>
          </UI.Stack>) : null}
        {r ? (<UI.Stack gap="small-100">
            
            <UI.Text>{`In AI shopping, for “${r.question}”: ${r.headline}.`}</UI.Text>
            <UI.Link href={aiVisibilityHref('shopping')}>{r.offerDiagnosis ? 'See why yours might not appear' : 'See the products shown'}</UI.Link>
          </UI.Stack>) : null}
        {!v && !r ? (<UI.Paragraph>
            {o.hasPlan
                ? 'Your first checks are running. The answers appear here within the hour.'
                : (o.freeSnapshot?.line ?? 'Your first free check runs soon.')}
          </UI.Paragraph>) : null}
        {schedule.map((line) => (<UI.Text key={line.key} color="subdued">
            {line.label}: {line.text.replace('{date}', formatDate(line.date))}
          </UI.Text>))}
      </UI.Stack>
    </UI.Section>);
}
function coveredByGuide(key: string): boolean {
    return GUIDE_COVERS.actionKeys.includes(key) || (key.startsWith('fix:') && GUIDE_COVERS.gapCodes.includes(key.slice(4)));
}
