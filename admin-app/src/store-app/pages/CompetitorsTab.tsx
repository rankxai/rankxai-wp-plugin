import { ofAnswers, siteHref } from '@/lib/shopify-app/competitors-page-core';
import { fmtNumber } from '../format';
import { ErrorBanner, useLoad } from '../kit';
import type { ShareRate } from '@/lib/shopify-app/share-bars-core';
import { ShareBar, ShareKey, rateText } from '../components/ShareBars';
import { SkeletonSection } from '../components/Status';
import { usePaged } from '../components/Pager';
import * as UI from '../ui';
interface StoreRow {
    label: string;
    isOwn: boolean;
    domain: string | null;
    rate: ShareRate | null;
    productCards: number | null;
    bestPosition: number | null;
}
interface Competitors {
    windowDays: number;
    stores: Array<{
        label: string;
        rated: boolean;
        rows: StoreRow[];
    }> | null;
    brands: {
        analysed: number;
        ownLabel: string;
        ownNamed: number;
        rows: Array<{
            name: string;
            answers: number;
            domain: string | null;
            listed: boolean;
        }>;
    };
    sites: {
        answers: number;
        rows: Array<{
            domain: string;
            answers: number;
            kind: 'own' | 'competitor' | null;
        }>;
    };
    answersCapped: number | null;
}
function SiteName({ label, domain }: {
    label: string;
    domain: string | null;
}) {
    return domain ? (<UI.Link href={siteHref(domain)} target="_blank" accessibilityLabel={`${label} (opens ${domain} in a new tab)`}>
      {label}
    </UI.Link>) : (<UI.Text>{label}</UI.Text>);
}
export function CompetitorsTab() {
    const load = useLoad<Competitors>('competitors');
    if (!load.data)
        return load.error ? <ErrorBanner error={load.error}/> : <SkeletonSection lines={6} label="Loading your competitors"/>;
    const d = load.data;
    const period = `Last ${d.windowDays} days`;
    const stores = d.stores?.filter((s) => s.rows.length > 0) ?? [];
    return (<UI.Stack gap="base">
      <Takeaways d={d} stores={stores} period={period}/>
      {d.stores === null ? (<UI.Section heading="Stores in AI shopping results">
          <UI.Paragraph>We could not read the stores in your shopping results just now. This is a loading problem, not a finding about your store.</UI.Paragraph>
        </UI.Section>) : stores.length === 0 ? (<UI.Section heading="Stores in AI shopping results">
          <UI.Paragraph>No other stores have appeared in the products shown for your questions yet. They are listed here once your questions are checked.</UI.Paragraph>
        </UI.Section>) : (stores.map((s, i) => <StoreSurface key={s.label} surface={s} period={period} last={i === stores.length - 1}/>))}
      <BrandsSection brands={d.brands} period={period} capped={d.answersCapped}/>
      <SitesSection sites={d.sites} period={period} capped={d.answersCapped}/>
    </UI.Stack>);
}
function Takeaways({ d, stores, period }: {
    d: Competitors;
    stores: Array<{
        label: string;
        rated: boolean;
        rows: StoreRow[];
    }>;
    period: string;
}) {
    const pct = (r: ShareRate | null) => (r && r.shown ? Math.round(r.p * 100) : null);
    const leads = stores
        .map((s) => {
        const leader = s.rows.filter((r) => !r.isOwn && r.rate?.shown).sort((a, b) => (pct(b.rate) ?? 0) - (pct(a.rate) ?? 0))[0] ?? null;
        const own = s.rows.find((r) => r.isOwn) ?? null;
        return leader ? { surface: s.label, leader: leader.label, leaderPct: pct(leader.rate), ownPct: own ? pct(own.rate) : null } : null;
    })
        .filter((x): x is NonNullable<typeof x> => x !== null);
    const openSites = d.sites.rows.filter((s) => s.kind === null).slice(0, 3);
    if (leads.length === 0 && openSites.length === 0)
        return null;
    return (<UI.Section heading={`What this means · ${period.toLowerCase()}`}>
      <UI.Stack gap="small-200">
        {leads.map((l) => (<UI.Text key={l.surface}>
            {`${l.surface}: ${l.leader} appears in ${l.leaderPct}% of answers that showed products`}
            {l.ownPct !== null ? `; your store in ${l.ownPct}%.` : '.'}
          </UI.Text>))}
        {openSites.length > 0 ? (<UI.Text>
            {`AI reads ${openSites.map((s) => `${s.domain} (${d.sites.answers > 0 ? Math.round((s.answers / d.sites.answers) * 100) : 0}% of answers)`).join(', ')} and they are not your competitors: a review, a listing or a mention of your store there is something AI can quote.`}
          </UI.Text>) : null}
      </UI.Stack>
    </UI.Section>);
}
function StoreSurface({ surface, period, last }: {
    surface: {
        label: string;
        rated: boolean;
        rows: StoreRow[];
    };
    period: string;
    last: boolean;
}) {
    const own = surface.rows.find((r) => r.isOwn) ?? null;
    const { rows, pager } = usePaged(surface.rows.filter((r) => !r.isOwn));
    return (<UI.Section heading={surface.label}>
      <UI.Stack gap="base">
        <UI.Text color="subdued">
          {surface.rated
            ? `${period}: the stores whose products ${surface.label} showed for your questions.`
            : `${period}: the stores whose products ${surface.label} showed for your questions. Not enough checks yet to rate each store’s share of answers; a rate is shown from 10 checks of a question.`}
        </UI.Text>
        <UI.Table variant="auto">
          <UI.TableHeaderRow>
            <UI.TableHeader listSlot="primary">Store</UI.TableHeader>
            <UI.TableHeader listSlot="secondary">Share of answers that showed products</UI.TableHeader>
            <UI.TableHeader listSlot="labeled">Product cards</UI.TableHeader>
            <UI.TableHeader listSlot="labeled">Best position</UI.TableHeader>
          </UI.TableHeaderRow>
          <UI.TableBody>
            
            {[...rows, ...(own ? [own] : [])].map((r) => (<UI.TableRow key={`${r.label}-${r.isOwn ? 'own' : 'x'}`}>
                <UI.TableCell>
                  <UI.Stack direction="inline" gap="small-200" alignItems="center">
                    {r.isOwn ? <UI.Text type="strong">{r.label}</UI.Text> : <SiteName label={r.label} domain={r.domain}/>}
                    {r.isOwn ? <UI.Badge tone="info">You</UI.Badge> : null}
                  </UI.Stack>
                </UI.TableCell>
                <UI.TableCell>
                  {r.rate ? (<UI.Stack gap="small-100">
                      <UI.Text>{rateText(r.rate, 'answers')}</UI.Text>
                      <ShareBar rate={r.rate} own={r.isOwn}/>
                    </UI.Stack>) : (<UI.Text color="subdued">Not rated</UI.Text>)}
                </UI.TableCell>
                <UI.TableCell>{r.productCards === null ? '–' : fmtNumber(r.productCards)}</UI.TableCell>
                <UI.TableCell>{r.bestPosition === null ? '–' : fmtNumber(r.bestPosition)}</UI.TableCell>
              </UI.TableRow>))}
          </UI.TableBody>
        </UI.Table>
        {pager}
        
        {last ? (<UI.Stack gap="small-200">
            <ShareKey />
            <UI.Text color="subdued">Product cards: how many of each store’s products these answers showed. Best position: its highest place among them. “–” means none were counted for that store.</UI.Text>
          </UI.Stack>) : null}
      </UI.Stack>
    </UI.Section>);
}
function BrandsSection({ brands, period, capped }: {
    brands: Competitors['brands'];
    period: string;
    capped: number | null;
}) {
    const { rows, pager } = usePaged(brands.rows);
    const n = brands.analysed;
    return (<UI.Section heading="Brands AI assistants named">
      <UI.Stack gap="base">
        {n === 0 ? (<UI.Paragraph>No brands have been named in your answers yet. They are listed here once your questions are checked.</UI.Paragraph>) : (<>
            <UI.Text color="subdued">
              {`${period}, from ${fmtNumber(n)} ${n === 1 ? 'answer' : 'answers'}${capped ? ` (the newest ${fmtNumber(capped)})` : ''}. Your competitors were found during setup; the others are brands the answers named, not confirmed as competitors.`}
            </UI.Text>
            <UI.Table variant="auto">
              <UI.TableHeaderRow>
                <UI.TableHeader listSlot="primary">Brand</UI.TableHeader>
                <UI.TableHeader listSlot="labeled">Named in</UI.TableHeader>
              </UI.TableHeaderRow>
              <UI.TableBody>
                
                <UI.TableRow key="own">
                  <UI.TableCell>
                    <UI.Stack direction="inline" gap="small-200" alignItems="center">
                      <UI.Text type="strong">{brands.ownLabel}</UI.Text>
                      <UI.Badge tone="info">You</UI.Badge>
                    </UI.Stack>
                  </UI.TableCell>
                  <UI.TableCell>{ofAnswers(brands.ownNamed, n)}</UI.TableCell>
                </UI.TableRow>
                {rows.map((r) => (<UI.TableRow key={`${r.listed ? 'l' : 'o'}-${r.name}`}>
                    <UI.TableCell>
                      <UI.Stack direction="inline" gap="small-200" alignItems="center">
                        <SiteName label={r.name} domain={r.domain}/>
                        {r.listed ? <UI.Badge tone="neutral">Your competitor</UI.Badge> : null}
                      </UI.Stack>
                    </UI.TableCell>
                    <UI.TableCell>{ofAnswers(r.answers, n)}</UI.TableCell>
                  </UI.TableRow>))}
              </UI.TableBody>
            </UI.Table>
            {pager}
          </>)}
      </UI.Stack>
    </UI.Section>);
}
function SitesSection({ sites, period, capped }: {
    sites: Competitors['sites'];
    period: string;
    capped: number | null;
}) {
    const { rows, pager } = usePaged(sites.rows);
    const n = sites.answers;
    return (<UI.Section heading="Sites AI assistants read">
      <UI.Stack gap="base">
        {sites.rows.length === 0 ? (<UI.Paragraph>No sites yet. They appear once assistants answer your questions.</UI.Paragraph>) : (<>
            <UI.Text color="subdued">
              {`${period}: the sites the answers cited or linked to, from ${fmtNumber(n)} ${n === 1 ? 'answer' : 'answers'}${capped ? ` (the newest ${fmtNumber(capped)})` : ''}.`}
            </UI.Text>
            <UI.Table variant="auto">
              <UI.TableHeaderRow>
                <UI.TableHeader listSlot="primary">Site</UI.TableHeader>
                <UI.TableHeader listSlot="labeled">Used in</UI.TableHeader>
              </UI.TableHeaderRow>
              <UI.TableBody>
                {rows.map((r) => (<UI.TableRow key={r.domain}>
                    <UI.TableCell>
                      <UI.Stack direction="inline" gap="small-200" alignItems="center">
                        <SiteName label={r.domain} domain={r.domain}/>
                        {r.kind === 'own' ? <UI.Badge tone="info">Your site</UI.Badge> : r.kind === 'competitor' ? <UI.Badge tone="neutral">Your competitor</UI.Badge> : null}
                      </UI.Stack>
                    </UI.TableCell>
                    <UI.TableCell>{ofAnswers(r.answers, n)}</UI.TableCell>
                  </UI.TableRow>))}
              </UI.TableBody>
            </UI.Table>
            {pager}
          </>)}
      </UI.Stack>
    </UI.Section>);
}
