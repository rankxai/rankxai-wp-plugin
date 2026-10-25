import { useStore } from '../plan-context';
import { useState } from 'react';
import { useLoad, fieldError, type PageError } from '../kit';
import { useModal } from './FixModals';
import { usePlan } from '../plan-context';
import { BlogImagePanel } from './BlogImagePanel';
import type { ImageJob } from './ImageStudio';
import * as UI from '../ui';
export interface ChosenImage {
    url: string;
    altText: string;
    id?: string;
}
interface StoreImage {
    id: string;
    url: string;
    alt: string | null;
}
export function FeaturedImagePicker({ value, onChange, error, defaultAlt, articleId }: {
    articleId: string;
    value: ChosenImage | null;
    onChange: (v: ChosenImage | null) => void;
    error: PageError | null;
    defaultAlt: string;
}) {
    const { words, platform } = useStore();
    const altEditable = platform !== 'woocommerce';
    const modal = useModal('featured-image');
    const aiModal = useModal('featured-image-ai');
    const [open, setOpen] = useState(false);
    const [aiOpen, setAiOpen] = useState(false);
    const { plan } = usePlan();
    const made = useLoad<{
        jobs: ImageJob[];
    }>(`images/jobs?articleId=${articleId}`);
    const waiting = (made.data?.jobs ?? []).filter((j) => j.purpose === 'blog' && j.status === 'ready' && j.imageUrl);
    const being = (made.data?.jobs ?? []).some((j) => j.purpose === 'blog' && (j.status === 'queued' || j.status === 'generating'));
    return (<UI.Stack gap="small-200">
      <UI.Text type="strong">Featured image</UI.Text>
      {value ? (<UI.Stack direction="inline" gap="base" alignItems="center">
          <UI.Thumbnail src={value.url} alt={value.altText} size="large"/>
          <UI.Stack gap="small-200">
            {altEditable ? (<UI.TextField label="Alt text" details="What the picture shows, for screen readers and search." value={value.altText} maxLength={512} error={fieldError(error, 'imageAlt') ?? (value.altText.trim() ? undefined : 'Describe the image.')} onInput={(e) => onChange({ ...value, altText: e.currentTarget.value })}/>) : (<UI.Text color="subdued">{value.altText.trim() ? `Alt text from your ${words.files}: “${value.altText.trim()}”` : `It keeps the alt text it has in your ${words.files}.`}</UI.Text>)}
            <UI.Stack direction="inline" gap="small-200">
              <UI.Button variant="tertiary" commandFor={modal.id} command="--show" onClick={() => setOpen(true)}>
                Choose another
              </UI.Button>
              <UI.Button variant="tertiary" onClick={() => onChange(null)}>
                Remove
              </UI.Button>
            </UI.Stack>
          </UI.Stack>
        </UI.Stack>) : (<UI.Stack gap="small-200">
          {waiting.length > 0 ? (<UI.Stack direction="inline" gap="base" alignItems="center">
              <UI.Thumbnail src={waiting[0]!.imageUrl!} alt={waiting[0]!.altSuggestion ?? ''} size="large"/>
              <UI.Stack gap="small-200">
                <UI.Text>{waiting.length > 1 ? `${waiting.length} images were made for this article.` : 'An image was made for this article.'}</UI.Text>
                <UI.Stack direction="inline">
                  <UI.Button variant="primary" commandFor={aiModal.id} command="--show" onClick={() => setAiOpen(true)}>
                    Review and use it
                  </UI.Button>
                </UI.Stack>
              </UI.Stack>
            </UI.Stack>) : being ? (<UI.Text color="subdued">An image is being made for this article. It appears here in about a minute.</UI.Text>) : (<UI.Text color="subdued">None chosen. Most themes show the featured image above the article and in the blog list.</UI.Text>)}
          <UI.Stack direction="inline" gap="small-200">
            {waiting.length === 0 ? (<UI.Button variant="primary" commandFor={aiModal.id} command="--show" onClick={() => setAiOpen(true)}>
                Make one with AI
              </UI.Button>) : null}
            <UI.Button commandFor={modal.id} command="--show" onClick={() => setOpen(true)}>
              {`Choose from your ${words.files}`}
            </UI.Button>
          </UI.Stack>
        </UI.Stack>)}
      <UI.Modal id={aiModal.id} heading="Featured image" size="large">
        {aiOpen ? (<BlogImagePanel articleId={articleId} title={defaultAlt} lock={plan?.locks.access ?? null} onUse={(img) => {
                onChange({ url: img.url, altText: img.altText.slice(0, 512), ...(img.id ? { id: img.id } : {}) });
                aiModal.hide();
                void made.reload();
            }}/>) : null}
        <UI.Button slot="secondary-actions" commandFor={aiModal.id} command="--hide">
          Close
        </UI.Button>
      </UI.Modal>
      <UI.Modal id={modal.id} heading="Choose a featured image" size="large">
        {open ? (<ImageGrid onPick={(img) => {
                onChange({ url: img.url, altText: (img.alt ?? defaultAlt).slice(0, 512), id: img.id });
                modal.hide();
            }}/>) : null}
        <UI.Button slot="secondary-actions" commandFor={modal.id} command="--hide">
          Close
        </UI.Button>
      </UI.Modal>
    </UI.Stack>);
}
function ImageGrid({ onPick }: {
    onPick: (img: StoreImage) => void;
}) {
    const { words, platform } = useStore();
    const [q, setQ] = useState('');
    const [search, setSearch] = useState('');
    const images = useLoad<{
        images: StoreImage[];
    }>(`blog/images${search ? `?q=${encodeURIComponent(search)}` : ''}`);
    return (<UI.Stack gap="base">
      <form onSubmit={(e) => {
            e.preventDefault();
            setSearch(q.trim());
        }}>
        <UI.SearchField label={`Search your ${words.files}`} labelAccessibilityVisibility="exclusive" placeholder={`Search your ${words.files}`} value={q} onInput={(e) => setQ(e.currentTarget.value)}/>
      </form>
      {images.error ? <UI.Text color="subdued">{images.error}</UI.Text> : null}
      {!images.data && images.loading ? <UI.Text color="subdued">{`Reading your ${words.files}…`}</UI.Text> : null}
      {images.data && images.data.images.length === 0 ? (<UI.Paragraph>{search ? 'No images match that search.' : `Your store has no images in ${platform === 'woocommerce' ? `its ${words.files}` : words.files} yet. Upload one under ${words.filesPlace}.`}</UI.Paragraph>) : null}
      {images.data && images.data.images.length > 0 ? (<UI.Grid gridTemplateColumns="repeat(auto-fill, minmax(min(120px, 100%), 1fr))" gap="base">
          {images.data.images.map((img) => (<UI.Clickable key={img.id} onClick={() => onPick(img)} accessibilityLabel={img.alt ? `Choose ${img.alt}` : 'Choose this image'} border="base" borderRadius="base" padding="small-200">
              <UI.Stack gap="small-200">
                <UI.Thumbnail src={img.url} alt={img.alt ?? ''} size="large"/>
                <UI.Text color="subdued">{img.alt ?? 'No alt text'}</UI.Text>
              </UI.Stack>
            </UI.Clickable>))}
        </UI.Grid>) : null}
    </UI.Stack>);
}
