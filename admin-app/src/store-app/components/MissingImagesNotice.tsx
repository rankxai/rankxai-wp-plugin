import { useState } from 'react';
import { api, toastSuccess } from '../api';
import { usePlan } from '../plan-context';
import { ErrorBanner, act, creditsLabel, useLoad, usePageError } from '../kit';
import { useModal } from './FixModals';
import * as UI from '../ui';
interface Missing {
    articles: Array<{
        id: string;
        title: string | null;
    }>;
    total: number;
    price: number | null;
}
export function MissingImagesNotice() {
    const missing = useLoad<Missing>('images/blog-missing');
    const looks = useLoad<{
        looks: Array<{
            purpose: string;
            name: string;
            options: unknown;
        }>;
    }>('images/looks');
    const { plan } = usePlan();
    const modal = useModal('blog-fill-images');
    const [error, setError] = usePageError();
    const [busy, setBusy] = useState(false);
    const d = missing.data;
    if (!d || d.total === 0)
        return null;
    const lock = plan?.locks.access ?? null;
    const blogLook = [...(looks.data?.looks ?? [])].reverse().find((l) => l.purpose === 'blog') ?? null;
    const count = d.articles.length;
    const total = d.price === null ? null : d.price * count;
    async function fill() {
        const r = await act(() => api<{
            started: number;
        }>('images/blog-fill', { method: 'POST', body: { articleIds: d!.articles.map((a) => a.id), options: blogLook?.options ?? null } }), setBusy, setError);
        if (r.ok && r.data) {
            modal.hide();
            toastSuccess(`Making ${r.data.started} ${r.data.started === 1 ? 'image' : 'images'}. Each waits on its article’s page for you to use it.`);
            void missing.reload();
        }
    }
    return (<UI.Stack gap="small-200">
      <UI.Stack direction="inline" gap="small-200" alignItems="center">
        <UI.Text>{d.total === 1 ? '1 article has no featured image.' : `${d.total} articles have no featured image.`}</UI.Text>
        <UI.Button variant="tertiary" commandFor={modal.id} command="--show">
          Make images for them
        </UI.Button>
      </UI.Stack>
      <UI.Modal id={modal.id} heading="Make featured images" size="base">
        <UI.Stack gap="base">
          <ErrorBanner error={error} onDismiss={error ? () => setError(null) : undefined}/>
          <UI.Paragraph>
            {`One image for each of ${count === 1 ? 'this article' : `these ${count} articles`}, made from the article${blogLook ? ` in your blog look, “${blogLook.name}”` : ''}. Nothing is added to an article until you use its image on the article’s page.`}
          </UI.Paragraph>
          <UI.UnorderedList>
            {d.articles.map((a) => (<UI.ListItem key={a.id}>{a.title ?? 'An untitled article'}</UI.ListItem>))}
          </UI.UnorderedList>
          {d.total > count ? <UI.Text color="subdued">{`${d.total - count} more after these. Make these first.`}</UI.Text> : null}
          {lock ? <UI.Text color="subdued">{`${lock.reason}${lock.planNeeded ? ` Available on ${lock.planNeeded}.` : ''}`}</UI.Text> : null}
          {total === null ? <UI.Text color="subdued">The price could not be read just now, so this is unavailable.</UI.Text> : null}
          <UI.Text color="subdued">An image that cannot be made is not charged.</UI.Text>
        </UI.Stack>
        
        <UI.Button slot="primary-action" variant="primary" disabled={!!lock || total === null || busy || undefined} loading={busy || undefined} onClick={() => void fill()}>
          {`${count === 1 ? 'Make 1 image' : `Make ${count} images`}${total === null ? '' : ` · ${creditsLabel(total)}`}`}
        </UI.Button>
        <UI.Button slot="secondary-actions" commandFor={modal.id} command="--hide">
          Close
        </UI.Button>
      </UI.Modal>
    </UI.Stack>);
}
