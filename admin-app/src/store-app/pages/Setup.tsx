import { APP_PATHS } from '@/lib/shopify-app/app-routes-core';
import { useStore } from '../plan-context';
import { useEffect, useState } from 'react';
import type { SetupPhase } from '@/lib/shopify-app/setup-phase';
import { api, toastSuccess } from '../api';
import { host } from '../host';
import { ErrorBanner, Loading, act, useLoad, usePageError } from '../kit';
import * as UI from '../ui';
interface Suggestion {
    id: string;
    title: string;
    imageUrl: string | null;
    price: string | null;
    productType: string | null;
}
interface Suggestions {
    products: Suggestion[];
    excluded: {
        giftCard: number;
        inactive: number;
        notPublished: number;
    };
    publicationAssessed: boolean;
    order: 'best_selling' | 'newest';
    defaultIds: string[];
    allowance: {
        cap: number | null;
        active: number | null;
    };
}
export interface SetupView {
    phase: SetupPhase;
    line: string;
    status: string | null;
    expected: number;
    finished: number;
    stillChecking: number;
    usageLine: string | null;
    results: Array<{
        id: string;
        question: string;
        surface: string;
        outcome: string;
        text: string;
        checkedAt: string | null;
    }>;
    answers: {
        expected: number;
        finished: number;
    };
    polling: boolean;
    ranFirstCheck: boolean;
    noFirstCheckReason: string | null;
}
export function SetupCard({ onStarted, onTrial }: {
    onStarted: () => void;
    onTrial: boolean;
}) {
    const { words } = useStore();
    const suggestions = useLoad<Suggestions>('setup/suggestions');
    const [selected, setSelected] = useState<Set<string> | null>(null);
    const [picked, setPicked] = useState<Suggestion[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = usePageError();
    const list: Suggestion[] = [...(suggestions.data?.products ?? []), ...picked.filter((p) => !(suggestions.data?.products ?? []).some((s) => s.id === p.id))];
    const chosen = selected ?? new Set<string>(suggestions.data?.defaultIds ?? []);
    const cap = suggestions.data?.allowance.cap ?? null;
    const active = suggestions.data?.allowance.active ?? 0;
    const room = cap === null ? null : Math.max(0, cap - active);
    const toggle = (id: string, on: boolean) => {
        setSelected(() => {
            const next = new Set(chosen);
            if (on)
                next.add(id);
            else
                next.delete(id);
            return next;
        });
    };
    async function chooseOther() {
        let result: Array<{
            id: string;
            title?: string;
        }> | undefined;
        try {
            result = await host.pickProducts({ multiple: true });
        }
        catch {
            setError({ message: words.pickerFailed, planLink: false });
            return;
        }
        if (!result || result.length === 0)
            return;
        setPicked((prev) => [...prev, ...result!.map((p) => ({ id: p.id, title: p.title ?? 'Product', imageUrl: null, price: null, productType: null }))]);
        setSelected(() => {
            const next = new Set(chosen);
            for (const p of result!)
                next.add(p.id);
            return next;
        });
    }
    async function start() {
        const r = await act(() => api<{
            started: boolean;
        }>('setup/start', { method: 'POST', body: { productIds: [...chosen] } }), setBusy, setError);
        if (r.ok || r.code === 'already_started') {
            toastSuccess('Setting up your store');
            onStarted();
        }
    }
    const over = room !== null && chosen.size > room;
    const noneChosen = list.length > 0 && chosen.size === 0;
    return (<UI.Section heading="Set up RankX AI">
      <UI.Stack gap="base">
        <ErrorBanner error={error ?? suggestions.error} onDismiss={error ? () => setError(null) : undefined}/>
        <UI.Paragraph>
          Choose the products that matter most to you. We use them to write the questions shoppers ask ChatGPT and Google AI Mode,
          find the stores that compete with you, and run your first check. Results appear here within a few minutes.
        </UI.Paragraph>
        
        <UI.Text type="strong">{onTrial ? 'Your first check is included in your free trial.' : 'Your first check uses your plan’s monthly credits.'}</UI.Text>
        {!suggestions.data && suggestions.loading ? <Loading label="Reading your best sellers"/> : null}
        {suggestions.data && list.length === 0 ? (<UI.Paragraph>
            Your store has no active products on its online store yet. You can still start: we will check what AI assistants say
            about your store, and you can add products later.
          </UI.Paragraph>) : null}
        {list.length > 0 ? (<UI.Stack gap="small-200">
            <UI.Text color="subdued">
              {suggestions.data?.order === 'best_selling' ? 'Your best sellers come first.' : 'Your newest products come first.'} Untick any you do not
              want, or add others.
            </UI.Text>
            {list.map((p) => (<UI.Checkbox key={p.id} label={p.price ? `${p.title} · ${p.price}` : p.title} checked={chosen.has(p.id) || undefined} onChange={(e) => toggle(p.id, e.currentTarget.checked)}/>))}
          </UI.Stack>) : null}
        {noneChosen ? <UI.Text color="subdued">Choose at least one product to start.</UI.Text> : null}
        {over ? <UI.Text color="subdued">You can monitor {room} more {room === 1 ? 'product' : 'products'}. Untick {chosen.size - (room ?? 0)} to continue.</UI.Text> : null}
        <UI.Stack direction="inline" gap="base">
          <UI.Button variant="primary" loading={busy || undefined} disabled={busy || over || noneChosen || undefined} onClick={() => void start()}>
            Start my first check
          </UI.Button>
          <UI.Button onClick={() => void chooseOther()}>Choose other products</UI.Button>
        </UI.Stack>
        <UI.Text color="subdued">If you leave now, we finish setting up with the products we suggested above.</UI.Text>
      </UI.Stack>
    </UI.Section>);
}
const HEADINGS: Record<SetupPhase, string> = {
    not_started: 'Set up RankX AI',
    setting_up: 'Setting up your store',
    checking: 'Your first check',
    done: 'Your first check',
    deferred: 'Your first check is on its way',
    failed: 'Setup did not finish',
};
const POLL_MS = 5000;
export function SetupProgress({ initial, onSettled }: {
    initial: SetupView;
    onSettled: () => void;
}) {
    const { capabilities, platform } = useStore();
    const canStart = capabilities ? capabilities.can.setupStart : platform === 'shopify';
    const [view, setView] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [error, setError] = usePageError();
    useEffect(() => {
        if (!view.polling)
            return;
        let cancelled = false;
        const timer = setInterval(() => {
            void api<SetupView>('setup').then((r) => {
                if (cancelled || !r.ok || !r.data)
                    return;
                setView(r.data);
                if (!r.data.polling)
                    onSettled();
            });
        }, POLL_MS);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [view.polling]);
    async function retry() {
        const r = await act(() => api('setup/start', { method: 'POST', body: {} }), setBusy, setError);
        if (r.ok) {
            const s = await api<SetupView>('setup');
            if (s.ok && s.data)
                setView(s.data);
        }
    }
    const done = view.results.filter((r) => r.outcome !== 'still_checking');
    return (<UI.Section heading={HEADINGS[view.phase]}>
      <UI.Stack gap="base">
        <ErrorBanner error={error} onDismiss={error ? () => setError(null) : undefined}/>
        <UI.Paragraph>{view.line}</UI.Paragraph>
        {view.phase === 'setting_up' ? <Loading label="Setting up"/> : null}
        {view.usageLine ? <UI.Text color="subdued">{view.usageLine}</UI.Text> : null}
        {done.length > 0 ? (<UI.Table>
            <UI.TableHeaderRow>
              <UI.TableHeader listSlot="primary">Question</UI.TableHeader>
              <UI.TableHeader>Result</UI.TableHeader>
            </UI.TableHeaderRow>
            <UI.TableBody>
              {done.map((r) => (<UI.TableRow key={r.id}>
                  <UI.TableCell>{r.question}</UI.TableCell>
                  <UI.TableCell>{r.text}</UI.TableCell>
                </UI.TableRow>))}
            </UI.TableBody>
          </UI.Table>) : null}
        {view.phase === 'checking' && view.stillChecking > 0 ? (<UI.Text color="subdued">
            {view.stillChecking === 1 ? '1 answer is still checking.' : `${view.stillChecking} answers are still checking.`} Each takes about half a
            minute, and some take longer.
          </UI.Text>) : null}
        {view.answers.expected > 0 ? (<UI.Text color="subdued">
            What AI assistants say about your store: {view.answers.finished} of {view.answers.expected} answers in.
          </UI.Text>) : null}
        {view.phase === 'failed' && !canStart && capabilities?.why.setupStart ? <UI.Text color="subdued">{capabilities.why.setupStart}</UI.Text> : null}
        {view.phase === 'failed' && canStart ? (<UI.Button variant="primary" loading={busy || undefined} disabled={busy || undefined} onClick={() => void retry()}>
            Try again
          </UI.Button>) : null}
        {done.length > 0 ? <UI.Link href={`${APP_PATHS.aiVisibility}?tab=shopping`}>See every result</UI.Link> : null}
      </UI.Stack>
    </UI.Section>);
}
