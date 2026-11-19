import { useEffect, useState } from 'react';
import { blogPlanHref, blogArticleHref } from '@/lib/shopify-app/app-routes-core';
import { api } from '../api';
import * as UI from '../ui';
export interface RunStep {
    key: string;
    label: string;
    status: 'pending' | 'running' | 'done' | 'failed';
    detail: string | null;
}
export interface ShopifyRun {
    stage: 'researching' | 'writing_queued' | 'writing' | 'ready' | 'needs_edits' | 'failed' | 'not_started' | 'plan_ready';
    briefId: string;
    itemId: string | null;
    failure?: {
        message: string;
        retryable: boolean;
    };
    steps: RunStep[];
    minutesLeft: number | null;
    topic: string | null;
    guided: {
        state: 'awaiting' | 'approved';
    } | null;
}
const SETTLED = new Set(['ready', 'needs_edits', 'failed', 'not_started']);
function StepIcon({ status }: {
    status: RunStep['status'];
}) {
    if (status === 'done')
        return <UI.Icon type="check-circle" tone="success"/>;
    if (status === 'running')
        return <UI.Spinner accessibilityLabel="In progress" size="base"/>;
    if (status === 'failed')
        return <UI.Icon type="alert-triangle" tone="warning"/>;
    return <UI.Icon type="circle" color="subdued"/>;
}
export function ArticleRunCard({ initial, onSettled }: {
    initial: ShopifyRun;
    onSettled: () => void;
}) {
    const [run, setRun] = useState<ShopifyRun>(initial);
    useEffect(() => {
        if (SETTLED.has(initial.stage) || initial.stage === 'plan_ready')
            return;
        let stop = false;
        const tick = async () => {
            const r = await api<{
                run: ShopifyRun;
            }>(`blog/runs/${initial.briefId}`);
            if (stop)
                return;
            if (r.ok && r.data) {
                setRun(r.data.run);
                if (SETTLED.has(r.data.run.stage) || r.data.run.stage === 'plan_ready') {
                    if (r.data.run.stage !== 'plan_ready')
                        void api('images/article-image-start', { method: 'POST', body: { briefId: initial.briefId } });
                    onSettled();
                    return;
                }
            }
            setTimeout(tick, 6000);
        };
        const t = setTimeout(tick, 6000);
        return () => {
            stop = true;
            clearTimeout(t);
        };
    }, [initial.briefId]);
    const topic = run.topic ? `“${run.topic}”` : 'your article';
    const planFirst = run.guided?.state === 'awaiting' && run.stage === 'researching';
    if (run.stage === 'plan_ready') {
        return (<UI.Box padding="base" border="base" borderRadius="base">
        <UI.Stack gap="small-200">
          <UI.Stack direction="inline" gap="small-200" alignItems="center">
            <UI.Text type="strong">{`The plan for ${topic} is ready`}</UI.Text>
            <UI.Badge tone="info">Waiting for you</UI.Badge>
          </UI.Stack>
          <UI.Text color="subdued">Choose the title and shape the sections, then it is written. Nothing is written until you approve the plan.</UI.Text>
          <UI.Stack direction="inline">
            <UI.Button variant="primary" href={blogPlanHref(run.briefId)}>
              Review the plan
            </UI.Button>
          </UI.Stack>
        </UI.Stack>
      </UI.Box>);
    }
    return (<UI.Box padding="base" border="base" borderRadius="base">
      <UI.Stack gap="base">
        <UI.Stack direction="inline" gap="small-200" alignItems="center" justifyContent="space-between">
          <UI.Text type="strong">{run.stage === 'failed' || run.stage === 'not_started' ? `Writing ${topic} stopped` : planFirst ? `Researching ${topic}` : `Writing ${topic}`}</UI.Text>
          {run.minutesLeft !== null ? <UI.Text color="subdued">{`${planFirst ? 'plan ready in about' : 'about'} ${run.minutesLeft} ${run.minutesLeft === 1 ? 'minute' : 'minutes'}${planFirst ? '' : ' left'}`}</UI.Text> : null}
        </UI.Stack>
        <UI.Stack gap="small-200">
          {run.steps.map((s) => (<UI.Grid key={s.key} gridTemplateColumns="20px minmax(0, 1fr)" gap="small-200" alignItems="center">
              <StepIcon status={s.status}/>
              <UI.Stack direction="inline" gap="small-200" alignItems="baseline">
                <UI.Text type={s.status === 'running' ? 'strong' : undefined} color={s.status === 'pending' ? 'subdued' : undefined}>
                  {s.label}
                </UI.Text>
                {s.detail ? <UI.Text color="subdued">{s.detail}</UI.Text> : null}
              </UI.Stack>
            </UI.Grid>))}
        </UI.Stack>
        {run.stage === 'writing_queued' ? <UI.Text color="subdued">Starts when the article before it is written.</UI.Text> : null}
        {run.failure ? <UI.Text>{run.failure.message}</UI.Text> : null}
        {planFirst ? (<UI.Text color="subdued">You can leave this page. When the research is done, the plan waits here for you; nothing is written until you approve it.</UI.Text>) : !SETTLED.has(run.stage) ? (<UI.Text color="subdued">You can leave this page. We will tell you here and in your notifications when it is ready.</UI.Text>) : null}
        {run.itemId && (run.stage === 'ready' || run.stage === 'needs_edits') ? <UI.Link href={blogArticleHref(run.itemId)}>Read it</UI.Link> : null}
      </UI.Stack>
    </UI.Box>);
}
