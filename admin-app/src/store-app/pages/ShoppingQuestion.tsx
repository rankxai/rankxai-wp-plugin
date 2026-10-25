import { useEffect, useState } from 'react';
import { aiVisibilityHref } from '@/lib/shopify-app/app-routes-core';
import { formatPrice } from '@/lib/shopping/catalogue-display';
import { rivalPriceSentence, type RivalPriceRange } from '@/lib/shopping/rival-price-core';
import { api, toastSuccess } from '../api';
import { toastWrite } from '../reviews';
import { usePlan } from '../plan-context';
import { BackLink, ErrorBanner, PagePrimaryAction, PricedButton, act, formatDate, lockSentence, pricedLabel, useLoad, usePagedRows, usePageError, useNoSpend } from '../kit';
import { adminLocale, fmtNumber } from '../format';
import { SkeletonSection } from '../components/Status';
import { TwinAnswers } from '../components/AnswerParts';
import { BuyerQueryShare, QuestionTypeSection } from './BuyerQueries';
import { rankListingCandidates } from '@/lib/shopify-app/listing-candidates-core';
import * as UI from '../ui';
interface Detail {
    question: {
        id: string;
        text: string;
        source: string;
        isActive: boolean;
        checking?: boolean;
    };
    carouselRate: {
        carousels: number;
        knownChecks: number;
        pct: number | null;
    } | null;
    surfaces: Array<{
        surface: string;
        label: string;
    }>;
    whoAppeared: Array<{
        merchant: string;
        answers: number;
        bestPosition: number | null;
        outrankedYou: boolean;
    }>;
    timeline: Array<{
        checkId: string;
        surfaceLabel: string;
        checkedAt: string | null;
        verdict: string;
        ourCards: number;
        totalCards: number;
        bestPosition: number | null;
    }>;
    absent: Array<{
        checkId: string;
        surfaceLabel: string;
        checkedAt: string | null;
        totalCards: number;
        outOfStock?: {
            titles: string[];
            asOf: string | null;
        } | null;
    }>;
    rivalPrices?: RivalPriceRange | null;
    cardReasons?: Array<{
        surface: string;
        label: string;
        checkId: string;
        checkedAt: string | null;
        rows: Array<{
            position: number | null;
            title: string;
            store: string | null;
            reason: string;
            isYours: boolean;
        }>;
    }>;
    attributeShare?: Array<{
        name: string;
        answers: number;
        yours: number;
        topMerchants: Array<{
            merchant: string;
            answers: number;
        }>;
    }>;
    partial: boolean;
    twinBrandId?: string | null;
    checkPrice?: number | null;
    listing?: {
        productChecks: number;
        assistantAnswers: number;
        shownProductIds: string[];
    } | null;
}
interface ShoppingSummary {
    products: {
        rows: Array<{
            id: string;
            title: string | null;
        }>;
    } | null;
    prices: {
        checkQuestion: number | null;
        diagnose: number | null;
        rewrite: number | null;
    };
}
interface Diagnosis {
    diagnosisId: string;
    status: string;
    headline: string | null;
    verdict: string | null;
    error: string | null;
    comparison?: string[] | null;
}
interface Proposal {
    proposalId: string;
    fields: {
        seoTitle?: string;
        seoDescription?: string;
        description?: string;
    };
    dropped?: unknown[];
}
const FIELD_LABEL: Record<string, string> = { seoTitle: 'search title', seoDescription: 'search description', description: 'description' };
function leftOut(dropped: unknown[] | undefined): Array<{
    field: string;
    detail: string;
}> {
    return (dropped ?? []).flatMap((x) => {
        if (!x || typeof x !== 'object')
            return [];
        const o = x as {
            field?: unknown;
            reason?: unknown;
            detail?: unknown;
        };
        if (typeof o.field !== 'string' || typeof o.detail !== 'string')
            return [];
        return o.reason === 'unsupported_claim' || o.reason === 'names_another_brand' ? [{ field: o.field, detail: o.detail }] : [];
    });
}
function listingBasisLine(b: {
    productChecks: number;
    assistantAnswers: number;
}, attributes: string[]): string {
    const parts = [
        b.productChecks > 0 ? `${fmtNumber(b.productChecks)} ${b.productChecks === 1 ? 'check' : 'checks'} that showed products` : null,
        b.assistantAnswers > 0 ? 'the latest answer from each AI assistant' : null,
    ].filter(Boolean);
    const top = attributes.slice(0, 3);
    const compared = top.length === 0 ? '' : ` The answers compared products on ${top.length === 1 ? top[0] : `${top.slice(0, -1).join(', ')} and ${top[top.length - 1]}`}.`;
    return `Based on ${parts.join(' and ')} for this question.${compared}`;
}
const VERDICT: Record<string, {
    label: string;
    tone: 'success' | 'warning' | 'neutral';
}> = {
    present: { label: 'Your product appeared', tone: 'success' },
    absent: { label: 'Other products, not yours', tone: 'warning' },
    no_carousel: { label: 'No products shown', tone: 'neutral' },
    not_assessed: { label: 'Could not be read', tone: 'neutral' },
};
export function ShoppingQuestionPage({ id }: {
    id: string;
}) {
    const noSpend = useNoSpend();
    const detail = useLoad<Detail>(`shopping/questions/${id}`);
    const summary = useLoad<ShoppingSummary>('shopping');
    const { plan, ready: planReady } = usePlan();
    const [error, setError] = usePageError();
    const [busy, setBusy] = useState<string | null>(null);
    const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
    const [productId, setProductId] = useState('');
    const [proposal, setProposal] = useState<Proposal | null>(null);
    const [applied, setApplied] = useState<{
        changeId: string | null;
        verified: boolean;
    } | null>(null);
    const [checkFor, setCheckFor] = useState<string | null>(null);
    const access = plan?.locks.access ?? null;
    useEffect(() => {
        if (!diagnosis || diagnosis.status !== 'pending')
            return;
        const t = setTimeout(async () => {
            const r = await api<Diagnosis>(`shopping/diagnoses/${diagnosis.diagnosisId}`);
            if (r.ok && r.data)
                setDiagnosis(r.data);
        }, 4000);
        return () => clearTimeout(t);
    }, [diagnosis]);
    const d = planReady ? detail.data : null;
    const checks = usePagedRows(d?.timeline ?? [], 10);
    const prices = summary.data?.prices;
    const products = summary.data?.products?.rows ?? [];
    async function diagnose(checkId: string) {
        setCheckFor(checkId);
        setDiagnosis(null);
        const r = await act(() => api<Diagnosis>('shopping/diagnoses', { method: 'POST', body: { checkId } }), (b) => setBusy(b ? 'diagnose' : null), setError);
        if (r.ok && r.data)
            setDiagnosis({ ...r.data, headline: null, verdict: null, error: null });
    }
    async function propose() {
        setProposal(null);
        setApplied(null);
        const r = await act(() => api<Proposal>('shopping/rewrites', { method: 'POST', body: { productId, questionId: id, checkId: checkFor } }), (b) => setBusy(b ? 'rewrite' : null), setError);
        if (r.ok && r.data)
            setProposal(r.data);
    }
    async function apply() {
        if (!proposal)
            return;
        const r = await act(() => api<{
            verified: boolean;
            changeId: string | null;
            message: string;
        }>(`shopping/rewrites/${proposal.proposalId}/apply`, { method: 'POST' }), (b) => setBusy(b ? 'apply' : null), setError);
        if (r.ok && r.data) {
            setApplied({ changeId: r.data.changeId, verified: r.data.verified });
            toastWrite(r.data.verified, 'Saved and confirmed on your store', 'Saved');
        }
    }
    async function undo() {
        if (!applied?.changeId)
            return;
        const r = await act(() => api(`changes/${applied.changeId}/undo`, { method: 'POST' }), (b) => setBusy(b ? 'undo' : null), setError);
        if (r.ok) {
            toastSuccess('Change undone');
            setApplied(null);
            setProposal(null);
        }
    }
    const stopped = !!d && (d.question.checking === false || !d.question.isActive);
    const hasProductChecks = !!d && d.timeline.length > 0;
    const basis = d?.listing ?? null;
    const canRewrite = basis === null || basis === undefined ? true : basis.productChecks > 0 || basis.assistantAnswers > 0;
    const candidates = d
        ? rankListingCandidates(products, {
            shownIds: basis?.shownProductIds ?? [],
            question: d.question.text,
        })
        : [];
    const checkPrice = d?.checkPrice !== undefined ? d.checkPrice : prices?.checkQuestion;
    const checkLock = stopped ? 'This question’s schedule is paused. Resume it to check the question now or on its schedule.' : lockSentence(access, checkPrice);
    async function setChecking(on: boolean) {
        const r = await act(() => api(`shopper-questions/${id}/${on ? 'resume' : 'stop'}`, { method: 'POST' }), (b) => setBusy(b ? 'stop' : null), setError);
        if (r.ok) {
            toastSuccess(on ? 'Schedule resumed' : 'Schedule paused');
            void detail.reload();
        }
    }
    return (<UI.Page heading={d ? d.question.text : 'Question'} inlineSize="large">
      <BackLink href={aiVisibilityHref('shopping')} label="AI search"/>
      
      {d && d.question.isActive ? (stopped ? (<UI.Button slot="secondary-actions" disabled={busy !== null || undefined} onClick={() => void setChecking(true)}>
            Resume schedule
          </UI.Button>) : (<UI.Button slot="secondary-actions" disabled={busy !== null || undefined} onClick={() => void setChecking(false)}>
            Pause schedule
          </UI.Button>)) : null}
      
      <PagePrimaryAction spends disabled={!!checkLock || busy !== null} loading={busy === 'check'} onClick={() => void act(() => api<{
            checking: string[];
            problems?: string[];
        }>(`shopper-questions/${id}/check`, { method: 'POST' }), (b) => setBusy(b ? 'check' : null), setError).then((r) => {
            if (!r.ok)
                return;
            toastSuccess('Checking now. Results arrive in a few minutes.');
            if (r.data?.problems?.length)
                setError({ message: r.data.problems.join(' '), planLink: false, kind: 'refused' });
        })}>
        {pricedLabel('Check now', checkPrice)}
      </PagePrimaryAction>
      <ErrorBanner error={error ?? detail.error} onDismiss={error ? () => setError(null) : undefined}/>
      {!d && (detail.loading || (detail.data && !planReady)) ? <SkeletonSection lines={3} label="Loading this question"/> : null}
      {d ? (<UI.Stack gap="base">
          
          
          {stopped || checkLock ? (<UI.Section>
              <UI.Stack gap="small-200">
                {stopped ? (<UI.Stack direction="inline" gap="small-200" alignItems="center">
                    <UI.Badge tone="neutral">Paused</UI.Badge>
                    <UI.Text>Not checked until you resume its schedule. Results so far are kept below.</UI.Text>
                  </UI.Stack>) : null}
                {checkLock && !stopped ? <UI.Text color="subdued">{checkLock}</UI.Text> : null}
              </UI.Stack>
            </UI.Section>) : null}

          
          {d.twinBrandId ? <TwinAnswers brandId={d.twinBrandId}/> : null}

          
          <UI.Section heading="Products shown in AI shopping">
            {hasProductChecks ? (<UI.Paragraph>
                {d.carouselRate && d.carouselRate.knownChecks > 0
                    ? `${d.surfaces.map((s) => s.label).join(' and ')} showed products in ${fmtNumber(d.carouselRate.carousels)} of ${fmtNumber(d.carouselRate.knownChecks)} answers to this question.`
                    : 'This question has been checked, but no answer could be read yet.'}
              </UI.Paragraph>) : (<UI.Paragraph>Not checked yet. The products ChatGPT Shopping and Google AI Mode show for this question are checked on its next scheduled check, or press Check now.</UI.Paragraph>)}
          </UI.Section>

          
          {hasProductChecks ? <BuyerQueryShare id={id} storesSeen={d.whoAppeared}/> : null}

          
          {(d.cardReasons ?? []).map((r) => (<UI.Section key={r.surface} heading={`Why ${r.label} showed these products`}>
              <UI.Stack gap="base">
                <UI.Text color="subdued">{`In its answer of ${formatDate(r.checkedAt)}, in its own words. What it says about a product is what it picked out to tell shoppers.`}</UI.Text>
                <UI.Table variant="auto">
                  <UI.TableHeaderRow>
                    <UI.TableHeader listSlot="primary">Product</UI.TableHeader>
                    <UI.TableHeader listSlot="secondary">Store</UI.TableHeader>
                    <UI.TableHeader listSlot="labeled">Why it was shown</UI.TableHeader>
                  </UI.TableHeaderRow>
                  <UI.TableBody>
                    {r.rows.map((p, i) => (<UI.TableRow key={`${p.position ?? i}-${p.title}`}>
                        <UI.TableCell>
                          <UI.Stack direction="inline" gap="small-200" alignItems="center">
                            <UI.Text>{p.title}</UI.Text>
                            {p.isYours ? <UI.Badge tone="info">You</UI.Badge> : null}
                          </UI.Stack>
                        </UI.TableCell>
                        <UI.TableCell>{p.store ?? '–'}</UI.TableCell>
                        <UI.TableCell>
                          <UI.Stack gap="small-100">
                            {p.reason.split('\n').map((line, j) => (<UI.Text key={j}>{line}</UI.Text>))}
                          </UI.Stack>
                        </UI.TableCell>
                      </UI.TableRow>))}
                  </UI.TableBody>
                </UI.Table>
              </UI.Stack>
            </UI.Section>))}

          
          {d.rivalPrices ? (<UI.Section heading="Prices in these answers">
              <UI.Stack gap="small-200">
                <UI.Paragraph>{rivalPriceSentence(d.rivalPrices, (minor, currency) => formatPrice(minor, currency, adminLocale()))}</UI.Paragraph>
                <UI.Text color="subdued">From the other stores’ cards in the answers we checked, in your store’s currency only.</UI.Text>
              </UI.Stack>
            </UI.Section>) : null}

          
          {d.attributeShare && d.attributeShare.length > 0 ? (<UI.Section heading="What these answers compared on">
              <UI.Table variant="auto">
                <UI.TableHeaderRow>
                  <UI.TableHeader listSlot="primary">Detail</UI.TableHeader>
                  <UI.TableHeader>Answers</UI.TableHeader>
                  <UI.TableHeader>With your products</UI.TableHeader>
                  <UI.TableHeader>Stores also there</UI.TableHeader>
                </UI.TableHeaderRow>
                <UI.TableBody>
                  {d.attributeShare.map((a) => (<UI.TableRow key={a.name}>
                      <UI.TableCell>{a.name}</UI.TableCell>
                      <UI.TableCell>{fmtNumber(a.answers)}</UI.TableCell>
                      <UI.TableCell>{`${fmtNumber(a.yours)} of ${fmtNumber(a.answers)}`}</UI.TableCell>
                      <UI.TableCell>{a.topMerchants.length > 0 ? a.topMerchants.map((m) => m.merchant).join(', ') : '–'}</UI.TableCell>
                    </UI.TableRow>))}
                </UI.TableBody>
              </UI.Table>
            </UI.Section>) : null}

          
          <UI.Section heading="Improve a listing for this question">
            <UI.Stack gap="base">
              <UI.Paragraph>We rewrite one product’s search title, search description and description so it speaks to this question, using only what its listing already says. The product title is never changed, and you see the result before anything is saved.</UI.Paragraph>
              {!canRewrite ? (<UI.Text color="subdued">Available once this question has been checked: the rewrite is based on what the AI assistants answered and the products they showed.</UI.Text>) : products.length === 0 ? (<UI.Paragraph>Monitor a product first.</UI.Paragraph>) : (<>
                  {basis ? <UI.Text color="subdued">{listingBasisLine(basis, (d.attributeShare ?? []).map((a) => a.name))}</UI.Text> : null}
                  
                  <UI.QueryContainer>
                    <UI.Grid gridTemplateColumns="@container (inline-size > 640px) 1fr auto, 1fr" gap="small-200" alignItems="end">
                      <UI.Select label="Product" value={productId} onChange={(e) => setProductId(e.currentTarget.value)}>
                        <UI.Option value="">Choose a product</UI.Option>
                        {candidates.map((p) => (<UI.Option key={p.id} value={p.id}>
                            {`${p.title ?? 'Untitled product'}${p.reason === 'shown' ? ' · shown in answers to this question' : p.reason === 'matches' ? ' · matches this question' : ''}`}
                          </UI.Option>))}
                      </UI.Select>
                      <UI.Box>
                        <PricedButton label="Write a better listing" credits={prices?.rewrite} lock={access} busy={busy === 'rewrite'} onClick={() => (productId ? void propose() : setError({ message: 'Choose a product first.', planLink: false }))}/>
                      </UI.Box>
                    </UI.Grid>
                  </UI.QueryContainer>
                </>)}
              {proposal ? (<UI.Box padding="base" border="base" borderRadius="base">
                  <UI.Stack gap="base">
                    <UI.Text type="strong">Preview</UI.Text>
                    {proposal.fields.seoTitle ? <UI.Paragraph>Search title: {proposal.fields.seoTitle}</UI.Paragraph> : null}
                    {proposal.fields.seoDescription ? <UI.Paragraph>Search description: {proposal.fields.seoDescription}</UI.Paragraph> : null}
                    {proposal.fields.description ? <UI.Paragraph>Description: {proposal.fields.description}</UI.Paragraph> : null}
                    
                    {leftOut(proposal.dropped).map((x) => (<UI.Text key={x.field} color="subdued">{`Not proposed, ${FIELD_LABEL[x.field] ?? x.field}: ${x.detail}`}</UI.Text>))}
                    {applied ? (<UI.Stack gap="small-200">
                        <UI.Badge tone={applied.verified ? 'success' : 'warning'}>{applied.verified ? 'Saved and confirmed' : 'Saved, not yet confirmed'}</UI.Badge>
                        {applied.changeId ? (<UI.Button disabled={busy !== null} loading={busy === 'undo' || undefined} onClick={() => void undo()}>
                            Undo
                          </UI.Button>) : null}
                      </UI.Stack>) : (<UI.Button variant="primary" disabled={busy !== null} loading={busy === 'apply' || undefined} onClick={() => void apply()}>
                        Save to my store
                      </UI.Button>)}
                  </UI.Stack>
                </UI.Box>) : null}
            </UI.Stack>
          </UI.Section>

          
          {hasProductChecks ? (<UI.Section heading="Product check history">
              <UI.Stack gap="base">
                <UI.Text color="subdued">Each time ChatGPT Shopping and Google AI Mode were checked for this question, and what they showed.</UI.Text>
                {d.absent.length > 0 ? (<UI.Text color="subdued">
                    {access ? `${access.reason}${access.planNeeded ? ` Available on ${access.planNeeded}.` : ''}` : 'Where other stores’ products were shown, “Why not mine?” checks the live answer for the likely reason.'}
                  </UI.Text>) : null}
                {diagnosis ? (<UI.Box padding="base" border="base" borderRadius="base">
                    <UI.Stack gap="small-200">
                      {diagnosis.status === 'pending' ? (<UI.Text color="subdued">Checking the live answer. This takes about a minute…</UI.Text>) : diagnosis.status === 'failed' ? (<UI.Paragraph>{diagnosis.error ?? 'The check did not complete. Nothing was charged.'}</UI.Paragraph>) : (<>
                          <UI.Paragraph>{diagnosis.headline ?? 'The check is complete.'}</UI.Paragraph>
                          {diagnosis.comparison && diagnosis.comparison.length > 0 ? (<UI.Stack gap="small-100">
                              <UI.Text type="strong">What the other listings on that page had</UI.Text>
                              <UI.UnorderedList>
                                {diagnosis.comparison.map((line) => (<UI.ListItem key={line}>{line}</UI.ListItem>))}
                              </UI.UnorderedList>
                              <UI.Text color="subdued">From the same Google Shopping page, side by side. It shows what shoppers saw there, not why a listing was shown.</UI.Text>
                            </UI.Stack>) : null}
                        </>)}
                    </UI.Stack>
                  </UI.Box>) : null}
                <UI.Table variant="auto" {...checks.tableProps}>
                  <UI.TableHeaderRow>
                    <UI.TableHeader listSlot="primary">When</UI.TableHeader>
                    <UI.TableHeader>Where</UI.TableHeader>
                    <UI.TableHeader>Result</UI.TableHeader>
                    <UI.TableHeader listSlot="inline">Action</UI.TableHeader>
                  </UI.TableHeaderRow>
                  <UI.TableBody>
                    {checks.rows.map((t) => {
                    const absent = d.absent.find((a) => a.checkId === t.checkId) ?? null;
                    return (<UI.TableRow key={t.checkId}>
                          <UI.TableCell>{formatDate(t.checkedAt)}</UI.TableCell>
                          <UI.TableCell>{t.surfaceLabel}</UI.TableCell>
                          <UI.TableCell>
                            <UI.Stack gap="small-100">
                              {VERDICT[t.verdict] ? <UI.Badge tone={VERDICT[t.verdict]!.tone}>{VERDICT[t.verdict]!.label}</UI.Badge> : <UI.Text>{t.verdict}</UI.Text>}
                              
                              {absent?.outOfStock && absent.outOfStock.titles.length > 0 ? (<UI.Text color="subdued">
                                  {`Out of stock that night${absent.outOfStock.asOf ? ` (as of ${formatDate(absent.outOfStock.asOf)})` : ''}: ${absent.outOfStock.titles.slice(0, 3).join(', ')}${absent.outOfStock.titles.length > 3 ? ` and ${absent.outOfStock.titles.length - 3} more` : ''}.`}
                                </UI.Text>) : null}
                            </UI.Stack>
                          </UI.TableCell>
                          <UI.TableCell>
                            {absent ? (<UI.Button disabled={!!access || noSpend || prices?.diagnose === null || prices?.diagnose === undefined || busy !== null || undefined} loading={(busy === 'diagnose' && checkFor === absent.checkId) || undefined} onClick={() => void diagnose(absent.checkId)}>
                                {pricedLabel('Why not mine?', prices?.diagnose)}
                              </UI.Button>) : null}
                          </UI.TableCell>
                        </UI.TableRow>);
                })}
                  </UI.TableBody>
                </UI.Table>
              </UI.Stack>
          </UI.Section>) : null}

          
          <QuestionTypeSection id={id} setError={setError}/>
          {stopped && !d.question.isActive ? (<UI.Section>
              <UI.Text color="subdued">This question was removed, so it can no longer be checked.</UI.Text>
            </UI.Section>) : null}
        </UI.Stack>) : null}
    </UI.Page>);
}
