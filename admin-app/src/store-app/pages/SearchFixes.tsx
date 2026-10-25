import { useEffect, useRef, useState } from 'react';
import { APP_PATHS, searchHref } from '@/lib/shopify-app/app-routes-core';
import { bulkGate } from '@/lib/shopify-app/fix-index-core';
import { lengthState } from '@/lib/shopify-app/template-edit-core';
import { api, toastSuccess } from '../api';
import { toastWrite } from '../reviews';
import { usePlan, useStore } from '../plan-context';
import { fmtCount, fmtNumber } from '../format';
import { AdminLink, ErrorBanner, PricedButton, act, fieldError, usePageError, type Load, type PageError } from '../kit';
import { BatchProgress, useBatch } from '../components/BatchProgress';
import { useModal, type WriteResult } from '../components/FixModals';
import { SkeletonSection, StatusBadge } from '../components/Status';
import * as UI from '../ui';
type Action = {
    kind: 'seo';
    objectType: string;
    objectId: string;
    seoTitle: string | null;
    seoDescription: string | null;
} | {
    kind: 'alt_text';
    fileId: string;
    imageUrl: string | null;
} | {
    kind: 'redirect';
    path: string;
} | {
    kind: 'shopify_admin';
    adminPath: string;
    label: string;
};
export interface FixItem {
    key: string;
    group: 'search' | 'images' | 'visibility' | 'links';
    title: string;
    detail: string;
    objectLabel: string;
    objectUrl: string | null;
    action: Action;
    cause?: string;
    objectKind?: string;
}
export interface FixesData {
    items: FixItem[];
    totals: {
        search: number;
        images: number;
        visibility: number;
        links: number;
    };
    links: {
        state: 'checked' | 'not_checked';
        reason?: string;
        checked: number;
        broken: number;
    };
    notes: string[];
    prices: {
        writeSeo: number | null;
    };
}
interface Draft {
    seoTitle?: string;
    seoDescription?: string;
    target?: string;
}
export type SearchFixGroup = 'search' | 'links';
const HEADING: Record<SearchFixGroup, string> = {
    search: 'Search titles and descriptions',
    links: 'Broken links',
};
const TITLE_MAX = 60;
const DESC_MAX = 158;
const ROWS_COLLAPSED = 10;
const isLinksNote = (n: string) => n.includes(' links ');
export function SearchFixes({ load, group, setError, focusProductId = null }: {
    load: Load<FixesData>;
    group: SearchFixGroup;
    setError: (e: PageError | null) => void;
    focusProductId?: string | null;
}) {
    const { words } = useStore();
    const { plan, ready: planReady, reload: reloadPlan } = usePlan();
    const [busy, setBusy] = useState<string | null>(null);
    const [drafts, setDrafts] = useState<Record<string, Draft>>({});
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [done, setDone] = useState<Record<string, WriteResult>>({});
    const [picked, setEditing] = useState<FixItem | null>(null);
    const [expanded, setExpanded] = useState(false);
    const editor = useModal('fix');
    const [modalError, setModalError] = usePageError();
    const focusItem = focusProductId && load.data
        ? load.data.items.find((i) => i.action.kind === 'seo' && i.action.objectType === 'product' && i.action.objectId.endsWith(`/${focusProductId}`)) ?? null
        : null;
    const focusMissing = !!focusProductId && !!load.data && focusItem === null;
    const editing = picked ?? focusItem;
    const focusOpened = useRef(false);
    useEffect(() => {
        if (!focusItem || focusOpened.current)
            return;
        focusOpened.current = true;
        editor.show();
    }, [focusItem, editor]);
    const batch = useBatch(() => void load.reload());
    const access = plan?.locks.access ?? null;
    const d = planReady ? load.data : null;
    if (!d)
        return load.loading || (load.data && !planReady) ? <SkeletonSection lines={4} label="Reading your store"/> : null;
    const setDraft = (key: string, patch: Draft) => setDrafts((all) => ({ ...all, [key]: { ...all[key], ...patch } }));
    const ready = (i: FixItem) => {
        const dr = drafts[i.key] ?? {};
        if (i.action.kind === 'seo')
            return !!(dr.seoTitle?.trim() || dr.seoDescription?.trim());
        if (i.action.kind === 'redirect')
            return !!dr.target?.trim();
        return false;
    };
    const batchable = (i: FixItem) => i.action.kind === 'seo';
    const toggle = (key: string, on: boolean) => setSelected((s) => {
        const next = new Set(s);
        if (on)
            next.add(key);
        else
            next.delete(key);
        return next;
    });
    async function saveOne(item: FixItem) {
        const draft = drafts[item.key] ?? {};
        const a = item.action;
        const call = a.kind === 'seo'
            ? () => api<WriteResult>('fixes/seo', { method: 'POST', body: { objectType: a.objectType, objectId: a.objectId, seoTitle: draft.seoTitle, seoDescription: draft.seoDescription, label: item.objectLabel } })
            : a.kind === 'redirect'
                ? () => api<WriteResult>('fixes/redirects', { method: 'POST', body: { path: a.path, target: draft.target } })
                : null;
        if (!call)
            return;
        const r = await act(call, (b) => setBusy(b ? item.key : null), setModalError);
        if (r.ok && r.data) {
            setDone((all) => ({ ...all, [item.key]: r.data! }));
            toggle(item.key, false);
            toastWrite(r.data.verified, 'Saved and confirmed on your store', 'Saved');
            editor.hide();
        }
    }
    async function suggest(item: FixItem) {
        const a = item.action;
        if (a.kind !== 'seo')
            return;
        const r = await act(() => api<{
            suggestion: {
                seoTitle: string;
                seoDescription: string;
            };
        }>('fixes/seo/suggest', { method: 'POST', body: { objectType: a.objectType, objectId: a.objectId } }), (b) => setBusy(b ? `suggest:${item.key}` : null), setModalError);
        if (r.ok && r.data) {
            setDraft(item.key, { seoTitle: r.data.suggestion.seoTitle, seoDescription: r.data.suggestion.seoDescription });
            toastSuccess('Written. Review it, then save.');
            void reloadPlan();
        }
    }
    async function undo(key: string) {
        const changeId = done[key]?.changeId;
        if (!changeId)
            return;
        const r = await act(() => api(`changes/${changeId}/undo`, { method: 'POST' }), (b) => setBusy(b ? `undo:${key}` : null), setError);
        if (r.ok) {
            setDone((all) => {
                const next = { ...all };
                delete next[key];
                return next;
            });
            toastSuccess('Change undone');
        }
    }
    const items = d.items.filter((i) => i.group === group);
    const total = d.totals[group];
    const chosen = items.filter((i) => selected.has(i.key) && !done[i.key] && batchable(i) && ready(i));
    const gate = bulkGate({ selected: chosen.length, freePlanNeeded: access?.planNeeded ?? null, mode: 'visibility' });
    async function approveAll() {
        const body = chosen.flatMap((i) => {
            if (i.action.kind !== 'seo')
                return [];
            const draft = drafts[i.key] ?? {};
            return [{ kind: 'seo', objectType: i.action.objectType, objectId: i.action.objectId, seoTitle: draft.seoTitle, seoDescription: draft.seoDescription, label: i.objectLabel }];
        });
        if (body.length === 0)
            return;
        const r = await act(() => api('fixes/apply', { method: 'POST', body: { items: body } }), (b) => setBusy(b ? 'approve' : null), setError);
        if (r.ok && batch.begin(r.data, 'apply'))
            setSelected(new Set());
    }
    const notes = d.notes.filter((n) => (group === 'links' ? isLinksNote(n) : !isLinksNote(n)));
    const shown = total > items.length ? `${fmtNumber(items.length)} of ${fmtNumber(total)}` : fmtNumber(items.length);
    const selectable = items.some(batchable);
    const open = expanded || items.length <= ROWS_COLLAPSED;
    const visible = open ? items : items.slice(0, ROWS_COLLAPSED);
    const e = editing;
    const ed = e ? (drafts[e.key] ?? {}) : {};
    return (<UI.Section heading={group === 'links' && d.links.state !== 'checked' ? HEADING[group] : `${HEADING[group]} (${shown})`}>
      <UI.Stack gap="base">
        {focusMissing && focusProductId ? (<UI.Banner tone="info">
            This product already has a search title and description, so it is not in the list below. To rewrite them,{' '}
            <AdminLink path={`/products/${focusProductId}`}>edit the product</AdminLink> and change them under Search engine listing.
          </UI.Banner>) : null}
        {group === 'search' ? (<UI.Paragraph>
            {total === 0
                ? 'Nothing to fix right now in what we could check.'
                : `${fmtCount(total, 'search title or description', 'search titles and descriptions')} to fix on your products, ${words.collections}, pages and blog posts.${total > items.length ? ` The first ${fmtNumber(items.length)} are shown, most important first.` : ''} Open one to fill it in, then save it, or tick several and approve them together.`}{' '}
            To fill every empty search title or description at once, use a <UI.Link href={searchHref('listings', { bulk: true })}>template</UI.Link>.
          </UI.Paragraph>) : (<UI.Paragraph>
            {d.links.state === 'checked'
                ? total === 0
                    ? `We checked ${fmtCount(d.links.checked, 'link', 'links')} on your pages and blog posts and none is broken.`
                    : `We checked ${fmtCount(d.links.checked, 'link', 'links')} on your pages and blog posts. These lead to a missing page: send each one to a page that exists.`
                : (d.links.reason ?? 'Your links could not be checked just now.')}
          </UI.Paragraph>)}
        {notes.map((n) => (<UI.Text key={n} color="subdued">
            {n}
          </UI.Text>))}
        {chosen.length > 0 ? (<UI.Stack gap="small-200">
            <UI.Stack direction="inline" gap="base" alignItems="center">
              <UI.Text>{`${fmtNumber(chosen.length)} ready to approve`}</UI.Text>
              <UI.Button variant="primary" disabled={(chosen.length > 1 && !gate.allowed) || busy !== null || undefined} loading={busy === 'approve' || undefined} onClick={() => void approveAll()}>
                {`Approve ${fmtNumber(chosen.length)}`}
              </UI.Button>
            </UI.Stack>
            {chosen.length > 1 && gate.note ? <UI.Text color="subdued">{gate.note}</UI.Text> : null}
            {chosen.length > 1 && !gate.allowed && gate.reason ? <UI.Text color="subdued">{gate.reason}</UI.Text> : null}
          </UI.Stack>) : null}
        <BatchProgress handle={batch} setError={setError}/>
        {items.length > 0 ? (<UI.Table variant="auto">
            <UI.TableHeaderRow>
              {selectable ? <UI.TableHeader listSlot="inline">Approve</UI.TableHeader> : null}
              <UI.TableHeader listSlot="primary">Page or product</UI.TableHeader>
              <UI.TableHeader listSlot="secondary">What to fix</UI.TableHeader>
              <UI.TableHeader listSlot="inline">Action</UI.TableHeader>
            </UI.TableHeaderRow>
            <UI.TableBody>
              {visible.map((i) => {
                const result = done[i.key];
                return (<UI.TableRow key={i.key}>
                    {selectable ? (<UI.TableCell>
                        {batchable(i) && !result ? (<UI.Checkbox accessibilityLabel={ready(i) ? `Approve ${i.objectLabel} with the others` : `Fill in ${i.objectLabel} first`} checked={selected.has(i.key) || undefined} disabled={!ready(i) || undefined} onChange={(ev) => toggle(i.key, ev.currentTarget.checked === true)}/>) : null}
                      </UI.TableCell>) : null}
                    <UI.TableCell>
                      <UI.Stack gap="small-100">
                        <UI.Text type="strong">{i.objectLabel}</UI.Text>
                        {i.objectKind ? <UI.Text color="subdued">{i.objectKind}</UI.Text> : null}
                      </UI.Stack>
                    </UI.TableCell>
                    <UI.TableCell>
                      <UI.Stack gap="small-100">
                        <UI.Text>{i.title}</UI.Text>
                        <UI.Text color="subdued">{i.detail}</UI.Text>
                      </UI.Stack>
                    </UI.TableCell>
                    <UI.TableCell>
                      {result ? (<UI.Stack direction="inline" gap="small-200" alignItems="center">
                          <StatusBadge status={result.verified ? 'saved' : 'saved_unconfirmed'}/>
                          {result.changeId ? (<UI.Button variant="tertiary" disabled={busy !== null || undefined} loading={busy === `undo:${i.key}` || undefined} onClick={() => void undo(i.key)}>
                              Undo
                            </UI.Button>) : null}
                        </UI.Stack>) : i.action.kind === 'shopify_admin' ? (<AdminLink path={i.action.adminPath}>{i.action.label}</AdminLink>) : (<UI.Button onClick={() => {
                            setEditing(i);
                            editor.show();
                        }}>
                          {ready(i) ? 'Edit' : 'Fix this'}
                        </UI.Button>)}
                    </UI.TableCell>
                  </UI.TableRow>);
            })}
            </UI.TableBody>
          </UI.Table>) : null}
        {items.length > ROWS_COLLAPSED ? (<UI.Button variant="tertiary" onClick={() => setExpanded(!open)}>
            {open ? 'Show fewer' : `Show all ${fmtNumber(items.length)}`}
          </UI.Button>) : null}
      </UI.Stack>

      <UI.Modal id={editor.id} heading={e ? e.objectLabel : 'Fix'}>
        {e ? (<UI.Stack gap="base">
            <ErrorBanner error={modalError} onDismiss={modalError ? () => setModalError(null) : undefined}/>
            <UI.Text color="subdued">{e.title}</UI.Text>
            {e.action.kind === 'seo' ? (<>
                <UI.TextField label="Search title" value={ed.seoTitle ?? ''} maxLength={70} error={fieldError(modalError, 'seoTitle')} details={`${(ed.seoTitle ?? '').length} of ${TITLE_MAX} characters show in search results${lengthState(ed.seoTitle ?? '', TITLE_MAX) === 'long' ? '; the rest is cut off' : ''}`} onInput={(ev) => setDraft(e.key, { seoTitle: ev.currentTarget.value })}/>
                <UI.TextArea label="Search description" value={ed.seoDescription ?? ''} maxLength={320} details={`${(ed.seoDescription ?? '').length} of ${DESC_MAX} characters show in search results${lengthState(ed.seoDescription ?? '', DESC_MAX) === 'long' ? '; the rest is cut off' : ''}`} onInput={(ev) => setDraft(e.key, { seoDescription: ev.currentTarget.value })}/>
                <PricedButton label="Write it for me" credits={d.prices.writeSeo} lock={access} busy={busy === `suggest:${e.key}`} onClick={() => void suggest(e)}/>
              </>) : e.action.kind === 'redirect' ? (<UI.TextField label="Send visitors to" placeholder={words.redirectExample} value={ed.target ?? ''} maxLength={500} error={fieldError(modalError, 'target')} onInput={(ev) => setDraft(e.key, { target: ev.currentTarget.value })}/>) : null}
            <UI.Text color="subdued">
              Saved straight to your store and checked there. You can undo it from <UI.Link href={APP_PATHS.changes}>Changes</UI.Link>.
            </UI.Text>
          </UI.Stack>) : null}
        <UI.Button slot="primary-action" variant="primary" disabled={!e || !ready(e) || busy !== null || undefined} loading={(e && busy === e.key) || undefined} onClick={() => e && void saveOne(e)}>
          {e?.action.kind === 'redirect' ? 'Create redirect' : 'Save'}
        </UI.Button>
        {e && batchable(e) ? (<UI.Button slot="secondary-actions" disabled={!ready(e) || undefined} onClick={() => {
                toggle(e.key, true);
                editor.hide();
            }}>
            Approve with others
          </UI.Button>) : null}
        <UI.Button slot="secondary-actions" commandFor={editor.id} command="--hide">
          Cancel
        </UI.Button>
      </UI.Modal>
    </UI.Section>);
}
