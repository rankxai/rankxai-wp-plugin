import { useState } from 'react';
import { formatPrice } from '@/lib/shopping/catalogue-display';
import { rivalPriceSentence, type RivalPriceRange } from '@/lib/shopping/rival-price-core';
import { ratingsGapSentence, type RatingsGap } from '@/lib/shopify-app/ratings-gap-copy';
import { api, toastSuccess } from '../api';
import { host } from '../host';
import { usePlan, useStore } from '../plan-context';
import { act, useLoad, usePagedRows, type PageError } from '../kit';
import { adminLocale, fmtCount, fmtNumber } from '../format';
import { ProductCell, SkeletonSection } from '../components/Status';
import { useModal } from '../components/FixModals';
import type { Shopping } from './ShoppingTab';
import * as UI from '../ui';
export function MonitoredProducts({ setError }: {
    setError: (e: PageError | null) => void;
}) {
    const { words } = useStore();
    const data = useLoad<Shopping>('shopping');
    const { plan, ready: planReady, reload: reloadPlan } = usePlan();
    const [busy, setBusy] = useState<string | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [pricesFor, setPricesFor] = useState<{
        id: string;
        title: string | null;
        price: string | null;
    } | null>(null);
    const pricesModal = useModal('prices');
    const d = planReady ? data.data : null;
    const productLock = plan?.locks.products ?? null;
    const access = plan?.locks.access ?? null;
    const lock = productLock ?? access;
    const paged = usePagedRows(d?.products?.rows ?? []);
    async function chooseProducts() {
        const p = data.data?.products;
        const remaining = p?.cap === null || p?.cap === undefined ? true : Math.max(1, p.cap - p.active);
        let picked: Array<{
            id: string;
        }> | undefined;
        try {
            picked = await host.pickProducts({ multiple: remaining });
        }
        catch {
            setError({ message: words.pickerFailed, planLink: false });
            return;
        }
        if (!picked || picked.length === 0)
            return;
        const r = await act(() => api<{
            tracked?: number;
        }>('shopping/products', { method: 'POST', body: { productIds: picked!.map((x) => x.id) } }), (b) => setBusy(b ? 'track' : null), setError);
        if (r.ok) {
            toastSuccess('Products added');
            await Promise.all([data.reload(), reloadPlan()]);
        }
        if (r.status === 207)
            setError({ message: 'Some products could not be added. The ones that were added are listed below.', planLink: false });
    }
    async function stopSelected() {
        const ids = [...selected];
        if (ids.length === 0)
            return;
        setBusy('untrack');
        setError(null);
        let failed = 0;
        for (const id of ids) {
            const r = await api(`shopping/products/${id}`, { method: 'DELETE' });
            if (!r.ok)
                failed += 1;
        }
        setBusy(null);
        setSelected(new Set());
        if (failed > 0)
            setError({ message: `${fmtCount(failed, 'product', 'products')} could not be removed just now. Please try again.`, planLink: false });
        if (failed < ids.length)
            toastSuccess(ids.length - failed === 1 ? 'Stopped monitoring one product' : `Stopped monitoring ${fmtNumber(ids.length - failed)} products`);
        await Promise.all([data.reload(), reloadPlan()]);
    }
    const toggle = (id: string, on: boolean) => setSelected((s) => {
        const next = new Set(s);
        if (on)
            next.add(id);
        else
            next.delete(id);
        return next;
    });
    const pageIds = paged.rows.map((p) => p.id);
    const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
    return (<>
      {data.error ? <UI.Paragraph>{data.error}</UI.Paragraph> : null}
      {!d && (data.loading || (data.data && !planReady)) ? <SkeletonSection lines={6} label="Loading your monitored products"/> : null}
      {d ? (<UI.Stack gap="base">
            {d.products ? (<>
                <UI.Text color="subdued">Products we look for in the AI shopping answers, with their price against the other stores shown.</UI.Text>
                <UI.Stack direction="inline" gap="base" alignItems="center">
                  <UI.Button disabled={!!lock || busy !== null || undefined} loading={busy === 'track' || undefined} onClick={() => void chooseProducts()}>
                    Choose products
                  </UI.Button>
                  <UI.Text color="subdued">{d.products.meter}</UI.Text>
                </UI.Stack>
                {d.products.pausedNote ? <UI.Text color="subdued">{d.products.pausedNote}</UI.Text> : null}
                {lock ? <UI.Text color="subdued">{`${lock.reason}${lock.planNeeded ? ` Available on ${lock.planNeeded}.` : ''}`}</UI.Text> : null}
                {d.products.rows.length === 0 ? (<UI.EmptyState heading="No products monitored yet">
                    <UI.Paragraph>Choose the products you most want AI assistants to recommend. We check whether they appear for your shopper questions.</UI.Paragraph>
                    <UI.Button slot="primary-action" disabled={!!lock || undefined} onClick={() => void chooseProducts()}>
                      Choose products
                    </UI.Button>
                  </UI.EmptyState>) : (<>
                    {selected.size > 0 ? (<UI.Stack direction="inline" gap="base" alignItems="center">
                        <UI.Text>{`${fmtNumber(selected.size)} selected`}</UI.Text>
                        <UI.Button disabled={busy !== null || undefined} loading={busy === 'untrack' || undefined} onClick={() => void stopSelected()}>
                          Stop monitoring
                        </UI.Button>
                      </UI.Stack>) : null}
                    <UI.Table variant="auto" {...paged.tableProps}>
                      <UI.TableHeaderRow>
                        <UI.TableHeader listSlot="inline">
                          <UI.Checkbox accessibilityLabel={allOnPage ? 'Clear the selection' : 'Select every product shown'} checked={allOnPage || undefined} onChange={(e) => {
                        const on = e.currentTarget.checked === true;
                        setSelected((s) => {
                            const next = new Set(s);
                            for (const id of pageIds) {
                                if (on)
                                    next.add(id);
                                else
                                    next.delete(id);
                            }
                            return next;
                        });
                    }}/>
                        </UI.TableHeader>
                        <UI.TableHeader listSlot="primary">Product</UI.TableHeader>
                        <UI.TableHeader listSlot="labeled">Price</UI.TableHeader>
                        <UI.TableHeader listSlot="labeled">Stock</UI.TableHeader>
                        <UI.TableHeader listSlot="inline">Prices in answers</UI.TableHeader>
                      </UI.TableHeaderRow>
                      <UI.TableBody>
                        {paged.rows.map((p) => (<UI.TableRow key={p.id}>
                            <UI.TableCell>
                              <UI.Checkbox accessibilityLabel={`Select ${p.title ?? 'this product'}`} checked={selected.has(p.id) || undefined} onChange={(e) => toggle(p.id, e.currentTarget.checked === true)}/>
                            </UI.TableCell>
                            <UI.TableCell>
                              <ProductCell title={p.title} imageUrl={p.imageUrl}/>
                            </UI.TableCell>
                            <UI.TableCell>{p.price ?? '–'}</UI.TableCell>
                            <UI.TableCell>{p.availability ?? '–'}</UI.TableCell>
                            <UI.TableCell>
                              <UI.Button variant="tertiary" accessibilityLabel={`Compare prices for ${p.title ?? 'this product'}`} onClick={() => {
                            setPricesFor({ id: p.id, title: p.title, price: p.price });
                            pricesModal.show();
                        }}>
                                Compare prices
                              </UI.Button>
                            </UI.TableCell>
                          </UI.TableRow>))}
                      </UI.TableBody>
                    </UI.Table>
                    <UI.Modal id={pricesModal.id} heading={pricesFor ? `Prices and ratings next to ${pricesFor.title ?? 'this product'}` : 'Prices and ratings'}>
                      {pricesFor?.price ? <UI.Paragraph>{`Your price: ${pricesFor.price}`}</UI.Paragraph> : null}
                      {pricesFor ? <ProductPrices key={pricesFor.id} id={pricesFor.id} title={pricesFor.title} bare/> : null}
                      <UI.Button slot="secondary-actions" commandFor={pricesModal.id} command="--hide">
                        Close
                      </UI.Button>
                    </UI.Modal>
                  </>)}
              </>) : (<UI.Paragraph>We could not read your monitored products just now.</UI.Paragraph>)}
          </UI.Stack>) : null}
    </>);
}
export function ProductPrices({ id, title, bare = false }: {
    id: string;
    title: string | null;
    bare?: boolean;
}) {
    const { platform } = useStore();
    const load = useLoad<{
        rivalPrices: RivalPriceRange | null;
        ratings?: {
            state: 'unread';
        } | RatingsGap;
        partial: boolean;
    }>(`shopping/products/${id}/prices`);
    const ratings = load.data?.ratings;
    return (<UI.Box padding={bare ? 'none' : 'base'} background={bare ? 'transparent' : 'subdued'} borderRadius="base">
      <UI.Stack gap="small-200">
        {bare ? null : <UI.Text type="strong">{`Prices and ratings next to ${title ?? 'this product'}`}</UI.Text>}
        {load.error ? <UI.Text color="subdued">{load.error}</UI.Text> : null}
        {!load.data && load.loading ? <UI.Text color="subdued">Reading the answers it was in…</UI.Text> : null}
        {load.data ? (load.data.rivalPrices ? (<>
              <UI.Paragraph>{rivalPriceSentence(load.data.rivalPrices, (minor, currency) => formatPrice(minor, currency, adminLocale()))}</UI.Paragraph>
              <UI.Text color="subdued">From the other stores’ cards in the answers this product was in, in your store’s currency only.</UI.Text>
            </>) : (<UI.Text color="subdued">Not enough prices yet: fewer than three other stores’ prices in your currency in the answers this product was in.</UI.Text>)) : null}
        {ratings ? (ratings.state === 'unread' ? (<UI.Text color="subdued">We could not read this product’s rating from your store just now.</UI.Text>) : (<UI.Paragraph>{ratingsGapSentence(ratings, fmtNumber, platform)}</UI.Paragraph>)) : null}
      </UI.Stack>
    </UI.Box>);
}
