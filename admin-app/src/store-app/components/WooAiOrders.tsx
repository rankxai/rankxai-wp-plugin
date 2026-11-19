import { useEffect, useState } from 'react';
import { api, toastSuccess } from '../api';
import { adminLocale, fmtCount, fmtDate, fmtNumber, fmtPercent } from '../format';
import { MetricCard } from './MetricCard';
import { SkeletonSection } from './Status';
import { ErrorBanner, act, useLoad, usePageError } from '../kit';
import * as UI from '../ui';
type Window = 7 | 30 | 60;
const WINDOWS: readonly Window[] = [7, 30, 60];
interface Money {
    currency: string | null;
    gross: number;
    refunded: number;
    net: number;
}
interface Row {
    id: string;
    label: string;
    orders: number;
    share: number;
    money: Money[] | null;
}
interface View {
    windowDays: number;
    since: string;
    measured: boolean;
    showValue: boolean;
    totals: {
        orders: number;
        money: Money[] | null;
    };
    ai: {
        orders: number;
        share: number;
        money: Money[] | null;
    };
    assistants: Row[];
    otherSources: Row[];
    notRecordedOrders: number;
    onHoldOrders: number;
    offlineOrders: number;
    currencies: string[];
    truncated: boolean;
}
type Sync = {
    kind: 'no_store';
    reason: string | null;
} | {
    kind: 'backfilling';
    ordersSoFar: number | null;
} | {
    kind: 'failed';
    reason: string | null;
} | {
    kind: 'ready';
    lastRunAt: string | null;
    lastError: string | null;
};
type Health = {
    state: 'ok';
} | {
    state: 'feature_off';
} | {
    state: 'not_recording';
    run: number;
} | {
    state: 'unknown';
};
type WooAiOrders = {
    state: 'module_off';
    windowDays: number;
    canEnable: boolean;
    module: {
        label: string;
        description: string;
    };
} | {
    state: 'measured';
    platform: 'woocommerce';
    windowDays: number;
    sync: Sync;
    health: Health;
    measured: boolean;
    view: View;
    limits: string[];
};
function moneyLine(list: Money[] | null): string | null {
    if (!list)
        return null;
    if (list.length === 0)
        return '0';
    return list
        .map((m) => {
        if (!m.currency)
            return fmtNumber(m.net);
        try {
            return new Intl.NumberFormat(adminLocale(), { style: 'currency', currency: m.currency, maximumFractionDigits: 2 }).format(m.net);
        }
        catch {
            return `${fmtNumber(m.net)} ${m.currency}`;
        }
    })
        .join(' · ');
}
export function WooAiOrdersTab() {
    const [days, setDays] = useState<Window>(30);
    const data = useLoad<WooAiOrders>(`ai-orders?days=${days}`);
    const [error, setError] = usePageError();
    const [busy, setBusy] = useState(false);
    const d = data.data;
    const backfilling = d?.state === 'measured' && d.sync.kind === 'backfilling';
    const reload = data.reload;
    useEffect(() => {
        if (!backfilling)
            return;
        const timer = setInterval(() => void reload(), 20000);
        return () => clearInterval(timer);
    }, [backfilling, reload]);
    const enable = async () => {
        const r = await act(() => api<{
            enabled: boolean;
        }>('ai-orders/module', { method: 'PUT', body: { enabled: true } }), setBusy, setError);
        if (r.ok) {
            toastSuccess('Order reading is on');
            await data.reload();
        }
    };
    return (<>
      <ErrorBanner error={error ?? data.error} onDismiss={error ? () => setError(null) : undefined}/>
      {d?.state === 'measured' ? (<UI.Stack direction="inline" gap="small-200" alignItems="center">
          <UI.Text color="subdued">Period</UI.Text>
          {WINDOWS.map((w) => (<UI.PressButton key={w} pressed={w === days} onClick={() => setDays(w)}>
              {`Last ${w} days`}
            </UI.PressButton>))}
        </UI.Stack>) : null}

      {!d && data.loading ? <SkeletonSection lines={5} label="Loading AI orders"/> : null}

      {d?.state === 'module_off' ? (<UI.Section heading="See which orders came from AI assistants">
          <UI.Stack gap="base">
            <UI.Paragraph>
              WooCommerce records where each online order’s visit came from. RankX AI can read that record and show which orders started at an AI
              assistant, and what they were worth. It reads each order’s number, date, total and source, never a customer’s name, email or address.
            </UI.Paragraph>
            <UI.Text color="subdued">{`${d.module.label}: ${d.module.description}`}</UI.Text>
            {d.canEnable ? (<UI.Stack direction="inline" gap="base">
                <UI.Button variant="primary" loading={busy || undefined} disabled={busy || undefined} onClick={() => void enable()}>
                  Turn on order reading
                </UI.Button>
              </UI.Stack>) : (<UI.Text color="subdued">An owner or an admin of your RankX AI account can turn this on.</UI.Text>)}
          </UI.Stack>
        </UI.Section>) : null}

      {d?.state === 'measured' ? <Measured d={d}/> : null}
    </>);
}
function syncLine(s: Sync): string | null {
    if (s.kind === 'backfilling')
        return s.ordersSoFar !== null ? `Reading your orders: ${fmtCount(s.ordersSoFar, 'order', 'orders')} so far.` : 'Reading your orders.';
    if (s.kind === 'failed')
        return `Your orders could not be read${s.reason ? `: ${s.reason}` : ''}. We try again on our own.`;
    if (s.kind === 'no_store')
        return s.reason ?? 'Your store’s connection could not be found.';
    if (s.lastError)
        return `The last read did not finish: ${s.lastError}`;
    return s.lastRunAt ? `Orders last read ${fmtDate(s.lastRunAt)}.` : null;
}
function healthLine(h: Health): string | null {
    if (h.state === 'feature_off')
        return 'Order attribution is off in WooCommerce, so new orders carry no source. Turn it on in WooCommerce › Settings › Advanced › Features.';
    if (h.state === 'not_recording')
        return `Your most recent ${fmtCount(h.run, 'online order', 'online orders')} carry no source, so WooCommerce may not be recording where visits come from.`;
    return null;
}
function Measured({ d }: {
    d: Extract<WooAiOrders, {
        state: 'measured';
    }>;
}) {
    const v = d.view;
    const sync = syncLine(d.sync);
    const health = healthLine(d.health);
    const notes = (<>
      {sync ? <UI.Text color="subdued">{sync}</UI.Text> : null}
      {v.truncated ? <UI.Text color="subdued">Only the most recent orders in this period are counted.</UI.Text> : null}
      {!v.showValue ? <UI.Text color="subdued">Amounts are hidden for your account; the order counts are shown.</UI.Text> : null}
    </>);
    return (<>
      {health ? <UI.Banner tone="warning">{health}</UI.Banner> : null}
      {!d.measured ? (<UI.Section heading={`Orders from AI assistants, last ${d.windowDays} days`}>
          <UI.Stack gap="base">
            <UI.Paragraph>
              {d.sync.kind === 'backfilling'
                ? 'Reading your orders from WooCommerce. The numbers appear here when the first read finishes.'
                : 'Not measured yet: there are no online orders in this period, so there is nothing to trace.'}
            </UI.Paragraph>
            {notes}
          </UI.Stack>
        </UI.Section>) : (<>
          <UI.Grid gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap="base">
            <MetricCard label="Orders from AI assistants" value={fmtNumber(v.ai.orders)} basis={`Of ${fmtCount(v.totals.orders, 'online order', 'online orders')} in the last ${d.windowDays} days`}/>
            {v.showValue && v.ai.money && v.totals.money ? <MetricCard label="Sales from AI assistants" value={moneyLine(v.ai.money) ?? ''} basis={`Of ${moneyLine(v.totals.money) ?? ''} in total, after refunds`}/> : null}
            <MetricCard label="Share of online orders" value={fmtPercent(v.ai.share)} basis="Orders whose recorded visit came from an AI assistant"/>
          </UI.Grid>

          <UI.Section heading="By assistant">
            {v.assistants.length === 0 ? (<UI.Paragraph>{`No online order in the last ${d.windowDays} days came from a visit that started at an AI assistant.`}</UI.Paragraph>) : (<SourceTable rows={v.assistants} first="Assistant" showValue={v.showValue}/>)}
          </UI.Section>

          <UI.Section heading="Where the other orders came from">
            <UI.Stack gap="base">
              {v.otherSources.length > 0 ? <SourceTable rows={v.otherSources} first="Source of the visit" showValue={v.showValue}/> : null}
              <UI.Text color="subdued">
                {[
                v.notRecordedOrders > 0 ? `${fmtCount(v.notRecordedOrders, 'order has', 'orders have')} no recorded source and ${v.notRecordedOrders === 1 ? 'is' : 'are'} counted on neither side.` : null,
                v.onHoldOrders > 0 ? `${fmtCount(v.onHoldOrders, 'order is', 'orders are')} on hold and not counted yet.` : null,
                v.offlineOrders > 0 ? `${fmtCount(v.offlineOrders, 'order was', 'orders were')} added in WordPress or at a till and ${v.offlineOrders === 1 ? 'is' : 'are'} not counted.` : null,
                v.otherSources.length === 0 && v.notRecordedOrders === 0 && v.onHoldOrders === 0 && v.offlineOrders === 0
                    ? `Every online order in the last ${d.windowDays} days came from an AI assistant.`
                    : null,
            ]
                .filter(Boolean)
                .join(' ')}
              </UI.Text>
            </UI.Stack>
          </UI.Section>
        </>)}

      <UI.Section heading="How this is counted">
        <UI.Stack gap="base">
          <UI.UnorderedList>
            {d.limits.map((l) => (<UI.ListItem key={l}>{l}</UI.ListItem>))}
          </UI.UnorderedList>
          {d.measured ? notes : null}
        </UI.Stack>
      </UI.Section>
    </>);
}
function SourceTable({ rows, first, showValue }: {
    rows: Row[];
    first: string;
    showValue: boolean;
}) {
    return (<UI.Table>
      <UI.TableHeaderRow>
        <UI.TableHeader listSlot="primary">{first}</UI.TableHeader>
        <UI.TableHeader format="numeric">Orders</UI.TableHeader>
        {showValue ? <UI.TableHeader format="numeric">Sales</UI.TableHeader> : null}
        <UI.TableHeader format="numeric">Share of online orders</UI.TableHeader>
      </UI.TableHeaderRow>
      <UI.TableBody>
        {rows.map((r) => (<UI.TableRow key={r.id}>
            <UI.TableCell>{r.label}</UI.TableCell>
            <UI.TableCell>{fmtNumber(r.orders)}</UI.TableCell>
            {showValue ? <UI.TableCell>{moneyLine(r.money) ?? ''}</UI.TableCell> : null}
            <UI.TableCell>{fmtPercent(r.share)}</UI.TableCell>
          </UI.TableRow>))}
      </UI.TableBody>
    </UI.Table>);
}
