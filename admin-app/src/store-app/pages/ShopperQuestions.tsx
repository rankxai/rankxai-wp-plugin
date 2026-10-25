import { useEffect, useRef, useState } from 'react';
import { APP_PATHS, aiVisibilityHref, answerQuestionHref, shoppingQuestionHref } from '@/lib/shopify-app/app-routes-core';
import type { AssistantCheckStatus } from '@/lib/shopify-app/assistant-status';
import { api, toastSuccess } from '../api';
import { usePlan } from '../plan-context';
import { ErrorBanner, PagePrimaryAction, PricedButton, act, fieldError, formatDate, useLoad, usePagedRows, usePageError } from '../kit';
import { fmtNumber } from '../format';
import { SkeletonSection } from '../components/Status';
import { useModal } from '../components/FixModals';
import { latestSummary } from '../components/AnswerParts';
import type { Shopping } from './ShoppingTab';
import * as UI from '../ui';
interface Question {
    id: string;
    text: string;
    shoppingId: string | null;
    brandId: string | null;
    checking: boolean;
    lastCheckedAt: string | null;
    answers: Array<{
        label: string;
        status: AssistantCheckStatus;
    }> | null;
    products: string | null;
    checkPrice: number | null;
}
interface ShopperQuestionsData {
    assistants: string[];
    surfaces: string[];
    schedule: Array<{
        text: string;
        date: string | null;
    }> | null;
    cadence?: {
        answersDays: number | null;
        productsDays: number | null;
    } | null;
    questions: Question[];
}
interface AnswersSummary {
    windowDays: number;
    assistants: Array<{
        platform: string;
        label: string;
        known: number;
        mentioned: number;
        enoughData: boolean;
    }>;
}
const POLL_MS = 20000;
const POLL_TRIES = 12;
const questionHref = (q: Question) => (q.shoppingId ? shoppingQuestionHref(q.shoppingId) : answerQuestionHref(q.brandId!));
export function ShopperQuestionsTab() {
    const data = useLoad<ShopperQuestionsData>('shopper-questions');
    const answers = useLoad<AnswersSummary>('answers');
    const shopping = useLoad<Shopping>('shopping');
    const { plan, ready: planReady, reload: reloadPlan } = usePlan();
    const [error, setError] = usePageError();
    const [modalError, setModalError] = usePageError();
    const [busy, setBusy] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);
    const [text, setText] = useState('');
    const addModal = useModal('add-shopper-question');
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    const d = planReady ? data.data : null;
    const access = plan?.locks.access ?? null;
    const questionLock = plan?.locks.shoppingQuestions ?? plan?.locks.brandQuestions ?? null;
    const paged = usePagedRows(d?.questions ?? []);
    const price = checkPriceLine(d);
    async function reloadAll() {
        await Promise.all([data.reload(), answers.reload(), shopping.reload(), reloadPlan()]);
    }
    async function addQuestion() {
        const t = text.trim();
        if (!t)
            return;
        const r = await act(() => api('shopper-questions', { method: 'POST', body: { text: t } }), (b) => setBusy(b ? 'add' : null), setModalError);
        if (r.ok) {
            setText('');
            addModal.hide();
            toastSuccess('Question added');
            await reloadAll();
        }
    }
    async function suggest() {
        const r = await act(() => api('shopping/questions/generate', { method: 'POST' }), (b) => setBusy(b ? 'generate' : null), setModalError);
        if (r.ok) {
            addModal.hide();
            toastSuccess('Questions suggested');
            await reloadAll();
        }
    }
    async function check(q: Question) {
        const before = q.lastCheckedAt;
        const r = await act(() => api<{
            queued: boolean;
            checking: string[];
            problems?: string[];
        }>(`shopper-questions/${q.id}/check`, { method: 'POST' }), (b) => setBusy(b ? `check:${q.id}` : null), setError);
        if (!r.ok || !r.data)
            return;
        toastSuccess('Check started');
        const problems = r.data.problems?.length ? ` ${r.data.problems.join(' ')}` : '';
        setNote(`Checking “${q.text}” now on ${r.data.checking.join(', ')}. The results appear here as each one finishes.${problems}`);
        for (let i = 0; i < POLL_TRIES; i++) {
            await new Promise((res) => setTimeout(res, POLL_MS));
            if (!mounted.current)
                return;
            const next = await api<ShopperQuestionsData>('shopper-questions');
            if (!mounted.current)
                return;
            if (next.ok && next.data) {
                data.replace(next.data);
                const now = next.data.questions.find((x) => x.id === q.id);
                if (now && now.lastCheckedAt !== before && !(now.answers ?? []).some((a) => a.status === 'checking')) {
                    setNote(null);
                    void Promise.all([answers.reload(), shopping.reload(), reloadPlan()]);
                    return;
                }
            }
        }
        setNote('Some answers are still arriving. They appear here when they finish.');
    }
    async function setChecking(q: Question, on: boolean) {
        const r = await act(() => api(`shopper-questions/${q.id}/${on ? 'resume' : 'stop'}`, { method: 'POST' }), (b) => setBusy(b ? `status:${q.id}` : null), setError);
        if (r.ok) {
            toastSuccess(on ? 'Schedule resumed' : 'Schedule paused');
            await reloadAll();
        }
    }
    const sh = shopping.data;
    const suggestLock = access ?? questionLock ?? (sh?.products && sh.products.rows.length === 0 ? { locked: true as const, reason: 'Monitor a product first: suggestions are written from your products.', planNeeded: null } : null);
    return (<>
      <PagePrimaryAction disabled={!!questionLock} onClick={() => addModal.show()}>
        Add a question
      </PagePrimaryAction>
      <ErrorBanner error={error ?? data.error} onDismiss={error ? () => setError(null) : undefined}/>
      {!d && (data.loading || (data.data && !planReady)) ? <SkeletonSection lines={6} label="Loading your questions"/> : null}
      {d ? (<>
          <Summary answers={answers.data} shopping={sh}/>

          <UI.Section heading="Shopper questions">
            <UI.Stack gap="base">
              <UI.Text color="subdued">
                {[
                d.assistants.length ? `Asked on ${d.assistants.join(', ')}` : null,
                d.surfaces.length ? `products checked on ${d.surfaces.join(' and ')}` : null,
            ].filter(Boolean).join('; ')}
                {d.assistants.length || d.surfaces.length ? '. ' : ''}
                {(d.schedule ?? []).map((l) => l.text.replace('{date}', formatDate(l.date))).join(' ')}{' '}
                <UI.Link href={APP_PATHS.settings}>Change how often</UI.Link>
              </UI.Text>
              
              {price ? <UI.Text color="subdued">{price}</UI.Text> : null}
              {access ? <UI.Text color="subdued">{`${access.reason}${access.planNeeded ? ` Available on ${access.planNeeded}.` : ''}`}</UI.Text> : null}
              {sh?.freeSnapshot ? <UI.Text color="subdued">{sh.freeSnapshot.line}</UI.Text> : null}
              {questionLock ? <UI.Text color="subdued">{`${questionLock.reason}${questionLock.planNeeded ? ` Available on ${questionLock.planNeeded}.` : ''}`}</UI.Text> : null}
              {note ? <UI.Paragraph>{note}</UI.Paragraph> : null}
              {d.questions.length === 0 ? (<UI.EmptyState heading="No questions yet">
                  <UI.Paragraph>Add a question your shoppers ask an AI assistant before buying, like “best driver for a beginner”. We ask the assistants and check the products they show.</UI.Paragraph>
                  <UI.Button slot="primary-action" disabled={!!questionLock || undefined} onClick={() => addModal.show()}>
                    Add a question
                  </UI.Button>
                </UI.EmptyState>) : (<UI.Table variant="auto" {...paged.tableProps}>
                  <UI.TableHeaderRow>
                    <UI.TableHeader listSlot="primary">Question</UI.TableHeader>
                    <UI.TableHeader listSlot="labeled">Latest check</UI.TableHeader>
                    <UI.TableHeader listSlot="inline">Actions</UI.TableHeader>
                  </UI.TableHeaderRow>
                  <UI.TableBody>
                    {paged.rows.map((q) => {
                    const failed = (q.answers ?? []).filter((a) => a.status === 'failed').map((a) => a.label);
                    return (<UI.TableRow key={q.id} clickDelegate={`sq-${q.id}`}>
                          <UI.TableCell>
                            <UI.Stack gap="small-100">
                              <UI.Link id={`sq-${q.id}`} href={questionHref(q)}>
                                {q.text}
                              </UI.Link>
                              {q.checking ? (cadenceLine(d.cadence) ? <UI.Text color="subdued">{cadenceLine(d.cadence)}</UI.Text> : null) : (<UI.Stack direction="inline" gap="small-200" alignItems="center">
                                  <UI.Badge tone="neutral">Paused</UI.Badge>
                                  <UI.Text color="subdued">Not checked until you resume its schedule</UI.Text>
                                </UI.Stack>)}
                            </UI.Stack>
                          </UI.TableCell>
                          <UI.TableCell>
                            <UI.Stack gap="small-100">
                              <UI.Text>{q.lastCheckedAt ? formatDate(q.lastCheckedAt) : 'Not checked yet'}</UI.Text>
                              {q.lastCheckedAt && q.answers ? <ResultBadge label="AI assistants" text={latestSummary(q.answers)}/> : null}
                              {q.lastCheckedAt && q.products ? <ResultBadge label="Products" text={q.products.replace(/^Products:\s*/, '')}/> : null}
                              {failed.length ? <UI.Text color="subdued">{`Couldn’t check ${failed.join(', ')} · not charged`}</UI.Text> : null}
                            </UI.Stack>
                          </UI.TableCell>
                          <UI.TableCell>
                            <UI.Stack direction="inline" gap="small-200" alignItems="start">
                              {q.checking ? (<UI.Button disabled={!!access || q.checkPrice === null || busy !== null || undefined} loading={busy === `check:${q.id}` || undefined} accessibilityLabel={q.checkPrice !== null ? `Check now, ${fmtNumber(q.checkPrice)} credits` : 'Check now'} onClick={() => void check(q)}>
                                  Check now
                                </UI.Button>) : null}
                              <UI.Button variant="tertiary" disabled={busy !== null || undefined} loading={busy === `status:${q.id}` || undefined} onClick={() => void setChecking(q, !q.checking)}>
                                {q.checking ? 'Pause' : 'Resume schedule'}
                              </UI.Button>
                            </UI.Stack>
                          </UI.TableCell>
                        </UI.TableRow>);
                })}
                  </UI.TableBody>
                </UI.Table>)}
            </UI.Stack>
          </UI.Section>

          {sh && sh.findings.length > 0 ? (<UI.Section heading="What the answers show">
              <UI.Stack gap="base">
                {sh.findings.map((f, i) => (<UI.Stack key={`${f.kind}-${i}`} gap="small-200">
                    <UI.Text type="strong">{f.title}</UI.Text>
                    <UI.Text color="subdued">{f.detail}</UI.Text>
                    {f.remedy ? <UI.Paragraph>{f.remedy}</UI.Paragraph> : null}
                  </UI.Stack>))}
              </UI.Stack>
            </UI.Section>) : null}
        </>) : null}

      <UI.Modal id={addModal.id} heading="Add a question">
        <UI.Stack gap="base">
          <ErrorBanner error={modalError} onDismiss={modalError ? () => setModalError(null) : undefined}/>
          <form onSubmit={(e) => {
            e.preventDefault();
            void addQuestion();
        }}>
            <UI.TextField label="Question" details="A question a shopper asks an AI assistant before buying, in their own words. We ask the assistants and check the products they show." value={text} maxLength={500} error={fieldError(modalError, 'text')} disabled={!!questionLock || undefined} onInput={(e) => setText(e.currentTarget.value)}/>
          </form>
          {sh ? (<UI.Stack gap="small-200">
              <UI.Text color="subdued">Or let us suggest some from your monitored products.</UI.Text>
              <PricedButton label="Suggest questions" credits={sh.prices.generateQuestions} lock={suggestLock} busy={busy === 'generate'} onClick={() => void suggest()}/>
            </UI.Stack>) : null}
        </UI.Stack>
        <UI.Button slot="primary-action" variant="primary" disabled={!!questionLock || !text.trim() || busy !== null || undefined} loading={busy === 'add' || undefined} onClick={() => void addQuestion()}>
          Add question
        </UI.Button>
        <UI.Button slot="secondary-actions" commandFor={addModal.id} command="--hide">
          Cancel
        </UI.Button>
      </UI.Modal>
    </>);
}
function Summary({ answers, shopping }: {
    answers: AnswersSummary | null;
    shopping: Shopping | null;
}) {
    const rows: Array<{
        key: string;
        where: string;
        result: string;
        k: number;
        n: number;
    }> = [
        ...(answers?.assistants ?? []).map((a) => ({
            key: `a-${a.platform}`,
            where: a.label,
            result: a.known === 0 ? 'Not checked yet' : `Named you in ${fmtNumber(a.mentioned)} of ${fmtNumber(a.known)} answers${a.enoughData ? '' : ' (too few to read much into)'}`,
            k: a.mentioned,
            n: a.known,
        })),
        ...(shopping?.denominators ?? []).map((s) => ({
            key: `s-${s.surface}`,
            where: s.surface,
            result: s.checks === 0 ? 'Not checked yet' : s.showedProducts === 0 ? `No products shown in ${fmtNumber(s.checks)} checks` : `Your products in ${fmtNumber(s.showedYours)} of ${fmtNumber(s.showedProducts)} answers that showed products`,
            k: s.showedYours,
            n: s.showedProducts,
        })),
    ];
    if (rows.length === 0)
        return null;
    const measured = rows.filter((r) => r.n > 0);
    const none = measured.length > 0 && measured.every((r) => r.k === 0);
    return (<UI.Section heading={`Do AI assistants recommend your store? Last ${answers?.windowDays ?? 30} days`}>
      <UI.Stack gap="base">
        {none ? (<UI.Text>
            No assistant has named your store yet, and no shopping result has shown your products.{' '}
            <UI.Link href={aiVisibilityHref('competitors')}>See who they recommend instead</UI.Link>.
          </UI.Text>) : null}
        <UI.QueryContainer>
          <UI.Grid gridTemplateColumns="@container (inline-size > 720px) 1fr 1fr 1fr, 1fr" gap="base">
            {rows.map((r) => (<UI.Stack key={r.key} gap="small-100">
                <UI.Stack direction="inline" gap="small-200" alignItems="center" justifyContent="space-between">
                  <UI.Text type="strong">{r.where}</UI.Text>
                  <UI.Badge tone={r.n === 0 ? 'neutral' : r.k > 0 ? 'success' : 'caution'}>{r.n === 0 ? 'Not checked yet' : r.k > 0 ? `${Math.round((r.k / r.n) * 100)}%` : 'Not yet'}</UI.Badge>
                </UI.Stack>
                <svg width="100%" height="6" aria-hidden="true" focusable="false" style={{ display: 'block' }}>
                  <rect x="0" y="0" width="100%" height="6" rx="3" fill="currentColor" fillOpacity={0.1}/>
                  {r.n > 0 && r.k > 0 ? <rect x="0" y="0" width={`${(r.k / r.n) * 100}%`} height="6" rx="3" fill="currentColor" fillOpacity={0.75}/> : null}
                </svg>
                <UI.Text color="subdued">{r.result}</UI.Text>
              </UI.Stack>))}
          </UI.Grid>
        </UI.QueryContainer>
      </UI.Stack>
    </UI.Section>);
}
function every(days: number): string {
    return days === 1 ? 'every day' : days === 7 ? 'every week' : `every ${days} days`;
}
function cadenceLine(c: ShopperQuestionsData['cadence']): string | null {
    if (!c)
        return null;
    const { answersDays: a, productsDays: p } = c;
    if (a !== null && p !== null && a !== p)
        return `AI assistants ${every(a)}, products ${every(p)}`;
    const days = a ?? p;
    return days === null ? null : `Checked ${every(days)}`;
}
function checkPriceLine(d: ShopperQuestionsData | null): string | null {
    const checking = (d?.questions ?? []).filter((q) => q.checking);
    if (!d || checking.length === 0)
        return null;
    if (checking.some((q) => q.checkPrice === null))
        return 'The price of a check could not be read just now, so Check now is unavailable.';
    const prices = [...new Set(checking.map((q) => q.checkPrice as number))];
    const parts = [
        d.assistants.length ? `${d.assistants.length} AI ${d.assistants.length === 1 ? 'assistant' : 'assistants'}` : null,
        d.surfaces.length ? `${d.surfaces.length} shopping ${d.surfaces.length === 1 ? 'result' : 'results'}` : null,
    ].filter(Boolean);
    return `Each check of a question costs ${prices.length > 1 ? 'up to ' : ''}${fmtNumber(Math.max(...prices))} credits${parts.length ? ` (${parts.join(' and ')})` : ''}, whether you press Check now or it runs on its schedule.`;
}
function ResultBadge({ label, text }: {
    label: string;
    text: string;
}) {
    const t = text.toLowerCase();
    const tone = /^named|yours shown|your products? shown|^shown, yours/.test(t) ? 'success' : /not named|none yours/.test(t) ? 'caution' : 'neutral';
    return (<UI.Stack direction="inline" gap="small-200" alignItems="center">
      <UI.Text color="subdued">{label}</UI.Text>
      <UI.Badge tone={tone}>{text.charAt(0).toUpperCase() + text.slice(1)}</UI.Badge>
    </UI.Stack>);
}
