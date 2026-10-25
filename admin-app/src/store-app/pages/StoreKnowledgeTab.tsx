import { isAdminLink } from '@/lib/store-app/admin-target-core';
import { useEffect, useRef, useState } from 'react';
import { answerQuestionHref, searchHref } from '@/lib/shopify-app/app-routes-core';
import { siteHref } from '@/lib/shopify-app/competitors-page-core';
import { api, toastSuccess } from '../api';
import { usePlan } from '../plan-context';
import { AdminLink, ErrorBanner, GoButton, PricedButton, act, formatDate, useLoad, usePageError } from '../kit';
import { SkeletonSection } from '../components/Status';
import { usePaged } from '../components/Pager';
import * as UI from '../ui';
type Tone = 'good' | 'bad' | 'neutral';
interface Finding {
    tone: Tone;
    text: string;
    quote: string | null;
}
interface AssistantAnswer {
    platform: string;
    label: string;
    status: 'answered' | 'no_text' | 'checking' | 'not_asked';
    answerId: string | null;
    checkedAt: string | null;
    excerpt: string | null;
    assessment: {
        knows: 'yes' | 'no' | 'no_answer';
        findings: Finding[];
    } | null;
}
interface KnowledgeQuestion {
    id: string;
    key: 'store';
    heading: string;
    text: string;
    paused: boolean;
    assistants: AssistantAnswer[];
}
interface StoreKnowledge {
    brand: string | null;
    assistants: string[];
    checkPrice: number | null;
    freeAvailable: boolean;
    schedule: string | null;
    hasPlan: boolean;
    started: boolean;
    questions: KnowledgeQuestion[];
    sites: Array<{
        host: string;
        kind: 'yours' | 'lookalike' | 'other';
        answers: number;
    }>;
    summary: Array<{
        tone: Tone;
        text: string;
        quote: string | null;
        assistants: string[];
    }>;
    answersRead?: number;
    lastCheckedAt: string | null;
    checking: boolean;
}
const POLL_MS = 20000;
const POLL_TRIES = 15;
function verdictOf(a: AssistantAnswer): {
    label: string;
    tone: 'success' | 'warning' | 'info' | 'neutral';
} {
    if (a.status === 'checking')
        return { label: 'Asking now', tone: 'info' };
    if (a.status === 'not_asked')
        return { label: 'Not asked yet', tone: 'neutral' };
    if (a.status === 'no_text' || !a.assessment)
        return { label: 'No answer kept', tone: 'neutral' };
    if (a.assessment.knows === 'no_answer')
        return { label: 'Did not answer', tone: 'neutral' };
    if (a.assessment.knows === 'no')
        return { label: 'Does not know your store', tone: 'warning' };
    if (a.assessment.findings.some((f) => f.tone === 'bad'))
        return { label: 'Needs a look', tone: 'warning' };
    if (a.assessment.findings.some((f) => f.tone === 'good'))
        return { label: 'Looks right', tone: 'success' };
    return { label: 'Nothing to flag', tone: 'neutral' };
}
function list(names: string[]): string {
    return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
export function StoreKnowledgeTab() {
    const data = useLoad<StoreKnowledge>('store-knowledge');
    const { plan, ready: planReady, reload: reloadPlan } = usePlan();
    const [error, setError] = usePageError();
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState<string | null>(null);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    const d = planReady ? data.data : null;
    const access = plan?.locks.access ?? null;
    async function ask() {
        const before = d?.lastCheckedAt ?? null;
        const r = await act(() => api<{
            queued: boolean;
            free: boolean;
        }>('store-knowledge/check', { method: 'POST' }), setBusy, setError);
        if (!r.ok || !r.data)
            return;
        toastSuccess(r.data.free ? 'Asking now, free' : 'Asking now');
        setNote(`Asking ${list(d?.assistants ?? [])} now. Each answer appears here as it arrives; this takes a few minutes.`);
        for (let i = 0; i < POLL_TRIES; i++) {
            await new Promise((res) => setTimeout(res, POLL_MS));
            if (!mounted.current)
                return;
            const next = await api<StoreKnowledge>('store-knowledge');
            if (!mounted.current)
                return;
            if (next.ok && next.data) {
                data.replace(next.data);
                const answered = next.data.questions.every((q) => q.assistants.every((a) => a.status !== 'checking' && a.status !== 'not_asked'));
                if (next.data.lastCheckedAt !== before && answered && !next.data.checking) {
                    setNote(null);
                    void reloadPlan();
                    return;
                }
            }
        }
        setNote('Some assistants are still answering. Their answers appear here when they finish.');
    }
    if (!d) {
        return data.error ? <ErrorBanner error={data.error}/> : <SkeletonSection lines={6} label="Reading what AI says about your store"/>;
    }
    const brand = d.brand ?? 'your store';
    const bad = d.summary;
    const good = d.questions.flatMap((q) => q.assistants.filter((a) => verdictOf(a).tone === 'success'));
    const askButton = d.freeAvailable ? (<UI.Stack direction="inline">
      <UI.Button variant="primary" disabled={busy || undefined} loading={busy || undefined} onClick={() => void ask()}>
        Ask now, free
      </UI.Button>
    </UI.Stack>) : (<PricedButton label={d.started ? 'Ask again' : 'Ask now'} credits={d.checkPrice} lock={access} busy={busy} onClick={() => void ask()}/>);
    return (<UI.Stack gap="base">
      <ErrorBanner error={error} onDismiss={() => setError(null)}/>
      <UI.Section heading={`What AI tells shoppers about ${brand}`}>
        <UI.Stack gap="base">
          {!d.started ? (<UI.Paragraph>
              {`A shopper who finds your store asks AI about it by name: what it is, and what customers say about it. Ask ${list(d.assistants)} and see what they tell shoppers, and anything they get wrong.${d.freeAvailable ? ' The first time is free.' : ''}`}
            </UI.Paragraph>) : (<UI.Paragraph>
              {d.lastCheckedAt
                ? `We asked ${list(d.assistants)} about ${brand} on ${formatDate(d.lastCheckedAt)}. ${bad.length === 0 ? 'Nothing needs a look.' : `${bad.length} ${bad.length === 1 ? 'thing needs' : 'things need'} a look`}${bad.length > 0 && good.length > 0 ? `, and ${good.length} ${good.length === 1 ? 'answer looks' : 'answers look'} right.` : bad.length > 0 ? '.' : ''}`
                : `Asking ${list(d.assistants)} about ${brand}. Their answers appear here as they arrive.`}
            </UI.Paragraph>)}
          {bad.length > 0 ? (<UI.UnorderedList>
              {bad.slice(0, 8).map((f, i) => (<UI.ListItem key={i}>{f.text}</UI.ListItem>))}
            </UI.UnorderedList>) : null}
          {bad.length > 0 ? <HowToFix texts={bad.map((f) => f.text)}/> : null}
          {note ? <UI.Banner tone="info">{note}</UI.Banner> : null}
          {askButton}
          {d.schedule ? (<UI.Text color="subdued">{d.started ? d.schedule : `After that, ${d.schedule.charAt(0).toLowerCase()}${d.schedule.slice(1)}`}</UI.Text>) : d.started ? (<UI.Text color="subdued">On a plan, this is asked again every week.</UI.Text>) : null}
        </UI.Stack>
      </UI.Section>

      {d.questions.map((q) => (<KnowledgeSection key={q.id} q={q}/>))}

      {d.sites.length > 0 ? <SitesSection sites={d.sites}/> : null}
    </UI.Stack>);
}
function HowToFix({ texts }: {
    texts: string[];
}) {
    const all = texts.join(' ').toLowerCase();
    const steps: Array<{
        text: string;
        href: string | null;
        link: string | null;
    }> = [];
    if (/not yours|different business/.test(all)) {
        steps.push({ text: 'Say who you are in your own words: what you sell, where, and your store’s address, on your home page and an About page.', href: 'shopify://admin/pages', link: 'Open Pages' });
        steps.push({ text: 'Give assistants one place to read about you: your llms.txt file names your store and its pages.', href: searchHref('rich'), link: 'Open llms.txt' });
        steps.push({ text: 'Link your store from your social profiles and directory listings, so the right site carries your name.', href: null, link: null });
    }
    if (/rating|review/.test(all)) {
        steps.push({ text: 'Claim your profile on the review sites assistants quote (Trustpilot, Google), and ask happy customers to review you there.', href: null, link: null });
    }
    if (steps.length === 0)
        return null;
    return (<UI.Box padding="base" background="subdued" borderRadius="base">
      <UI.Stack gap="small-200">
        <UI.Text type="strong">How to fix this</UI.Text>
        <UI.OrderedList>
          {steps.map((st) => (<UI.ListItem key={st.text}>
              {st.text}{' '}
              {st.href && st.link ? (isAdminLink(st.href) ? <AdminLink path={st.href}>{st.link}</AdminLink> : <UI.Link href={st.href}>{st.link}</UI.Link>) : null}
            </UI.ListItem>))}
        </UI.OrderedList>
        <UI.Text color="subdued">Assistants pick up changes as they re-read the web, usually over weeks. Ask again later to see what changed.</UI.Text>
      </UI.Stack>
    </UI.Box>);
}
function KnowledgeSection({ q }: {
    q: KnowledgeQuestion;
}) {
    return (<UI.Section heading={q.heading}>
      <UI.Stack gap="base">
        <UI.Text color="subdued">{`We asked: “${q.text}”${q.paused ? ' This question is paused.' : ''}`}</UI.Text>
        <UI.Grid gridTemplateColumns="repeat(auto-fill, minmax(min(300px, 100%), 1fr))" gap="base">
          {q.assistants.map((a) => (<AssistantCard key={a.platform} a={a}/>))}
        </UI.Grid>
        <UI.Stack direction="inline">
          <GoButton href={answerQuestionHref(q.id)} label="Read the answers" accessibilityLabel={`Read every answer to: ${q.text}`}/>
        </UI.Stack>
      </UI.Stack>
    </UI.Section>);
}
function AssistantCard({ a }: {
    a: AssistantAnswer;
}) {
    const v = verdictOf(a);
    const findings = a.assessment?.findings ?? [];
    return (<UI.Box padding="base" border="base" borderRadius="large" background="base">
      <UI.Stack gap="small-200">
        <UI.Stack direction="inline" gap="small-200" alignItems="center">
          <UI.Text type="strong">{a.label}</UI.Text>
          <UI.Badge tone={v.tone}>{v.label}</UI.Badge>
        </UI.Stack>
        {a.status === 'checking' ? (<UI.Text color="subdued">Its answer appears here when it arrives.</UI.Text>) : a.status === 'not_asked' ? (<UI.Text color="subdued">Not asked yet.</UI.Text>) : (<>
            {findings.map((f, i) => (<UI.Grid key={i} gridTemplateColumns="auto 1fr" gap="small-200" alignItems="start">
                <UI.Icon type={f.tone === 'bad' ? 'alert-triangle' : f.tone === 'good' ? 'check-circle' : 'info'} tone={f.tone === 'bad' ? 'warning' : f.tone === 'good' ? 'success' : undefined}/>
                <UI.Stack gap="small-100">
                  <UI.Text>{f.text}</UI.Text>
                  {f.quote ? <UI.Text color="subdued">{`“${f.quote}”`}</UI.Text> : null}
                </UI.Stack>
              </UI.Grid>))}
            {findings.length === 0 && a.excerpt ? <UI.Text color="subdued">{a.excerpt}</UI.Text> : null}
            {a.checkedAt ? <UI.Text color="subdued">{`Asked ${formatDate(a.checkedAt)}`}</UI.Text> : null}
          </>)}
      </UI.Stack>
    </UI.Box>);
}
const KIND_BADGE: Record<'yours' | 'lookalike', {
    label: string;
    tone: 'success' | 'warning';
}> = {
    yours: { label: 'Your site', tone: 'success' },
    lookalike: { label: 'Uses your name, not yours', tone: 'warning' },
};
function SitesSection({ sites }: {
    sites: StoreKnowledge['sites'];
}) {
    const { rows, pager } = usePaged(sites);
    return (<UI.Section heading="Where AI read about you">
      <UI.Stack gap="base">
        <UI.Text color="subdued">The sites these answers cited or linked to. What they say about you is what AI tells shoppers.</UI.Text>
        <UI.Table variant="auto">
          <UI.TableHeaderRow>
            <UI.TableHeader listSlot="primary">Site</UI.TableHeader>
            <UI.TableHeader listSlot="labeled">Answers</UI.TableHeader>
          </UI.TableHeaderRow>
          <UI.TableBody>
            {rows.map((s) => (<UI.TableRow key={s.host}>
                <UI.TableCell>
                  <UI.Stack direction="inline" gap="small-200" alignItems="center">
                    <UI.Link href={siteHref(s.host)} target="_blank" accessibilityLabel={`${s.host} (opens in a new tab)`}>
                      {s.host}
                    </UI.Link>
                    {s.kind !== 'other' ? <UI.Badge tone={KIND_BADGE[s.kind].tone}>{KIND_BADGE[s.kind].label}</UI.Badge> : null}
                  </UI.Stack>
                </UI.TableCell>
                <UI.TableCell>{`${s.answers}`}</UI.TableCell>
              </UI.TableRow>))}
          </UI.TableBody>
        </UI.Table>
        {pager}
      </UI.Stack>
    </UI.Section>);
}
