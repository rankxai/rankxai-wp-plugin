import { useStore } from '../plan-context';
import { useEffect, useState, type ReactNode } from 'react';
import { AGE_CHOICES, AGE_CHOICE_LABEL, IMAGE_BRIEF_MAX, IMAGE_REQUEST_MAX, PURPOSE_LABEL, REFERENCES_MAX, SHOOT_CHOICE_LISTS, TAKE_CHOICES, TWEAK_CHOICES, DEFAULT_SHOOT, LOOK_NAME_MAX, keepingState, merchantReadiness, MERCHANT_IMAGE_RULES, shootChoices, type AgeChoice, type ChannelFormat, type ImagePurpose, type ProductShot, type ShootOptions, } from '@/lib/shopify-app/image-studio-choices';
import { APP_PATHS, productHref } from '@/lib/shopify-app/app-routes-core';
import type { BlogImageOptions } from '@/lib/shopify-app/blog-image-choices';
import { api, toastSuccess } from '../api';
import { ErrorBanner, PricedButton, act, fieldError, formatDate, useLoad, usePageError, type LockInfo } from '../kit';
import { toastWrite } from '../reviews';
import { useModal } from './FixModals';
import studioSample from '../assets/studio/studio.webp';
import onModelSample from '../assets/studio/on_model.webp';
import inActionSample from '../assets/studio/in_action.webp';
import { PageColumns } from './PageColumns';
import * as UI from '../ui';
export interface ImageJob {
    id: string;
    purpose: ImagePurpose;
    status: string;
    productGid: string | null;
    productTitle: string | null;
    sourceUrl: string | null;
    imageUrl: string | null;
    brief: string;
    enhancedBrief: string | null;
    error: string | null;
    differences: string[];
    credits: number | null;
    shopifyFileUrl: string | null;
    shopifyMediaGid?: string | null;
    funding?: string;
    createdAt?: string;
    shot?: string | null;
    options?: ShootOptions | null;
    take?: number | null;
    takes?: number | null;
    stage?: string | null;
    matches?: boolean;
    altSuggestion?: string;
    tweak?: string | null;
    productNum?: string | null;
    keptUntil?: string | null;
    storeCopy?: 'shopify' | 'removed' | 'unreadable';
    format?: ChannelFormat | null;
    madeFrom?: string | null;
    contentItemId?: string | null;
    articleTitle?: string | null;
    blogOptions?: BlogImageOptions | null;
    withProduct?: boolean;
}
export interface StudioInfo {
    price: number | null;
    plan: {
        allowance: {
            maxTakes: number;
            savedLooks: number | null;
            channelFormats: boolean;
        } | null;
        looksKept: number;
        lockedBy: {
            takes: string | null;
            looks: string | null;
            formats: string | null;
        };
    } | null;
    formats: Array<{
        id: ChannelFormat;
        label: string;
        use: string;
        onProduct: boolean;
    }>;
}
export interface StudioLook {
    id: string;
    name: string;
    purpose: ProductShot;
    options: ShootOptions;
    summary: string;
}
function planLock(reason: string, planNeeded: string | null | undefined): LockInfo | null {
    return planNeeded ? { locked: true, reason, planNeeded } : null;
}
export interface ShopperView {
    monitored: boolean;
    summary: string | null;
    answers: Array<{
        checkId: string;
        question: string;
        surface: string;
        checkedAt: string | null;
        thisProduct: {
            imageUrl: string;
            label: string;
            title: string | null;
        } | null;
        others: Array<{
            imageUrl: string;
            seller: string | null;
            title: string | null;
        }>;
    }>;
    imagesAddedAt: string | null;
    outcome: {
        changedAt: string;
        verdict: string;
        provisional: boolean;
        sentence: string;
    } | null;
}
const isFinishedPhoto = (j: ImageJob) => (j.status === 'ready' || j.status === 'applied') && !j.format && PRODUCT_SHOT_ORDER.some((s) => s === j.purpose);
const FORMAT_RATIO: Record<ChannelFormat, `${number}/${number}`> = { '4:5': '4/5', '9:16': '9/16', '16:9': '16/9' };
const goesToFiles = (j: ImageJob) => !!j.format && j.format !== '4:5';
const POLL_MS = 4000;
const isMaking = (j: ImageJob) => j.status === 'queued' || j.status === 'generating';
export interface GalleryExtras {
    hasMore?: boolean;
    counts?: {
        ready: number | null;
        added: number | null;
        blog?: number | null;
    };
}
export function useGallery(path: string): {
    jobs: ImageJob[] | null;
    extras: GalleryExtras;
    error: string | null;
    add: (ids: string[]) => void;
    replace: (job: ImageJob) => void;
} {
    const [jobs, setJobs] = useState<ImageJob[] | null>(null);
    const [extras, setExtras] = useState<GalleryExtras>({});
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        let live = true;
        void api<{
            jobs: ImageJob[];
        } & GalleryExtras>(path).then((r) => {
            if (!live)
                return;
            if (r.ok && r.data) {
                setJobs(r.data.jobs);
                setExtras({ hasMore: r.data.hasMore, counts: r.data.counts });
                setError(null);
            }
            else
                setError(r.error ?? 'We could not read your images just now.');
        });
        return () => {
            live = false;
        };
    }, [path]);
    const making = (jobs ?? []).filter(isMaking).map((j) => j.id).join(',');
    useEffect(() => {
        if (!making)
            return;
        const t = setTimeout(() => {
            void api<{
                jobs: ImageJob[];
            }>(`images/jobs?ids=${making}`).then((r) => {
                if (r.ok && r.data) {
                    const fresh = new Map(r.data.jobs.map((j) => [j.id, j]));
                    setJobs((all) => (all ?? []).map((j) => fresh.get(j.id) ?? j));
                }
            });
        }, POLL_MS);
        return () => clearTimeout(t);
    }, [making, jobs]);
    const add = (ids: string[]) => {
        void api<{
            jobs: ImageJob[];
        }>(`images/jobs?ids=${ids.join(',')}`).then((r) => {
            if (r.ok && r.data) {
                const arrived = [...r.data.jobs].sort((a, b) => (a.take ?? 0) - (b.take ?? 0));
                setJobs((all) => [...arrived, ...(all ?? []).filter((j) => !ids.includes(j.id))]);
            }
        });
    };
    return { jobs, extras, error, add, replace: (job) => setJobs((all) => (all ?? []).map((j) => (j.id === job.id ? job : j))) };
}
function AgeSelect({ value, onChange }: {
    value: AgeChoice;
    onChange: (v: AgeChoice) => void;
}) {
    return (<UI.Select label="Model’s age" details="Children are shown fully clothed in everyday settings, and never with swimwear, underwear, sleepwear or products for adults." value={value} onChange={(e) => onChange(e.currentTarget.value as AgeChoice)}>
      {AGE_CHOICES.map((a) => (<UI.Option key={a} value={a}>
          {AGE_CHOICE_LABEL[a]}
        </UI.Option>))}
    </UI.Select>);
}
const SAME_PRODUCT_REPORT = 'Checked against your photo before you saw it: the colours, the print and logos, every part, and its shape and size. No change was found.';
const NEVER_CHARGED = 'A photo that changes your product is made again once, free. If it still does, it is not kept and you are not charged.';
export const AI_LABEL_NOTE = 'The image file says it was made with AI, which Google reads. If you sell on Google, also turn on the AI label for it in Merchant Center.';
const SHOT_CARD: Record<ProductShot, {
    sample: string;
    line: string;
}> = {
    studio: { sample: studioSample, line: 'Your product alone on a lit set' },
    on_model: { sample: onModelSample, line: 'Worn or held by a model' },
    in_action: { sample: inActionSample, line: 'In use, where it belongs' },
};
const PRODUCT_SHOT_ORDER = ['studio', 'on_model', 'in_action'] as const;
export function SampleShots() {
    return (<UI.Grid gridTemplateColumns="repeat(auto-fit, minmax(min(180px, 100%), 1fr))" gap="base">
      {PRODUCT_SHOT_ORDER.map((s) => (<UI.Stack key={s} gap="small-200">
          <UI.Image src={SHOT_CARD[s].sample} alt={`A sample ${PURPOSE_LABEL[s].title.toLowerCase()} photo made by the studio`} aspectRatio="1/1" objectFit="cover" borderRadius="large"/>
          <UI.Text type="strong">{PURPOSE_LABEL[s].title}</UI.Text>
          <UI.Text color="subdued">{SHOT_CARD[s].line}</UI.Text>
        </UI.Stack>))}
    </UI.Grid>);
}
export function retakeBody(job: ImageJob, words: string, refs: string[] = []): Record<string, unknown> {
    const shot = PRODUCT_SHOT_ORDER.find((x) => x === job.purpose) ?? 'studio';
    return { purpose: shot, products: [{ productId: job.productGid, mediaId: refs[0] ?? null, title: job.productTitle }], references: refs, options: job.options ?? undefined, takes: 1, brief: words };
}
const CHOICE_LABEL: Record<keyof ShootOptions, string> = { set: 'Set', backdrop: 'Backdrop', place: 'Where', framing: 'Framing', light: 'Light', mood: 'Mood', season: 'Season' };
const STAGE: Record<string, {
    label: string;
    step: number;
}> = {
    queued: { label: 'Waiting for the studio', step: 0 },
    planning: { label: 'Planning the shot', step: 1 },
    shooting: { label: 'Shooting', step: 2 },
    checking: { label: 'Checking it is your product', step: 3 },
    finishing: { label: 'Finishing', step: 4 },
};
function Swatch({ color }: {
    color: string;
}) {
    return <span aria-hidden="true" style={{ display: 'inline-block', inlineSize: 12, blockSize: 12, borderRadius: 999, background: color, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.18)', marginInlineEnd: 6, verticalAlign: '-1px' }}/>;
}
function ShotCard({ shot, selected, onSelect }: {
    shot: ProductShot;
    selected: boolean;
    onSelect: () => void;
}) {
    return (<UI.Clickable onClick={onSelect} accessibilityLabel={`${PURPOSE_LABEL[shot].title}: ${SHOT_CARD[shot].line}${selected ? ' (chosen)' : ''}`} border={selected ? 'large-100 strong' : 'large-100 subdued'} borderRadius="large" padding="small-200" background={selected ? 'subdued' : 'base'}>
      <UI.Stack gap="small-200">
        <UI.Image src={SHOT_CARD[shot].sample} alt="" aspectRatio="1/1" objectFit="cover" borderRadius="base"/>
        <UI.Stack direction="inline" gap="small-200" alignItems="center" justifyContent="space-between">
          <UI.Text type="strong">{PURPOSE_LABEL[shot].title}</UI.Text>
          {selected ? <UI.Icon type="check-circle"/> : null}
        </UI.Stack>
        <UI.Text color="subdued">{SHOT_CARD[shot].line}</UI.Text>
      </UI.Stack>
    </UI.Clickable>);
}
function ChoiceRow({ name, value, onChange }: {
    name: keyof ShootOptions;
    value: string;
    onChange: (v: string) => void;
}) {
    return (<UI.Stack gap="small-200">
      <UI.Text type="strong">{CHOICE_LABEL[name]}</UI.Text>
      <UI.Stack direction="inline" gap="small-200">
        {SHOOT_CHOICE_LISTS[name].map((o) => (<UI.PressButton key={o.id} pressed={o.id === value} onClick={() => onChange(o.id)} accessibilityLabel={`${CHOICE_LABEL[name]}: ${o.label}`}>
            {o.swatch ? <Swatch color={o.swatch}/> : null}
            {o.label}
          </UI.PressButton>))}
      </UI.Stack>
    </UI.Stack>);
}
function CompareSlider({ original, made, title }: {
    original: string;
    made: string;
    title: string;
}) {
    const [at, setAt] = useState(100 / 2);
    const layer = { position: 'absolute', inset: 0, inlineSize: '100%', blockSize: '100%', objectFit: 'contain' } as const;
    return (<UI.Stack gap="small-200">
      <div style={{ position: 'relative', inlineSize: '100%', aspectRatio: '1 / 1', overflow: 'hidden', borderRadius: 12 }}>
        
        <img src={made} alt={`New image of ${title}`} style={layer}/>
        <img src={original} alt={`Your photo of ${title}`} style={{ ...layer, clipPath: `inset(0 ${100 - at}% 0 0)` }}/>
        
        
        <div aria-hidden="true" style={{ position: 'absolute', insetBlock: 0, insetInlineStart: `${at}%`, inlineSize: 2, background: '#ffffff', boxShadow: '0 0 0 1px rgba(0,0,0,0.25)' }}/>
      </div>
      <input type="range" min={0} max={100} value={at} onChange={(e) => setAt(Number(e.currentTarget.value))} aria-label="Slide between your photo and the new image" style={{ inlineSize: '100%' }}/>
      <UI.Stack direction="inline" justifyContent="space-between">
        <UI.Text color="subdued">Your photo</UI.Text>
        <UI.Text color="subdued">New image</UI.Text>
      </UI.Stack>
    </UI.Stack>);
}
function AnswerCard({ src, caption, tone }: {
    src: string;
    caption: string;
    tone?: 'info';
}) {
    return (<UI.Stack gap="small-100">
      <UI.Image src={src} alt={caption} aspectRatio="1/1" objectFit="contain" borderRadius="base"/>
      {tone ? <UI.Badge tone={tone}>{caption}</UI.Badge> : <UI.Text color="subdued">{caption}</UI.Text>}
    </UI.Stack>);
}
function ShopperSection({ view, onShoot }: {
    view: ShopperView;
    onShoot: () => void;
}) {
    if (!view.summary || view.answers.length === 0)
        return null;
    return (<UI.Section heading="What AI shoppers see">
      <UI.Stack gap="base">
        <UI.Text color="subdued">{view.summary}</UI.Text>
        {view.answers.map((a) => (<UI.Stack key={a.checkId} gap="small-200">
            <UI.Stack gap="small-100">
              <UI.Text type="strong">{`“${a.question}”`}</UI.Text>
              <UI.Text color="subdued">{a.checkedAt ? `${a.surface} · ${formatDate(a.checkedAt)}` : a.surface}</UI.Text>
            </UI.Stack>
            <UI.Grid gridTemplateColumns="repeat(auto-fill, minmax(min(110px, 100%), 140px))" gap="small-200">
              {a.thisProduct ? <AnswerCard src={a.thisProduct.imageUrl} caption={a.thisProduct.label} tone="info"/> : null}
              {a.others.map((o) => (<AnswerCard key={o.imageUrl} src={o.imageUrl} caption={o.seller ?? o.title ?? 'Another store'}/>))}
            </UI.Grid>
          </UI.Stack>))}
        <UI.Stack direction="inline">
          <UI.Button variant="primary" onClick={onShoot}>
            Shoot a better one
          </UI.Button>
        </UI.Stack>
      </UI.Stack>
    </UI.Section>);
}
function AfterImagesSection({ view, productNum }: {
    view: ShopperView;
    productNum: string | null;
}) {
    const o = view.outcome;
    return (<UI.Section heading="After your new images">
      <UI.Stack gap="small-200">
        {o ? (<>
            <UI.Text>{o.sentence}</UI.Text>
            <UI.Text color="subdued">{`New images added on ${formatDate(o.changedAt)}.`}</UI.Text>
            {o.provisional && o.verdict !== 'too_early' ? <UI.Text color="subdued">Early: each AI answer is one draw, so this can still move.</UI.Text> : null}
          </>) : view.imagesAddedAt && !view.monitored ? (<>
            <UI.Text color="subdued">Monitor this product in AI shopping to see how often it appears in answers before and after its new images.</UI.Text>
            {productNum ? <UI.Link href={productHref(productNum)}>Open the product</UI.Link> : null}
          </>) : (<UI.Text color="subdued">Once you add a studio photo, we compare how often the products you sell appear in AI shopping answers before and after it. An observation, not a promise.</UI.Text>)}
      </UI.Stack>
    </UI.Section>);
}
function Square({ children }: {
    children: ReactNode;
}) {
    return (<div style={{ aspectRatio: '1 / 1', display: 'grid' }}>
      <UI.Box background="subdued" borderRadius="base" padding="base" blockSize="100%">
        <div style={{ display: 'grid', placeItems: 'center', blockSize: '100%', textAlign: 'center' }}>{children}</div>
      </UI.Box>
    </div>);
}
function MakingTile({ job }: {
    job: ImageJob;
}) {
    const s = STAGE[job.stage ?? job.status] ?? STAGE.queued!;
    return (<Square>
      <UI.Stack gap="small-200" alignItems="center">
        <UI.Spinner accessibilityLabel={s.label}/>
        <UI.Text>{s.label}</UI.Text>
        <UI.Progress value={s.step} max={4} accessibilityLabel={`${s.label}, step ${s.step} of 4`}/>
      </UI.Stack>
    </Square>);
}
function Keeping({ job }: {
    job: ImageJob;
}) {
    if (job.status === 'applied') {
        if (job.storeCopy === 'removed')
            return <UI.Text color="subdued">Added, then removed from the product</UI.Text>;
        if (job.storeCopy === 'unreadable')
            return <UI.Text color="subdued">Added. The picture could not be read from your store just now.</UI.Text>;
        return null;
    }
    if (job.status !== 'ready' || !job.keptUntil)
        return null;
    const state = keepingState(job.keptUntil);
    if (!state)
        return null;
    return state === 'soon' ? (<UI.Badge tone="warning">{`Deleted on ${formatDate(job.keptUntil)} unless you add it`}</UI.Badge>) : (<UI.Text color="subdued">{`Kept until ${formatDate(job.keptUntil)} unless you add it`}</UI.Text>);
}
export function Tile({ job, selected, onSelect, onOpen, showProduct = false }: {
    job: ImageJob;
    selected: boolean;
    onSelect?: (on: boolean) => void;
    onOpen: () => void;
    showProduct?: boolean;
}) {
    const { words } = useStore();
    const caption = [job.shot ?? PURPOSE_LABEL[job.purpose]?.title, job.takes && job.take ? `take ${job.take} of ${job.takes}` : null].filter(Boolean).join(' · ');
    return (<UI.Box border={selected ? 'large-100 strong' : 'base'} borderRadius="large" padding="small-200" background="base">
      <UI.Stack gap="small-200">
        {isMaking(job) ? (<MakingTile job={job}/>) : job.status === 'failed' ? (<Square>
            <UI.Stack gap="small-200">
              <UI.Text type="strong">Not kept</UI.Text>
              <UI.Text color="subdued">{job.error ?? 'The image could not be made. Nothing was charged.'}</UI.Text>
              {job.differences.length > 0 ? <UI.Text color="subdued">{`What changed: ${job.differences.slice(0, 2).join('; ')}.`}</UI.Text> : null}
            </UI.Stack>
          </Square>) : job.imageUrl ? (<UI.Clickable onClick={onOpen} accessibilityLabel={`Open ${caption} full size`} borderRadius="base">
            <UI.Image src={job.imageUrl} alt={job.altSuggestion ?? ''} aspectRatio="1/1" objectFit={job.format || job.purpose === 'blog' ? 'contain' : 'cover'} borderRadius="base"/>
          </UI.Clickable>) : null}
        {showProduct ? <UI.Text type="strong">{job.productTitle ?? 'A product'}</UI.Text> : null}
        {job.funding === 'free_install' ? <UI.Badge>On us</UI.Badge> : job.funding === 'free_preview' ? <UI.Badge>Free preview</UI.Badge> : null}
        <UI.Text color="subdued">{caption}</UI.Text>
        {job.status === 'ready' || job.status === 'applied' ? (<UI.Stack direction="inline" gap="small-200" alignItems="center" justifyContent="space-between">
            {job.status === 'applied' ? <UI.Badge tone="success">{job.shopifyFileUrl ? `Saved to ${words.files}` : 'Added'}</UI.Badge> : onSelect ? <UI.Checkbox label="Select" checked={selected || undefined} onChange={(e) => onSelect(e.currentTarget.checked === true)}/> : null}
            {job.matches ? <UI.Badge tone="info" icon="check-circle">Matches your product</UI.Badge> : null}
          </UI.Stack>) : null}
        <Keeping job={job}/>
      </UI.Stack>
    </UI.Box>);
}
export function Viewer({ job, title, price, lock, busy, studio, onRefine, onRetake, onApplied, onDiscarded, onMade, onLookSaved }: {
    job: ImageJob;
    title: string;
    price: number | null | undefined;
    lock: LockInfo | null;
    busy: boolean;
    studio?: StudioInfo | null;
    onRefine: (tweak: string) => void;
    onRetake: (brief: string) => void;
    onApplied: (j: ImageJob) => void;
    onDiscarded: (j: ImageJob) => void;
    onMade?: (ids: string[], what: string) => void;
    onLookSaved?: () => void;
}) {
    const { words: storeWords } = useStore();
    const [view, setView] = useState<'compare' | 'new'>('new');
    const [alt, setAlt] = useState(job.altSuggestion ?? title);
    const [words, setWords] = useState(job.enhancedBrief ?? job.brief);
    const [showWords, setShowWords] = useState(false);
    const [working, setWorking] = useState<string | null>(null);
    const [error, setError] = usePageError();
    const shot = PRODUCT_SHOT_ORDER.find((s) => s === job.purpose) ?? null;
    async function add(makeMain: boolean, target: 'product' | 'files' = 'product') {
        const r = await act(() => api<{
            kind: string;
            verified?: boolean;
            message?: string;
            url?: string;
        }>(`images/jobs/${job.id}/apply`, { method: 'POST', body: { alt, makeMain, target } }), (b) => setWorking(b ? (target === 'files' ? 'files' : makeMain ? 'main' : 'add') : null), setError);
        if (r.ok && r.data) {
            if (r.data.kind === 'file')
                toastSuccess('Saved to your store’s Files');
            else {
                toastWrite(r.data.verified === true, makeMain ? 'Added as the main image and confirmed' : 'Added to the product and confirmed', 'Image added');
                if (!r.data.verified && r.data.message)
                    setError({ message: r.data.message, planLink: false, kind: 'refused' });
            }
            onApplied({ ...job, status: 'applied', ...(r.data.kind === 'file' ? { shopifyFileUrl: r.data.url ?? null } : {}) });
        }
    }
    const filesOnly = goesToFiles(job);
    const [formats, setFormats] = useState<ChannelFormat[]>([]);
    const [lookName, setLookName] = useState('');
    async function makeFormats() {
        const r = await act(() => api<{
            jobs: string[];
        }>(`images/jobs/${job.id}/formats`, { method: 'POST', body: { formats } }), (b) => setWorking(b ? 'formats' : null), setError);
        if (r.ok && r.data)
            onMade?.(r.data.jobs, formats.length === 1 ? 'Making the format' : `Making ${formats.length} formats`);
    }
    async function saveLook() {
        const r = await act(() => api<{
            id: string;
            name: string;
        }>('images/looks', { method: 'POST', body: { jobId: job.id, name: lookName } }), (b) => setWorking(b ? 'look' : null), setError);
        if (r.ok) {
            toastSuccess(`Saved “${lookName.trim()}”: choose it under Your looks on any product`);
            setLookName('');
            onLookSaved?.();
        }
    }
    const allowance = studio?.plan?.allowance ?? null;
    const lockedBy = studio?.plan?.lockedBy;
    const formatLock = planLock('Formats for social posts, ads and banners are not in your plan.', lockedBy?.formats);
    const lookLock = planLock(`Your plan keeps ${allowance?.savedLooks ?? 0} saved look${allowance?.savedLooks === 1 ? '' : 's'}; remove one in the shoot to save another.`, lockedBy?.looks);
    const formatPrice = price === null || price === undefined ? price : price * formats.length;
    async function discard() {
        const r = await act(() => api(`images/jobs/${job.id}/discard`, { method: 'POST' }), (b) => setWorking(b ? 'discard' : null), setError);
        if (r.ok)
            onDiscarded({ ...job, status: 'discarded' });
    }
    const ready = job.status === 'ready';
    return (<UI.Stack gap="base">
      <ErrorBanner error={error} onDismiss={error ? () => setError(null) : undefined}/>
      
      <UI.Grid gridTemplateColumns="repeat(auto-fit, minmax(min(280px, 100%), 1fr))" gap="large">
        <UI.Stack gap="base">
          {job.sourceUrl && !job.format ? (<UI.Stack direction="inline" gap="small-200">
              <UI.PressButton pressed={view === 'new'} onClick={() => setView('new')}>
                New image
              </UI.PressButton>
              <UI.PressButton pressed={view === 'compare'} onClick={() => setView('compare')}>
                Compare with your photo
              </UI.PressButton>
            </UI.Stack>) : null}
          {view === 'compare' && job.sourceUrl && job.imageUrl && !job.format ? (<CompareSlider original={job.sourceUrl} made={job.imageUrl} title={title}/>) : job.imageUrl ? (<UI.Image src={job.imageUrl} alt={alt} aspectRatio={job.format ? FORMAT_RATIO[job.format] : '1/1'} objectFit="contain" borderRadius="large"/>) : null}
          {job.imageUrl ? (<UI.Stack direction="inline">
              <UI.Link href={job.imageUrl} target="_blank">
                View full size
              </UI.Link>
            </UI.Stack>) : null}
          
          {job.matches ? (<UI.Box background="subdued" borderRadius="base" padding="small-200">
              <UI.Stack gap="small-100">
                <UI.Badge tone="info" icon="check-circle">Matches your product</UI.Badge>
                <UI.Text color="subdued">{SAME_PRODUCT_REPORT}</UI.Text>
              </UI.Stack>
            </UI.Box>) : null}
          <UI.Text color="subdued">Look closely at labels, small print and colours at full size before you add it.</UI.Text>
        </UI.Stack>

        <UI.Stack gap="base">
          
          {ready && job.funding === 'free_preview' && studio && !studio.plan?.allowance ? (<UI.Stack gap="small-200">
              <UI.Badge>Free preview</UI.Badge>
              <UI.Text color="subdued">This preview shows what the studio makes for your product. Choose a plan to add photos like it to your store.</UI.Text>
              <UI.Stack direction="inline">
                <UI.Button variant="primary" href={APP_PATHS.plan}>
                  See plans
                </UI.Button>
              </UI.Stack>
            </UI.Stack>) : ready ? (<UI.Stack gap="small-200">
              <UI.TextField label="Alt text" details="What the image shows, for screen readers and search." value={alt} maxLength={512} error={fieldError(error, 'imageAlt') ?? (alt.trim() ? undefined : 'Describe the image.')} onInput={(e) => setAlt(e.currentTarget.value)}/>
              <UI.Stack direction="inline" gap="small-200">
                {filesOnly ? null : (<UI.Button variant="primary" disabled={!alt.trim() || working !== null || undefined} loading={working === 'add' || undefined} onClick={() => void add(false)}>
                    Add to product
                  </UI.Button>)}
                {job.format ? null : (<UI.Button disabled={!alt.trim() || working !== null || undefined} loading={working === 'main' || undefined} onClick={() => void add(true)}>
                    Add as main image
                  </UI.Button>)}
                {job.format ? (<UI.Button variant={filesOnly ? 'primary' : 'secondary'} disabled={!alt.trim() || working !== null || undefined} loading={working === 'files' || undefined} onClick={() => void add(false, 'files')}>
                    {`Save to ${storeWords.files}`}
                  </UI.Button>) : null}
                <UI.Button variant="tertiary" disabled={working !== null || undefined} loading={working === 'discard' || undefined} onClick={() => void discard()}>
                  Discard
                </UI.Button>
              </UI.Stack>
              <UI.Text color="subdued">
                {filesOnly
                ? `Saved to ${storeWords.fileLibrary}, ready for social posts, ads and banners. `
                : 'Added beside your current images: nothing is replaced, and you can undo it from Settings › Changes. '}
                {AI_LABEL_NOTE}
              </UI.Text>
            </UI.Stack>) : job.status === 'applied' ? (<UI.Badge tone="success">{job.shopifyFileUrl ? 'Saved to your store’s Files' : 'Added to the product'}</UI.Badge>) : null}

          
          {studio && isFinishedPhoto(job) ? (<>
              <UI.Stack gap="small-200">
                <UI.Text type="strong">Formats for social and ads</UI.Text>
                <UI.Text color="subdued">The same photo re-made for another frame, checked to be your product like every photo.</UI.Text>
                <UI.Stack gap="small-100">
                  {studio.formats.map((f) => (<UI.Checkbox key={f.id} label={`${f.label}: ${f.use}`} checked={formats.includes(f.id) || undefined} disabled={!!formatLock || undefined} onChange={(e) => {
                    const on = e.currentTarget.checked === true;
                    setFormats((all) => (on ? (all.includes(f.id) ? all : [...all, f.id]) : all.filter((x) => x !== f.id)));
                }}/>))}
                </UI.Stack>
                <UI.Stack direction="inline">
                  {formats.length === 0 && !formatLock ? (<UI.Button disabled>Choose a format</UI.Button>) : (<PricedButton label={formats.length > 1 ? `Make ${formats.length} formats` : 'Make the format'} credits={formats.length > 0 ? formatPrice : price} lock={formatLock ?? lock} busy={working === 'formats' || busy} onClick={() => void makeFormats()}/>)}
                </UI.Stack>
              </UI.Stack>
              <UI.Stack gap="small-200">
                <UI.Text type="strong">Save this look</UI.Text>
                <UI.Text color="subdued">{`Keep this shot and its style to use on your other products: ${job.shot ?? 'this shot'}.`}</UI.Text>
                {lookLock ? (<UI.Text color="subdued">{`${lookLock.reason} Available on ${lookLock.planNeeded}.`}</UI.Text>) : (<UI.Stack direction="inline" gap="small-200" alignItems="end">
                    <UI.TextField label="Name" placeholder="For example: Autumn plinth" value={lookName} maxLength={LOOK_NAME_MAX} error={fieldError(error, 'lookName')} onInput={(e) => setLookName(e.currentTarget.value)}/>
                    <UI.Button disabled={!lookName.trim() || working !== null || undefined} loading={working === 'look' || undefined} onClick={() => void saveLook()}>
                      Save look
                    </UI.Button>
                  </UI.Stack>)}
              </UI.Stack>
            </>) : null}

          {shot && !job.format ? (<UI.Stack gap="small-200">
              <UI.Text type="strong">Change something</UI.Text>
              <UI.Text color="subdued">A new take of this shot with one thing changed. It is a new image, at the same price.</UI.Text>
              <UI.Stack direction="inline" gap="small-200">
                {TWEAK_CHOICES.filter((t) => t.shots.includes(shot)).map((t) => (<UI.Button key={t.id} disabled={busy || !!lock || price === null || price === undefined || undefined} onClick={() => onRefine(t.id)}>
                    {t.label}
                  </UI.Button>))}
              </UI.Stack>
            </UI.Stack>) : null}

          
          {job.format ? null : (<UI.Stack gap="small-200">
            <UI.Button variant="tertiary" onClick={() => setShowWords((x) => !x)}>
              {showWords ? 'Hide how it was shot' : 'How it was shot'}
            </UI.Button>
            {showWords ? (<UI.Stack gap="small-200">
                <UI.TextArea label="The description we wrote for this image" details="Change anything you like; we use your changes as ideas when we write the next one." value={words} rows={6} maxLength={IMAGE_BRIEF_MAX} onInput={(e) => setWords(e.currentTarget.value)}/>
                <PricedButton label="Make another from these words" credits={price} lock={lock} busy={busy} onClick={() => onRetake(words.slice(0, IMAGE_BRIEF_MAX))}/>
              </UI.Stack>) : null}
          </UI.Stack>)}
        </UI.Stack>
      </UI.Grid>
    </UI.Stack>);
}
export interface StudioPhoto {
    fileId: string;
    url: string | null;
    position: number;
    width?: number | null;
    height?: number | null;
}
export function PhotoStudio({ product, photos, suggestedShot, price, lock, onApplied }: {
    product: {
        productId: string;
        title: string | null;
    };
    photos: StudioPhoto[];
    suggestedShot: ProductShot;
    price: number | null | undefined;
    lock: LockInfo | null;
    onApplied?: () => void;
}) {
    const usable = photos.filter((p): p is StudioPhoto & {
        url: string;
    } => !!p.url);
    const title = product.title ?? 'this product';
    const [shot, setShot] = useState<ProductShot>(suggestedShot);
    const [styles, setStyles] = useState<Record<ProductShot, ShootOptions>>({ studio: DEFAULT_SHOOT, on_model: DEFAULT_SHOOT, in_action: DEFAULT_SHOOT });
    const [age, setAge] = useState<AgeChoice>('auto');
    const [ideas, setIdeas] = useState('');
    const [takes, setTakes] = useState<number>(2);
    const [refs, setRefs] = useState<string[]>(usable.slice(0, REFERENCES_MAX).map((p) => p.fileId));
    const [busy, setBusy] = useState(false);
    const [error, setError] = usePageError();
    const gallery = useGallery(`images/jobs?productId=${encodeURIComponent(product.productId)}`);
    const [selected, setSelected] = useState<string[]>([]);
    const [open, setOpen] = useState<ImageJob | null>(null);
    const [adding, setAdding] = useState(false);
    const viewer = useModal('studio-viewer');
    const studio = useLoad<StudioInfo>('images/studio');
    const looksAll = useLoad<{
        looks: Array<StudioLook | {
            purpose: 'blog';
        }>;
    }>('images/looks');
    const looks = { ...looksAll, data: looksAll.data ? { looks: looksAll.data.looks.filter((l): l is StudioLook => l.purpose !== 'blog') } : null };
    const shopper = useLoad<ShopperView>(`images/compare?productId=${encodeURIComponent(product.productId)}`);
    const productNum = /\/(\d+)$/.exec(product.productId)?.[1] ?? null;
    const maxTakes = studio.data?.plan?.allowance?.maxTakes ?? TAKE_CHOICES.length;
    const takesLockedBy = studio.data?.plan?.lockedBy.takes ?? null;
    const shownTakes = Math.min(takes, maxTakes);
    const opts = styles[shot];
    const choices = shootChoices(shot, opts.place);
    const ordered = usable.filter((p) => refs.includes(p.fileId)).map((p) => p.fileId);
    const main = photos.find((p) => p.position === 1) ?? null;
    const readiness = merchantReadiness(main ? { width: main.width ?? null, height: main.height ?? null } : null);
    const [finePrint, setFinePrint] = useState<{
        key: string;
        present: boolean;
        where: string | null;
    } | null>(null);
    const refsKey = ordered.join(',');
    useEffect(() => {
        if (!refsKey)
            return;
        let live = true;
        void api<{
            finePrint: {
                present: boolean;
                where: string | null;
            } | null;
        }>('images/fine-print', { method: 'POST', body: { productId: product.productId, mediaIds: refsKey.split(',') } }).then((r) => {
            if (live && r.ok && r.data?.finePrint)
                setFinePrint({ key: refsKey, ...r.data.finePrint });
        });
        return () => {
            live = false;
        };
    }, [product.productId, refsKey]);
    const smallPrint = finePrint && finePrint.key === refsKey && finePrint.present ? finePrint : null;
    async function shoot(body: Record<string, unknown>, count: number) {
        const r = await act(() => api<{
            jobs: string[];
        }>('images/generate', { method: 'POST', body }), setBusy, setError);
        if (r.ok && r.data) {
            toastSuccess(count > 1 ? `Shooting ${count} takes` : 'Shooting');
            gallery.add(r.data.jobs);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }
    function create() {
        void shoot({ purpose: shot, products: [{ productId: product.productId, mediaId: ordered[0] ?? null, title: product.title }], references: ordered, options: opts, takes: shownTakes, brief: ideas, age }, shownTakes);
    }
    function applyLook(look: StudioLook) {
        setShot(look.purpose);
        setStyles((all) => ({ ...all, [look.purpose]: { ...DEFAULT_SHOOT, ...look.options } }));
        toastSuccess(`Using “${look.name}”`);
    }
    async function removeLook(look: StudioLook) {
        const r = await act(() => api(`images/looks/${look.id}`, { method: 'DELETE' }), () => undefined, setError);
        if (r.ok) {
            void looks.reload();
            void studio.reload();
        }
    }
    async function refine(job: ImageJob, tweak: string) {
        viewer.hide();
        await shoot({ refineOf: job.id, tweak }, 1);
    }
    async function retake(job: ImageJob, words: string) {
        viewer.hide();
        const s = PRODUCT_SHOT_ORDER.find((x) => x === job.purpose) ?? shot;
        await shoot({ purpose: s, products: [{ productId: product.productId, mediaId: ordered[0] ?? null, title: product.title }], references: ordered, options: job.options ?? opts, takes: 1, brief: words, age }, 1);
    }
    async function addSelected() {
        setAdding(true);
        setError(null);
        let added = 0;
        for (const id of selected) {
            const job = gallery.jobs?.find((j) => j.id === id);
            if (!job || job.status !== 'ready')
                continue;
            const r = await api<{
                verified: boolean;
                message: string;
            }>(`images/jobs/${id}/apply`, { method: 'POST', body: { alt: job.altSuggestion ?? title, makeMain: false } });
            if (r.ok) {
                added++;
                gallery.replace({ ...job, status: 'applied' });
            }
            else {
                setError({ message: r.error ?? 'An image could not be added. The others were.', planLink: false });
                break;
            }
        }
        setAdding(false);
        setSelected([]);
        if (added > 0) {
            toastSuccess(added === 1 ? 'Added to the product' : `${added} images added to the product`);
            onApplied?.();
        }
    }
    const total = price === null || price === undefined ? price : price * shownTakes;
    const making = (gallery.jobs ?? []).some(isMaking);
    const shown = (gallery.jobs ?? []).filter((j) => j.purpose !== 'blog' && j.status !== 'discarded');
    if (usable.length === 0) {
        return (<UI.Section heading="Add a photo first">
        <UI.Paragraph>This product has no photo. The studio always starts from your own photos, so it never shows a product that does not match what you sell. Add one on the product’s page, then come back.</UI.Paragraph>
      </UI.Section>);
    }
    return (<>
      <ErrorBanner error={error} onDismiss={error ? () => setError(null) : undefined}/>
      
      {shown.length > 0 || gallery.error ? (<UI.Section heading="Your photos from the studio">
          <UI.Stack gap="base">
            {selected.length > 0 ? (<UI.Stack direction="inline" gap="base" alignItems="center">
                <UI.Text>{selected.length === 1 ? '1 selected' : `${selected.length} selected`}</UI.Text>
                <UI.Button variant="primary" loading={adding || undefined} disabled={adding || undefined} onClick={() => void addSelected()}>
                  {selected.length === 1 ? 'Add to product' : `Add ${selected.length} to product`}
                </UI.Button>
                <UI.Button variant="tertiary" disabled={adding || undefined} onClick={() => setSelected([])}>
                  Clear
                </UI.Button>
              </UI.Stack>) : null}
            {gallery.error ? <UI.Text color="subdued">{gallery.error}</UI.Text> : null}
            {shown.length > 0 ? (<UI.Grid gridTemplateColumns="repeat(auto-fill, minmax(min(200px, 100%), 1fr))" gap="base">
                {shown.map((j) => (<Tile key={j.id} job={j} selected={selected.includes(j.id)} onSelect={goesToFiles(j) ? undefined : (on) => setSelected((all) => (on ? (all.includes(j.id) ? all : [...all, j.id]) : all.filter((x) => x !== j.id)))} onOpen={() => {
                        setOpen(j);
                        viewer.show();
                    }}/>))}
              </UI.Grid>) : null}
            {making ? <UI.Text color="subdued">{`Each photo is checked to be your product before it is shown. ${NEVER_CHARGED}`}</UI.Text> : null}
          </UI.Stack>
        </UI.Section>) : null}

      
      <PageColumns main={<>
            <UI.Section heading="Choose the shot">
              
              <div id="studio-choose-shot" aria-hidden="true"/>
              <UI.Grid gridTemplateColumns="repeat(auto-fit, minmax(min(180px, 100%), 1fr))" gap="base">
                {PRODUCT_SHOT_ORDER.map((s) => (<ShotCard key={s} shot={s} selected={s === shot} onSelect={() => setShot(s)}/>))}
              </UI.Grid>
            </UI.Section>

            <UI.Section heading="Style it">
              <UI.Stack gap="base">
                {(looks.data?.looks.length ?? 0) > 0 ? (<UI.Stack gap="small-200">
                    <UI.Text type="strong">Your looks</UI.Text>
                    <UI.Stack direction="inline" gap="small-200">
                      {looks.data!.looks.map((l) => (<UI.Stack key={l.id} direction="inline" gap="small-100" alignItems="center">
                          <UI.Button onClick={() => applyLook(l)} accessibilityLabel={`Use the look ${l.name}: ${l.summary}`}>
                            {l.name}
                          </UI.Button>
                          <UI.Button variant="tertiary" icon="x" onClick={() => void removeLook(l)} accessibilityLabel={`Remove the look ${l.name}`}/>
                        </UI.Stack>))}
                    </UI.Stack>
                    <UI.Text color="subdued">A look sets the shot and its style. Save one from any finished photo.</UI.Text>
                  </UI.Stack>) : null}
                {choices.map((name) => (<ChoiceRow key={name} name={name} value={opts[name]} onChange={(v) => setStyles((all) => ({ ...all, [shot]: { ...all[shot], [name]: v } }))}/>))}
                {shot !== 'studio' ? <AgeSelect value={age} onChange={setAge}/> : null}
                <UI.TextField label="Anything else (optional)" details="In a few words. We write the photographer’s brief from your product, your choices and this." placeholder="For example: autumn leaves, a calm morning" value={ideas} maxLength={IMAGE_REQUEST_MAX} onInput={(e) => setIdeas(e.currentTarget.value)}/>
              </UI.Stack>
            </UI.Section>

            <UI.Section heading="Shoot">
              <UI.Stack gap="base">
                <UI.Stack gap="small-200">
                  <UI.Text type="strong">Takes</UI.Text>
                  <UI.Stack direction="inline" gap="small-200">
                    {TAKE_CHOICES.map((n) => (<UI.PressButton key={n} pressed={n === shownTakes} disabled={n > maxTakes || undefined} onClick={() => setTakes(n)} accessibilityLabel={`${n} ${n === 1 ? 'take' : 'takes'}${n > maxTakes ? ', not in your plan' : ''}`}>
                        {String(n)}
                      </UI.PressButton>))}
                  </UI.Stack>
                  <UI.Text color="subdued">{shownTakes === 1 ? 'One photo of this shot.' : `${shownTakes} different photos of this shot to choose from, each from a new angle. Each is its own image and price.`}</UI.Text>
                  {takesLockedBy && maxTakes < TAKE_CHOICES.length ? <UI.Text color="subdued">{`Your plan makes up to ${maxTakes} takes per shoot. ${takesLockedBy} makes up to ${TAKE_CHOICES.length}.`}</UI.Text> : null}
                </UI.Stack>
                {smallPrint ? (<UI.Box background="subdued" borderRadius="base" padding="small-200">
                    <UI.Stack gap="small-100">
                      <UI.Text type="strong">{`This product has small printed text${smallPrint.where ? `, ${smallPrint.where}` : ''}`}</UI.Text>
                      <UI.Text color="subdued">AI image models often redraw small text wrongly, so the studio turns that part away from the camera. Your larger logos and designs stay as they are. A photo that still changes the text is not kept, and you are not charged for it.</UI.Text>
                    </UI.Stack>
                  </UI.Box>) : null}
                <UI.Stack direction="inline">
                  <PricedButton variant="primary" label={shownTakes === 1 ? 'Create the photo' : `Create ${shownTakes} photos`} credits={total} lock={lock} busy={busy} onClick={create}/>
                </UI.Stack>
                <UI.Text color="subdued">{`Each photo takes about half a minute, and you can leave this page: your photos keep arriving here. ${NEVER_CHARGED}`}</UI.Text>
              </UI.Stack>
            </UI.Section>

            {shopper.data ? (<ShopperSection view={shopper.data} onShoot={() => {
                    const el = document.getElementById('studio-choose-shot');
                    if (el)
                        window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 16, behavior: 'smooth' });
                }}/>) : null}
          </>} side={<>
            {shopper.data ? <AfterImagesSection view={shopper.data} productNum={productNum}/> : null}

            <UI.Section heading="Photos the studio studies">
              <UI.Stack gap="base">
                <UI.Text color="subdued">{`Tick up to ${REFERENCES_MAX}: the product whole and in even light works best. The first one ticked sets the angle.`}</UI.Text>
                <UI.Grid gridTemplateColumns="repeat(3, minmax(0, 1fr))" gap="small-200">
                  {usable.map((p) => {
                const on = refs.includes(p.fileId);
                const full = !on && refs.length >= REFERENCES_MAX;
                return (<UI.Clickable key={p.fileId} onClick={() => (full ? undefined : setRefs((all) => (on ? (all.length > 1 ? all.filter((x) => x !== p.fileId) : all) : [...all, p.fileId])))} accessibilityLabel={`Photo ${p.position}${on ? ', studied' : ''}`} border={on ? 'large-100 strong' : 'base'} borderRadius="base" padding="small-100" disabled={full || undefined}>
                        <UI.Image src={p.url} alt={`Photo ${p.position} of ${title}`} aspectRatio="1/1" objectFit="cover" borderRadius="small"/>
                      </UI.Clickable>);
            })}
                </UI.Grid>
              </UI.Stack>
            </UI.Section>

            
            <UI.Section heading="Ready for Google Shopping">
              <UI.Stack gap="small-200">
                {readiness.state === 'unknown' ? null : <UI.Badge tone={readiness.state === 'ok' ? 'success' : 'warning'}>{readiness.state === 'ok' ? 'Main image meets Google’s size' : readiness.state === 'blocked' ? 'Main image too small for Google' : 'Main image below Google’s recommended size'}</UI.Badge>}
                <UI.Text color="subdued">{readiness.line}</UI.Text>
                <UI.Text color="subdued">{MERCHANT_IMAGE_RULES}</UI.Text>
              </UI.Stack>
            </UI.Section>

            <UI.Section heading="How the studio works">
              <UI.UnorderedList>
                <UI.ListItem>It starts from your own photos and keeps the product exactly as it is: colours, print, logos and every part.</UI.ListItem>
                <UI.ListItem>Each photo is checked to be your product before you see it. {NEVER_CHARGED}</UI.ListItem>
                <UI.ListItem>Nothing is added to the product until you choose it, beside your current images, and you can undo it from Settings › Changes.</UI.ListItem>
              </UI.UnorderedList>
            </UI.Section>
          </>}/>

      <UI.Modal id={viewer.id} heading={open?.shot ?? 'Your photo'} size="large">
        {open ? (<Viewer key={open.id} job={open} title={title} price={price} lock={lock} busy={busy} studio={studio.data} onRefine={(t) => void refine(open, t)} onRetake={(w) => void retake(open, w)} onMade={(ids, what) => {
                viewer.hide();
                setOpen(null);
                toastSuccess(what);
                gallery.add(ids);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }} onLookSaved={() => {
                void looks.reload();
                void studio.reload();
            }} onApplied={(j) => {
                gallery.replace(j);
                setOpen(j);
                setSelected((all) => all.filter((x) => x !== j.id));
                onApplied?.();
            }} onDiscarded={(j) => {
                gallery.replace(j);
                viewer.hide();
                setOpen(null);
            }}/>) : null}
        <UI.Button slot="secondary-actions" commandFor={viewer.id} command="--hide">
          Close
        </UI.Button>
      </UI.Modal>
    </>);
}
export function FreePhotoCard() {
    const [data, setData] = useState<{
        install: ImageJob | null;
        previews: ImageJob[];
    } | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = usePageError();
    const making = !!data && [data.install, ...data.previews].some((j) => j && isMaking(j));
    useEffect(() => {
        let live = true;
        const read = () => void api<{
            install: ImageJob | null;
            previews: ImageJob[];
        }>('images/free').then((r) => {
            if (live && r.ok && r.data)
                setData(r.data);
        });
        read();
        const t = making ? setInterval(read, POLL_MS) : null;
        return () => {
            live = false;
            if (t)
                clearInterval(t);
        };
    }, [making]);
    const job = data?.install ?? null;
    if (!job || job.status === 'failed' || job.status === 'discarded')
        return null;
    const title = job.productTitle ?? 'your product';
    async function add() {
        if (!job)
            return;
        const r = await act(() => api<{
            verified: boolean;
            message: string;
        }>(`images/jobs/${job.id}/apply`, { method: 'POST', body: { alt: job.altSuggestion ?? title, makeMain: false } }), setBusy, setError);
        if (r.ok && r.data) {
            toastWrite(r.data.verified, 'Added to the product and confirmed', 'Image added');
            setData((d) => (d ? { ...d, install: { ...job, status: 'applied' } } : d));
        }
    }
    const previews = (data?.previews ?? []).filter((p) => p.status === 'ready' && p.imageUrl);
    return (<UI.Section heading="Your first studio photo, on us">
      <UI.Stack gap="base">
        <ErrorBanner error={error} onDismiss={error ? () => setError(null) : undefined}/>
        {isMaking(job) ? (<UI.Grid gridTemplateColumns="repeat(auto-fit, minmax(min(220px, 100%), 1fr))" gap="base">
            <MakingTile job={job}/>
            <UI.Stack gap="small-200">
              <UI.Text type="strong">{`We are making a studio photo of ${title} for you.`}</UI.Text>
              <UI.Text color="subdued">It starts from your own photo and is checked to be your product before you see it. It takes about a minute, and it is free.</UI.Text>
            </UI.Stack>
          </UI.Grid>) : (<>
            
            <UI.Grid gridTemplateColumns="repeat(auto-fill, minmax(min(200px, 100%), 260px))" gap="base">
              {job.sourceUrl ? (<UI.Stack gap="small-200">
                  <UI.Image src={job.sourceUrl} alt={`Your photo of ${title}`} aspectRatio="1/1" objectFit="contain" borderRadius="large"/>
                  <UI.Text color="subdued">Your photo</UI.Text>
                </UI.Stack>) : null}
              {job.imageUrl ? (<UI.Stack gap="small-200">
                  <UI.Image src={job.imageUrl} alt={job.altSuggestion ?? `Studio photo of ${title}`} aspectRatio="1/1" objectFit="cover" borderRadius="large"/>
                  <UI.Text color="subdued">Studio photo</UI.Text>
                </UI.Stack>) : null}
            </UI.Grid>
            {job.matches ? <UI.Badge tone="info" icon="check-circle">Matches your product</UI.Badge> : null}
            <UI.Stack direction="inline" gap="small-200" alignItems="center">
              {job.status === 'ready' ? (<UI.Button variant="primary" loading={busy || undefined} disabled={busy || undefined} onClick={() => void add()}>
                  Add to product
                </UI.Button>) : (<UI.Badge tone="success">{`Added to ${title}`}</UI.Badge>)}
              <UI.Link href={APP_PATHS.productImages}>Open the Image studio</UI.Link>
            </UI.Stack>
          </>)}
        {previews.length > 0 ? (<UI.Stack gap="small-200">
            <UI.Text type="strong">{`${title}, on a model and in action`}</UI.Text>
            <UI.Grid gridTemplateColumns="repeat(auto-fill, minmax(min(140px, 100%), 180px))" gap="base">
              {previews.map((p) => (<UI.Image key={p.id} src={p.imageUrl!} alt={p.altSuggestion ?? ''} aspectRatio="1/1" objectFit="cover" borderRadius="base"/>))}
            </UI.Grid>
            <UI.Text color="subdued">Previews of what the studio makes for your products. Choose a plan to make photos like these and add them to your store.</UI.Text>
            <UI.Stack direction="inline">
              <UI.Button href={APP_PATHS.plan}>See plans</UI.Button>
            </UI.Stack>
          </UI.Stack>) : null}
      </UI.Stack>
    </UI.Section>);
}
