import { useState } from 'react';
import { api, toastSuccess } from '../api';
import { act, useLoad, type PageError } from '../kit';
import { ShareBar, ShareBars, ShareKey, rateText } from '../components/ShareBars';
import { SkeletonSection } from '../components/Status';
import { useModal } from '../components/FixModals';
import * as UI from '../ui';
export { rateText };
export type PresentedRate = {
    shown: true;
    k: number;
    n: number;
    p: number;
    lo: number;
    hi: number;
    precise: boolean;
} | {
    shown: false;
    n: number;
    needed: number;
};
export interface PresentedSurface {
    surface: string;
    label: string;
    trigger: PresentedRate;
    triggerLabel: 'measured' | 'low_trigger' | 'not_enough_checks';
    triggerNote: string | null;
    answered: number;
    withModule: number;
    stores: Array<{
        label: string;
        isOwn: boolean;
        rate: PresentedRate;
    }>;
    own: {
        label: string;
        rate: PresentedRate;
    } | null;
    products: Array<{
        title: string;
        rate: PresentedRate;
    }> | null;
    productNote: string | null;
}
interface PresentedQuery {
    id: string;
    text: string;
    stage: string;
    stageLabel: string;
    facets: Array<{
        key: string;
        label: string;
    }>;
    edited: boolean;
    surfaces: PresentedSurface[];
    why: string[];
}
export interface BuyerQueries {
    windowDays: number;
    locked: {
        reason: string;
        planNeeded: string | null;
    } | null;
    stages: Array<{
        key: string;
        label: string;
    }>;
    facets: Array<{
        key: string;
        label: string;
    }>;
    queries: PresentedQuery[];
    overall: PresentedSurface[];
    ownLabel: string;
}
function storeRows(s: PresentedSurface, limit = 6) {
    const rows = s.stores.filter((st) => !st.isOwn).slice(0, limit).map((st) => ({ label: st.label, isOwn: st.isOwn, rate: st.rate }));
    const own = s.own ?? s.stores.find((st) => st.isOwn) ?? null;
    if (own)
        rows.push({ label: own.label, isOwn: true, rate: own.rate });
    return rows;
}
export function StoreShareTable({ surfaces, empty, hideLabel, limit }: {
    surfaces: PresentedSurface[];
    empty: string;
    hideLabel?: boolean;
    limit?: number;
}) {
    const measured = surfaces.filter((s) => s.triggerLabel === 'measured' && s.stores.length > 0);
    if (measured.length === 0)
        return <UI.Paragraph>{empty}</UI.Paragraph>;
    return (<UI.Stack gap="large">
      {measured.map((s) => (<UI.Stack key={s.surface} gap="small-200">
          {hideLabel ? null : <UI.Text type="strong">{s.label}</UI.Text>}
          <ShareBars rows={storeRows(s, limit)} noun="answers that showed products"/>
        </UI.Stack>))}
      <ShareKey />
    </UI.Stack>);
}
export interface StoreSeen {
    merchant: string;
    answers: number;
    bestPosition: number | null;
    outrankedYou: boolean;
}
export function BuyerQueryShare({ id, storesSeen = [] }: {
    id: string;
    storesSeen?: StoreSeen[];
}) {
    const one = useLoad<{
        windowDays: number;
        query: PresentedQuery;
        ownLabel: string;
    }>(`shopping/buyer-queries/${id}`);
    const q = one.data?.query;
    if (!q) {
        return one.error ? (<UI.Section heading="Stores shown">
        <UI.Paragraph>{one.error}</UI.Paragraph>
      </UI.Section>) : (<SkeletonSection lines={3} label="Loading the stores shown"/>);
    }
    const anyRated = q.surfaces.some((s) => s.triggerLabel === 'measured');
    return (<>
      <UI.Grid gridTemplateColumns="repeat(auto-fit, minmax(min(300px, 100%), 1fr))" gap="base">
        {q.surfaces.map((s) => (<UI.Section key={s.surface} heading={`Stores shown on ${s.label}`}>
            <UI.Stack gap="base">
              <UI.Stack gap="small-100">
                
                <UI.Text>{s.trigger.shown ? `Shows products in ${rateText(s.trigger)}.` : `Not enough checks yet for a rate: ${s.trigger.n} of the ${s.trigger.needed} needed.`}</UI.Text>
                <ShareBar rate={s.trigger}/>
              </UI.Stack>
              {s.triggerNote && s.triggerLabel !== 'not_enough_checks' ? <UI.Text color="subdued">{s.triggerNote}</UI.Text> : null}
              {s.triggerLabel === 'measured' ? <StoreShareTable surfaces={[s]} hideLabel empty="No store appeared often enough to rate yet."/> : null}
              {s.products && s.products.length > 0 ? (<UI.Stack gap="small-200">
                  <UI.Text type="strong">Your products</UI.Text>
                  <ShareBars rows={s.products.map((p) => ({ label: p.title, isOwn: true, rate: p.rate }))} noun="answers that showed products" ownBadge={false}/>
                </UI.Stack>) : null}
              {s.productNote ? <UI.Text color="subdued">{s.productNote}</UI.Text> : null}
            </UI.Stack>
          </UI.Section>))}
      </UI.Grid>
      {!anyRated && storesSeen.length > 0 ? (<UI.Section heading="Stores shown so far">
          <UI.Stack gap="small-200">
            <UI.Table variant="auto">
              <UI.TableHeaderRow>
                <UI.TableHeader listSlot="primary">Store</UI.TableHeader>
                <UI.TableHeader listSlot="labeled">Answers</UI.TableHeader>
                <UI.TableHeader listSlot="labeled">Best position</UI.TableHeader>
              </UI.TableHeaderRow>
              <UI.TableBody>
                {storesSeen.map((w) => (<UI.TableRow key={w.merchant}>
                    <UI.TableCell>{w.outrankedYou ? `${w.merchant} (ranked above you)` : w.merchant}</UI.TableCell>
                    <UI.TableCell>{w.answers}</UI.TableCell>
                    <UI.TableCell>{w.bestPosition ?? '–'}</UI.TableCell>
                  </UI.TableRow>))}
              </UI.TableBody>
            </UI.Table>
            <UI.Text color="subdued">Every store whose products were shown, on ChatGPT Shopping and Google AI Mode together. Each one’s share is shown once there are enough checks.</UI.Text>
          </UI.Stack>
        </UI.Section>) : null}
      {q.why.length > 0 ? (<UI.Section heading="What the products that appeared have in common">
          <UI.Stack gap="small-200">
            {q.why.map((w) => (<UI.Paragraph key={w}>{w}</UI.Paragraph>))}
            <UI.Text color="subdued">A likely reason, from what the winning products state. Not a proven cause.</UI.Text>
          </UI.Stack>
        </UI.Section>) : null}
    </>);
}
export function QuestionTypeSection({ id, setError }: {
    id: string;
    setError: (e: PageError | null) => void;
}) {
    const one = useLoad<{
        windowDays: number;
        query: PresentedQuery;
        ownLabel: string;
    }>(`shopping/buyer-queries/${id}`);
    const all = useLoad<BuyerQueries>('shopping/buyer-queries');
    const [busy, setBusy] = useState(false);
    const editModal = useModal('stage');
    const q = one.data?.query;
    async function save(patch: {
        stage?: string;
        facets?: string[];
    }) {
        const r = await act(() => api(`shopping/questions/${id}/classification`, { method: 'PATCH', body: patch }), setBusy, setError);
        if (r.ok) {
            toastSuccess('Saved');
            await one.reload();
        }
    }
    if (!q)
        return null;
    return (<>
      
      <UI.Section heading="Question type">
        <UI.Stack gap="small-200">
          <UI.Stack direction="inline" gap="small-200" alignItems="center">
            <UI.Badge tone="neutral">{q.stageLabel}</UI.Badge>
            {q.facets.map((f) => (<UI.Badge key={f.key}>{f.label}</UI.Badge>))}
            <UI.Button variant="tertiary" commandFor={editModal.id} command="--show">
              Edit
            </UI.Button>
          </UI.Stack>
          <UI.Text color="subdued">{q.edited ? 'Set by you.' : 'Suggested from the wording; change it if it is wrong.'}</UI.Text>
        </UI.Stack>
      </UI.Section>
      <UI.Modal id={editModal.id} heading="Question type">
        <UI.Stack gap="base">
          <UI.Select label="Stage" value={q.stage} disabled={busy || undefined} onChange={(e) => void save({ stage: e.currentTarget.value })}>
            {(all.data?.stages ?? []).map((s) => (<UI.Option key={s.key} value={s.key}>
                {s.label}
              </UI.Option>))}
          </UI.Select>
          <UI.Stack gap="small-200">
            <UI.Text>What it is about</UI.Text>
            {(all.data?.facets ?? []).map((f) => {
            const on = q.facets.some((x) => x.key === f.key);
            return (<UI.Checkbox key={f.key} label={f.label} checked={on || undefined} disabled={busy || undefined} onChange={() => void save({ facets: on ? q.facets.filter((x) => x.key !== f.key).map((x) => x.key) : [...q.facets.map((x) => x.key), f.key] })}/>);
        })}
          </UI.Stack>
          <UI.Text color="subdued">Each change is saved as you make it.</UI.Text>
        </UI.Stack>
        <UI.Button slot="primary-action" variant="primary" commandFor={editModal.id} command="--hide">
          Done
        </UI.Button>
      </UI.Modal>
    </>);
}
