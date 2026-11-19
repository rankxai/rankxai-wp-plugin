import { useState } from 'react';
import { toastSuccess } from '../api';
import { host } from '../host';
import { adminLocale, fmtCount, fmtDate, fmtNumber, fmtPercent } from '../format';
import { MetricCard } from '../components/MetricCard';
import { SkeletonSection } from '../components/Status';
import { ErrorBanner, useLoad } from '../kit';
import * as UI from '../ui';
type Window = 7 | 30 | 60;
const WINDOWS: readonly Window[] = [7, 30, 60];
interface View {
    windowDays: number;
    since: string;
    currency: string | null;
    totals: {
        orders: number;
        revenue: number;
    };
    ai: {
        orders: number;
        revenue: number;
        share: number;
    };
    assistants: Array<{
        key: string;
        label: string;
        orders: number;
        revenue: number;
        share: number;
    }>;
    paidAi: {
        orders: number;
        revenue: number;
    };
    startedAtAi: {
        orders: number;
        revenue: number;
    };
    direct: number;
    other: number;
    unknown: {
        orders: number;
        pending: number;
    };
    recent: Array<{
        name: string;
        createdAt: string;
        total: number | null;
        currency: string | null;
        assistant: string;
        paid: boolean;
        landingPath: string | null;
    }>;
    sample: {
        ordersRead: number;
        truncated: boolean;
        testOrdersIncluded: boolean;
        testOrdersSkipped: number;
        cancelledSkipped: number;
    };
}
type AiOrders = {
    state: 'not_granted' | 'not_approved';
    scope: string;
    windowDays: number;
} | {
    state: 'measured';
    windowDays: number;
    measured: boolean;
    view: View;
    readAt: string;
    cached: boolean;
    limits: string[];
};
const SCOPE = 'read_orders';
function money(amount: number, currency: string | null): string {
    if (!currency)
        return fmtNumber(amount);
    try {
        return new Intl.NumberFormat(adminLocale(), { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
    }
    catch {
        return `${fmtNumber(amount)} ${currency}`;
    }
}
export function AiOrdersTab() {
    const [days, setDays] = useState<Window>(30);
    const [refreshKey, setRefreshKey] = useState(0);
    const path = `ai-orders?days=${days}${refreshKey > 0 ? `&refresh=1&r=${refreshKey}` : ''}`;
    const data = useLoad<AiOrders>(path);
    const [asking, setAsking] = useState(false);
    const [note, setNote] = useState<string | null>(null);
    const d = data.data;
    async function grant() {
        setAsking(true);
        setNote(null);
        try {
            const r = host.requestScopes ? await host.requestScopes([SCOPE]) : 'declined';
            if (r === 'granted') {
                toastSuccess('Permission granted');
                await data.reload();
            }
            else {
                setNote('No change: RankX AI still cannot read your orders. You can allow it here whenever you like.');
            }
        }
        catch {
            setNote('Shopify did not open the permission request. Reload the app and try again.');
        }
        finally {
            setAsking(false);
        }
    }
    return (<>
      <ErrorBanner error={data.error}/>
      
      {d?.state === 'not_granted' || d?.state === 'not_approved' ? null : <UI.Stack direction="inline" gap="small-200" alignItems="center">
        <UI.Text color="subdued">Period</UI.Text>
        {WINDOWS.map((w) => (<UI.PressButton key={w} pressed={w === days} onClick={() => setDays(w)}>
            {`Last ${w} days`}
          </UI.PressButton>))}
      </UI.Stack>}

      {!d && data.loading ? <SkeletonSection lines={5} label="Loading AI orders"/> : null}

      {d?.state === 'not_granted' ? (<UI.Section heading="See which orders came from AI assistants">
          <UI.Stack gap="base">
            <UI.Paragraph>
              When someone asks ChatGPT, Perplexity or another assistant for a product and follows its link to your store, Shopify records where that
              visit came from. RankX AI can read that record for your recent orders and show which ones started at an AI assistant, and how much they
              were worth. It is free on every plan.
            </UI.Paragraph>
            <UI.Paragraph>
              To do that, RankX AI needs permission to read your orders. It reads each order’s number, date, total and the visit that led to it. It
              does not read customer names, email addresses, phone numbers or addresses, and it does not store your orders.
            </UI.Paragraph>
            {note ? <UI.Text color="subdued">{note}</UI.Text> : null}
            <UI.Stack direction="inline" gap="base">
              <UI.Button variant="primary" loading={asking || undefined} disabled={asking || undefined} onClick={() => void grant()}>
                Allow RankX AI to read orders
              </UI.Button>
            </UI.Stack>
          </UI.Stack>
        </UI.Section>) : null}

      {d?.state === 'not_approved' ? (<UI.Section heading="Order data is not available to RankX AI yet">
          <UI.Stack gap="base">
            <UI.Paragraph>
              You have allowed RankX AI to read your orders. Shopify treats orders as protected customer data and releases them to an app only after
              checking how the app handles them, and that access is not active for RankX AI yet.
            </UI.Paragraph>
            <UI.Paragraph>There is nothing for you to do. This view fills in on its own once Shopify releases the data.</UI.Paragraph>
          </UI.Stack>
        </UI.Section>) : null}

      {d?.state === 'measured' ? <Measured d={d} onRefresh={() => setRefreshKey((k) => k + 1)} busy={data.loading}/> : null}
    </>);
}
function Measured({ d, onRefresh, busy }: {
    d: Extract<AiOrders, {
        state: 'measured';
    }>;
    onRefresh: () => void;
    busy: boolean;
}) {
    const v = d.view;
    const cur = v.currency;
    const footer = (<UI.Stack direction="inline" gap="base" alignItems="center">
      <UI.Text color="subdued">
        {`Read ${fmtDate(d.readAt)} from ${fmtCount(v.sample.ordersRead, 'order', 'orders')} placed since ${fmtDate(v.since)}.`}
        {v.sample.truncated ? ' Only the most recent orders were read.' : ''}
        {v.sample.testOrdersIncluded ? ' Test orders are included because this is a development store.' : ''}
      </UI.Text>
      <UI.Button variant="tertiary" loading={busy || undefined} disabled={busy || undefined} onClick={onRefresh}>
        Refresh
      </UI.Button>
    </UI.Stack>);
    if (!d.measured) {
        return (<UI.Section heading={`Orders from AI assistants, last ${d.windowDays} days`}>
        <UI.Stack gap="base">
          <UI.Paragraph>
            {v.totals.orders === 0
                ? 'Not measured yet: your store has no orders in this period, so there is nothing to trace.'
                : 'Not measured yet: Shopify has not recorded a visit for any order in this period (orders placed in person, by draft order or through another sales channel have none).'}
          </UI.Paragraph>
          {footer}
        </UI.Stack>
      </UI.Section>);
    }
    return (<>
      <UI.Grid gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap="base">
        <MetricCard label="Orders from AI assistants" value={fmtNumber(v.ai.orders)} basis={`Of ${fmtCount(v.totals.orders, 'order', 'orders')} in the last ${d.windowDays} days`}/>
        <MetricCard label="Sales from AI assistants" value={money(v.ai.revenue, cur)} basis={`Of ${money(v.totals.revenue, cur)} in total, after refunds`}/>
        <MetricCard label="Share of all orders" value={fmtPercent(v.ai.share)} basis="Orders whose last visit came from an AI assistant"/>
      </UI.Grid>

      <UI.Section heading="By assistant">
        {v.assistants.length === 0 ? (<UI.Paragraph>{`No orders in the last ${d.windowDays} days came from a visit that started at an AI assistant.`}</UI.Paragraph>) : (<UI.Table>
            <UI.TableHeaderRow>
              <UI.TableHeader listSlot="primary">Assistant</UI.TableHeader>
              <UI.TableHeader format="numeric">Orders</UI.TableHeader>
              <UI.TableHeader format="numeric">Sales</UI.TableHeader>
              <UI.TableHeader format="numeric">Share of all orders</UI.TableHeader>
            </UI.TableHeaderRow>
            <UI.TableBody>
              {v.assistants.map((a) => (<UI.TableRow key={a.key}>
                  <UI.TableCell>{a.label}</UI.TableCell>
                  <UI.TableCell>{fmtNumber(a.orders)}</UI.TableCell>
                  <UI.TableCell>{money(a.revenue, cur)}</UI.TableCell>
                  <UI.TableCell>{fmtPercent(a.share)}</UI.TableCell>
                </UI.TableRow>))}
            </UI.TableBody>
          </UI.Table>)}
      </UI.Section>

      {v.recent.length > 0 ? (<UI.Section heading="Recent orders from AI assistants">
          <UI.Table>
            <UI.TableHeaderRow>
              <UI.TableHeader listSlot="primary">Order</UI.TableHeader>
              <UI.TableHeader>Date</UI.TableHeader>
              <UI.TableHeader>Assistant</UI.TableHeader>
              <UI.TableHeader>Landing page</UI.TableHeader>
              <UI.TableHeader format="numeric">Total</UI.TableHeader>
            </UI.TableHeaderRow>
            <UI.TableBody>
              {v.recent.map((o) => (<UI.TableRow key={o.name}>
                  <UI.TableCell>{o.name}</UI.TableCell>
                  <UI.TableCell>{fmtDate(o.createdAt)}</UI.TableCell>
                  <UI.TableCell>{o.paid ? `${o.assistant} (ad)` : o.assistant}</UI.TableCell>
                  <UI.TableCell>{o.landingPath ?? 'Not shown'}</UI.TableCell>
                  <UI.TableCell>{o.total === null ? 'Not recorded' : money(o.total, o.currency ?? cur)}</UI.TableCell>
                </UI.TableRow>))}
            </UI.TableBody>
          </UI.Table>
        </UI.Section>) : null}

      <UI.Section heading="Where the other orders came from">
        <UI.Stack gap="base">
          <UI.Table>
            <UI.TableHeaderRow>
              <UI.TableHeader listSlot="primary">Source of the visit</UI.TableHeader>
              <UI.TableHeader format="numeric">Orders</UI.TableHeader>
            </UI.TableHeaderRow>
            <UI.TableBody>
              <UI.TableRow>
                <UI.TableCell>No referrer (typed, bookmarked, or an assistant that hides the link)</UI.TableCell>
                <UI.TableCell>{fmtNumber(v.direct)}</UI.TableCell>
              </UI.TableRow>
              <UI.TableRow>
                <UI.TableCell>Search engines, social, email and other websites</UI.TableCell>
                <UI.TableCell>{fmtNumber(v.other)}</UI.TableCell>
              </UI.TableRow>
              <UI.TableRow>
                <UI.TableCell>Ads on an AI assistant</UI.TableCell>
                <UI.TableCell>{fmtNumber(v.paidAi.orders)}</UI.TableCell>
              </UI.TableRow>
              <UI.TableRow>
                <UI.TableCell>{v.unknown.pending > 0 ? 'Unknown (no visit recorded, or Shopify is still working it out)' : 'Unknown (no visit recorded)'}</UI.TableCell>
                <UI.TableCell>{fmtNumber(v.unknown.orders)}</UI.TableCell>
              </UI.TableRow>
            </UI.TableBody>
          </UI.Table>
          {v.startedAtAi.orders > 0 ? (<UI.Paragraph>
              {`Separately, ${fmtCount(v.startedAtAi.orders, 'order', 'orders')} (${money(v.startedAtAi.revenue, cur)}) began with a first visit from an AI assistant and were placed after a later visit from somewhere else. They are not counted above as orders from AI.`}
            </UI.Paragraph>) : null}
        </UI.Stack>
      </UI.Section>

      <UI.Section heading="How this is counted">
        <UI.Stack gap="base">
          <UI.UnorderedList>
            {d.limits.map((l) => (<UI.ListItem key={l}>{l}</UI.ListItem>))}
          </UI.UnorderedList>
          {footer}
        </UI.Stack>
      </UI.Section>
    </>);
}
