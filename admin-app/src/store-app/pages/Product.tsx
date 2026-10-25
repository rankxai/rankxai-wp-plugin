import { useEffect, useState } from 'react';
import { APP_PATHS, blogNewHref, contentItemHref, productImagesHref, productRefOf } from '@/lib/shopify-app/app-routes-core';
import { MIN_DESCRIPTION_WORDS } from '@/lib/shopify-app/catalogue-copy';
import { FIX_GUIDE, fixGuideFor, wordCount, type LiveProduct, type ProductSection } from '@/lib/shopify-app/product-detail-core';
import { PRODUCT_STATE_LABEL, type AiShoppingStatus, type ChannelLine, type GapView, type ProductState } from '@/lib/shopify-app/product-view-core';
import { api, toastSuccess } from '../api';
import { toastWrite } from '../reviews';
import { usePlan, useStore } from '../plan-context';
import { adminLocale, fmtCount, fmtNumber } from '../format';
import { formatPrice } from '@/lib/shopping/catalogue-display';
import { AdminButton, BackLink, ErrorBanner, act, formatDate, useLoad, usePageError, type PageError } from '../kit';
import { SkeletonSection, StatusBadge } from '../components/Status';
import { AttributesModal, BarcodeModal, CategoryModal, useModal, type Category, type WriteResult } from '../components/FixModals';
import { ImageList } from '../components/ImageFixes';
import { ScoreBadge } from './ContentTab';
import { ProductPrices } from './MonitoredTab';
import { Snippet } from './Listings';
import { PageColumns } from '../components/PageColumns';
import * as UI from '../ui';
interface ProductData {
    scan: {
        id: string;
        finishedAt: string;
    } | null;
    product: {
        productId: string;
        num: string;
        title: string | null;
        imageUrl: string | null;
        status: string | null;
        category: string | null;
        aiStatus: AiShoppingStatus;
        state: ProductState;
        channels: ChannelLine[];
        issues: GapView[];
        detailsPresent: number;
        detailsRecommended: number;
    } | null;
    monitored: {
        itemId: string;
        active: boolean;
        price: string | null;
        currency: string | null;
        availability: string | null;
        rating: number | null;
        ratingCount: number | null;
        answers: {
            windowDays: number;
            withProducts: number;
            showedProduct: number;
            ownStore: number;
        } | null;
    } | null;
    changes: Array<{
        id: string;
        kind: string;
        label: string;
        status: string;
        createdAt: string;
        undone: boolean;
    }>;
}
interface LiveData {
    product: LiveProduct;
    looksFixed: Record<string, boolean | null>;
    readAt: string;
}
const STATE_TONE: Record<ProductState, 'success' | 'warning' | 'neutral'> = { ready: 'success', needs_fix: 'warning', cant_tell: 'neutral' };
const STORE_PASSWORD_REASON = 'Your store is password-protected';
const VERDICT_BADGE: Record<ChannelLine['verdict'], {
    label: string;
    tone: 'success' | 'warning' | 'neutral';
}> = {
    clear: { label: 'Can be shown', tone: 'success' },
    blocked: { label: 'Can’t be shown', tone: 'warning' },
    unknown: { label: 'We can’t tell', tone: 'neutral' },
};
const STATUS_LABEL: Record<string, {
    label: string;
    tone: 'success' | 'warning' | 'neutral';
}> = {
    ACTIVE: { label: 'Active', tone: 'success' },
    DRAFT: { label: 'Draft', tone: 'neutral' },
    ARCHIVED: { label: 'Archived', tone: 'neutral' },
    UNLISTED: { label: 'Unlisted', tone: 'warning' },
};
const DESCRIPTION_SHOWN = 420;
const FIXES_ANCHOR = 'product-fixes';
const anchor = (s: ProductSection) => `product-${s}`;
export function ProductPage({ num }: {
    num: string;
}) {
    const { words, platform } = useStore();
    const load = useLoad<ProductData>(`catalogue/products/${num}`);
    const live = useLoad<LiveData>(`catalogue/products/${num}/live`);
    const { plan, ready: planReady, reload: reloadPlan } = usePlan();
    const [error, setError] = usePageError();
    const d = planReady ? load.data : null;
    const productLock = plan?.locks.products ?? null;
    const p = d?.product ?? null;
    const lp = live.data?.product ?? null;
    const gid = productRefOf(platform, num);
    const title = lp?.title ?? p?.title ?? 'Product';
    const reloadLive = live.reload;
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === 'visible')
                void reloadLive();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [reloadLive]);
    const issuesBy = (section: ProductSection) => (p?.issues ?? []).filter((g) => FIX_GUIDE[g.code]?.section === section);
    const fixed = (code: string) => live.data?.looksFixed?.[code] === true;
    return (<UI.Page heading={d ? title : 'Product'} inlineSize="large">
      <BackLink href={APP_PATHS.products} label="Products"/>
      
      <UI.Button slot="secondary-actions" href={productImagesHref(num)}>
        Image studio
      </UI.Button>
      
      <UI.Button slot="secondary-actions" href={blogNewHref(null, { num, title: d?.product?.title ?? null })}>
        Write an article about it
      </UI.Button>
      <ErrorBanner error={error ?? load.error} onDismiss={error ? () => setError(null) : undefined}/>
      {!d && (load.loading || (load.data && !planReady)) ? <SkeletonSection lines={6} label="Reading this product"/> : null}
      {d ? (<PageColumns main={<>
              {p ? (<FixList issues={p.issues} product={{ productId: gid, title }} num={num} fixed={fixed} setError={setError} checkedAt={d.scan?.finishedAt ?? null} liveReadAt={live.data?.readAt ?? null} onReadAgain={() => void reloadLive()} reading={live.loading} onChanged={() => {
                        void load.reload();
                        void reloadLive();
                    }}/>) : (<UI.Section heading="Not in your latest product check">
                  <UI.Paragraph>
                    The product check reads your active products, so a draft, an archived product or one created since the last check is not in it. Its
                    details are below.
                  </UI.Paragraph>
                </UI.Section>)}

              {live.error ? (<UI.Section>
                  <UI.Paragraph>{`We could not read this product from ${words.productSource} just now, so its details are not shown. The fixes above are from your product check on ${d.scan ? formatDate(d.scan.finishedAt) : 'record'}.`}</UI.Paragraph>
                  <UI.Stack direction="inline">
                    <UI.Button onClick={() => void reloadLive()}>Try again</UI.Button>
                  </UI.Stack>
                </UI.Section>) : !lp ? (<SkeletonSection lines={4} label={`Reading the product from ${words.productSource}`}/>) : (<>
                  <DescriptionCard num={num} product={lp} issues={issuesBy('description')} fixed={fixed}/>

                  <UI.Section heading="Media" id={anchor('media')}>
                    <ImageList productId={gid} onChanged={() => void load.reload()}/>
                  </UI.Section>

                  <UI.Section heading="Category" id={anchor('category')}>
                    <UI.Stack gap="small-200">
                      <IssueBadges issues={issuesBy('category')} fixed={fixed}/>
                      <UI.Text>{lp.category ?? 'No category chosen'}</UI.Text>
                      {p && p.detailsRecommended > 0 ? (<UI.Stack gap="small-100">
                          <UI.Text color="subdued">{`${fmtNumber(p.detailsPresent)} of ${fmtNumber(p.detailsRecommended)} details shoppers ask about are filled in`}</UI.Text>
                          <UI.Progress value={p.detailsPresent} max={p.detailsRecommended} accessibilityLabel={`${p.detailsPresent} of ${p.detailsRecommended} recommended details`}/>
                        </UI.Stack>) : null}
                    </UI.Stack>
                  </UI.Section>

                  <VariantsCard product={lp} issues={issuesBy('variants')} fixed={fixed}/>

                  <SearchListingCard product={lp} issues={issuesBy('search')} fixed={fixed} num={num}/>
                </>)}
            </>} side={<>
              
              <UI.Section heading="Status">
                <UI.Stack gap="small-200">
                  {lp?.status ? <UI.Badge tone={(STATUS_LABEL[lp.status.toUpperCase()] ?? STATUS_LABEL.DRAFT)!.tone}>{(STATUS_LABEL[lp.status.toUpperCase()] ?? { label: lp.status }).label}</UI.Badge> : null}
                  <IssueBadges issues={issuesBy('status')} fixed={fixed}/>
                  {p ? (<>
                      <UI.Text type="strong">AI shopping</UI.Text>
                      <UI.Badge tone={STATE_TONE[p.state]}>{PRODUCT_STATE_LABEL[p.state]}</UI.Badge>
                      {p.channels.map((c) => (<UI.Stack key={c.channel} gap="small-100">
                          <UI.Stack direction="inline" gap="small-200" alignItems="center">
                            <UI.Text>{c.name}</UI.Text>
                            {c.verdict === 'blocked' && c.reasons.every((r) => r === STORE_PASSWORD_REASON) ? (<UI.Badge tone="warning">Stopped by your store settings</UI.Badge>) : (<UI.Badge tone={VERDICT_BADGE[c.verdict].tone}>{VERDICT_BADGE[c.verdict].label}</UI.Badge>)}
                          </UI.Stack>
                          {c.reasons.map((r) => (<UI.Text key={r} color="subdued">
                              {r}
                            </UI.Text>))}
                        </UI.Stack>))}
                      {d.scan ? <UI.Text color="subdued">{`From your product check on ${formatDate(d.scan.finishedAt)}.`}</UI.Text> : null}
                    </>) : (<UI.Text color="subdued">Not assessed: this product was not in your latest product check.</UI.Text>)}
                </UI.Stack>
              </UI.Section>

              {lp ? (<UI.Section heading="Product organization" id={anchor('organization')}>
                  <UI.Stack gap="small-200">
                    <IssueBadges issues={issuesBy('organization')} fixed={fixed}/>
                    <Field label="Type" value={lp.productType}/>
                    <Field label="Vendor" value={lp.vendor}/>
                    <Field label="Tags" value={lp.tags.length ? lp.tags.join(', ') : null}/>
                  </UI.Stack>
                </UI.Section>) : null}

              <UI.Section heading="AI answers">
                {d.monitored ? (<UI.Stack gap="base">
                    {d.monitored.answers ? (d.monitored.answers.withProducts === 0 ? (<UI.Paragraph>{`No AI shopping answers showed products in the last ${d.monitored.answers.windowDays} days.`}</UI.Paragraph>) : (<UI.Stack gap="small-100">
                          <UI.Text type="strong">{`Named in ${fmtNumber(d.monitored.answers.showedProduct)} of ${fmtCount(d.monitored.answers.withProducts, 'answer', 'answers')}`}</UI.Text>
                          <UI.Text color="subdued">{`Answers that showed products in the last ${d.monitored.answers.windowDays} days. A named product can be sold by another store.`}</UI.Text>
                          <UI.Text>{`Your store was the seller in ${fmtNumber(d.monitored.answers.ownStore)}.`}</UI.Text>
                        </UI.Stack>)) : (<UI.Paragraph>We could not read the answers just now.</UI.Paragraph>)}
                    <ProductPrices id={d.monitored.itemId} title={title}/>
                  </UI.Stack>) : (<MonitorPrompt gid={gid} lock={productLock} onDone={() => Promise.all([load.reload(), reloadPlan()]).then(() => undefined)} setError={setError}/>)}
              </UI.Section>

              <UI.Section heading="Changes">
                {d.changes.length === 0 ? (<UI.Paragraph>No changes made to this product from RankX AI.</UI.Paragraph>) : (<UI.Stack gap="small-200">
                    {d.changes.slice(0, 8).map((c) => (<UI.Stack key={c.id} gap="small-100">
                        <UI.Text>{c.label}</UI.Text>
                        <UI.Text color="subdued">{`${formatDate(c.createdAt)}${c.undone ? ' · undone' : c.status === 'failed' ? ' · not applied' : ''}`}</UI.Text>
                      </UI.Stack>))}
                    <UI.Link href={APP_PATHS.changes}>See all changes and undo</UI.Link>
                  </UI.Stack>)}
              </UI.Section>
            </>}/>) : null}
    </UI.Page>);
}
function Field({ label, value }: {
    label: string;
    value: string | null;
}) {
    return (<UI.Grid gridTemplateColumns="72px 1fr" gap="small-200">
      <UI.Text color="subdued">{label}</UI.Text>
      <UI.Text>{value ?? '–'}</UI.Text>
    </UI.Grid>);
}
function IssueBadges({ issues, fixed }: {
    issues: GapView[];
    fixed: (code: string) => boolean;
}) {
    if (issues.length === 0)
        return null;
    const open = issues.some((g) => !fixed(g.code));
    return (<UI.Stack direction="inline" gap="small-200" alignItems="center">
      {issues.map((g) => fixed(g.code) ? (<StatusBadge key={g.code} status="saved" label={`${g.title}: looks fixed`}/>) : (<StatusBadge key={g.code} status={g.group === 'cant_be_shown' ? 'cant_be_shown' : 'needs_attention'} label={g.title}/>))}
      {open ? (<UI.Button variant="tertiary" onClick={() => document.getElementById(FIXES_ANCHOR)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          How to fix
        </UI.Button>) : null}
    </UI.Stack>);
}
function DescriptionCard({ num, product, issues, fixed }: {
    num: string;
    product: LiveProduct;
    issues: GapView[];
    fixed: (code: string) => boolean;
}) {
    const [all, setAll] = useState(false);
    const words = wordCount(product.description);
    const text = product.description;
    const shown = all || text.length <= DESCRIPTION_SHOWN ? text : `${text.slice(0, DESCRIPTION_SHOWN).replace(/\s+\S*$/, '')}…`;
    const content = useLoad<{
        item: {
            score: number;
            words: number;
            gaps: Array<{
                code: string;
            }>;
        };
    }>(`content/items/product/${num}`);
    return (<UI.Section heading="Title and description" id={anchor('description')}>
      <UI.Stack gap="base">
        <UI.Grid gridTemplateColumns="auto minmax(0, 1fr)" gap="base" alignItems="start">
          {product.imageUrl ? <UI.Thumbnail src={product.imageUrl} alt={product.imageAlt ?? ''} size="base"/> : <UI.Thumbnail alt="" size="base"/>}
          <UI.Stack gap="small-100">
            <UI.Text type="strong">{product.title ?? 'Untitled product'}</UI.Text>
            <UI.Text color="subdued">{`${fmtCount(words, 'word', 'words')} in the description${words < MIN_DESCRIPTION_WORDS ? ` (AI shopping reads ${MIN_DESCRIPTION_WORDS} or more best)` : ''}`}</UI.Text>
          </UI.Stack>
        </UI.Grid>
        <IssueBadges issues={issues} fixed={fixed}/>
        {text ? (<UI.Stack gap="small-200">
            <UI.Paragraph>{shown}</UI.Paragraph>
            {text.length > DESCRIPTION_SHOWN ? (<UI.Stack direction="inline">
                <UI.Button variant="tertiary" onClick={() => setAll((v) => !v)}>
                  {all ? 'Show less' : 'Show all'}
                </UI.Button>
              </UI.Stack>) : null}
          </UI.Stack>) : (<UI.Text color="subdued">This product has no description yet.</UI.Text>)}
        <UI.Stack direction="inline" gap="small-200">
          <AdminButton path={`/products/${num}`} label="Edit description"/>
          {content.data ? (<UI.Button href={contentItemHref('product', num)}>{content.data.item.gaps.length === 0 ? 'See the content check' : 'See what to improve'}</UI.Button>) : null}
        </UI.Stack>
        {content.data ? (<UI.Stack direction="inline" gap="small-200" alignItems="center">
            <ScoreBadge score={content.data.item.score}/>
            <UI.Text color="subdued">{`Content check: ${content.data.item.gaps.length === 0 ? 'nothing to improve' : fmtCount(content.data.item.gaps.length, 'thing to improve', 'things to improve')}`}</UI.Text>
          </UI.Stack>) : null}
      </UI.Stack>
    </UI.Section>);
}
function VariantsCard({ product, issues, fixed }: {
    product: LiveProduct;
    issues: GapView[];
    fixed: (code: string) => boolean;
}) {
    const single = product.variants.length === 1 && (product.variants[0]!.title ?? '').toLowerCase() === 'default title';
    return (<UI.Section heading={single ? 'Pricing and inventory' : 'Variants'} id={anchor('variants')}>
      <UI.Stack gap="small-200">
        <IssueBadges issues={issues} fixed={fixed}/>
        <UI.Table variant="auto">
          <UI.TableHeaderRow>
            {single ? null : <UI.TableHeader listSlot="primary">Variant</UI.TableHeader>}
            
            <UI.TableHeader listSlot={single ? 'primary' : 'labeled'}>Price</UI.TableHeader>
            <UI.TableHeader listSlot="labeled">Barcode</UI.TableHeader>
            <UI.TableHeader listSlot="labeled">SKU</UI.TableHeader>
            <UI.TableHeader listSlot="labeled">Available</UI.TableHeader>
          </UI.TableHeaderRow>
          <UI.TableBody>
            {product.variants.map((v, i) => (<UI.TableRow key={i}>
                {single ? null : <UI.TableCell>{v.title ?? '–'}</UI.TableCell>}
                <UI.TableCell>{v.price === null ? '–' : product.currency ? formatPrice(Math.round(Number(v.price) * 100), product.currency, adminLocale()) : v.price}</UI.TableCell>
                <UI.TableCell>{v.barcode ?? <UI.Badge tone="warning">Missing</UI.Badge>}</UI.TableCell>
                <UI.TableCell>{v.sku ?? '–'}</UI.TableCell>
                <UI.TableCell>{v.inventory === null ? '–' : fmtNumber(v.inventory)}</UI.TableCell>
              </UI.TableRow>))}
          </UI.TableBody>
        </UI.Table>
        {product.variantsCount !== null && product.variantsCount > product.variants.length ? (<UI.Text color="subdued">{`The first ${fmtNumber(product.variants.length)} of ${fmtNumber(product.variantsCount)} variants.`}</UI.Text>) : null}
      </UI.Stack>
    </UI.Section>);
}
function SearchListingCard({ product, issues, fixed, num }: {
    product: LiveProduct;
    issues: GapView[];
    fixed: (code: string) => boolean;
    num: string;
}) {
    return (<UI.Section heading="Search engine listing" id={anchor('search')}>
      <UI.Stack gap="small-200">
        <IssueBadges issues={issues} fixed={fixed}/>
        <UI.Box padding="base" border="base" borderRadius="base">
          
          <Snippet url={product.handle ? `/products/${product.handle}` : null} title={product.seo.title ?? product.title ?? 'Untitled product'} description={product.seo.description ?? null}/>
        </UI.Box>
        <UI.Text color="subdued">
          {product.seo.title ? 'Page title set.' : 'No page title set: search engines show the product title.'}{' '}
          {product.seo.description ? 'Meta description set.' : 'No meta description set.'}
        </UI.Text>
        <UI.Stack direction="inline">
          <UI.Button href={`${APP_PATHS.search}?product=${num}`}>Write it in SEO › Listings</UI.Button>
        </UI.Stack>
      </UI.Stack>
    </UI.Section>);
}
function FixList({ issues, product, num, fixed, setError, checkedAt, liveReadAt, onReadAgain, reading, onChanged }: {
    issues: GapView[];
    product: {
        productId: string;
        title: string | null;
    };
    num: string;
    fixed: (code: string) => boolean;
    setError: (e: PageError | null) => void;
    checkedAt: string | null;
    liveReadAt: string | null;
    onReadAgain: () => void;
    reading: boolean;
    onChanged: () => void;
}) {
    const { platform, capabilities } = useStore();
    const attributeValues = capabilities ? capabilities.can.attributeValues : platform === 'shopify';
    const [done, setDone] = useState<Record<string, WriteResult>>({});
    const [busy, setBusy] = useState<string | null>(null);
    const [modalError, setModalError] = useState<PageError | null>(null);
    const [opened, setOpened] = useState(false);
    const categoryModal = useModal('product-category');
    const barcodeModal = useModal('product-barcode');
    const attributesModal = useModal('product-details');
    const markDone = (code: string, r: WriteResult) => {
        setDone((all) => ({ ...all, [code]: r }));
        toastWrite(r.verified, 'Saved and confirmed on your store', 'Saved');
        onChanged();
    };
    async function save(code: string, body: Record<string, unknown>, fromModal = false) {
        const r = await act(() => api<WriteResult>('fixes/product', { method: 'POST', body: { ...body, productId: product.productId, label: product.title ?? 'a product' } }), (b) => setBusy(b ? code : null), fromModal ? setModalError : setError);
        if (r.ok && r.data) {
            markDone(code, r.data);
            categoryModal.hide();
        }
    }
    async function undo(code: string) {
        const id = done[code]?.changeId;
        if (!id)
            return;
        const r = await act(() => api(`changes/${id}/undo`, { method: 'POST' }), (b) => setBusy(b ? `undo:${code}` : null), setError);
        if (r.ok) {
            setDone((all) => {
                const next = { ...all };
                delete next[code];
                return next;
            });
            toastSuccess('Change undone');
            onChanged();
        }
    }
    const categoryCode = issues.find((i) => i.mode === 'category')?.code ?? 'no_category';
    const open = issues.filter((g) => !fixed(g.code) && !done[g.code]);
    const goTo = (section: ProductSection) => document.getElementById(anchor(section))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return (<UI.Section id={FIXES_ANCHOR} heading={issues.length === 0 ? 'Nothing to fix' : open.length === 0 ? 'What to fix: all looks done' : `What to fix (${fmtNumber(open.length)})`}>
      {issues.length === 0 ? (<UI.Paragraph>Your latest product check found nothing to fix on this product.</UI.Paragraph>) : (<UI.Stack gap="base">
          {issues.map((g, i) => {
                const result = done[g.code];
                const guide = fixGuideFor(g.code, platform);
                const looksFixed = fixed(g.code);
                return (<UI.Stack key={g.code} gap="small-200">
                {i > 0 ? <UI.Divider /> : null}
                
                <UI.Grid gridTemplateColumns="minmax(0, 1fr) auto" gap="base" alignItems="start">
                  <UI.Stack gap="small-100">
                    <UI.Stack direction="inline" gap="small-200" alignItems="center">
                      <UI.Text type="strong">{g.title}</UI.Text>
                      {looksFixed ? (<StatusBadge status="saved" label="Looks fixed"/>) : g.group === 'cant_be_shown' ? (<StatusBadge status="cant_be_shown" label="Stops it being shown"/>) : null}
                    </UI.Stack>
                    <UI.Text color="subdued">{detailLine(g) ?? g.fix}</UI.Text>
                    {guide && guide.steps.length > 0 && !looksFixed && !result ? (<UI.Stack gap="small-100">
                        <UI.Text>{guide.place.kind === 'admin' ? `On ${guide.place.label.replace(/^Open /, '')}:` : 'On the product’s page:'}</UI.Text>
                        {guide.steps.length === 1 ? (<UI.Text color="subdued">{guide.steps[0]}</UI.Text>) : (<UI.OrderedList>
                            {guide.steps.map((step) => (<UI.ListItem key={step}>{step}</UI.ListItem>))}
                          </UI.OrderedList>)}
                      </UI.Stack>) : null}
                  </UI.Stack>
                  <UI.Stack gap="small-200" alignItems="end">
                    {result ? (<UI.Stack direction="inline" gap="small-200" alignItems="center">
                        <StatusBadge status={result.verified ? 'saved' : 'saved_unconfirmed'}/>
                        {result.changeId ? (<UI.Button variant="tertiary" disabled={busy !== null || undefined} loading={busy === `undo:${g.code}` || undefined} onClick={() => void undo(g.code)}>
                            Undo
                          </UI.Button>) : null}
                      </UI.Stack>) : looksFixed ? null : guide?.place.kind === 'product' ? (<AdminButton path={`/products/${num}`} label="Edit product" onOpen={() => setOpened(true)}/>) : guide?.place.kind === 'admin' ? (<AdminButton path={guide.place.path} label={guide.place.label} onOpen={() => setOpened(true)}/>) : g.mode === 'category' ? (<UI.Button onClick={() => categoryModal.show()}>Choose category</UI.Button>) : g.mode === 'barcode' ? (<UI.Button onClick={() => barcodeModal.show()}>Add barcode</UI.Button>) : g.mode === 'attributes' ? (<UI.Button onClick={() => attributesModal.show()}>Set details</UI.Button>) : g.mode === 'visibility' ? (<UI.Button disabled={busy !== null || undefined} loading={busy === g.code || undefined} onClick={() => void save(g.code, { kind: 'visibility' })}>
                        Show to search engines
                      </UI.Button>) : g.mode === 'images' ? (<UI.Button onClick={() => goTo('media')}>Go to Media</UI.Button>) : g.mode === 'search' ? (<UI.Button href={`${APP_PATHS.search}?product=${num}`}>Write it in SEO › Listings</UI.Button>) : (<AdminButton path={`/products/${num}`} label="Edit product" onOpen={() => setOpened(true)}/>)}
                  </UI.Stack>
                </UI.Grid>
              </UI.Stack>);
            })}
          <UI.Divider />
          <UI.Stack gap="small-200">
            {opened ? (<UI.Text>It opened in a new tab. Make the change there and save it, then come back to this tab: it updates by itself.</UI.Text>) : null}
            <UI.Stack direction="inline" gap="base" alignItems="center">
              <UI.Button variant="tertiary" icon="refresh" loading={reading || undefined} onClick={onReadAgain}>
                Read the product again
              </UI.Button>
              <UI.Text color="subdued">
                {`${checkedAt ? `Issues from your product check on ${formatDate(checkedAt)}.` : ''}${liveReadAt ? ' “Looks fixed” means the product has it now; the next check confirms it.' : ''}`}
              </UI.Text>
            </UI.Stack>
          </UI.Stack>
        </UI.Stack>)}
      <CategoryModal modal={categoryModal} heading={`Category for ${product.title ?? 'this product'}`} busy={busy !== null} onPick={(c: Category) => void save(categoryCode, { kind: 'category', categoryId: c.id, categoryName: c.fullName }, true)} error={modalError} onDismissError={() => setModalError(null)}/>
      <BarcodeModal modal={barcodeModal} product={product} onSaved={(r) => markDone(issues.find((i) => i.mode === 'barcode')?.code ?? 'gtin_missing', r)}/>
      {attributeValues ? <AttributesModal modal={attributesModal} product={product}/> : null}
    </UI.Section>);
}
function detailLine(g: GapView): string | null {
    if (g.detail?.attributes?.length)
        return `Not set: ${g.detail.attributes.join(', ')}. ${g.fix}`;
    if (g.detail?.variants)
        return `On ${fmtCount(g.detail.variants, 'variant', 'variants')}. ${g.fix}`;
    if (g.detail?.images)
        return `${fmtCount(g.detail.images, 'image', 'images')}. ${g.fix}`;
    return null;
}
function MonitorPrompt({ gid, lock, onDone, setError }: {
    gid: string;
    lock: {
        reason: string;
        planNeeded: string | null;
    } | null;
    onDone: () => Promise<void>;
    setError: (e: PageError | null) => void;
}) {
    const [busy, setBusy] = useState(false);
    return (<UI.Stack gap="small-200">
      <UI.Paragraph>Monitor this product to see whether AI shopping answers show it, and how its price compares with the other stores in them.</UI.Paragraph>
      <UI.Stack direction="inline">
        <UI.Button disabled={!!lock || busy || undefined} loading={busy || undefined} onClick={() => void act(() => api('shopping/products', { method: 'POST', body: { productIds: [gid] } }), setBusy, setError).then(async (r) => {
            if (r.ok) {
                toastSuccess('Product added to monitoring');
                await onDone();
            }
        })}>
          Monitor this product
        </UI.Button>
      </UI.Stack>
      {lock ? <UI.Text color="subdued">{`${lock.reason}${lock.planNeeded ? ` Available on ${lock.planNeeded}.` : ''}`}</UI.Text> : null}
    </UI.Stack>);
}
