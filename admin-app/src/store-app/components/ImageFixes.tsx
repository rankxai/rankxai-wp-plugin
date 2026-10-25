import { useState } from 'react';
import { oversizedGuidance, tooSmallGuidance } from '@/lib/shopify-app/image-guidance-copy';
import { api, toastSuccess } from '../api';
import { toastWrite } from '../reviews';
import { usePlan, useStore } from '../plan-context';
import { fmtCount, fmtNumber } from '../format';
import { AdminButton, AdminLink, ErrorBanner, GoButton, PricedButton, act, fieldError, useLoad, usePageError, type PageError } from '../kit';
import type { ModalHandle, WriteResult } from './FixModals';
import { StatusBadge } from './Status';
import { productImagesHref } from '@/lib/shopify-app/app-routes-core';
import * as UI from '../ui';
interface ImageIssueView {
    code: string;
    label: string;
    detail: string | null;
}
interface ImageRowView {
    fileId: string;
    position: number;
    url: string | null;
    alt: string | null;
    fileName: string | null;
    issues: ImageIssueView[];
    largeOriginal?: string | null;
    suggestedFileName: string | null;
}
interface ImagesData {
    product: {
        id: string;
        title: string | null;
        adminPath: string;
    };
    images: ImageRowView[];
    complete: boolean;
    failed?: number;
    prices: {
        writeAlt: number | null;
        makeImage?: number | null;
    };
}
const ROWS_COLLAPSED = 10;
function splitName(name: string | null): {
    stem: string;
    ext: string;
} {
    if (!name)
        return { stem: '', ext: '' };
    const i = name.lastIndexOf('.');
    return i > 0 ? { stem: name.slice(0, i), ext: name.slice(i + 1).toLowerCase() } : { stem: name, ext: '' };
}
export function ImagesModal({ modal, product, onChanged }: {
    modal: ModalHandle;
    product: {
        productId: string;
        title: string | null;
    } | null;
    onChanged: () => void;
}) {
    return (<UI.Modal id={modal.id} heading={product ? `Images for ${product.title ?? 'this product'}` : 'Images'} size="large">
      {product ? <ImageList key={product.productId} productId={product.productId} onChanged={onChanged}/> : null}
      <UI.Button slot="secondary-actions" commandFor={modal.id} command="--hide">
        Close
      </UI.Button>
    </UI.Modal>);
}
export function ImageList({ productId, onChanged }: {
    productId: string;
    onChanged: () => void;
}) {
    const { words } = useStore();
    const load = useLoad<ImagesData>(`catalogue/images?productId=${encodeURIComponent(productId)}`);
    const [error, setError] = usePageError();
    const [all, setAll] = useState(false);
    const d = load.data;
    if (!d)
        return load.error ? <ErrorBanner error={load.error}/> : <UI.Text color="subdued">Reading the product’s images…</UI.Text>;
    const failedNote = d.failed ? `${words.imageHost} could not process ${fmtCount(d.failed, 'image', 'images')} on this product, so ${d.failed === 1 ? 'it has' : 'they have'} no picture. Delete and upload ${d.failed === 1 ? 'it' : 'them'} again on the product’s page.` : null;
    if (d.images.length === 0) {
        return (<UI.Stack gap="base">
        {failedNote ? <UI.Paragraph>{failedNote}</UI.Paragraph> : null}
        <UI.Paragraph>This product has no images. Add at least one on the product’s page: AI shopping cannot show a product without one.</UI.Paragraph>
        <UI.Stack direction="inline">
          <AdminButton path={`/products/${productId.split('/').pop()}`} label="Edit product"/>
        </UI.Stack>
      </UI.Stack>);
    }
    const withIssues = d.images.filter((i) => i.issues.length > 0).length;
    const shown = all || d.images.length <= ROWS_COLLAPSED ? d.images : d.images.slice(0, ROWS_COLLAPSED);
    return (<UI.Stack gap="base">
      <ErrorBanner error={error} onDismiss={error ? () => setError(null) : undefined}/>
      {failedNote ? <UI.Paragraph>{failedNote}</UI.Paragraph> : null}
      <UI.Text color="subdued">
        {withIssues === 0
            ? 'Nothing to fix on these images in what we check.'
            : `${fmtCount(withIssues, 'image needs', 'images need')} attention.${d.complete ? '' : ' Only the first images were read.'}`}
      </UI.Text>
      {shown.map((img, i) => (<UI.Stack key={img.fileId} gap="base">
          {i > 0 ? <UI.Divider /> : null}
          <ImageBlock img={img} productId={productId} price={d.prices.writeAlt} setError={setError} onChanged={onChanged}/>
        </UI.Stack>))}
      {d.images.length > ROWS_COLLAPSED ? (<UI.Button variant="tertiary" onClick={() => setAll((x) => !x)}>
          {all ? 'Show fewer' : `Show all ${fmtNumber(d.images.length)}`}
        </UI.Button>) : null}
      <UI.Divider />
      
      <UI.Stack direction="inline">
        <GoButton href={productImagesHref(productId)} label="Open the image studio"/>
      </UI.Stack>
    </UI.Stack>);
}
function ImageBlock({ img, productId, price, setError, onChanged }: {
    img: ImageRowView;
    productId: string;
    price: number | null;
    setError: (e: PageError | null) => void;
    onChanged: () => void;
}) {
    const { platform, words } = useStore();
    const { plan, reload: reloadPlan } = usePlan();
    const access = plan?.locks.access ?? null;
    const name = splitName(img.fileName);
    const suggested = splitName(img.suggestedFileName);
    const [alt, setAlt] = useState(img.alt ?? '');
    const [busy, setBusy] = useState<string | null>(null);
    const [altError, setAltError] = useState<PageError | null>(null);
    const routeAltError = (e: PageError | null) => {
        setAltError(e?.field ? e : null);
        if (!e?.field)
            setError(e);
    };
    const [savedAlt, setSavedAlt] = useState<WriteResult | null>(null);
    const altIssue = img.issues.some((i) => i.code.startsWith('alt_'));
    const nameIssue = img.issues.some((i) => i.code === 'filename_camera');
    const tooSmall = img.issues.some((i) => i.code === 'too_small');
    async function writeWithAi() {
        const r = await act(() => api<{
            suggestion: string;
        }>('fixes/image/alt-suggest', { method: 'POST', body: { fileId: img.fileId, productId } }), (b) => setBusy(b ? 'ai' : null), setError);
        if (r.ok && r.data) {
            setAlt(r.data.suggestion);
            toastSuccess('Written. Review it, then save.');
            void reloadPlan();
        }
    }
    async function saveAlt() {
        const r = await act(() => api<WriteResult>('fixes/alt', { method: 'POST', body: { fileId: img.fileId, alt } }), (b) => setBusy(b ? 'alt' : null), routeAltError);
        if (r.ok && r.data) {
            setSavedAlt(r.data);
            toastWrite(r.data.verified, 'Saved and confirmed on your store', 'Saved');
            onChanged();
        }
    }
    async function undo(which: 'alt') {
        const changeId = savedAlt?.changeId;
        if (!changeId)
            return;
        const r = await act(() => api(`changes/${changeId}/undo`, { method: 'POST' }), (b) => setBusy(b ? `undo:${which}` : null), setError);
        if (r.ok) {
            setSavedAlt(null);
            toastSuccess('Change undone');
            onChanged();
        }
    }
    return (<UI.Grid gridTemplateColumns="auto minmax(0, 1fr)" gap="base">
      {img.url ? <UI.Thumbnail src={img.url} alt={img.alt ?? ''} size="large"/> : <UI.Thumbnail alt="" size="large"/>}
      <UI.Stack gap="base">
        <UI.Stack gap="small-100">
          <UI.Text type="strong">{`Image ${img.position}${img.fileName ? ` · ${img.fileName}` : ''}`}</UI.Text>
          {img.issues.length === 0 ? (<UI.Text color="subdued">Nothing to fix in what we check.</UI.Text>) : (img.issues.map((issue) => (<UI.Stack key={issue.code} direction="inline" gap="small-200" alignItems="center">
                <StatusBadge status="needs_attention" label={issue.label}/>
                {issue.detail ? <UI.Text color="subdued">{issue.detail}</UI.Text> : null}
              </UI.Stack>)))}
        </UI.Stack>

        {altIssue || savedAlt ? (<UI.Stack gap="small-200">
            <UI.TextField label="Alt text" details="A few words saying what the picture shows." value={alt} maxLength={512} error={fieldError(altError, 'alt')} onInput={(e) => setAlt(e.currentTarget.value)}/>
            {savedAlt ? (<UI.Stack direction="inline" gap="small-200" alignItems="center">
                <StatusBadge status={savedAlt.verified ? 'saved' : 'saved_unconfirmed'}/>
                {savedAlt.changeId ? (<UI.Button variant="tertiary" disabled={busy !== null || undefined} loading={busy === 'undo:alt' || undefined} onClick={() => void undo('alt')}>
                    Undo
                  </UI.Button>) : null}
              </UI.Stack>) : (<UI.Stack direction="inline" gap="small-200" alignItems="start">
                <UI.Button disabled={!alt.trim() || busy !== null || undefined} loading={busy === 'alt' || undefined} onClick={() => void saveAlt()}>
                  Save alt text
                </UI.Button>
                <PricedButton label="Write with AI" credits={price} lock={access} busy={busy === 'ai'} onClick={() => void writeWithAi()}/>
              </UI.Stack>)}
          </UI.Stack>) : null}

        {nameIssue && name.ext ? (<UI.Stack gap="small-200">
            <UI.Text color="subdued">
              {suggested.stem ? `A clearer name: ${suggested.stem}.${name.ext}. ` : ''}
              {words.renameImage}
            </UI.Text>
            <AdminLink path="/content/files">{`Open ${words.filesPlace}`}</AdminLink>
          </UI.Stack>) : null}

        {tooSmall ? (<UI.Stack gap="small-200">
            <UI.Text color="subdued">{tooSmallGuidance(platform)}</UI.Text>
            <AdminLink path={`/products/${productId.split('/').pop()}`}>Edit product</AdminLink>
          </UI.Stack>) : null}

        {img.largeOriginal ? (<UI.Text color="subdued">{`Original file: ${img.largeOriginal}. ${oversizedGuidance(platform)}`}</UI.Text>) : null}
      </UI.Stack>
    </UI.Grid>);
}
