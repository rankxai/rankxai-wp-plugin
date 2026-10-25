import { useStore } from '../plan-context';
import { useEffect, useRef, useState } from 'react';
import { BLOG_CROPS, BLOG_PALETTE_OPTIONS, BLOG_TWEAK_OPTIONS, DEFAULT_BLOG_OPTIONS, blogStyleOptionsFor, cropBox, readBlogImageOptions, type BlogConcept, type BlogImageOptions, } from '@/lib/shopify-app/blog-image-choices';
import { IMAGE_REQUEST_MAX, LOOK_NAME_MAX, TAKE_CHOICES } from '@/lib/shopify-app/image-studio-choices';
import { api, toastSuccess } from '../api';
import { ErrorBanner, PricedButton, act, creditsLabel, useLoad, usePageError, type LockInfo, useNoSpend } from '../kit';
import { AI_LABEL_NOTE, useGallery, type ImageJob, type StudioInfo } from './ImageStudio';
import * as UI from '../ui';
interface BlogLook {
    id: string;
    name: string;
    options: BlogImageOptions;
    summary: string;
}
interface Setup {
    title: string;
    products: Array<{
        id: string;
        name: string;
    }>;
    looks: BlogLook[];
    ideas: BlogConcept[];
    ideasLeft: number;
}
const making = (j: ImageJob) => j.status === 'queued' || j.status === 'generating';
const OWN = -1;
function CropPreview({ src, alt }: {
    src: string;
    alt: string;
}) {
    const [crop, setCrop] = useState<string>('card');
    const box = BLOG_CROPS.find((c) => c.id === crop);
    const size = box ? cropBox(box.ratio) : null;
    return (<UI.Stack gap="small-200">
      <div style={{ position: 'relative', inlineSize: '100%', aspectRatio: '16 / 9', overflow: 'hidden', borderRadius: 12 }}>
        
        <img src={src} alt={alt} style={{ position: 'absolute', inset: 0, inlineSize: '100%', blockSize: '100%', objectFit: 'cover' }}/>
        {size ? (<div aria-hidden="true" style={{
                position: 'absolute',
                insetBlockStart: `${(100 - size.heightPct) / 2}%`,
                insetInlineStart: `${(100 - size.widthPct) / 2}%`,
                inlineSize: `${size.widthPct}%`,
                blockSize: `${size.heightPct}%`,
                outline: '2px dashed #ffffff',
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
            }}/>) : null}
      </div>
      <UI.Stack direction="inline" gap="small-200" alignItems="center">
        <UI.Text color="subdued">Show how it is cropped:</UI.Text>
        {BLOG_CROPS.map((c) => (<UI.PressButton key={c.id} pressed={crop === c.id} onClick={() => setCrop(crop === c.id ? '' : c.id)} accessibilityLabel={`Show the ${c.label} crop`}>
            {c.label}
          </UI.PressButton>))}
      </UI.Stack>
    </UI.Stack>);
}
function Chips({ label, options, value, onChange }: {
    label: string;
    options: ReadonlyArray<{
        id: string;
        label: string;
    }>;
    value: string;
    onChange: (id: string) => void;
}) {
    return (<UI.Stack gap="small-200">
      <UI.Text type="strong">{label}</UI.Text>
      <UI.Stack direction="inline" gap="small-200">
        {options.map((o) => (<UI.PressButton key={o.id} pressed={o.id === value} onClick={() => onChange(o.id)} accessibilityLabel={`${label}: ${o.label}`}>
            {o.label}
          </UI.PressButton>))}
      </UI.Stack>
    </UI.Stack>);
}
export function BlogImagePanel({ articleId, title, lock, onUse }: {
    articleId: string;
    title: string;
    lock: LockInfo | null;
    onUse: (img: {
        url: string;
        altText: string;
        id?: string;
    }) => void;
}) {
    const noSpend = useNoSpend();
    const { words: storeWords } = useStore();
    const setup = useLoad<Setup>(`images/blog-setup?articleId=${articleId}`);
    const studio = useLoad<StudioInfo>('images/studio');
    const gallery = useGallery(`images/jobs?articleId=${articleId}`);
    const [error, setError] = usePageError();
    const [busy, setBusy] = useState<string | null>(null);
    const [ideas, setIdeas] = useState<BlogConcept[] | null>(null);
    const [ideasLeft, setIdeasLeft] = useState<number | null>(null);
    const [ideasNote, setIdeasNote] = useState<string | null>(null);
    const [pick, setPick] = useState<number>(0);
    const [words, setWords] = useState('');
    const [opts, setOpts] = useState<BlogImageOptions | null>(null);
    const [productId, setProductId] = useState('');
    const [takes, setTakes] = useState(1);
    const [shown, setShown] = useState<string | null>(null);
    const [alts, setAlts] = useState<Record<string, string>>({});
    const [lookName, setLookName] = useState('');
    const asked = useRef(false);
    const s = setup.data;
    if (s && ideas === null && s.ideas.length > 0) {
        setIdeas(s.ideas);
        setIdeasLeft(s.ideasLeft);
        setWords(s.ideas[0]!.description);
        if (s.ideas[0]!.product && s.products[0])
            setProductId(s.products[0].id);
    }
    if (s && opts === null)
        setOpts(s.looks[0]?.options ?? DEFAULT_BLOG_OPTIONS);
    async function makeIdeas(refresh: boolean) {
        const r = await act(() => api<{
            ideas: BlogConcept[];
            ideasLeft: number;
        }>('images/blog-ideas', { method: 'POST', body: { articleId, refresh } }), (b) => setBusy(b ? 'ideas' : null), () => undefined);
        if (r.ok && r.data) {
            setIdeas(r.data.ideas);
            setIdeasLeft(r.data.ideasLeft);
            setIdeasNote(null);
            setPick(0);
            const first = r.data.ideas[0];
            setWords(first?.description ?? '');
            const product = first?.product && s?.products[0] ? s.products[0].id : productId;
            if (product !== productId)
                setProductId(product);
            if (first && first.style !== 'auto')
                setOpts((o) => readBlogImageOptions({ ...(o ?? DEFAULT_BLOG_OPTIONS), style: first.style }, !!product));
        }
        else
            setIdeasNote(r.error ?? 'We could not write ideas just now. Write your own below.');
    }
    useEffect(() => {
        if (!s || asked.current || s.ideas.length > 0 || s.ideasLeft <= 0)
            return;
        asked.current = true;
        void makeIdeas(false);
    }, [s]);
    const price = studio.data?.price;
    const maxTakes = studio.data?.plan?.allowance?.maxTakes ?? 1;
    const takesLockedBy = studio.data?.plan?.lockedBy.takes ?? null;
    const options = opts ?? DEFAULT_BLOG_OPTIONS;
    const withProduct = !!productId;
    const styles = blogStyleOptionsFor(withProduct);
    const jobs = (gallery.jobs ?? []).filter((j) => j.status !== 'discarded' && j.status !== 'failed');
    const failed = (gallery.jobs ?? []).filter((j) => j.status === 'failed').slice(0, 2);
    const ready = jobs.filter((j) => j.status === 'ready' || j.status === 'applied');
    const current = ready.find((j) => j.id === shown) ?? ready[0] ?? null;
    const inFlight = jobs.some(making);
    const altOf = (j: ImageJob) => alts[j.id] ?? (j.altSuggestion?.trim() || title);
    const makeTakes = Math.min(takes, maxTakes);
    const makeLabel = makeTakes > 1 ? `Make ${makeTakes} images` : 'Make the image';
    const makeCredits = price === null || price === undefined ? price : price * makeTakes;
    function choose(i: number) {
        setPick(i);
        const idea = i === OWN ? null : ideas?.[i];
        setWords(idea ? idea.description : '');
        const product = idea?.product && !productId && s?.products[0] ? s.products[0].id : productId;
        if (product !== productId)
            setProductId(product);
        if (idea && idea.style !== 'auto')
            setOpts(readBlogImageOptions({ ...options, style: idea.style }, !!product));
    }
    async function make() {
        const body = { purpose: 'blog', articleId, brief: words.trim(), options, takes: Math.min(takes, maxTakes), products: productId ? [{ productId }] : [] };
        const r = await act(() => api<{
            jobs: string[];
        }>('images/generate', { method: 'POST', body }), (b) => setBusy(b ? 'make' : null), setError);
        if (r.ok && r.data) {
            toastSuccess(r.data.jobs.length > 1 ? `Making ${r.data.jobs.length} images` : 'Making the image');
            gallery.add(r.data.jobs);
            setShown(null);
        }
    }
    async function tweak(job: ImageJob, id: string) {
        const r = await act(() => api<{
            jobs: string[];
        }>('images/generate', { method: 'POST', body: { refineOf: job.id, tweak: id } }), (b) => setBusy(b ? `tweak:${id}` : null), setError);
        if (r.ok && r.data) {
            toastSuccess('Making a new take');
            gallery.add(r.data.jobs);
            setShown(null);
        }
    }
    async function use(job: ImageJob) {
        const alt = altOf(job).trim();
        const r = await act(() => api<{
            url: string;
            alt: string;
            mediaId?: string;
        }>(`images/jobs/${job.id}/apply`, { method: 'POST', body: { alt } }), (b) => setBusy(b ? 'use' : null), setError);
        if (r.ok && r.data) {
            toastSuccess(`Image added to your ${storeWords.files}`);
            gallery.replace({ ...job, status: 'applied', ...(r.data.mediaId ? { shopifyMediaGid: r.data.mediaId } : {}) });
            onUse({ url: r.data.url, altText: r.data.alt, ...(r.data.mediaId ? { id: r.data.mediaId } : {}) });
        }
    }
    async function saveLook() {
        const r = await act(() => api('images/looks', { method: 'POST', body: { purpose: 'blog', name: lookName.trim(), options } }), (b) => setBusy(b ? 'look' : null), setError);
        if (r.ok) {
            toastSuccess(`Saved “${lookName.trim()}”: it is chosen for your next blog images`);
            setLookName('');
            void setup.reload();
        }
    }
    function reuse(job: ImageJob) {
        if (job.shopifyFileUrl)
            onUse({ url: job.shopifyFileUrl, altText: altOf(job).trim(), ...(job.shopifyMediaGid ? { id: job.shopifyMediaGid } : {}) });
    }
    const ideaSection = (<UI.Section heading="Ideas from your article">
      <UI.Stack gap="base">
        {ideas === null && busy === 'ideas' ? <UI.Text color="subdued">Reading your article and writing three ideas. Free…</UI.Text> : null}
        {ideasNote ? <UI.Text color="subdued">{ideasNote}</UI.Text> : null}
        {ideas && ideas.length > 0 ? (<UI.ChoiceList name="blog-image-idea" label="Choose an idea" labelAccessibilityVisibility="exclusive" values={[String(pick)]} onChange={(e) => choose(Number((e.currentTarget as unknown as {
            values: string[];
        }).values[0] ?? 0))}>
            {ideas.map((idea, i) => (<UI.Choice key={`${i}-${idea.title}`} value={String(i)} selected={pick === i || undefined}>
                {idea.title}
                <UI.Text slot="details" color="subdued">{idea.description}</UI.Text>
              </UI.Choice>))}
            <UI.Choice value={String(OWN)} selected={pick === OWN || undefined}>
              My own idea
            </UI.Choice>
          </UI.ChoiceList>) : null}
        <UI.TextArea label="What the image shows" details="Change anything you like. We write the full description for the image from your article and these words." placeholder="For example: a calm morning kitchen with fresh coffee" value={words} rows={3} maxLength={IMAGE_REQUEST_MAX} onInput={(e) => {
            setWords(e.currentTarget.value);
            if (pick !== OWN && ideas && e.currentTarget.value !== ideas[pick]?.description)
                setPick(OWN);
        }}/>
        {ideas && ideasLeft !== null && ideasLeft > 0 ? (<UI.Stack direction="inline">
            <UI.Button variant="tertiary" loading={busy === 'ideas' || undefined} disabled={busy !== null || undefined} onClick={() => void makeIdeas(true)}>
              {`New ideas (free, ${ideasLeft} left)`}
            </UI.Button>
          </UI.Stack>) : null}
      </UI.Stack>
    </UI.Section>);
    const lookSection = (<UI.Section heading="The look">
      <UI.Stack gap="base">
        {s && s.looks.length > 0 ? (<UI.Stack gap="small-200">
            <UI.Text type="strong">Your blog looks</UI.Text>
            <UI.Stack direction="inline" gap="small-200">
              {s.looks.map((l) => (<UI.Button key={l.id} onClick={() => setOpts(readBlogImageOptions(l.options, withProduct))} accessibilityLabel={`Use the look ${l.name}: ${l.summary}`}>
                  {l.name}
                </UI.Button>))}
            </UI.Stack>
          </UI.Stack>) : null}
        <Chips label="Style" options={styles} value={options.style} onChange={(style) => setOpts({ ...options, style })}/>
        <Chips label="Colours" options={BLOG_PALETTE_OPTIONS} value={options.palette} onChange={(palette) => setOpts({ ...options, palette })}/>
        <UI.Stack direction="inline" gap="small-200" alignItems="end">
          <UI.TextField label="Save this look" details="Your newest blog look is chosen for every blog image, so your blog looks consistent." placeholder="For example: Warm photos" value={lookName} maxLength={LOOK_NAME_MAX} onInput={(e) => setLookName(e.currentTarget.value)}/>
          <UI.Button disabled={!lookName.trim() || busy !== null || undefined} loading={busy === 'look' || undefined} onClick={() => void saveLook()}>
            Save look
          </UI.Button>
        </UI.Stack>
        {s && s.products.length > 0 ? (<UI.Select label="Show one of the article’s products" details="Made from your own product photos and checked to be the same product, so it is always a photograph." value={productId} onChange={(e) => {
                const id = e.currentTarget.value;
                setProductId(id);
                setOpts((o) => readBlogImageOptions(o ?? DEFAULT_BLOG_OPTIONS, !!id));
            }}>
            <UI.Option value="">No product</UI.Option>
            {s.products.map((p) => (<UI.Option key={p.id} value={p.id}>
                {p.name}
              </UI.Option>))}
          </UI.Select>) : null}
        <UI.Select label="Takes" details={takesLockedBy && maxTakes < TAKE_CHOICES.length ? `Your plan makes up to ${maxTakes} at a time. ${takesLockedBy} makes up to ${TAKE_CHOICES.length}.` : 'Each take is its own image and its own price.'} value={String(Math.min(takes, maxTakes))} onChange={(e) => setTakes(Number(e.currentTarget.value) || 1)}>
          {TAKE_CHOICES.filter((n) => n <= maxTakes).map((n) => (<UI.Option key={n} value={String(n)}>
              {n === 1 ? '1 image' : `${n} images`}
            </UI.Option>))}
        </UI.Select>
        
        {current ? (<PricedButton label={makeLabel} credits={makeCredits} lock={lock} busy={busy === 'make'} onClick={() => void make()}/>) : lock ? (<UI.Text color="subdued">
            {lock.reason}
            {lock.planNeeded ? ` Available on ${lock.planNeeded}.` : ''}
          </UI.Text>) : makeCredits === null || makeCredits === undefined ? (<UI.Text color="subdued">The price could not be read just now, so this is unavailable.</UI.Text>) : null}
        <UI.Text color="subdued">An image that cannot be made is not charged. One that shows your product is made again once, free, if it changes the product.</UI.Text>
      </UI.Stack>
    </UI.Section>);
    const resultSection = jobs.length > 0 || failed.length > 0 ? (<UI.Section heading="Images for this article">
      <UI.Stack gap="base">
        {current && current.imageUrl ? (<UI.Stack gap="small-200">
            <CropPreview src={current.imageUrl} alt={altOf(current)}/>
            {current.shot ? <UI.Text color="subdued">{current.shot}</UI.Text> : null}
            <UI.TextField label="Alt text" details={current.altSuggestion ? 'Written from the picture. Change it if you like.' : 'What the picture shows, for screen readers and search.'} value={altOf(current)} maxLength={512} error={altOf(current).trim() ? undefined : 'Describe the image.'} onInput={(e) => setAlts((a) => ({ ...a, [current.id]: e.currentTarget.value }))}/>
            <UI.Stack gap="small-200">
              <UI.Text type="strong">Change something</UI.Text>
              <UI.Stack direction="inline" gap="small-200">
                {BLOG_TWEAK_OPTIONS.map((t) => (<UI.Button key={t.id} disabled={!!lock || noSpend || busy !== null || undefined} loading={busy === `tweak:${t.id}` || undefined} onClick={() => void tweak(current, t.id)} accessibilityLabel={`${t.label}: a new take${price ? `, ${creditsLabel(price)}` : ''}`}>
                    {t.label}
                  </UI.Button>))}
              </UI.Stack>
              <UI.Text color="subdued">{price ? `Each change is a new take, ${creditsLabel(price)}.` : 'Each change is a new take.'}</UI.Text>
            </UI.Stack>
            <UI.Text color="subdued">{AI_LABEL_NOTE}</UI.Text>
          </UI.Stack>) : null}
        {inFlight ? <UI.Text color="subdued">Making your image. This takes about half a minute; you can close this and come back.</UI.Text> : null}
        {failed.map((j) => (<UI.Banner key={j.id} tone="warning">
            {j.error ?? 'An image could not be made. Nothing was charged.'}
          </UI.Banner>))}
        {jobs.length > 1 || (jobs.length === 1 && !current) ? (<UI.Grid gridTemplateColumns="repeat(auto-fill, minmax(min(150px, 100%), 1fr))" gap="small-200">
            {jobs.map((j) => (<UI.Clickable key={j.id} onClick={() => (j.imageUrl ? setShown(j.id) : undefined)} accessibilityLabel={making(j) ? 'An image being made' : `Show this image${j.id === current?.id ? ' (shown)' : ''}`} border={j.id === current?.id ? 'large-100 strong' : 'base'} borderRadius="base" padding="small-100">
                <UI.Stack gap="small-100">
                  {j.imageUrl ? (<UI.Image src={j.imageUrl} alt={j.altSuggestion ?? ''} aspectRatio="16/9" objectFit="cover" borderRadius="base"/>) : (<div style={{ aspectRatio: '16 / 9', display: 'grid', placeItems: 'center' }}>
                      <UI.Spinner accessibilityLabel="Making the image"/>
                    </div>)}
                  {j.status === 'applied' ? <UI.Badge tone="success">{`In your ${storeWords.files}`}</UI.Badge> : null}
                </UI.Stack>
              </UI.Clickable>))}
          </UI.Grid>) : null}
        <UI.Text color="subdued">Every image made for this article is kept here for 30 days unless you use it.</UI.Text>
      </UI.Stack>
    </UI.Section>) : null;
    const primary = current ? (current.status === 'applied' ? (<UI.Button slot="primary-action" variant="primary" disabled={!current.shopifyFileUrl || undefined} onClick={() => reuse(current)}>
        Use this image
      </UI.Button>) : (<UI.Button slot="primary-action" variant="primary" disabled={!altOf(current).trim() || busy !== null || undefined} loading={busy === 'use' || undefined} onClick={() => void use(current)}>
        Use this image
      </UI.Button>)) : (<UI.Button slot="primary-action" variant="primary" disabled={!!lock || noSpend || makeCredits === null || makeCredits === undefined || busy !== null || undefined} loading={busy === 'make' || undefined} onClick={() => void make()}>
      {makeCredits === null || makeCredits === undefined ? makeLabel : `${makeLabel} · ${creditsLabel(makeCredits)}`}
    </UI.Button>);
    return (<>
      <UI.Stack gap="base">
        <ErrorBanner error={error ?? setup.error} onDismiss={error ? () => setError(null) : undefined}/>
        {resultSection}
        {ideaSection}
        {lookSection}
      </UI.Stack>
      {primary}
    </>);
}
