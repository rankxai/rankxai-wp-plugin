import { useEffect, useRef, useState } from 'react';
import { aiVisibilityHref } from '@/lib/shopify-app/app-routes-core';
import { api, toastSuccess } from '../api';
import { usePlan } from '../plan-context';
import { BackLink, ErrorBanner, PagePrimaryAction, act, formatDate, pricedLabel, useLoad, usePageError } from '../kit';
import { SkeletonSection } from '../components/Status';
import { AnswerDays, type AnswerCheckView } from '../components/AnswerParts';
import * as UI from '../ui';
interface QuestionData {
    question: {
        id: string;
        text: string;
        checking: boolean;
    };
    lastCheckedAt: string | null;
    schedule: {
        text: string;
        date: string | null;
    } | null;
    checks: AnswerCheckView[];
    keptDays: number;
    checkPrice: number | null;
}
const POLL_MS = 20000;
const POLL_TRIES = 12;
export function AnswerQuestionPage({ id }: {
    id: string;
}) {
    const path = `answers/questions/${id}`;
    const data = useLoad<QuestionData>(path);
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
    const access = plan?.locks.access ?? null;
    const d = planReady ? data.data : null;
    async function checkNow() {
        const before = d?.lastCheckedAt ?? null;
        const r = await act(() => api<{
            queued: boolean;
            assistants: string[];
        }>(`${path}/check`, { method: 'POST' }), setBusy, setError);
        if (!r.ok || !r.data)
            return;
        toastSuccess('Check started');
        setNote(`Checking now on ${r.data.assistants.join(', ')}. Each answer appears here as it arrives${r.data.assistants.some((a) => /copilot/i.test(a)) ? '; Copilot can take a few minutes' : ''}.`);
        for (let i = 0; i < POLL_TRIES; i++) {
            await new Promise((res) => setTimeout(res, POLL_MS));
            if (!mounted.current)
                return;
            const next = await api<QuestionData>(path);
            if (!mounted.current)
                return;
            if (next.ok && next.data) {
                data.replace(next.data);
                const done = next.data.lastCheckedAt !== before && !(next.data.checks[0]?.answers ?? []).some((a) => a.status === 'checking');
                if (done) {
                    setNote(null);
                    void reloadPlan();
                    return;
                }
            }
        }
        setNote('Some assistants are still answering. Their answers appear here when they finish.');
    }
    return (<UI.Page heading={d?.question.text ?? 'Question'} inlineSize="large">
      <BackLink href={aiVisibilityHref('shopping')} label="AI search"/>
      {d && d.question.checking ? (<PagePrimaryAction spends disabled={!!access || busy} loading={busy} onClick={() => void checkNow()}>
          {pricedLabel('Check now', d.checkPrice)}
        </PagePrimaryAction>) : null}
      <ErrorBanner error={error ?? data.error} onDismiss={error ? () => setError(null) : undefined}/>
      {!d && (data.loading || (data.data && !planReady)) ? <SkeletonSection lines={6} label="Reading the answers"/> : null}
      {d ? (<>
          <UI.Section heading="When it was checked">
            <UI.Stack gap="base">
              <UI.Text color="subdued">
                {d.lastCheckedAt ? `Checked ${formatDate(d.lastCheckedAt)}.` : 'Not checked yet.'}
                {d.schedule ? ` ${d.schedule.text.replace('{date}', formatDate(d.schedule.date))}` : ''}
                {!d.question.checking ? ' This question is not being checked.' : ''}
              </UI.Text>
              {note ? <UI.Paragraph>{note}</UI.Paragraph> : null}
              {access ? <UI.Text color="subdued">{`${access.reason}${access.planNeeded ? ` Available on ${access.planNeeded}.` : ''}`}</UI.Text> : null}
            </UI.Stack>
          </UI.Section>

          <AnswerDays questionId={d.question.id} questionText={d.question.text} checks={d.checks} keptDays={d.keptDays}/>
        </>) : null}
    </UI.Page>);
}
