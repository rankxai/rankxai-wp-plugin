import { useStore } from '../plan-context';
import { useEffect, useId, useState } from 'react';
import { APP_PATHS } from '@/lib/shopify-app/app-routes-core';
import { api, toastSuccess } from '../api';
import { toastWrite } from '../reviews';
import { fmtCount } from '../format';
import { AdminLink, ErrorBanner, act, useLoad, usePageError, type PageError } from '../kit';
import { StatusBadge } from './Status';
import * as UI from '../ui';
export interface ModalHandle {
    id: string;
    show: () => void;
    hide: () => void;
}
export function useModal(prefix: string): ModalHandle {
    const id = `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
    return { id, show: () => UI.showOverlay(id), hide: () => UI.hideOverlay(id) };
}
export interface WriteResult {
    verdict?: string;
    verified: boolean;
    message: string;
    changeId: string | null;
    batchId: string | null;
}
export interface Category {
    id: string;
    fullName: string;
    isLeaf: boolean;
}
export function CategoryModal({ modal, heading, note, busy, onPick, error = null, onDismissError }: {
    modal: ModalHandle;
    heading: string;
    note?: string | null;
    busy: boolean;
    onPick: (c: Category) => void;
    error?: PageError | null;
    onDismissError?: () => void;
}) {
    return (<UI.Modal id={modal.id} heading={heading}>
      <UI.Stack gap="base">
        <ErrorBanner error={error} onDismiss={error ? onDismissError : undefined}/>
        {note ? <UI.Text color="subdued">{note}</UI.Text> : null}
        <CategorySearch busy={busy} onPick={onPick}/>
      </UI.Stack>
      <UI.Button slot="secondary-actions" commandFor={modal.id} command="--hide">
        Close
      </UI.Button>
    </UI.Modal>);
}
function CategorySearch({ busy, onPick }: {
    busy: boolean;
    onPick: (c: Category) => void;
}) {
    const { words } = useStore();
    const [q, setQ] = useState('');
    const [found, setFound] = useState<{
        q: string;
        categories: Category[];
    } | null>(null);
    const term = q.trim();
    useEffect(() => {
        if (term.length < 2)
            return;
        let cancelled = false;
        const t = setTimeout(async () => {
            const r = await api<{
                categories: Category[];
            }>(`taxonomy/search?q=${encodeURIComponent(term)}`);
            if (!cancelled)
                setFound({ q: term, categories: r.ok && r.data ? r.data.categories : [] });
        }, 300);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [term]);
    const results = found && found.q === term ? found.categories : null;
    return (<UI.Stack gap="base">
      <UI.SearchField label={words.categorySearch} placeholder="For example: golf drivers" value={q} onInput={(e) => setQ(e.currentTarget.value)}/>
      {term.length < 2 ? (<UI.Text color="subdued">Type at least two letters.</UI.Text>) : results === null ? (<UI.Text color="subdued">Searching…</UI.Text>) : results.length === 0 ? (<UI.Text color="subdued">No category matches. Try a broader word.</UI.Text>) : (<UI.Stack gap="small-200">
          {results.map((c) => (<UI.Stack key={c.id} direction="inline" gap="small-200" alignItems="center" justifyContent="space-between">
              <UI.Stack direction="inline" gap="small-200" alignItems="center">
                <UI.Text>{c.fullName}</UI.Text>
                {!c.isLeaf ? <UI.Badge tone="neutral">Broad</UI.Badge> : null}
              </UI.Stack>
              <UI.Button disabled={busy || undefined} loading={busy || undefined} onClick={() => onPick(c)} accessibilityLabel={`Use ${c.fullName}`}>
                Use this
              </UI.Button>
            </UI.Stack>))}
          {results.some((c) => !c.isLeaf) ? <UI.Text color="subdued">A broad category asks for fewer details. A more specific one is better.</UI.Text> : null}
        </UI.Stack>)}
    </UI.Stack>);
}
export function BarcodeModal({ modal, product, onSaved }: {
    modal: ModalHandle;
    product: {
        productId: string;
        title: string | null;
    } | null;
    onSaved: (r: WriteResult) => void;
}) {
    return (<UI.Modal id={modal.id} heading={product ? `Barcodes for ${product.title ?? 'this product'}` : 'Barcodes'}>
      {product ? <BarcodeForm key={product.productId} productId={product.productId} label={product.title ?? 'a product'} onSaved={onSaved}/> : null}
      <UI.Button slot="secondary-actions" commandFor={modal.id} command="--hide">
        Close
      </UI.Button>
    </UI.Modal>);
}
type Variant = {
    id: string;
    title: string;
    barcode: string | null;
};
const variantsOf = (v: Variant[] | {
    nodes: Variant[];
}): Variant[] => (Array.isArray(v) ? v : v.nodes);
function BarcodeForm({ productId, label, onSaved }: {
    productId: string;
    label: string;
    onSaved: (r: WriteResult) => void;
}) {
    const { platform } = useStore();
    const product = useLoad<{
        product: {
            title?: string;
            variants: Variant[] | {
                nodes: Variant[];
            };
        };
    }>(`catalogue/product?id=${encodeURIComponent(productId)}`);
    const [values, setValues] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState<string | null>(null);
    const [saved, setSaved] = useState<Record<string, WriteResult>>({});
    const [error, setError] = usePageError();
    if (!product.data)
        return product.error ? <ErrorBanner error={product.error}/> : <UI.Text color="subdued">Reading the product’s variants…</UI.Text>;
    return (<UI.Stack gap="base">
      <ErrorBanner error={error} onDismiss={error ? () => setError(null) : undefined}/>
      {variantsOf(product.data.product.variants).map((v) => (<UI.Stack key={v.id} direction="inline" gap="small-200" alignItems="end">
          <UI.TextField label={`Barcode for ${v.title === 'Default Title' || (platform === 'woocommerce' && v.title === product.data!.product.title) ? 'this product' : v.title}`} value={values[v.id] ?? v.barcode ?? ''} onInput={(e) => setValues((all) => ({ ...all, [v.id]: e.currentTarget.value }))}/>
          {saved[v.id] ? (<StatusBadge status={saved[v.id]!.verified ? 'saved' : 'saved_unconfirmed'}/>) : (<UI.Button disabled={busy !== null || !(values[v.id] ?? '').trim() || undefined} loading={busy === v.id || undefined} onClick={() => void act(() => api<WriteResult>('fixes/product', { method: 'POST', body: { kind: 'gtin', productId, variantId: v.id, barcode: values[v.id], label } }), (b) => setBusy(b ? v.id : null), setError).then((r) => {
                    if (r.ok && r.data) {
                        setSaved((all) => ({ ...all, [v.id]: r.data! }));
                        onSaved(r.data);
                    }
                })}>
              Save
            </UI.Button>)}
        </UI.Stack>))}
      <UI.Text color="subdued">The barcode printed on the product or its packaging (UPC, EAN or ISBN). We check the last digit before saving.</UI.Text>
    </UI.Stack>);
}
interface Attribute {
    key: string;
    name: string;
    current: string[];
    options: Array<{
        id: string;
        name: string;
    }>;
}
interface ProductAttributes {
    product: {
        id: string;
        title: string | null;
        categoryId: string | null;
        categoryName: string | null;
    };
    attributes: Attribute[];
}
const FILTER_OVER = 15;
function ValuePicker({ attr, value, onChange, disabled }: {
    attr: Attribute;
    value: string;
    onChange: (v: string) => void;
    disabled: boolean;
}) {
    const [filter, setFilter] = useState('');
    const f = filter.trim().toLowerCase();
    const shown = attr.options.filter((o) => f === '' || o.name.toLowerCase().includes(f) || o.id === value);
    return (<UI.Stack gap="small-200">
      {attr.options.length > FILTER_OVER ? (<UI.SearchField label={`Filter ${attr.name.toLowerCase()}`} labelAccessibilityVisibility="exclusive" placeholder={`Filter ${fmtCount(attr.options.length, 'choice', 'choices')}`} value={filter} onInput={(e) => setFilter(e.currentTarget.value)}/>) : null}
      <UI.Select label={attr.name} labelAccessibilityVisibility="exclusive" value={value} disabled={disabled || undefined} onChange={(e) => onChange(e.currentTarget.value)}>
        <UI.Option value="">{shown.length === 0 ? 'No choice matches the filter' : 'Choose'}</UI.Option>
        {shown.map((o) => (<UI.Option key={o.id} value={o.id}>
            {o.name}
          </UI.Option>))}
      </UI.Select>
    </UI.Stack>);
}
function AttributeRow({ productId, title, attr, setError }: {
    productId: string;
    title: string;
    attr: Attribute;
    setError: (e: {
        message: string;
        planLink: boolean;
    } | null) => void;
}) {
    const [value, setValue] = useState('');
    const [busy, setBusy] = useState<'save' | 'undo' | null>(null);
    const [saved, setSaved] = useState<WriteResult | null>(null);
    const chosen = attr.options.find((o) => o.id === value)?.name ?? null;
    async function save() {
        const r = await act(() => api<WriteResult>('fixes/attribute', { method: 'POST', body: { productId, key: attr.key, valueIds: [value], label: title } }), (b) => setBusy(b ? 'save' : null), setError);
        if (r.ok && r.data) {
            setSaved(r.data);
            toastWrite(r.data.verified, 'Saved and confirmed on your store', 'Saved');
        }
    }
    async function undo() {
        if (!saved?.changeId)
            return;
        const r = await act(() => api(`changes/${saved.changeId}/undo`, { method: 'POST' }), (b) => setBusy(b ? 'undo' : null), setError);
        if (r.ok) {
            setSaved(null);
            setValue('');
            toastSuccess('Change undone');
        }
    }
    return (<UI.Box padding="base" border="base" borderRadius="base">
      <UI.Stack gap="small-200">
        <UI.Stack direction="inline" gap="small-200" alignItems="center" justifyContent="space-between">
          <UI.Text type="strong">{attr.name}</UI.Text>
          {saved ? (<StatusBadge status={saved.verified ? 'saved' : 'saved_unconfirmed'}/>) : attr.current.length > 0 ? (<UI.Badge tone="success">{`Set: ${attr.current.join(', ')}`}</UI.Badge>) : (<UI.Badge tone="warning">Not set</UI.Badge>)}
        </UI.Stack>
        {saved ? (<UI.Stack direction="inline" gap="small-200" alignItems="center">
            <UI.Text>{chosen ? `Now ${chosen}.` : 'Saved.'}</UI.Text>
            {saved.changeId ? (<UI.Button variant="tertiary" disabled={busy !== null || undefined} loading={busy === 'undo' || undefined} onClick={() => void undo()}>
                Undo
              </UI.Button>) : null}
          </UI.Stack>) : attr.options.length === 0 ? (<UI.Stack gap="small-100">
            <UI.Text color="subdued">This detail is a measurement or free text, so you set it on the product’s page.</UI.Text>
            <AdminLink path={`/products/${productId.split('/').pop()}`}>Edit product</AdminLink>
          </UI.Stack>) : (<UI.Grid gridTemplateColumns="minmax(0, 1fr) auto" gap="small-200" alignItems="end">
            <ValuePicker attr={attr} value={value} onChange={setValue} disabled={busy !== null}/>
            <UI.Button disabled={!value || busy !== null || undefined} loading={busy === 'save' || undefined} onClick={() => void save()}>
              Save
            </UI.Button>
          </UI.Grid>)}
      </UI.Stack>
    </UI.Box>);
}
export function AttributesModal({ modal, product }: {
    modal: ModalHandle;
    product: {
        productId: string;
        title: string | null;
    } | null;
}) {
    return (<UI.Modal id={modal.id} heading={product ? `Details for ${product.title ?? 'this product'}` : 'Details'} size="large">
      {product ? <AttributesBody key={product.productId} productId={product.productId} title={product.title ?? 'a product'}/> : null}
      <UI.Button slot="secondary-actions" commandFor={modal.id} command="--hide">
        Close
      </UI.Button>
    </UI.Modal>);
}
function AttributesBody({ productId, title }: {
    productId: string;
    title: string;
}) {
    const { words } = useStore();
    const data = useLoad<ProductAttributes>(`catalogue/attributes?productId=${encodeURIComponent(productId)}`);
    const [error, setError] = usePageError();
    const [saving, setSaving] = useState(false);
    const d = data.data;
    if (!d)
        return data.error ? <ErrorBanner error={data.error}/> : <UI.Text color="subdued">Reading this product’s details…</UI.Text>;
    if (!d.product.categoryId) {
        const pick = async (c: Category) => {
            const r = await act(() => api<WriteResult>('fixes/product', { method: 'POST', body: { kind: 'category', productId, categoryId: c.id, categoryName: c.fullName, label: title } }), setSaving, setError);
            if (r.ok && r.data) {
                toastWrite(r.data.verified, 'Category saved and confirmed on your store', 'Category saved');
                await data.reload();
            }
        };
        return (<UI.Stack gap="base">
        <ErrorBanner error={error} onDismiss={error ? () => setError(null) : undefined}/>
        <UI.Paragraph>
          Choose a category for this product first: the details shoppers ask about come from its category. You can undo it from{' '}
          <UI.Link href={APP_PATHS.changes}>Changes</UI.Link>.
        </UI.Paragraph>
        <CategorySearch busy={saving} onPick={(c) => void pick(c)}/>
      </UI.Stack>);
    }
    const missing = d.attributes.filter((a) => a.current.length === 0);
    const set = d.attributes.filter((a) => a.current.length > 0);
    return (<UI.Stack gap="base">
      <ErrorBanner error={error} onDismiss={error ? () => setError(null) : undefined}/>
      <UI.Text color="subdued">{`${d.product.categoryName ?? 'Category'} · ${fmtCount(missing.length, 'detail', 'details')} not set`}</UI.Text>
      {d.attributes.length === 0 ? <UI.Paragraph>{`${words.platform} lists no details for this category.`}</UI.Paragraph> : null}
      {[...missing, ...set].map((a) => (<AttributeRow key={a.key} productId={productId} title={title} attr={a} setError={setError}/>))}
    </UI.Stack>);
}
export function AttributeBulkModal({ modal, first, count, busy, onApply, error = null, onDismissError }: {
    modal: ModalHandle;
    error?: PageError | null;
    onDismissError?: () => void;
    first: {
        productId: string;
        title: string | null;
    } | null;
    count: number;
    busy: boolean;
    onApply: (key: string, valueId: string) => void;
}) {
    const [pick, setPick] = useState<{
        productId: string | null;
        key: string;
        value: string;
    }>({ productId: null, key: '', value: '' });
    const current = pick.productId === (first?.productId ?? null) ? pick : { productId: first?.productId ?? null, key: '', value: '' };
    return (<UI.Modal id={modal.id} heading={`Set one detail on ${fmtCount(count, 'product', 'products')}`}>
      <ErrorBanner error={error} onDismiss={error ? onDismissError : undefined}/>
      {first ? (<AttributeBulkBody key={first.productId} productId={first.productId} busy={busy} choice={current} onChoose={(key, value) => setPick({ productId: first.productId, key, value })}/>) : null}
      <UI.Button slot="primary-action" variant="primary" disabled={!current.key || !current.value || busy || undefined} loading={busy || undefined} onClick={() => onApply(current.key, current.value)}>
        {`Apply to ${fmtCount(count, 'product', 'products')}`}
      </UI.Button>
      <UI.Button slot="secondary-actions" commandFor={modal.id} command="--hide">
        Close
      </UI.Button>
    </UI.Modal>);
}
function AttributeBulkBody({ productId, busy, choice, onChoose }: {
    productId: string;
    busy: boolean;
    choice: {
        key: string;
        value: string;
    };
    onChoose: (key: string, value: string) => void;
}) {
    const data = useLoad<ProductAttributes>(`catalogue/attributes?productId=${encodeURIComponent(productId)}`);
    const { key, value } = choice;
    const setKey = (k: string) => onChoose(k, '');
    const setValue = (v: string) => onChoose(key, v);
    const d = data.data;
    if (!d)
        return data.error ? <ErrorBanner error={data.error}/> : <UI.Text color="subdued">Reading the category’s details…</UI.Text>;
    const choosable = d.attributes.filter((a) => a.options.length > 0);
    const attr = choosable.find((a) => a.key === key) ?? null;
    if (choosable.length === 0)
        return <UI.Paragraph>This category has no details with a list of choices. Set them on the product’s page.</UI.Paragraph>;
    return (<UI.Stack gap="base">
      <UI.Text color="subdued">{`${d.product.categoryName ?? 'Category'}. The value you choose is written to every selected product, replacing what is set.`}</UI.Text>
      <UI.Select label="Detail" value={key} onChange={(e) => setKey(e.currentTarget.value)}>
        <UI.Option value="">Choose a detail</UI.Option>
        {choosable.map((a) => (<UI.Option key={a.key} value={a.key}>
            {a.name}
          </UI.Option>))}
      </UI.Select>
      {attr ? <ValuePicker key={attr.key} attr={attr} value={value} onChange={setValue} disabled={busy}/> : null}
    </UI.Stack>);
}
