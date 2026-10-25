import { useEffect, useState } from 'react';
import { productHref, productIssueHref } from '@/lib/shopify-app/app-routes-core';
import { hiddenIssues } from '@/lib/shopify-app/product-issues-core';
import { PRODUCT_FILTERS, PRODUCT_STATE_LABEL, type ProductFilter, type ProductState } from '@/lib/shopify-app/product-view-core';
import { fmtCount, fmtNumber } from '../format';
import { formatDate, useLoad, type PagedTableProps } from '../kit';
import { SkeletonSection } from '../components/Status';
import { IssueTable } from './CatalogueFixes';
import type { FixesData } from './SearchFixes';
import * as UI from '../ui';
interface ListRow {
    productId: string;
    num: string | null;
    title: string | null;
    imageUrl: string | null;
    category: string | null;
    state: ProductState;
    issueCount: number;
    topIssue: {
        code: string;
        title: string;
    } | null;
    detailsPresent: number;
    detailsRecommended: number;
}
interface ListData {
    scan: {
        id: string;
        finishedAt: string;
    } | null;
    counts: Record<'all' | 'needs_fix' | 'missing_details' | 'ready', number>;
    total: number;
    products: ListRow[];
    hasMore: boolean;
    truncated: boolean;
}
const STATE_TONE: Record<ProductState, 'success' | 'warning' | 'neutral'> = {
    ready: 'success',
    needs_fix: 'warning',
    cant_tell: 'neutral',
};
export function ProductList({ fixes, storeBlocked }: {
    fixes: FixesData | null;
    storeBlocked: boolean;
}) {
    const [filter, setFilter] = useState<ProductFilter>('all');
    const [query, setQuery] = useState('');
    const [q, setQ] = useState('');
    const [page, setPage] = useState(0);
    useEffect(() => {
        const t = setTimeout(() => {
            setQ(query.trim());
            setPage(0);
        }, 300);
        return () => clearTimeout(t);
    }, [query]);
    const checked = filter !== 'not_checked';
    const list = useLoad<ListData>(checked ? `catalogue/products?filter=${filter}&q=${encodeURIComponent(q)}&page=${page}` : null);
    const hidden = fixes ? hiddenIssues(fixes.items) : [];
    const hiddenCount = hidden.reduce((n, i) => n + i.items.length, 0);
    const hiddenRead = fixes ? fixes.items.filter((i) => i.group === 'visibility').length : 0;
    const d = list.data;
    const [shown, setShown] = useState<ListData['counts'] | null>(null);
    if (d && d.counts !== shown)
        setShown(d.counts);
    const counts: Record<ProductFilter, number | null> = {
        all: shown?.all ?? null,
        needs_fix: shown?.needs_fix ?? null,
        missing_details: shown?.missing_details ?? null,
        ready: shown?.ready ?? null,
        not_checked: fixes ? hiddenCount : null,
    };
    const tableProps: PagedTableProps = d && (d.hasMore || page > 0)
        ? { paginate: true, hasNextPage: d.hasMore || undefined, hasPreviousPage: page > 0 || undefined, onNextPage: () => setPage((n) => n + 1), onPreviousPage: () => setPage((n) => Math.max(0, n - 1)) }
        : {};
    return (<UI.Section heading="Your products">
      <UI.Stack gap="base">
        <UI.Stack direction="inline" gap="small-200">
          {PRODUCT_FILTERS.map((f) => (<UI.PressButton key={f.id} pressed={f.id === filter} onClick={() => {
                setFilter(f.id);
                setPage(0);
            }}>
              {counts[f.id] === null ? f.label : `${f.label} (${fmtNumber(counts[f.id]!)})`}
            </UI.PressButton>))}
        </UI.Stack>

        {!checked ? (fixes === null ? (<SkeletonSection lines={3} label="Reading your products"/>) : hidden.length === 0 ? (<UI.Paragraph>No drafts, archived products or products out of stock in every option.</UI.Paragraph>) : (<UI.Stack gap="small-200">
              <UI.Text color="subdued">Drafts, archived products and products out of stock in every option. The product check does not read them; you change them on each product’s page.</UI.Text>
              <IssueTable rows={hidden.map((i) => ({ code: i.code, title: i.title, fix: i.fix, products: i.items.length, fixedIn: 'On the product’s page', href: productIssueHref(i.code) }))}/>
              
              {fixes.totals.visibility > hiddenRead ? <UI.Text color="subdued">{`Counted from the first ${fmtNumber(hiddenRead)} of ${fmtNumber(fixes.totals.visibility)} hidden products we found.`}</UI.Text> : null}
            </UI.Stack>)) : (<>
            <UI.Table variant="auto" loading={list.loading || undefined} {...tableProps}>
              <UI.SearchField slot="filters" label="Search your products" labelAccessibilityVisibility="exclusive" placeholder="Search by product title" value={query} onInput={(e) => setQuery(e.currentTarget.value)}/>
              <UI.TableHeaderRow>
                <UI.TableHeader listSlot="primary">Product</UI.TableHeader>
                <UI.TableHeader listSlot="inline">Status</UI.TableHeader>
                <UI.TableHeader listSlot="labeled">What to fix</UI.TableHeader>
                <UI.TableHeader listSlot="labeled">Details</UI.TableHeader>
              </UI.TableHeaderRow>
              <UI.TableBody>
                {(d?.products ?? []).map((r) => (<UI.TableRow key={r.productId} clickDelegate={r.num ? `product-${r.num}` : undefined}>
                    <UI.TableCell>
                      <UI.Grid gridTemplateColumns="auto minmax(0, 1fr)" gap="small-200" alignItems="center">
                        {r.imageUrl ? <UI.Thumbnail src={r.imageUrl} alt="" size="small-200"/> : <UI.Thumbnail alt="" size="small-200"/>}
                        <UI.Stack gap="small-100">
                          {r.num ? (<UI.Link id={`product-${r.num}`} href={productHref(r.num)}>
                              {r.title ?? 'Untitled product'}
                            </UI.Link>) : (<UI.Text type="strong">{r.title ?? 'Untitled product'}</UI.Text>)}
                          {r.category ? <UI.Text color="subdued">{r.category}</UI.Text> : null}
                        </UI.Stack>
                      </UI.Grid>
                    </UI.TableCell>
                    <UI.TableCell>
                      <UI.Badge tone={STATE_TONE[r.state]}>{PRODUCT_STATE_LABEL[r.state]}</UI.Badge>
                    </UI.TableCell>
                    <UI.TableCell>
                      {r.topIssue ? (<UI.Text>{`${r.topIssue.title}${r.issueCount > 1 ? ` and ${fmtCount(r.issueCount - 1, 'more', 'more')}` : ''}`}</UI.Text>) : (<UI.Text color="subdued">Nothing to fix</UI.Text>)}
                    </UI.TableCell>
                    <UI.TableCell>
                      
                      {r.detailsRecommended > 0 ? (<UI.Stack gap="small-100">
                          <UI.Text>{`${fmtNumber(r.detailsPresent)} of ${fmtNumber(r.detailsRecommended)} details`}</UI.Text>
                          <UI.Progress value={r.detailsPresent} max={r.detailsRecommended} accessibilityLabel={`${r.detailsPresent} of ${r.detailsRecommended} recommended details`}/>
                        </UI.Stack>) : ('–')}
                    </UI.TableCell>
                  </UI.TableRow>))}
              </UI.TableBody>
            </UI.Table>
            {d && d.products.length === 0 ? (<UI.Text color="subdued">{q ? 'No product matches your search.' : filter === 'needs_fix' ? 'No product has a problem of its own that stops it being shown.' : filter === 'missing_details' ? 'No product is missing a detail shoppers ask about.' : 'No products here.'}</UI.Text>) : null}
            {d?.scan ? <UI.Text color="subdued">{`From your product check on ${formatDate(d.scan.finishedAt)}. ${storeBlocked ? '“Ready to be shown” means nothing on the product stops it; your store settings above still do. ' : ''}Open a product to see everything about it in one place.`}</UI.Text> : null}
          </>)}
      </UI.Stack>
    </UI.Section>);
}
