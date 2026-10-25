import { useEffect, useMemo, useRef, useState } from 'react';
import { APP_PATHS, searchHref } from '@/lib/shopify-app/app-routes-core';
import { snippetFor, widthNote, type Device, type Fitted } from '@/lib/shopify-app/serp-preview-core';
import { api, toastSuccess } from '../api';
import { toastWrite } from '../reviews';
import { usePlan, useStore } from '../plan-context';
import { fmtNumber } from '../format';
import { ErrorBanner, GoButton, PricedButton, act, creditsLabel, fieldError, useLoad, usePageError, type PageError } from '../kit';
import { BatchProgress, useBatch } from '../components/BatchProgress';
import { useModal, type WriteResult } from '../components/FixModals';
import { ProductCell, SkeletonSection, StatusBadge } from '../components/Status';
import * as UI from '../ui';
type Severity = 'must' | 'should' | 'nice';
type ObjectType = 'product' | 'collection' | 'page' | 'article';
interface Row {
    id: string;
    type: ObjectType;
    typeLabel: string;
    title: string | null;
    url: string | null;
    imageUrl: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    shownTitle: string;
    shownDescription: string | null;
    issues: Array<{
        code: string;
        severity: Severity;
        label: string;
        why: string;
        others: number | null;
    }>;
    clicks: number | null;
    impressions: number | null;
}
export interface ListingsData {
    state: 'ready' | 'first_check';
    refreshing: boolean;
    readFailed?: boolean;
    readAt?: string;
    truncated?: boolean;
    rows?: Row[];
    total?: number;
    totalAll?: number;
    page?: number;
    pages?: number;
    pageSize?: number;
    byType?: Record<ObjectType, number>;
    byIssue?: Array<{
        code: string;
        label: string;
        severity: Severity;
        pages: number;
    }>;
    clean?: number;
    home?: {
        description: string | null;
        title: string | null;
        shopName: string | null;
        issues: Array<{
            code: string;
            severity: Severity;
            label: string;
            why: string;
        }>;
        adminPath: string;
    } | null;
    google?: {
        window: {
            from: string;
            to: string;
        } | null;
    } | null;
    prices?: {
        writeSeo: number | null;
    };
    focus?: Row | null;
    matching?: Row[];
}
interface Draft {
    seoTitle: string;
    seoDescription: string;
    skip?: boolean;
}
const TONE: Record<Severity, 'warning' | 'caution' | 'info'> = { must: 'warning', should: 'caution', nice: 'info' };
const TYPE_OPTIONS: Array<{
    value: '' | ObjectType;
    label: string;
}> = [
    { value: '', label: 'All pages' },
    { value: 'product', label: 'Products' },
    { value: 'collection', label: 'Collections' },
    { value: 'page', label: 'Pages' },
    { value: 'article', label: 'Blog posts' },
];
const WRITE_MAX = 50;
const badgeText = (i: Row['issues'][number]) => (i.others ? `${i.label} (${fmtNumber(i.others)} other${i.others === 1 ? '' : 's'})` : i.label);
export function Snippet({ url, title, description, device = 'desktop' }: {
    url: string | null;
    title: string;
    description: string | null;
    device?: Device;
}) {
    const s = snippetFor(title, description, device);
    const host = (() => {
        try {
            const u = new URL(url ?? '');
            return `${u.host}${u.pathname === '/' ? '' : ` › ${u.pathname.split('/').filter(Boolean).join(' › ')}`}`;
        }
        catch {
            return url ?? '';
        }
    })();
    return (<UI.Stack gap="none">
      {host ? <UI.Text color="subdued">{host}</UI.Text> : null}
      <UI.Text type="strong">{s.title.shown}</UI.Text>
      {s.description ? <UI.Text>{s.description.shown}</UI.Text> : <UI.Text color="subdued">No search description: Google writes its own from the page.</UI.Text>}
    </UI.Stack>);
}
export function Listings({ setError, issue: initialIssue = null, product = null, select = false }: {
    setError: (e: PageError | null) => void;
    issue?: string | null;
    product?: string | null;
    select?: boolean;
}) {
    const { words } = useStore();
    const { plan, ready: planReady, reload: reloadPlan } = usePlan();
    const access = plan?.locks.access ?? null;
    const [type, setType] = useState<'' | ObjectType>('');
    const [issue, setIssue] = useState<string>(initialIssue ?? 'all');
    const [sort, setSort] = useState<'impact' | 'clicks' | 'name'>('impact');
    const [q, setQ] = useState('');
    const [term, setTerm] = useState('');
    const [page, setPage] = useState(0);
    useEffect(() => {
        const id = setTimeout(() => {
            setTerm(q.trim());
            setPage(0);
        }, 350);
        return () => clearTimeout(id);
    }, [q]);
    const path = `seo/listings?type=${type}&issue=${encodeURIComponent(issue)}&sort=${sort}&q=${encodeURIComponent(term)}&page=${page}${product ? `&focus=${product}` : ''}${select ? '&select=1' : ''}`;
    const load = useLoad<ListingsData>(path);
    const [last, setLast] = useState<ListingsData | null>(null);
    if (load.data && load.data !== last)
        setLast(load.data);
    const d = planReady ? (load.data ?? last) : null;
    const [selected, setSelected] = useState<Map<string, Row>>(new Map());
    const [drafts, setDrafts] = useState<Record<string, Draft>>({});
    const [bulk, setBulk] = useState<{
        phase: 'writing' | 'review';
        ids: string[];
        done: number;
        failed: number;
    } | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [done, setDone] = useState<Record<string, WriteResult>>({});
    const batch = useBatch(() => {
        setBulk(null);
        setSelected(new Map());
        void load.reload();
    });
    const editor = useModal('listing');
    const [editing, setEditing] = useState<Row | null>(null);
    const [device, setDevice] = useState<Device>('desktop');
    const [modalError, setModalError] = usePageError();
    const focusOpened = useRef(false);
    const preselected = useRef(false);
    if (select && !preselected.current && load.data?.matching) {
        preselected.current = true;
        setSelected(new Map(load.data.matching.map((r) => [r.id, r])));
    }
    const focusRow = product && d?.focus ? d.focus : null;
    const focusMissing = !!product && !!d && d.state === 'ready' && d.focus === null;
    useEffect(() => {
        if (!focusRow || focusOpened.current)
            return;
        focusOpened.current = true;
        open(focusRow);
    });
    useEffect(() => {
        if (!d?.refreshing)
            return;
        const id = setTimeout(() => void load.reload(), 4000);
        return () => clearTimeout(id);
    }, [d?.refreshing, load]);
    const price = d?.prices?.writeSeo ?? null;
    const draftOf = (r: Row): Draft => drafts[r.id] ?? { seoTitle: r.seoTitle ?? '', seoDescription: r.seoDescription ?? '' };
    const setDraft = (id: string, patch: Partial<Draft>, r: Row) => setDrafts((all) => ({ ...all, [id]: { ...draftOf(r), ...all[id], ...patch } }));
    function open(r: Row) {
        setEditing(r);
        setModalError(null);
        editor.show();
    }
    async function saveOne(r: Row) {
        const dr = draftOf(r);
        const body: Record<string, unknown> = { objectType: r.type, objectId: r.id, label: r.title ?? 'a page' };
        if (dr.seoTitle.trim() !== (r.seoTitle ?? ''))
            body.seoTitle = dr.seoTitle;
        if (dr.seoDescription.trim() !== (r.seoDescription ?? ''))
            body.seoDescription = dr.seoDescription;
        const res = await act(() => api<WriteResult>('fixes/seo', { method: 'POST', body }), (b) => setBusy(b ? `save:${r.id}` : null), setModalError);
        if (res.ok && res.data) {
            setDone((all) => ({ ...all, [r.id]: res.data! }));
            toastWrite(res.data.verified, 'Saved and confirmed on your store', 'Saved');
            editor.hide();
            void load.reload();
        }
    }
    async function writeOne(r: Row, onError: (e: PageError | null) => void): Promise<'ok' | 'stop' | 'failed'> {
        const res = await act(() => api<{
            suggestion: {
                seoTitle: string;
                seoDescription: string;
            };
        }>('fixes/seo/suggest', { method: 'POST', body: { objectType: r.type, objectId: r.id } }), () => undefined, onError);
        if (res.ok && res.data) {
            setDrafts((all) => ({ ...all, [r.id]: { seoTitle: res.data!.suggestion.seoTitle, seoDescription: res.data!.suggestion.seoDescription } }));
            return 'ok';
        }
        return res.status === 402 || res.status === 403 ? 'stop' : 'failed';
    }
    async function suggestInEditor(r: Row) {
        setBusy(`suggest:${r.id}`);
        const out = await writeOne(r, setModalError);
        setBusy(null);
        if (out === 'ok') {
            toastSuccess('Written. Review it, then save.');
            void reloadPlan();
        }
    }
    async function writeSelected() {
        const rows = [...selected.values()].slice(0, WRITE_MAX);
        setBulk({ phase: 'writing', ids: rows.map((r) => r.id), done: 0, failed: 0 });
        let doneN = 0;
        let failed = 0;
        for (const r of rows) {
            const out = await writeOne(r, setError);
            if (out === 'stop')
                break;
            if (out === 'ok')
                doneN++;
            else
                failed++;
            setBulk((b) => (b ? { ...b, done: doneN, failed } : b));
        }
        void reloadPlan();
        setBulk((b) => (b ? { ...b, phase: 'review', done: doneN, failed } : b));
    }
    async function approveDrafts() {
        if (!bulk)
            return;
        const rows = bulk.ids.map((id) => selected.get(id)).filter((r): r is Row => !!r && !!drafts[r.id] && !drafts[r.id]!.skip);
        const items = rows.map((r) => ({ kind: 'seo', objectType: r.type, objectId: r.id, seoTitle: drafts[r.id]!.seoTitle, seoDescription: drafts[r.id]!.seoDescription, label: r.title ?? 'a page' }));
        if (items.length === 0)
            return;
        const res = await act(() => api('fixes/apply', { method: 'POST', body: { items } }), (b) => setBusy(b ? 'approve' : null), setError);
        if (res.ok)
            batch.begin(res.data, 'apply');
    }
    const rows = d?.rows ?? [];
    const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
    const toggle = (r: Row, on: boolean) => setSelected((s) => {
        const next = new Map(s);
        if (on)
            next.set(r.id, r);
        else
            next.delete(r.id);
        return next;
    });
    const issueOptions = useMemo(() => d?.byIssue ?? [], [d?.byIssue]);
    if (!d)
        return load.loading || (load.data && !planReady) ? <SkeletonSection lines={6} label="Reading your listings"/> : null;
    if (d.state === 'first_check') {
        return (<UI.Section heading={d.readFailed ? 'Your store could not be read' : 'Checking your store'}>
        <UI.Text color="subdued">
          {d.readFailed
                ? 'We could not read your products and pages just now. We try again on our own; Check again on the Overview tries now.'
                : `We are reading your products, ${words.collections}, pages and posts. This takes under a minute.`}
        </UI.Text>
      </UI.Section>);
    }
    const e = editing;
    const ed = e ? draftOf(e) : null;
    const reviewRows = bulk?.phase === 'review' ? bulk.ids.map((id) => selected.get(id)).filter((r): r is Row => !!r && !!drafts[r.id]) : [];
    return (<UI.Stack gap="base">
      {d.home ? (<UI.Section heading="Home page">
          <UI.Stack gap="base">
            <UI.Box paddingInline="small-300" paddingBlock="small-200" background="subdued" borderRadius="base">
              <Snippet url={null} title={d.home.title ?? d.home.shopName ?? 'Your store'} description={d.home.description}/>
            </UI.Box>
            {d.home.issues.map((i) => (<UI.Stack key={i.code} direction="inline" gap="small-200" alignItems="center">
                <UI.Badge tone={TONE[i.severity]}>{i.label}</UI.Badge>
                <UI.Text color="subdued">{i.why}</UI.Text>
              </UI.Stack>))}
            <UI.Stack direction="inline" gap="base" alignItems="center">
              <GoButton href={d.home.adminPath} label={words.homeListingButton}/>
              <UI.Text color="subdued">{`Apps cannot change the home page listing, so it is set in ${words.homeListingPlace}.`}</UI.Text>
            </UI.Stack>
          </UI.Stack>
        </UI.Section>) : null}

      {focusMissing ? (<UI.Banner tone="info">{`That product is not in search (it is a draft, or not on your ${words.storefront}), so it has no listing to edit here.`}</UI.Banner>) : null}
      <UI.Section heading={`Search listings (${fmtNumber(d.total ?? 0)}${(d.total ?? 0) !== (d.totalAll ?? 0) ? ` of ${fmtNumber(d.totalAll ?? 0)}` : ''})`}>
        <UI.Stack gap="base">
          <UI.Text color="subdued">
            How each page may look in Google. Open one to edit it with a live preview, or tick several and have them written for you to review.
            To fill every empty title or description from a pattern, use <UI.Link href={searchHref('listings', { bulk: true })}>Fill in bulk</UI.Link>.
          </UI.Text>
          <UI.QueryContainer>
          <UI.Grid gridTemplateColumns="@container (inline-size > 720px) 2fr 1fr 1fr 1fr, 1fr" gap="base">
            <UI.SearchField label="Search" labelAccessibilityVisibility="exclusive" placeholder="Search by name, address or title" value={q} onInput={(ev) => setQ(ev.currentTarget.value)}/>
            <UI.Select label="Type" labelAccessibilityVisibility="exclusive" value={type} onChange={(ev) => { setType(ev.currentTarget.value as '' | ObjectType); setPage(0); }}>
              {TYPE_OPTIONS.map((o) => (<UI.Option key={o.value} value={o.value}>
                  {((label) => (o.value && d.byType ? `${label} (${fmtNumber(d.byType[o.value] ?? 0)})` : label))(o.value === 'collection' ? words.Collections : o.label)}
                </UI.Option>))}
            </UI.Select>
            <UI.Select label="Problem" labelAccessibilityVisibility="exclusive" value={issue} onChange={(ev) => { setIssue(ev.currentTarget.value); setPage(0); }}>
              <UI.Option value="all">Every page</UI.Option>
              <UI.Option value="problems">Any problem</UI.Option>
              <UI.Option value="clean">Looks good</UI.Option>
              {issueOptions.map((o) => (<UI.Option key={o.code} value={o.code}>{`${o.label} (${fmtNumber(o.pages)})`}</UI.Option>))}
              {issue !== 'all' && issue !== 'problems' && !issueOptions.some((o) => o.code === issue) ? <UI.Option value={issue}>That problem (none left)</UI.Option> : null}
            </UI.Select>
            <UI.Select label="Sort" labelAccessibilityVisibility="exclusive" value={sort} onChange={(ev) => { setSort(ev.currentTarget.value as 'impact' | 'clicks' | 'name'); setPage(0); }}>
              <UI.Option value="impact">Worst first</UI.Option>
              {d.google ? <UI.Option value="clicks">Most clicks</UI.Option> : null}
              <UI.Option value="name">Name</UI.Option>
            </UI.Select>
          </UI.Grid>
          </UI.QueryContainer>

          
          {(d.byIssue ?? []).length > 0 ? (<UI.Stack direction="inline" gap="small-200">
              <UI.PressButton pressed={issue === 'all'} onClick={() => { setIssue('all'); setPage(0); }}>{`All · ${fmtNumber(d.totalAll ?? 0)}`}</UI.PressButton>
              {(d.byIssue ?? []).map((o) => (<UI.PressButton key={o.code} pressed={issue === o.code} onClick={() => { setIssue(o.code); setPage(0); }}>{`${o.label} · ${fmtNumber(o.pages)}`}</UI.PressButton>))}
              {(d.clean ?? 0) > 0 ? <UI.PressButton pressed={issue === 'clean'} onClick={() => { setIssue('clean'); setPage(0); }}>{`Looks good · ${fmtNumber(d.clean ?? 0)}`}</UI.PressButton> : null}
            </UI.Stack>) : null}
          {selected.size > 0 && !bulk ? (<UI.Stack direction="inline" gap="base" alignItems="center">
              <UI.Text>{`${fmtNumber(selected.size)} selected`}</UI.Text>
              <PricedButton variant="primary" label={`Write ${fmtNumber(Math.min(selected.size, WRITE_MAX))} for me`} credits={price === null ? null : price * Math.min(selected.size, WRITE_MAX)} lock={access} busy={false} onClick={() => void writeSelected()}/>
              <UI.Button variant="tertiary" onClick={() => setSelected(new Map())}>Clear</UI.Button>
              {selected.size > WRITE_MAX ? <UI.Text color="subdued">{`The first ${WRITE_MAX} are written in one go.`}</UI.Text> : null}
            </UI.Stack>) : null}

          {bulk?.phase === 'writing' ? (<UI.Stack direction="inline" gap="small-200" alignItems="center">
              <UI.Spinner accessibilityLabel="Writing" size="base"/>
              <UI.Text>{`Writing ${fmtNumber(bulk.done + bulk.failed + 1 > bulk.ids.length ? bulk.ids.length : bulk.done + bulk.failed + 1)} of ${fmtNumber(bulk.ids.length)}. Nothing is saved until you approve.`}</UI.Text>
            </UI.Stack>) : null}

          <BatchProgress handle={batch} setError={setError}/>

          {bulk?.phase === 'review' ? (<UI.Box padding="base" border="base" borderRadius="large">
              <UI.Stack gap="base">
                <UI.Text type="strong">{`Review ${fmtNumber(reviewRows.length)} written listings`}</UI.Text>
                <UI.Text color="subdued">
                  {bulk.failed > 0 ? `${fmtNumber(bulk.failed)} could not be written and are left out. ` : ''}
                  {bulk.done < bulk.ids.length - bulk.failed ? 'Writing stopped early, so only these are here. ' : ''}
                  Edit any of them, untick the ones to leave as they are, then approve. Each one is checked on your store and can be undone.
                </UI.Text>
                <UI.Table variant="auto">
                  <UI.TableHeaderRow>
                    <UI.TableHeader listSlot="inline">Keep</UI.TableHeader>
                    <UI.TableHeader listSlot="primary">Page</UI.TableHeader>
                    <UI.TableHeader listSlot="secondary">New listing</UI.TableHeader>
                  </UI.TableHeaderRow>
                  <UI.TableBody>
                    {reviewRows.map((r) => {
                const dr = drafts[r.id]!;
                const t = snippetFor(dr.seoTitle, dr.seoDescription, 'desktop');
                return (<UI.TableRow key={r.id}>
                          <UI.TableCell>
                            <UI.Checkbox accessibilityLabel={`Keep the new listing for ${r.title ?? 'this page'}`} checked={!dr.skip || undefined} onChange={(ev) => setDraft(r.id, { skip: ev.currentTarget.checked !== true }, r)}/>
                          </UI.TableCell>
                          <UI.TableCell>
                            <UI.Stack gap="small-100">
                              <ProductCell title={r.title} imageUrl={r.imageUrl} sub={r.typeLabel}/>
                              <UI.Text color="subdued">{`Was: ${r.seoTitle ?? 'no search title'}`}</UI.Text>
                            </UI.Stack>
                          </UI.TableCell>
                          <UI.TableCell>
                            <UI.Stack gap="small-200">
                              <UI.TextField label="Search title" value={dr.seoTitle} maxLength={70} details={widthNote(t.title, 'title')} onInput={(ev) => setDraft(r.id, { seoTitle: ev.currentTarget.value }, r)}/>
                              <UI.TextArea label="Search description" value={dr.seoDescription} maxLength={320} details={t.description ? widthNote(t.description, 'description') : undefined} onInput={(ev) => setDraft(r.id, { seoDescription: ev.currentTarget.value }, r)}/>
                            </UI.Stack>
                          </UI.TableCell>
                        </UI.TableRow>);
            })}
                  </UI.TableBody>
                </UI.Table>
                <UI.Stack direction="inline" gap="base">
                  <UI.Button variant="primary" disabled={busy !== null || reviewRows.every((r) => drafts[r.id]!.skip) || undefined} loading={busy === 'approve' || undefined} onClick={() => void approveDrafts()}>
                    {`Approve ${fmtNumber(reviewRows.filter((r) => !drafts[r.id]!.skip).length)}`}
                  </UI.Button>
                  <UI.Button onClick={() => setBulk(null)}>Discard the drafts</UI.Button>
                </UI.Stack>
              </UI.Stack>
            </UI.Box>) : null}

          {rows.length === 0 ? (<UI.Text>{(d.totalAll ?? 0) === 0 ? 'Nothing in search to list yet.' : 'No page matches these filters.'}</UI.Text>) : (<UI.Table variant="auto">
              <UI.TableHeaderRow>
                <UI.TableHeader listSlot="inline">
                  <UI.Checkbox accessibilityLabel="Select every page on this page of the list" checked={allOnPageSelected || undefined} disabled={!!bulk || undefined} onChange={(ev) => {
                const on = ev.currentTarget.checked === true;
                setSelected((s) => {
                    const next = new Map(s);
                    for (const r of rows) {
                        if (on)
                            next.set(r.id, r);
                        else
                            next.delete(r.id);
                    }
                    return next;
                });
            }}/>
                </UI.TableHeader>
                <UI.TableHeader listSlot="primary">Page and how it may look in Google</UI.TableHeader>
                {d.google ? <UI.TableHeader listSlot="labeled" format="numeric">Clicks</UI.TableHeader> : null}
                <UI.TableHeader listSlot="inline">Action</UI.TableHeader>
              </UI.TableHeaderRow>
              <UI.TableBody>
                {rows.map((r) => {
                const result = done[r.id];
                return (<UI.TableRow key={r.id}>
                      <UI.TableCell>
                        <UI.Checkbox accessibilityLabel={`Select ${r.title ?? 'this page'}`} checked={selected.has(r.id) || undefined} disabled={!!bulk || undefined} onChange={(ev) => toggle(r, ev.currentTarget.checked === true)}/>
                      </UI.TableCell>
                      <UI.TableCell>
                        
                        
                        <UI.Grid gridTemplateColumns="auto minmax(0, 1fr)" gap="small-300" alignItems="start">
                          {r.imageUrl ? <UI.Thumbnail src={r.imageUrl} alt="" size="small-200"/> : <UI.Thumbnail alt="" size="small-200"/>}
                          <UI.Stack gap="small-200">
                            <UI.Stack direction="inline" gap="small-200" alignItems="center">
                              <UI.Text type="strong">{r.title ?? 'Untitled'}</UI.Text>
                              <UI.Text color="subdued">{r.typeLabel}</UI.Text>
                              {r.issues.length > 0 ? (r.issues.map((i) => (<UI.Badge key={i.code} tone={TONE[i.severity]}>{badgeText(i)}</UI.Badge>))) : (<UI.Badge tone="success">Looks good</UI.Badge>)}
                            </UI.Stack>
                            <UI.Box paddingInline="small-300" paddingBlock="small-200" background="subdued" borderRadius="base">
                              <Snippet url={r.url} title={r.shownTitle} description={r.shownDescription}/>
                            </UI.Box>
                          </UI.Stack>
                        </UI.Grid>
                      </UI.TableCell>
                      {d.google ? <UI.TableCell>{r.clicks === null ? '—' : fmtNumber(r.clicks)}</UI.TableCell> : null}
                      <UI.TableCell>
                        {result ? (<StatusBadge status={result.verified ? 'saved' : 'saved_unconfirmed'}/>) : (<UI.Button onClick={() => open(r)} accessibilityLabel={`Edit the listing for ${r.title ?? 'this page'}`}>
                            Edit
                          </UI.Button>)}
                      </UI.TableCell>
                    </UI.TableRow>);
            })}
              </UI.TableBody>
            </UI.Table>)}

          {(d.pages ?? 1) > 1 ? (<UI.Stack direction="inline" gap="small-200" alignItems="center">
              <UI.Button icon="chevron-left" disabled={(d.page ?? 0) === 0 || undefined} onClick={() => setPage((d.page ?? 0) - 1)}>Previous</UI.Button>
              <UI.Text color="subdued">{`${fmtNumber((d.page ?? 0) * (d.pageSize ?? 50) + 1)}–${fmtNumber(Math.min(((d.page ?? 0) + 1) * (d.pageSize ?? 50), d.total ?? 0))} of ${fmtNumber(d.total ?? 0)}`}</UI.Text>
              <UI.Button icon="chevron-right" disabled={(d.page ?? 0) >= (d.pages ?? 1) - 1 || undefined} onClick={() => setPage((d.page ?? 0) + 1)}>Next</UI.Button>
            </UI.Stack>) : null}
          {d.truncated ? <UI.Text color="subdued">Your store is large: this list covers the first 2,000 of each kind of page.</UI.Text> : null}
        </UI.Stack>
      </UI.Section>

      <UI.Modal id={editor.id} heading={e ? (e.title ?? 'Edit listing') : 'Edit listing'}>
        {e && ed ? (<UI.Stack gap="base">
            <ErrorBanner error={modalError} onDismiss={modalError ? () => setModalError(null) : undefined}/>
            {e.issues.length > 0 ? (<UI.Stack gap="small-100">
                {e.issues.map((i) => (<UI.Text key={i.code} color="subdued">{`${badgeText(i)}: ${i.why}`}</UI.Text>))}
              </UI.Stack>) : null}
            <UI.TextField label="Search title" value={ed.seoTitle} maxLength={70} error={fieldError(modalError, 'seoTitle')} details={widthNote(snippetFor(ed.seoTitle || e.title || '', null, device).title, 'title')} onInput={(ev) => setDraft(e.id, { seoTitle: ev.currentTarget.value }, e)}/>
            <UI.TextArea label="Search description" value={ed.seoDescription} maxLength={320} details={ed.seoDescription.trim() ? widthNote(snippetFor('x', ed.seoDescription, device).description as Fitted, 'description') : 'Empty: Google writes its own from the page.'} onInput={(ev) => setDraft(e.id, { seoDescription: ev.currentTarget.value }, e)}/>
            <PricedButton label="Write it for me" credits={price} lock={access} busy={busy === `suggest:${e.id}`} onClick={() => void suggestInEditor(e)}/>
            <UI.Stack direction="inline" gap="small-200">
              <UI.PressButton pressed={device === 'desktop'} onClick={() => setDevice('desktop')}>Desktop</UI.PressButton>
              <UI.PressButton pressed={device === 'mobile'} onClick={() => setDevice('mobile')}>Mobile</UI.PressButton>
            </UI.Stack>
            <UI.Box padding="base" border="base" borderRadius="base">
              <UI.Stack gap="small-200">
                <UI.Text color="subdued">New</UI.Text>
                <Snippet url={e.url} title={ed.seoTitle.trim() || e.title || 'Untitled'} description={ed.seoDescription.trim() || null} device={device}/>
              </UI.Stack>
            </UI.Box>
            <UI.Box padding="base" background="subdued" borderRadius="base">
              <UI.Stack gap="small-200">
                <UI.Text color="subdued">Now</UI.Text>
                <Snippet url={e.url} title={e.shownTitle} description={e.shownDescription} device={device}/>
              </UI.Stack>
            </UI.Box>
            <UI.Text color="subdued">
              A preview: Google may show a different title or description. Saved straight to your store and checked there; undo it from <UI.Link href={APP_PATHS.changes}>Changes</UI.Link>.
            </UI.Text>
          </UI.Stack>) : null}
        <UI.Button slot="primary-action" variant="primary" disabled={!e || !ed || busy !== null || (ed.seoTitle.trim() === (e.seoTitle ?? '') && ed.seoDescription.trim() === (e.seoDescription ?? '')) || undefined} loading={(e && busy === `save:${e.id}`) || undefined} onClick={() => e && void saveOne(e)}>
          Save
        </UI.Button>
        <UI.Button slot="secondary-actions" commandFor={editor.id} command="--hide">
          Cancel
        </UI.Button>
      </UI.Modal>
      {price !== null ? <UI.Text color="subdued">{`Writing a listing for you costs ${creditsLabel(price)} a page. Typing your own is free.`}</UI.Text> : null}
    </UI.Stack>);
}
