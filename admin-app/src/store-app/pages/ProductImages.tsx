import { useState } from 'react';
import { APP_PATHS, productHref, productImagesDataPath, productImagesHref, STUDIO_GALLERY_PATH } from '@/lib/shopify-app/app-routes-core';
import type { ProductShot } from '@/lib/shopify-app/image-studio-choices';
import { api, toastSuccess } from '../api';
import { host } from '../host';
import { useRouter } from '../router';
import { usePlan, useStore } from '../plan-context';
import { BackLink, ErrorBanner, GoButton, PagePrimaryAction, act, useLoad, usePageError } from '../kit';
import { PhotoStudio, SampleShots, Tile, Viewer, retakeBody, useGallery, type ImageJob, type StudioInfo } from '../components/ImageStudio';
import { useModal } from '../components/FixModals';
import { SkeletonSection } from '../components/Status';
import * as UI from '../ui';
interface ProductImages {
    product: {
        id: string;
        title: string | null;
        suggestedShot?: ProductShot;
    };
    images: Array<{
        fileId: string;
        url: string | null;
        position: number;
        width?: number | null;
        height?: number | null;
    }>;
    prices: {
        makeImage?: number | null;
    };
}
interface Suggestion {
    productGid: string;
    productNum: string | null;
    title: string | null;
    imageUrl: string | null;
    reason: 'small' | 'monitored';
}
const SUGGESTION_REASON: Record<Suggestion['reason'], string> = {
    small: 'Its photo is too small to zoom in on. Studio photos are 2048 px.',
    monitored: 'You track it in AI shopping, and it has no studio photo yet.',
};
type Filter = 'all' | 'ready' | 'added' | 'blog';
export function ProductImagesPage({ product }: {
    product: string | null;
}) {
    return product ? <OneProductStudio num={product}/> : <StudioHome />;
}
function StudioHome() {
    const { words } = useStore();
    const { navigate } = useRouter();
    const { plan } = usePlan();
    const [error, setError] = usePageError();
    const [filter, setFilter] = useState<Filter>('all');
    const [page, setPage] = useState(0);
    const path = filter === 'all' && page === 0 ? STUDIO_GALLERY_PATH : `images/gallery?filter=${filter}&page=${page}`;
    const gallery = useGallery(path);
    const studio = useLoad<StudioInfo>('images/studio');
    const suggestions = useLoad<{
        suggestions: Suggestion[];
    }>('images/suggestions');
    const viewer = useModal('studio-home-viewer');
    const [open, setOpen] = useState<ImageJob | null>(null);
    const [busy, setBusy] = useState(false);
    const price = studio.data?.price;
    const lock = plan?.locks.access ?? null;
    async function choose() {
        try {
            const picked = await host.pickProducts({ multiple: false, productsOnly: true });
            if (picked?.[0])
                navigate(productImagesHref(picked[0].id));
        }
        catch {
            setError({ message: words.pickerFailed, planLink: false });
        }
    }
    async function shoot(body: Record<string, unknown>) {
        viewer.hide();
        const r = await act(() => api<{
            jobs: string[];
        }>('images/generate', { method: 'POST', body }), setBusy, setError);
        if (r.ok && r.data) {
            toastSuccess('Shooting');
            gallery.add(r.data.jobs);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }
    const jobs = gallery.jobs ?? [];
    const counts = gallery.extras.counts;
    const nothingYet = gallery.jobs !== null && filter === 'all' && page === 0 && jobs.length === 0;
    const shown = jobs.filter((j) => j.status !== 'discarded');
    const blogView = filter === 'blog';
    const groups: Array<{
        key: string;
        num: string | null;
        title: string | null;
        articleId: string | null;
        jobs: ImageJob[];
    }> = [];
    for (const j of shown) {
        const key = blogView ? (j.contentItemId ?? j.id) : (j.productGid ?? j.id);
        const g = groups.find((x) => x.key === key);
        if (g)
            g.jobs.push(j);
        else
            groups.push({ key, num: blogView ? null : (j.productNum ?? null), title: blogView ? (j.articleTitle ?? null) : j.productTitle, articleId: blogView ? (j.contentItemId ?? null) : null, jobs: [j] });
    }
    const filterLabel = (f: Filter) => {
        const n = f === 'ready' ? counts?.ready : f === 'added' ? counts?.added : f === 'blog' ? counts?.blog : null;
        const base = f === 'all' ? 'All' : f === 'ready' ? 'Ready to add' : f === 'added' ? 'Added' : 'Blog images';
        return n === null || n === undefined ? base : `${base} (${n})`;
    };
    return (<UI.Page heading="Image studio" inlineSize="large">
      <PagePrimaryAction onClick={() => void choose()}>Start a shoot</PagePrimaryAction>
      <ErrorBanner error={error ?? gallery.error} onDismiss={error ? () => setError(null) : undefined}/>

      {nothingYet ? (<UI.Section heading="Studio photos of your products">
          <UI.Stack gap="base">
            <UI.Paragraph>Studio photos of your products, ready for Google, AI shopping and your store. Each starts from your own photos and keeps the product exactly as it is.</UI.Paragraph>
            <SampleShots />
            <UI.Stack direction="inline">
              <UI.Button variant="primary" onClick={() => void choose()}>
                Start a shoot
              </UI.Button>
            </UI.Stack>
          </UI.Stack>
        </UI.Section>) : null}

      {(suggestions.data?.suggestions.length ?? 0) > 0 ? (<UI.Section heading="Shoot these first">
          <UI.Grid gridTemplateColumns="repeat(auto-fill, minmax(min(220px, 100%), 1fr))" gap="base">
            {suggestions.data!.suggestions.map((s) => (<UI.Box key={s.productGid} border="base" borderRadius="large" padding="small-200">
                <UI.Stack gap="small-200">
                  {s.imageUrl ? <UI.Image src={s.imageUrl} alt={s.title ?? ''} aspectRatio="1/1" objectFit="cover" borderRadius="base"/> : null}
                  <UI.Text type="strong">{s.title ?? 'A product'}</UI.Text>
                  <UI.Text color="subdued">{SUGGESTION_REASON[s.reason]}</UI.Text>
                  {s.productNum ? <GoButton href={productImagesHref(s.productNum)} label="Start a shoot"/> : null}
                </UI.Stack>
              </UI.Box>))}
          </UI.Grid>
        </UI.Section>) : null}

      {!nothingYet ? (<UI.Section heading="Your photos from the studio">
          <UI.Stack gap="base">
            <UI.Stack direction="inline" gap="small-200">
              {(['all', 'ready', 'added', 'blog'] as const).map((f) => (<UI.PressButton key={f} pressed={f === filter} onClick={() => {
                    setFilter(f);
                    setPage(0);
                }}>
                  {filterLabel(f)}
                </UI.PressButton>))}
            </UI.Stack>
            {gallery.jobs === null && !gallery.error ? <SkeletonSection lines={4} label="Reading your photos"/> : null}
            {gallery.jobs !== null && shown.length === 0 ? (<UI.Text color="subdued">
                {filter === 'ready' ? 'No photos waiting to be added.' : filter === 'added' ? 'No studio photos added to a product yet.' : filter === 'blog' ? 'No blog images yet. Make one from an article’s page, under Featured image.' : 'Nothing here yet.'}
              </UI.Text>) : null}
            {groups.map((g) => (<UI.Stack key={g.key} gap="small-200">
                <UI.Stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
                  <UI.Text type="strong">{g.title ?? (g.articleId ? 'An article' : 'A product')}</UI.Text>
                  {g.num ? <UI.Link href={productImagesHref(g.num)}>Open its shoot</UI.Link> : null}
                  {g.articleId ? <UI.Link href={`${APP_PATHS.blog}/articles/${g.articleId}`}>Open the article</UI.Link> : null}
                </UI.Stack>
                <UI.Grid gridTemplateColumns="repeat(auto-fill, minmax(min(200px, 100%), 1fr))" gap="base">
                  {g.jobs.map((j) => (<Tile key={j.id} job={j} selected={false} onOpen={() => {
                        if (j.purpose === 'blog' && j.contentItemId) {
                            navigate(`${APP_PATHS.blog}/articles/${j.contentItemId}`);
                            return;
                        }
                        setOpen(j);
                        viewer.show();
                    }}/>))}
                </UI.Grid>
              </UI.Stack>))}
            {page > 0 || gallery.extras.hasMore ? (<UI.Stack direction="inline" gap="small-200">
                {page > 0 ? <UI.Button onClick={() => setPage((p) => p - 1)}>Newer</UI.Button> : null}
                {gallery.extras.hasMore ? <UI.Button onClick={() => setPage((p) => p + 1)}>Older</UI.Button> : null}
              </UI.Stack>) : null}
            <UI.Text color="subdued">A photo you have not added is kept for 30 days, then deleted. One you add is on the product in your store; undo it from Changes in Settings.</UI.Text>
          </UI.Stack>
        </UI.Section>) : null}

      <UI.Modal id={viewer.id} heading={open ? `${open.productTitle ?? 'Your photo'}${open.shot ? ` · ${open.shot}` : ''}` : 'Your photo'} size="large">
        {open ? (<Viewer key={open.id} job={open} title={open.productTitle ?? 'this product'} price={price} lock={lock} busy={busy} studio={studio.data} onRefine={(tweak) => void shoot({ refineOf: open.id, tweak })} onMade={(ids, what) => {
                viewer.hide();
                setOpen(null);
                toastSuccess(what);
                gallery.add(ids);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }} onLookSaved={() => void studio.reload()} onRetake={(words) => void shoot(retakeBody(open, words))} onApplied={(j) => {
                gallery.replace(j);
                setOpen(j);
            }} onDiscarded={(j) => {
                gallery.replace(j);
                viewer.hide();
                setOpen(null);
            }}/>) : null}
        <UI.Button slot="secondary-actions" commandFor={viewer.id} command="--hide">
          Close
        </UI.Button>
      </UI.Modal>
    </UI.Page>);
}
function OneProductStudio({ num }: {
    num: string;
}) {
    const { platform } = useStore();
    const load = useLoad<ProductImages>(productImagesDataPath(num, platform));
    const { plan, ready: planReady } = usePlan();
    const d = load.data;
    const title = d?.product.title ?? null;
    return (<UI.Page heading={title ? `Image studio: ${title}` : 'Image studio'} inlineSize="large">
      <BackLink href={APP_PATHS.productImages} label="Image studio"/>
      
      {load.status === 404 ? null : (<UI.Button slot="secondary-actions" href={productHref(num)}>
          Open the product
        </UI.Button>)}
      <ErrorBanner error={load.error}/>
      
      {d && planReady ? (<PhotoStudio product={{ productId: d.product.id, title }} photos={d.images} suggestedShot={d.product.suggestedShot ?? 'studio'} price={d.prices.makeImage} lock={plan?.locks.access ?? null}/>) : load.error ? null : (<SkeletonSection lines={5} label="Reading the product’s photos"/>)}
    </UI.Page>);
}
