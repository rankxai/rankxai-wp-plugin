import { useEffect, useRef, useState } from 'react';
import { APP_PATHS } from '@/lib/shopify-app/app-routes-core';
import { insertAtCursor, lengthState, unknownVariables, variableLabel } from '@/lib/shopify-app/template-edit-core';
import { api, toastSuccess } from '../api';
import { host } from '../host';
import { toastWrite } from '../reviews';
import { fmtCount, fmtNumber } from '../format';
import { act, useLoad, type PageError } from '../kit';
import { BatchProgress, useBatch } from '../components/BatchProgress';
import { ProductCell, SkeletonSection, StatusBadge } from '../components/Status';
import * as UI from '../ui';
interface TemplateTarget {
    target: string;
    label: string;
    objectType: string;
    field: string;
    variables: string[];
    maxLength: number;
    suggested?: string | null;
    empty?: number | null;
}
interface Rule {
    field: 'productType' | 'vendor';
    equals: string;
    template: string;
}
const MAX_RULES = 10;
const RULE_FIELD: Record<Rule['field'], string> = { productType: 'Product type', vendor: 'Vendor' };
interface TemplatesData {
    templates: Array<{
        target: string;
        template: string;
        autoApply: boolean;
        rules?: Rule[];
    }>;
    targets: TemplateTarget[];
    canAutoApply: boolean;
    lockedBy: string | null;
}
interface PreviewItem {
    objectType: string;
    objectId: string;
    label: string;
    imageUrl: string | null;
    current: string | null;
    proposed: string;
}
interface Preview {
    items: PreviewItem[];
    total: number;
    truncated: boolean;
    shared?: number;
}
const PREVIEW_DEBOUNCE_MS = 400;
export function TemplatesSection({ setError, target = null }: {
    setError: (e: PageError | null) => void;
    target?: string | null;
}) {
    const data = useLoad<TemplatesData>('templates');
    const d = data.data;
    if (!d) {
        if (data.loading)
            return <SkeletonSection lines={6} label="Loading templates"/>;
        return (<UI.Section heading="Fill in bulk">
        <UI.Paragraph>
          {data.status === 404 ? 'Templates are not available on your store yet.' : 'Templates could not be read just now. Reload the page to try again.'}
        </UI.Paragraph>
      </UI.Section>);
    }
    if (d.targets.length === 0)
        return null;
    return <TemplateEditor key={d.targets.map((t) => t.target).join(',')} d={d} setError={setError} onSaved={() => void data.reload()} initialTarget={target}/>;
}
function firstTarget(d: TemplatesData, asked: string | null = null): string {
    if (asked && d.targets.some((t) => t.target === asked))
        return asked;
    const known = d.targets.filter((t) => typeof t.empty === 'number' && t.empty > 0);
    return (known.sort((a, b) => (b.empty ?? 0) - (a.empty ?? 0))[0] ?? d.targets[0]!).target;
}
const sameRules = (a: readonly Rule[], b: readonly Rule[]) => JSON.stringify(a) === JSON.stringify(b);
function TemplateEditor({ d, setError, onSaved, initialTarget = null }: {
    d: TemplatesData;
    setError: (e: PageError | null) => void;
    onSaved: () => void;
    initialTarget?: string | null;
}) {
    const [target, setTarget] = useState(() => firstTarget(d, initialTarget));
    const saved = (t: string) => d.templates.find((x) => x.target === t);
    const startText = (t: string) => saved(t)?.template ?? d.targets.find((x) => x.target === t)?.suggested ?? '';
    const savedRules = (t: string) => saved(t)?.rules ?? [];
    const [text, setText] = useState(() => startText(firstTarget(d, initialTarget)));
    const [auto, setAuto] = useState(() => saved(firstTarget(d, initialTarget))?.autoApply ?? false);
    const [rules, setRules] = useState<Rule[]>(() => savedRules(firstTarget(d, initialTarget)));
    const [busy, setBusy] = useState<string | null>(null);
    const [preview, setPreview] = useState<{
        key: string;
        data: Preview | null;
        error: string | null;
    } | null>(null);
    const [applied, setApplied] = useState<Set<string>>(new Set());
    const fieldRef = useRef<UI.FocusHandle | null>(null);
    const t = d.targets.find((x) => x.target === target) ?? d.targets[0]!;
    const batch = useBatch(() => setPreview(null));
    const unknown = unknownVariables(text, t.variables);
    const liveRules = t.objectType === 'product' ? rules.filter((r) => r.equals.trim() && r.template.trim()) : [];
    const rulesKey = JSON.stringify(liveRules);
    const previewKey = `${target}\n${text}\n${rulesKey}`;
    useEffect(() => {
        if (text.trim() === '')
            return;
        let cancelled = false;
        const timer = setTimeout(async () => {
            const r = await api<Preview>('templates/preview', { method: 'POST', body: { target, template: text, rules: JSON.parse(rulesKey) as Rule[] } });
            if (!cancelled)
                setPreview({ key: `${target}\n${text}\n${rulesKey}`, data: r.ok ? r.data : null, error: r.ok ? null : r.error });
        }, PREVIEW_DEBOUNCE_MS);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [target, text, rulesKey]);
    const shown = preview && preview.key === previewKey ? preview : null;
    async function chooseTarget(next: string) {
        await host.leaveConfirmation();
        setTarget(next);
        setText(startText(next));
        setAuto(saved(next)?.autoApply ?? false);
        setRules(savedRules(next));
        setApplied(new Set());
    }
    function insert(token: string) {
        const input = UI.fieldInput(fieldRef.current);
        const { value, caret } = insertAtCursor(text, token, input?.selectionStart ?? null, input?.selectionEnd ?? null);
        setText(value);
        requestAnimationFrame(() => {
            try {
                input?.focus();
                input?.setSelectionRange(caret, caret);
            }
            catch {
            }
        });
    }
    async function save(nextAuto = auto) {
        const r = await act(() => api<{
            saved: boolean;
        }>('templates', { method: 'PUT', body: { target, template: text, autoApply: nextAuto, rules: liveRules } }), (b) => setBusy(b ? 'save' : null), setError);
        if (r.ok) {
            setAuto(nextAuto);
            toastSuccess('Template saved');
            onSaved();
        }
    }
    async function applyAll(objectIds?: string[]) {
        const key = objectIds ? `one:${objectIds[0]}` : 'all';
        const r = await act(() => api('templates/apply', { method: 'POST', body: objectIds ? { target, template: text, objectIds, rules: liveRules } : { target, template: text, rules: liveRules } }), (b) => setBusy(b ? key : null), setError);
        if (!r.ok)
            return;
        if (objectIds) {
            const one = (r.data as {
                results?: Array<{
                    ok: boolean;
                    verified: boolean;
                }>;
            } | null)?.results?.[0];
            if (one?.ok) {
                setApplied((s) => new Set(s).add(objectIds[0]!));
                toastWrite(one.verified, 'Saved and confirmed on your store', 'Saved');
            }
            else
                batch.begin(r.data, 'apply');
        }
        else
            batch.begin(r.data, 'apply');
    }
    const p = shown?.data ?? null;
    return (<UI.Section heading="Templates">
      <UI.Stack gap="base">
        <UI.Paragraph>Fill empty search titles, search descriptions and image descriptions from one pattern. Only empty fields are filled: anything you wrote yourself stays as it is.</UI.Paragraph>
        <UI.Select label="What to fill" value={target} onChange={(ev) => void chooseTarget(ev.currentTarget.value)}>
          {d.targets.map((x) => (<UI.Option key={x.target} value={x.target}>
              {typeof x.empty === 'number' ? `${x.label} (${fmtNumber(x.empty)} empty in search)` : x.label}
            </UI.Option>))}
        </UI.Select>
        
        <UI.SaveBarForm key={`${target}\n${saved(target)?.template ?? ''}`} onSubmit={(ev) => {
            ev.preventDefault();
            void save();
        }} onReset={() => setText(startText(target))}>
          <UI.TextField ref={fieldRef} label="Template" name="template" placeholder={t.suggested ?? ''} value={text} defaultValue={startText(target)} maxLength={500} error={shown?.error ?? undefined} details={`Up to ${fmtNumber(t.maxLength)} characters show where this is used. Click a variable to add it where the cursor is.`} onInput={(ev) => setText(ev.currentTarget.value)}/>
        </UI.SaveBarForm>
        <UI.Stack direction="inline" gap="small-200">
          {t.variables.map((v) => (<UI.ClickableChip key={v} accessibilityLabel={`Insert ${variableLabel(v)}`} onClick={() => insert(v)}>
              {variableLabel(v)}
            </UI.ClickableChip>))}
        </UI.Stack>
        {t.suggested && text.trim() === '' ? (<UI.Stack direction="inline">
            <UI.Button variant="tertiary" onClick={() => setText(t.suggested ?? '')}>
              Start from the suggested template
            </UI.Button>
          </UI.Stack>) : null}
        {unknown.length > 0 ? <UI.Text color="subdued">{`Not a variable here, so written as typed: ${unknown.join(', ')}`}</UI.Text> : null}
        {t.objectType === 'product' ? (<UI.Stack gap="small-200">
            <UI.Text type="strong">Rules</UI.Text>
            <UI.Text color="subdued">Use a different template for products of one type or vendor. The first rule that matches a product is used; the template above fills the rest.</UI.Text>
            {rules.map((r, i) => (<UI.QueryContainer key={i}>
              <UI.Grid gridTemplateColumns="@container (inline-size > 640px) 1fr 1fr 2fr auto, 1fr" gap="small-200" alignItems="end">
                <UI.Select label="When" value={r.field} onChange={(ev) => setRules(rules.map((x, j) => (j === i ? { ...x, field: ev.currentTarget.value as Rule['field'] } : x)))}>
                  {(Object.keys(RULE_FIELD) as Rule['field'][]).map((f) => (<UI.Option key={f} value={f}>{RULE_FIELD[f]}</UI.Option>))}
                </UI.Select>
                <UI.TextField label="Is" value={r.equals} maxLength={120} onInput={(ev) => setRules(rules.map((x, j) => (j === i ? { ...x, equals: ev.currentTarget.value } : x)))}/>
                <UI.TextField label="Template" value={r.template} maxLength={500} placeholder={text} onInput={(ev) => setRules(rules.map((x, j) => (j === i ? { ...x, template: ev.currentTarget.value } : x)))}/>
                <UI.Button variant="tertiary" accessibilityLabel={`Remove rule ${i + 1}`} onClick={() => setRules(rules.filter((_, j) => j !== i))}>
                  Remove
                </UI.Button>
              </UI.Grid>
              </UI.QueryContainer>))}
            <UI.Stack direction="inline" gap="small-200">
              {rules.length < MAX_RULES ? (<UI.Button variant="tertiary" onClick={() => setRules([...rules, { field: 'productType', equals: '', template: text }])}>
                  Add a rule
                </UI.Button>) : null}
              {!sameRules(liveRules, savedRules(target)) ? (<UI.Button disabled={busy !== null || text.trim() === '' || undefined} loading={busy === 'save' || undefined} onClick={() => void save()}>
                  Save template and rules
                </UI.Button>) : null}
            </UI.Stack>
          </UI.Stack>) : null}
        
        {t.objectType === 'product' ? (<UI.Switch label="Apply automatically to new products" details={d.canAutoApply ? 'New products get this template when their field is empty. Every change can be undone.' : `Available on ${d.lockedBy ?? 'a paid plan'}.`} checked={auto || undefined} disabled={!d.canAutoApply || busy !== null || text.trim() === '' || undefined} onChange={(ev) => void save(ev.currentTarget.checked === true)}/>) : null}
        {d.canAutoApply ? (<UI.Text color="subdued">
            Every change is listed in <UI.Link href={APP_PATHS.changes}>Changes</UI.Link>.
          </UI.Text>) : null}
        <UI.Stack direction="inline" gap="small-200">
          <UI.Button variant="primary" disabled={!p || p.total === 0 || busy !== null || batch.state?.status === 'running' || undefined} loading={busy === 'all' || undefined} onClick={() => void applyAll()}>
            {p ? `Apply to ${fmtCount(p.total, 'empty field', 'empty fields')}` : 'Apply'}
          </UI.Button>
        </UI.Stack>
        <BatchProgress handle={batch} setError={setError}/>

        {text.trim() === '' ? (<UI.Text color="subdued">Type a template to see what it would write.</UI.Text>) : !shown ? (<UI.Text color="subdued">Previewing…</UI.Text>) : shown.error ? null : p && p.items.length === 0 ? (<UI.Text color="subdued">Every one of these already has a value, so there is nothing to fill.</UI.Text>) : p ? (<UI.Stack gap="small-200">
            <UI.Text color="subdued">{p.truncated ? `The first ${fmtNumber(p.items.length)} of ${fmtNumber(p.total)} shown.` : `${fmtCount(p.total, 'empty field', 'empty fields')} would be filled.`}</UI.Text>
            
            {p.shared && p.shared > 0 ? (<UI.Stack direction="inline" gap="small-200" alignItems="center">
                <UI.Badge tone="warning">Not unique</UI.Badge>
                <UI.Text>{`${fmtNumber(p.shared)} of these would read the same as another page. Add a detail that differs, such as ${t.variables.slice(0, 2).map(variableLabel).join(' or ')}, or a rule.`}</UI.Text>
              </UI.Stack>) : null}
            <UI.Table variant="auto">
              <UI.TableHeaderRow>
                <UI.TableHeader listSlot="primary">Item</UI.TableHeader>
                <UI.TableHeader listSlot="labeled">Now</UI.TableHeader>
                <UI.TableHeader listSlot="secondary">Would become</UI.TableHeader>
                <UI.TableHeader listSlot="inline">Length</UI.TableHeader>
                <UI.TableHeader listSlot="inline">Action</UI.TableHeader>
              </UI.TableHeaderRow>
              <UI.TableBody>
                {p.items.map((it) => {
                const fit = lengthState(it.proposed, t.maxLength);
                return (<UI.TableRow key={`${it.objectType}:${it.objectId}`}>
                      <UI.TableCell>
                        <ProductCell title={it.label} imageUrl={it.imageUrl}/>
                      </UI.TableCell>
                      <UI.TableCell>{it.current ? it.current : 'Empty'}</UI.TableCell>
                      <UI.TableCell>{it.proposed}</UI.TableCell>
                      <UI.TableCell>
                        {fit === 'long' ? (<UI.Badge tone="warning">{`May be cut off: ${fmtNumber([...it.proposed].length)} of ${fmtNumber(t.maxLength)}`}</UI.Badge>) : fit === 'empty' ? (<UI.Badge tone="warning">Empty</UI.Badge>) : (<UI.Badge tone="success">Fits</UI.Badge>)}
                      </UI.TableCell>
                      <UI.TableCell>
                        {applied.has(it.objectId) ? (<StatusBadge status="saved"/>) : (<UI.Button variant="tertiary" disabled={busy !== null || undefined} loading={busy === `one:${it.objectId}` || undefined} onClick={() => void applyAll([it.objectId])}>
                            Apply
                          </UI.Button>)}
                      </UI.TableCell>
                    </UI.TableRow>);
            })}
              </UI.TableBody>
            </UI.Table>
          </UI.Stack>) : null}
      </UI.Stack>
    </UI.Section>);
}
