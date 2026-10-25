import { useRef, useState } from 'react';
import { APP_PATHS, productHref, searchHref } from '@/lib/shopify-app/app-routes-core';
import { PRODUCT_STATE_LABEL, channelsDiffer, productNum, type ProductState, type Readiness } from '@/lib/shopify-app/product-view-core';
import { bulkGate, bulkable, fixModeFor, matchesQuery, type FixMode } from '@/lib/shopify-app/fix-index-core';
import { issueHref, storeSettingLink } from '@/lib/shopify-app/product-issues-core';
import type { BatchState } from '@/lib/shopify-app/batch-progress-core';
import { api, toastSuccess } from '../api';
import { toastWrite } from '../reviews';
import { usePlan, useStore } from '../plan-context';
import { adminLocale, fmtCount, fmtDate, fmtNumber } from '../format';
import { AdminButton, AdminLink, act, useLoad, type Load, type PageError } from '../kit';
import { BatchProgress, useBatch, type BatchKind } from '../components/BatchProgress';
import { AttributeBulkModal, AttributesModal, BarcodeModal, CategoryModal, useModal, type Category, type WriteResult } from '../components/FixModals';
import { MetricCard, MetricRow } from '../components/MetricCard';
import { ImagesModal } from '../components/ImageFixes';
import { ProductCell, SkeletonSection, StatusBadge } from '../components/Status';
import * as UI from '../ui';
export interface QueueItem {
    code: string;
    group: string;
    products: number;
    title: string;
    fix: string;
}
interface StoreFinding {
    code: string;
    kind: string;
    title: string;
    body: string;
    policies?: string[];
}
export interface CatalogueData {
    scan: {
        id: string;
        finishedAt: string;
        products: number;
        productsTotal: number | null;
        truncated: boolean;
    } | null;
    running: {
        id: string;
        since: string;
    } | null;
    failed?: {
        at: string | null;
    } | null;
    headline?: {
        lead: string;
        detail: string | null;
        details: string | null;
    };
    channels?: Array<{
        key: string;
        name: string;
        feeds: string;
        clear: number;
        blocked: number;
        unknown: number;
    }>;
    completeness?: {
        present: number;
        recommended: number;
        productsMissingDetails: number;
    };
    blockers?: StoreFinding[];
    findings?: StoreFinding[];
    queue?: QueueItem[];
    readiness?: Readiness | null;
}
interface GapProduct {
    productId: string;
    title: string | null;
    imageUrl: string | null;
    categoryId: string | null;
    categoryName: string | null;
    detailsPresent: number;
    detailsRecommended: number;
    gap: {
        code: string;
        detail?: {
            attributes?: string[];
            variants?: number;
            images?: number;
        };
    } | null;
    adminPath: string;
    status?: string | null;
    state?: ProductState;
    otherIssues?: string[];
}
const STATE_TONE: Record<ProductState, 'success' | 'warning' | 'neutral'> = { ready: 'success', needs_fix: 'warning', cant_tell: 'neutral' };
const STORE_STATUS: Record<string, {
    label: string;
    tone: 'neutral' | 'warning';
}> = {
    DRAFT: { label: 'Draft', tone: 'neutral' },
    ARCHIVED: { label: 'Archived', tone: 'neutral' },
    UNLISTED: { label: 'Unlisted', tone: 'warning' },
};
export function StoreBlocks({ data }: {
    data: CatalogueData | null;
}) {
    const { platform } = useStore();
    const blocks = (data?.blockers ?? []).filter((b) => b.kind === 'blocks');
    if (!data?.scan || blocks.length === 0)
        return null;
    const everyAssistant = blocks.some((b) => b.code === 'password');
    return (<UI.Section heading="Fix your store settings first">
      <UI.Stack gap="base">
        <UI.Paragraph>
          {everyAssistant
            ? 'These are settings on your store, not on your products. Until they are fixed, AI shopping cannot show any of your products, however ready they are.'
            : 'This is a setting on your store, not on your products. Until it is fixed, ChatGPT cannot show any of your products.'}
        </UI.Paragraph>
        {blocks.map((b) => {
            const link = storeSettingLink(b.code, platform, b.policies);
            return (<UI.Grid key={b.code} gridTemplateColumns="auto 1fr" gap="small-200" alignItems="start">
              <UI.Icon type="alert-triangle" tone="warning"/>
              <UI.Stack gap="small-100">
                <UI.Text type="strong">{b.title}</UI.Text>
                <UI.Text color="subdued">{b.body}</UI.Text>
                {link ? <AdminLink path={link.href}>{link.label}</AdminLink> : null}
              </UI.Stack>
            </UI.Grid>);
        })}
        <UI.Link href={APP_PATHS.storeSetup}>See every check on your store</UI.Link>
      </UI.Stack>
    </UI.Section>);
}
export function CatalogueSummary({ cat }: {
    cat: Load<CatalogueData>;
}) {
    const d = cat.data;
    if (!d)
        return cat.loading ? <SkeletonSection lines={3} label="Reading your product check"/> : null;
    if (!d.scan) {
        return (<UI.Section heading="Your products in AI shopping">
        {d.running ? (<UI.Stack gap="small-200">
            <UI.Progress accessibilityLabel="Checking your products"/>
            <UI.Paragraph>We are checking your products now. This takes about a minute.</UI.Paragraph>
          </UI.Stack>) : (<UI.Paragraph>{d.failed ? 'Your last product check did not finish. Check again to try once more.' : 'Your store has not been checked yet.'}</UI.Paragraph>)}
      </UI.Section>);
    }
    const checked = `Checked ${fmtDate(d.scan.finishedAt)} · ${fmtCount(d.scan.products, 'active product', 'active products')}${d.scan.truncated ? ` (the first ${fmtNumber(d.scan.products)} of ${d.scan.productsTotal !== null ? fmtNumber(d.scan.productsTotal) : 'more'})` : ''}`;
    if (d.scan.products === 0 && !d.scan.truncated) {
        return (<UI.Section heading="Your products in AI shopping">
        <UI.Stack gap="base">
          <UI.Paragraph>
            Your store has no active products yet, so there is nothing to check. Add your products under Products and RankX AI checks each one as it is
            saved. Use Check again if you have just added some.
          </UI.Paragraph>
          <AdminLink path="/products/new">Add a product</AdminLink>
          <UI.Text color="subdued">{d.running ? `${checked}. Checking again now…` : `${checked}.`}</UI.Text>
        </UI.Stack>
      </UI.Section>);
    }
    const r = d.readiness ?? null;
    const storeBlocked = (d.blockers ?? []).some((b) => b.kind === 'blocks');
    return (<UI.Section heading="Your products in AI shopping">
      <UI.Stack gap="base">
        {r ? (<MetricRow>
            <MetricCard label="Ready to be shown" value={`${fmtNumber(r.ready)} of ${fmtNumber(r.products)}`} unit="products" basis={storeBlocked ? 'Nothing on these products stops it. They can be shown once your store settings are fixed.' : 'Nothing we can check stops ChatGPT or Google showing them.'} badge={r.cantTell > 0 ? <StatusBadge status="cant_tell" label={`${fmtNumber(r.cantTell)} we can’t tell`}/> : null}/>
            <MetricCard label="Need a fix to be shown" value={fmtNumber(r.needsFix)} unit={r.needsFix === 1 ? 'product' : 'products'} basis="Something on the product stops AI shopping showing it, such as no image or not published." badge={r.needsFix > 0 ? <StatusBadge status="cant_be_shown" label="Fix first"/> : <StatusBadge status="can_be_shown" label="None"/>}/>
            <MetricCard label="Missing details" value={fmtNumber(r.missingDetails)} unit={r.missingDetails === 1 ? 'product' : 'products'} basis="Missing at least one detail shoppers ask about, such as material or size." badge={r.missingDetails > 0 ? <StatusBadge status="needs_attention"/> : null}/>
          </MetricRow>) : (<UI.Paragraph>We could not count your products just now. The fixes below are up to date.</UI.Paragraph>)}
        {r && channelsDiffer(r) ? (<UI.Table variant="auto">
            <UI.TableHeaderRow>
              <UI.TableHeader listSlot="primary">Where it can appear</UI.TableHeader>
              <UI.TableHeader listSlot="labeled">Ready</UI.TableHeader>
              <UI.TableHeader listSlot="labeled">Need a fix</UI.TableHeader>
              <UI.TableHeader listSlot="labeled">We can’t tell</UI.TableHeader>
            </UI.TableHeaderRow>
            <UI.TableBody>
              {(d.channels ?? []).map((c) => {
                const own = r.channels[c.key as 'catalog' | 'google'];
                return own ? (<UI.TableRow key={c.key}>
                    <UI.TableCell>
                      <UI.Stack gap="small-100">
                        <UI.Text type="strong">{c.name}</UI.Text>
                        <UI.Text color="subdued">{c.feeds}</UI.Text>
                      </UI.Stack>
                    </UI.TableCell>
                    <UI.TableCell>{fmtNumber(own.clear)}</UI.TableCell>
                    <UI.TableCell>{fmtNumber(own.blocked)}</UI.TableCell>
                    <UI.TableCell>{fmtNumber(own.unknown)}</UI.TableCell>
                  </UI.TableRow>) : null;
            })}
            </UI.TableBody>
          </UI.Table>) : null}
        <UI.Text color="subdued">{d.running ? `${checked}. Checking again now…` : `${checked}. Fixing products is free, one at a time or many at once; only AI writing uses credits.`}</UI.Text>
      </UI.Stack>
    </UI.Section>);
}
const FIXES_SHOWN = 6;
export function CatalogueIndex({ data }: {
    data: CatalogueData | null;
}) {
    const queue = data?.queue ?? [];
    const [all, setAll] = useState(false);
    if (!data?.scan)
        return null;
    if (queue.length === 0) {
        return (<UI.Section heading="Fixes">
        <UI.EmptyState heading="Nothing to fix in what we check">
          <UI.Paragraph>Every product has what AI shopping needs, as far as we can check. We check again every day you open the app.</UI.Paragraph>
        </UI.EmptyState>
      </UI.Section>);
    }
    const ordered = [...queue.filter((i) => i.group === 'cant_be_shown'), ...queue.filter((i) => i.group !== 'cant_be_shown')];
    const shown = all ? ordered : ordered.slice(0, FIXES_SHOWN);
    return (<UI.Section heading="Fixes, most important first">
      <UI.Stack gap="base">
        <IssueTable rows={shown.map((i) => ({ code: i.code, title: i.title, fix: i.fix, products: i.products, total: data.scan?.products ?? null, mode: fixModeFor(i.code), fixedIn: fixedIn(i.code), href: issueHref(i.code), blocks: i.group === 'cant_be_shown' }))}/>
        {queue.length > FIXES_SHOWN ? (<UI.Stack direction="inline">
            <UI.Button variant="tertiary" onClick={() => setAll((v) => !v)}>
              {all ? 'Show fewer' : `Show all ${fmtNumber(queue.length)} fixes`}
            </UI.Button>
          </UI.Stack>) : null}
      </UI.Stack>
    </UI.Section>);
}
function fixedIn(code: string): string {
    const mode = fixModeFor(code);
    return mode === 'shopify' ? 'On the product’s page' : mode === 'search' ? 'Here, under SEO' : 'Here';
}
export interface IssueRow {
    code: string;
    title: string;
    fix: string;
    products: number;
    fixedIn: string;
    href: string;
    blocks?: boolean;
    total?: number | null;
    mode?: FixMode;
}
export function sharePercent(part: number, whole: number): number {
    if (whole <= 0 || part <= 0)
        return 0;
    if (part >= whole)
        return 100;
    return Math.min(99, Math.max(1, Math.round((part / whole) * 100)));
}
function fixHow(mode: FixMode | undefined): {
    line: string | null;
    bulk: boolean;
} {
    if (!mode)
        return { line: null, bulk: false };
    if (bulkable(mode))
        return { line: 'Several at once', bulk: true };
    if (mode === 'shopify')
        return { line: 'One product at a time', bulk: false };
    if (mode === 'search')
        return { line: 'One page at a time or several at once', bulk: false };
    return { line: 'One product at a time', bulk: false };
}
export function IssueTable({ rows }: {
    rows: IssueRow[];
}) {
    return (<UI.Table variant="auto">
      <UI.TableHeaderRow>
        <UI.TableHeader listSlot="primary">Issue</UI.TableHeader>
        <UI.TableHeader listSlot="inline">Products</UI.TableHeader>
        <UI.TableHeader listSlot="labeled">How you fix it</UI.TableHeader>
        <UI.TableHeader />
      </UI.TableHeaderRow>
      <UI.TableBody>
        {rows.map((i) => (<UI.TableRow key={i.code}>
            <UI.TableCell>
              <UI.Stack gap="small-100">
                <UI.Stack direction="inline" gap="small-200" alignItems="center">
                  <UI.Text type="strong">{i.title}</UI.Text>
                  {i.blocks ? <StatusBadge status="cant_be_shown" label="Stops it being shown"/> : null}
                </UI.Stack>
                <UI.Text color="subdued">{i.fix}</UI.Text>
              </UI.Stack>
            </UI.TableCell>
            <UI.TableCell>
              
              <UI.Stack gap="small-100">
                <UI.Text type="strong">{fmtNumber(i.products)}</UI.Text>
                {i.total && i.total > 0 ? (<>
                    <UI.Text color="subdued">{`${sharePercent(i.products, i.total)}% of products`}</UI.Text>
                    <svg width="96" height="4" aria-hidden="true" focusable="false" style={{ display: 'block' }}>
                      <rect x="0" y="0" width="96" height="4" rx="2" fill="currentColor" fillOpacity={0.1}/>
                      <rect x="0" y="0" width={Math.max(2, (Math.min(i.products, i.total) / i.total) * 96)} height="4" rx="2" fill="currentColor" fillOpacity={0.7}/>
                    </svg>
                  </>) : null}
              </UI.Stack>
            </UI.TableCell>
            <UI.TableCell>
              <UI.Stack gap="small-100">
                <UI.Text>{i.fixedIn}</UI.Text>
                {fixHow(i.mode).bulk ? (<UI.Stack direction="inline">
                    <UI.Badge tone="success">{fixHow(i.mode).line!}</UI.Badge>
                  </UI.Stack>) : fixHow(i.mode).line ? (<UI.Text color="subdued">{fixHow(i.mode).line}</UI.Text>) : null}
              </UI.Stack>
            </UI.TableCell>
            <UI.TableCell>
              <UI.Button href={i.href} accessibilityLabel={`${i.mode && i.mode !== 'shopify' && i.mode !== 'search' ? 'Fix products' : 'View products'}: ${i.title}`}>
                {i.mode && i.mode !== 'shopify' && i.mode !== 'search' ? 'Fix products' : 'View products'}
              </UI.Button>
            </UI.TableCell>
          </UI.TableRow>))}
      </UI.TableBody>
    </UI.Table>);
}
function lastCategory(name: string | null | undefined): string | null {
    return name ? (name.split(' > ').pop() ?? name) : null;
}
function gapLine(p: GapProduct, item: QueueItem): string {
    if (p.gap?.detail?.attributes?.length)
        return `Not set: ${p.gap.detail.attributes.join(', ')}`;
    if (p.gap?.detail?.variants)
        return `${item.title} on ${fmtCount(p.gap.detail.variants, 'variant', 'variants')}`;
    if (p.gap?.detail?.images)
        return `${fmtCount(p.gap.detail.images, 'image', 'images')}`;
    return item.title;
}
type Done = Record<string, {
    verified: boolean;
    changeId: string | null;
}>;
interface LiveSummary {
    status: string | null;
    updatedAt: string | null;
    inventory: number | null;
    tracksInventory: boolean | null;
    price: {
        min: string;
        max: string;
        currency: string;
    } | null;
    images: number | null;
    variants: number | null;
}
function priceText(p: LiveSummary['price']): string {
    if (!p)
        return '–';
    const f = (a: string) => {
        try {
            return new Intl.NumberFormat(adminLocale(), { style: 'currency', currency: p.currency }).format(Number(a));
        }
        catch {
            return `${a} ${p.currency}`;
        }
    };
    return Number(p.min) === Number(p.max) ? f(p.min) : `${f(p.min)} – ${f(p.max)}`;
}
function StockCell({ s }: {
    s: LiveSummary;
}) {
    if (s.tracksInventory === false)
        return <UI.Text color="subdued">Stock not tracked</UI.Text>;
    if (s.inventory === null)
        return <UI.Text color="subdued">Stock unknown</UI.Text>;
    if (s.inventory <= 0)
        return <UI.Badge tone="caution">Out of stock</UI.Badge>;
    return <UI.Text>{`${fmtNumber(s.inventory)} in stock`}</UI.Text>;
}
export function GapTable({ item, setError, onChanged }: {
    item: QueueItem;
    setError: (e: PageError | null) => void;
    onChanged: () => void;
}) {
    const { words } = useStore();
    const mode: FixMode = fixModeFor(item.code);
    const { plan } = usePlan();
    const [page, setPage] = useState(0);
    const list = useLoad<{
        products: GapProduct[];
        hasMore: boolean;
    }>(`catalogue/gaps?code=${encodeURIComponent(item.code)}&page=${page}`);
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [done, setDone] = useState<Done>({});
    const [busy, setBusy] = useState<string | null>(null);
    const [target, setTarget] = useState<GapProduct | null>(null);
    const [bulkMode, setBulkMode] = useState(false);
    const sent = useRef<string[]>([]);
    const categoryModal = useModal('category');
    const barcodeModal = useModal('barcode');
    const attributesModal = useModal('details');
    const bulkAttributesModal = useModal('details-bulk');
    const [modalError, setModalError] = useState<PageError | null>(null);
    const imagesModal = useModal('images');
    const batch = useBatch((s: BatchState, kind: BatchKind) => {
        if (kind === 'apply') {
            setDone((all) => {
                const next = { ...all };
                s.results.forEach((r, i) => {
                    const id = sent.current[i];
                    if (id && r.ok)
                        next[id] = { verified: r.verified, changeId: r.changeId };
                });
                return next;
            });
        }
        else {
            setDone((all) => {
                const next = { ...all };
                for (const id of sent.current)
                    delete next[id];
                return next;
            });
        }
        onChanged();
    });
    const products = list.data?.products ?? [];
    const pageNums = products.map((p) => productNum(p.productId)).filter((n): n is string => !!n);
    const live = useLoad<{
        products: Record<string, LiveSummary>;
    }>(pageNums.length > 0 ? `catalogue/products-summary?ids=${pageNums.join(',')}` : null);
    const liveFor = (p: GapProduct): LiveSummary | null => live.data?.products[p.productId] ?? null;
    const pending = <UI.Text color="subdued">{live.error ? '–' : '…'}</UI.Text>;
    const rows = products.filter((p) => matchesQuery(p.title, query));
    const showIssue = rows.some((p) => gapLine(p, item) !== item.title);
    const showDetails = item.group === 'missing_details';
    const blockerIssue = item.group === 'cant_be_shown';
    const showStatus = !blockerIssue || rows.some((p) => !!p.status && p.status.toUpperCase() !== 'ACTIVE');
    const selectable = bulkable(mode);
    const chosen = products.filter((p) => selected.has(p.productId) && !done[p.productId]);
    const freePlanNeeded = plan?.locks.access?.planNeeded ?? null;
    const gate = bulkGate({ selected: chosen.length, freePlanNeeded, mode, categories: chosen.map((p) => p.categoryId) });
    const toggle = (id: string, on: boolean) => setSelected((s) => {
        const next = new Set(s);
        if (on)
            next.add(id);
        else
            next.delete(id);
        return next;
    });
    const markDone = (id: string, r: WriteResult) => {
        setDone((all) => ({ ...all, [id]: { verified: r.verified, changeId: r.changeId } }));
        toastWrite(r.verified, 'Saved and confirmed on your store', 'Saved');
    };
    async function saveOne(p: GapProduct, body: Record<string, unknown>, fromModal = false) {
        const r = await act(() => api<WriteResult>('fixes/product', { method: 'POST', body: { ...body, productId: p.productId, label: p.title ?? 'a product' } }), (b) => setBusy(b ? p.productId : null), fromModal ? setModalError : setError);
        if (r.ok && r.data) {
            markDone(p.productId, r.data);
            categoryModal.hide();
        }
    }
    async function undo(p: GapProduct) {
        const id = done[p.productId]?.changeId;
        if (!id)
            return;
        const r = await act(() => api(`changes/${id}/undo`, { method: 'POST' }), (b) => setBusy(b ? `undo:${p.productId}` : null), setError);
        if (r.ok) {
            setDone((all) => {
                const next = { ...all };
                delete next[p.productId];
                return next;
            });
            toastSuccess('Change undone');
        }
    }
    async function sendBulk(path: string, list: GapProduct[], build: (p: GapProduct) => Record<string, unknown>, fromModal = false) {
        sent.current = list.map((p) => p.productId);
        const r = await act(() => api(path, { method: 'POST', body: { items: list.map(build) } }), (b) => setBusy(b ? 'bulk' : null), fromModal ? setModalError : setError);
        if (r.ok && batch.begin(r.data, 'apply')) {
            setSelected(new Set());
            categoryModal.hide();
            bulkAttributesModal.hide();
        }
    }
    function fixSelected() {
        if (!gate.allowed)
            return;
        if (mode === 'visibility')
            void sendBulk('fixes/product/bulk', chosen, (p) => ({ kind: 'visibility', productId: p.productId, label: p.title ?? 'a product' }));
        else if (mode === 'category') {
            setBulkMode(true);
            categoryModal.show();
        }
        else if (mode === 'attributes')
            bulkAttributesModal.show();
    }
    function pickCategory(c: Category) {
        if (bulkMode)
            void sendBulk('fixes/product/bulk', chosen, (p) => ({ kind: 'category', productId: p.productId, categoryId: c.id, categoryName: c.fullName, label: p.title ?? 'a product' }), true);
        else if (target)
            void saveOne(target, { kind: 'category', categoryId: c.id, categoryName: c.fullName }, true);
    }
    const allOnPage = rows.filter((p) => !done[p.productId]);
    const allSelected = allOnPage.length > 0 && allOnPage.every((p) => selected.has(p.productId));
    return (<UI.Section heading="Products with this issue">
      <UI.Stack gap="base">
        {selectable ? (<UI.Stack gap="small-200">
            <UI.Stack direction="inline" gap="base" alignItems="center">
              <UI.Text>{chosen.length > 0 ? `${fmtNumber(chosen.length)} selected` : 'Select products to fix several at once.'}</UI.Text>
              <UI.Button variant="primary" disabled={!gate.allowed || busy !== null || undefined} loading={busy === 'bulk' || undefined} onClick={fixSelected}>
                Fix selected
              </UI.Button>
            </UI.Stack>
            {gate.note ? <UI.Text color="subdued">{gate.note}</UI.Text> : null}
            {!gate.allowed && chosen.length > 0 && gate.reason ? <UI.Text color="subdued">{gate.reason}</UI.Text> : null}
          </UI.Stack>) : null}
        <BatchProgress handle={batch} setError={setError}/>
        <UI.Table variant="auto" loading={list.loading || undefined} paginate={list.data ? list.data.hasMore || page > 0 : undefined} hasNextPage={list.data?.hasMore || undefined} hasPreviousPage={page > 0 || undefined} onNextPage={() => setPage((n) => n + 1)} onPreviousPage={() => setPage((n) => Math.max(0, n - 1))}>
          <UI.SearchField slot="filters" label="Search these products" labelAccessibilityVisibility="exclusive" placeholder="Search by product title" value={query} onInput={(e) => setQuery(e.currentTarget.value)}/>
          <UI.TableHeaderRow>
            {selectable ? (<UI.TableHeader listSlot="inline">
                <UI.Checkbox accessibilityLabel={allSelected ? 'Clear the selection' : 'Select every product shown'} checked={allSelected || undefined} onChange={(e) => {
                const on = e.currentTarget.checked === true;
                setSelected((s) => {
                    const next = new Set(s);
                    for (const p of allOnPage) {
                        if (on)
                            next.add(p.productId);
                        else
                            next.delete(p.productId);
                    }
                    return next;
                });
            }}/>
              </UI.TableHeader>) : null}
            <UI.TableHeader listSlot="primary">Product</UI.TableHeader>
            {showIssue ? <UI.TableHeader listSlot="secondary">Issue</UI.TableHeader> : null}
            
            {showStatus ? <UI.TableHeader listSlot="labeled">{blockerIssue ? 'Status' : 'AI shopping'}</UI.TableHeader> : null}
            {showDetails ? <UI.TableHeader listSlot="labeled">Details</UI.TableHeader> : null}
            <UI.TableHeader listSlot="labeled">Price and stock</UI.TableHeader>
            <UI.TableHeader listSlot="labeled">Also needs</UI.TableHeader>
            <UI.TableHeader listSlot="labeled">Last changed</UI.TableHeader>
            <UI.TableHeader listSlot="inline">Action</UI.TableHeader>
          </UI.TableHeaderRow>
          <UI.TableBody>
            {rows.map((p) => {
            const result = done[p.productId];
            return (<UI.TableRow key={p.productId}>
                  {selectable ? (<UI.TableCell>
                      {result ? null : (<UI.Checkbox accessibilityLabel={`Select ${p.title ?? 'this product'}`} checked={selected.has(p.productId) || undefined} onChange={(e) => toggle(p.productId, e.currentTarget.checked === true)}/>)}
                    </UI.TableCell>) : null}
                  <UI.TableCell>
                    <ProductCell title={p.title} imageUrl={p.imageUrl} sub={lastCategory(p.categoryName)} href={productNum(p.productId) ? productHref(productNum(p.productId)!) : null}/>
                  </UI.TableCell>
                  {showIssue ? <UI.TableCell>{gapLine(p, item)}</UI.TableCell> : null}
                  {showStatus ? (<UI.TableCell>
                      <UI.Stack direction="inline" gap="small-100" alignItems="center">
                        {blockerIssue ? (p.status?.toUpperCase() === 'ACTIVE' ? <UI.Badge tone="success">Active</UI.Badge> : p.status ? null : <UI.Text color="subdued">–</UI.Text>) : p.state ? <UI.Badge tone={STATE_TONE[p.state]}>{PRODUCT_STATE_LABEL[p.state]}</UI.Badge> : <UI.Text color="subdued">–</UI.Text>}
                        {p.status && STORE_STATUS[p.status.toUpperCase()] ? <UI.Badge tone={STORE_STATUS[p.status.toUpperCase()]!.tone}>{STORE_STATUS[p.status.toUpperCase()]!.label}</UI.Badge> : null}
                      </UI.Stack>
                    </UI.TableCell>) : null}
                  {showDetails ? (<UI.TableCell>
                      <UI.Stack gap="small-100">
                        <UI.Text>{`${fmtNumber(p.detailsPresent)} of ${fmtNumber(p.detailsRecommended)}`}</UI.Text>
                        {p.detailsRecommended > 0 ? <UI.Progress value={p.detailsPresent} max={p.detailsRecommended} accessibilityLabel={`${p.detailsPresent} of ${p.detailsRecommended} recommended details`}/> : null}
                      </UI.Stack>
                    </UI.TableCell>) : null}
                  <UI.TableCell>
                    
                    {liveFor(p) ? (<UI.Stack gap="small-100">
                        <UI.Text>{priceText(liveFor(p)!.price)}</UI.Text>
                        <StockCell s={liveFor(p)!}/>
                        <UI.Text color="subdued">{`${liveFor(p)!.variants === null ? '–' : fmtCount(liveFor(p)!.variants!, 'variant', 'variants')} · ${liveFor(p)!.images === null ? '–' : liveFor(p)!.images === 0 ? 'no image' : fmtCount(liveFor(p)!.images!, 'image', 'images')}`}</UI.Text>
                      </UI.Stack>) : (pending)}
                  </UI.TableCell>
                  <UI.TableCell>
                    
                    {(p.otherIssues ?? []).length === 0 ? (<UI.Text color="subdued">Nothing else</UI.Text>) : (<UI.Stack direction="inline" gap="small-100" alignItems="center">
                        {p.otherIssues!.slice(0, 2).map((t) => (<UI.Badge key={t}>{t}</UI.Badge>))}
                        {p.otherIssues!.length > 2 ? <UI.Text color="subdued">{`+${fmtNumber(p.otherIssues!.length - 2)} more`}</UI.Text> : null}
                      </UI.Stack>)}
                  </UI.TableCell>
                  <UI.TableCell>{liveFor(p) ? <UI.Text color="subdued">{fmtDate(liveFor(p)!.updatedAt)}</UI.Text> : pending}</UI.TableCell>
                  <UI.TableCell>
                    {result ? (<UI.Stack direction="inline" gap="small-200" alignItems="center">
                        <StatusBadge status={result.verified ? 'saved' : 'saved_unconfirmed'}/>
                        {result.changeId ? (<UI.Button variant="tertiary" disabled={busy !== null || undefined} loading={busy === `undo:${p.productId}` || undefined} onClick={() => void undo(p)}>
                            Undo
                          </UI.Button>) : null}
                      </UI.Stack>) : mode === 'category' ? (<UI.Button onClick={() => {
                        setBulkMode(false);
                        setTarget(p);
                        categoryModal.show();
                    }}>
                        Choose category
                      </UI.Button>) : mode === 'barcode' ? (<UI.Button onClick={() => {
                        setTarget(p);
                        barcodeModal.show();
                    }}>
                        Add barcode
                      </UI.Button>) : mode === 'visibility' ? (<UI.Button disabled={busy !== null || undefined} loading={busy === p.productId || undefined} onClick={() => void saveOne(p, { kind: 'visibility' })}>
                        Show to search engines
                      </UI.Button>) : mode === 'images' ? (<UI.Button onClick={() => {
                        setTarget(p);
                        imagesModal.show();
                    }}>
                        Fix images
                      </UI.Button>) : mode === 'attributes' ? (<UI.Button onClick={() => {
                        setTarget(p);
                        attributesModal.show();
                    }}>
                        Set details
                      </UI.Button>) : mode === 'search' ? (<UI.Link href={searchHref('listings')}>Write it in SEO › Listings</UI.Link>) : (<AdminButton path={`/products/${String(p.productId).split('/').pop()}`} label="Edit product"/>)}
                  </UI.TableCell>
                </UI.TableRow>);
        })}
          </UI.TableBody>
        </UI.Table>
        {list.data && rows.length === 0 ? (<UI.Text color="subdued">{query.trim() ? 'No product on this page matches your search.' : 'No products to show on this page.'}</UI.Text>) : null}
        {live.error && rows.length > 0 ? <UI.Text color="subdued">{`Price, stock, variants and the last change could not be read from ${words.productSource} just now. Reload the page to try again.`}</UI.Text> : null}
      </UI.Stack>

      <CategoryModal modal={categoryModal} heading={bulkMode ? `Choose one category for ${fmtCount(chosen.length, 'product', 'products')}` : `Category for ${target?.title ?? 'this product'}`} note={bulkMode && gate.note ? gate.note : null} busy={busy !== null} onPick={pickCategory} error={modalError} onDismissError={() => setModalError(null)}/>
      <BarcodeModal modal={barcodeModal} product={target} onSaved={(r) => target && markDone(target.productId, r)}/>
      <AttributesModal modal={attributesModal} product={target}/>
      <ImagesModal modal={imagesModal} product={target} onChanged={onChanged}/>
      <AttributeBulkModal modal={bulkAttributesModal} first={chosen[0] ?? null} count={chosen.length} busy={busy === 'bulk'} onApply={(key, valueId) => void sendBulk('fixes/attribute/bulk', chosen, (p) => ({ productId: p.productId, key, valueIds: [valueId], label: p.title ?? 'a product' }), true)} error={modalError} onDismissError={() => setModalError(null)}/>
    </UI.Section>);
}
