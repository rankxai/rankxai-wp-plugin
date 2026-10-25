import { useStore } from '../plan-context';
import { useRef, useState } from 'react';
import { readRedirectsCsv, redirectsToCsv, type CsvReadResult } from '@/lib/shopify-app/redirect-csv-core';
import { api, toastSuccess } from '../api';
import { toastWrite } from '../reviews';
import { fmtCount, fmtDate, fmtNumber } from '../format';
import { ErrorBanner, act, useLoad, type PageError } from '../kit';
import { BatchProgress, useBatch } from '../components/BatchProgress';
import { useModal, type WriteResult } from '../components/FixModals';
import { StatusBadge } from '../components/Status';
import * as UI from '../ui';
interface Suggestion {
    id: string;
    path: string;
    title: string | null;
    createdAt: string | null;
    suggestedTarget: string | null;
}
export function RedirectsSection({ setError }: {
    setError: (e: PageError | null) => void;
}) {
    const { words } = useStore();
    const list = useLoad<{
        redirects: Array<{
            id: string;
            path: string;
            target: string;
        }>;
        truncated: boolean;
    }>('fixes/redirects');
    const suggestions = useLoad<{
        suggestions: Suggestion[];
    }>('fixes/redirect-suggestions');
    const [busy, setBusy] = useState<string | null>(null);
    const [targets, setTargets] = useState<Record<string, string>>({});
    const [handled, setHandled] = useState<Record<string, 'redirected' | 'dismissed' | 'unconfirmed'>>({});
    const [csv, setCsv] = useState<(CsvReadResult & {
        name: string;
    }) | null>(null);
    const fileRef = useRef<HTMLInputElement | null>(null);
    const [manual, setManual] = useState({ path: '', target: '' });
    const [added, setAdded] = useState<(WriteResult & {
        path: string;
        target: string;
    }) | null>(null);
    const importModal = useModal('import');
    const [importError, setImportError] = useState<PageError | null>(null);
    const batch = useBatch(() => void list.reload());
    async function exportCsv() {
        const r = await act(() => api<{
            rows: Array<{
                path: string;
                target: string;
            }>;
        }>('fixes/redirects/export'), (b) => setBusy(b ? 'export' : null), setError);
        if (!r.ok || !r.data)
            return;
        const url = URL.createObjectURL(new Blob([redirectsToCsv(r.data.rows)], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'redirects.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        toastSuccess(`${fmtCount(r.data.rows.length, 'redirect', 'redirects')} exported`);
    }
    async function readFile(file: File | undefined) {
        if (!file)
            return;
        const text = await file.text().catch(() => null);
        if (fileRef.current)
            fileRef.current.value = '';
        if (text === null) {
            setError({ message: 'That file could not be read. Save it as a CSV and try again.', planLink: false });
            return;
        }
        setCsv({ ...readRedirectsCsv(text), name: file.name });
        importModal.show();
    }
    async function importRows() {
        if (!csv || csv.rows.length === 0)
            return;
        const r = await act(() => api('fixes/redirects/import', { method: 'POST', body: { rows: csv.rows } }), (b) => setBusy(b ? 'import' : null), setImportError);
        if (r.ok && batch.begin(r.data, 'apply')) {
            importModal.hide();
            setCsv(null);
        }
    }
    async function redirect(s: Suggestion) {
        const target = (targets[s.id] ?? s.suggestedTarget ?? '').trim();
        if (!target)
            return;
        const r = await act(() => api<WriteResult>(`fixes/redirect-suggestions/${s.id}/apply`, { method: 'POST', body: { target } }), (b) => setBusy(b ? s.id : null), setError);
        if (r.ok && r.data) {
            setHandled((h) => ({ ...h, [s.id]: r.data!.verified ? 'redirected' : 'unconfirmed' }));
            toastWrite(r.data.verified, 'Redirect created and confirmed', 'Redirect created');
            void list.reload();
        }
    }
    async function addRedirect() {
        const path = manual.path.trim();
        const target = manual.target.trim();
        if (!path || !target)
            return;
        const r = await act(() => api<WriteResult>('fixes/redirects', { method: 'POST', body: { path, target } }), (b) => setBusy(b ? 'add' : null), setError);
        if (r.ok && r.data) {
            setAdded({ ...r.data, path, target });
            setManual({ path: '', target: '' });
            toastWrite(r.data.verified, 'Redirect created and confirmed', 'Redirect created');
            void list.reload();
        }
    }
    async function undoAdded() {
        const changeId = added?.changeId;
        if (!changeId)
            return;
        const r = await act(() => api(`changes/${changeId}/undo`, { method: 'POST' }), (b) => setBusy(b ? 'undo:add' : null), setError);
        if (r.ok) {
            setAdded(null);
            toastSuccess('Redirect removed and confirmed');
            void list.reload();
        }
    }
    async function dismiss(s: Suggestion) {
        const r = await act(() => api(`fixes/redirect-suggestions/${s.id}/dismiss`, { method: 'POST' }), (b) => setBusy(b ? `dismiss:${s.id}` : null), setError);
        if (r.ok)
            setHandled((h) => ({ ...h, [s.id]: 'dismissed' }));
    }
    const pending = (suggestions.data?.suggestions ?? []).filter((s) => handled[s.id] !== 'dismissed');
    const csvAvailable = suggestions.status !== 404;
    return (<>
      {pending.length > 0 ? (<UI.Section heading="Products you deleted">
          <UI.Stack gap="base">
            <UI.Paragraph>Their old addresses now show a “page not found”. Send each one to a page that still sells something close, such as its {words.collection}.</UI.Paragraph>
            <UI.Table variant="auto">
              <UI.TableHeaderRow>
                <UI.TableHeader listSlot="primary">Old address</UI.TableHeader>
                <UI.TableHeader listSlot="secondary">Product</UI.TableHeader>
                <UI.TableHeader listSlot="labeled">Send visitors to</UI.TableHeader>
                <UI.TableHeader listSlot="inline">Action</UI.TableHeader>
              </UI.TableHeaderRow>
              <UI.TableBody>
                {pending.map((s) => {
                const state = handled[s.id];
                const value = targets[s.id] ?? s.suggestedTarget ?? '';
                return (<UI.TableRow key={s.id}>
                      <UI.TableCell>{s.path}</UI.TableCell>
                      <UI.TableCell>
                        <UI.Stack gap="small-100">
                          <UI.Text>{s.title ?? 'A deleted product'}</UI.Text>
                          {s.createdAt ? <UI.Text color="subdued">{`Deleted ${fmtDate(s.createdAt)}`}</UI.Text> : null}
                        </UI.Stack>
                      </UI.TableCell>
                      <UI.TableCell>
                        {state ? (<UI.Text>{value}</UI.Text>) : (<UI.TextField label="Send visitors to" labelAccessibilityVisibility="exclusive" placeholder={words.redirectExample} value={value} maxLength={500} onInput={(e) => setTargets((t) => ({ ...t, [s.id]: e.currentTarget.value }))}/>)}
                      </UI.TableCell>
                      <UI.TableCell>
                        {state ? (<StatusBadge status={state === 'redirected' ? 'saved' : 'saved_unconfirmed'}/>) : (<UI.Stack direction="inline" gap="small-200">
                            <UI.Button variant="primary" disabled={!value.trim() || busy !== null || undefined} loading={busy === s.id || undefined} onClick={() => void redirect(s)}>
                              Redirect
                            </UI.Button>
                            <UI.Button variant="tertiary" disabled={busy !== null || undefined} loading={busy === `dismiss:${s.id}` || undefined} onClick={() => void dismiss(s)}>
                              Dismiss
                            </UI.Button>
                          </UI.Stack>)}
                      </UI.TableCell>
                    </UI.TableRow>);
            })}
              </UI.TableBody>
            </UI.Table>
          </UI.Stack>
        </UI.Section>) : null}

      <UI.Section heading="Your redirects">
        <UI.Stack gap="base">
          <UI.Stack gap="small-200">
            <UI.Text type="strong">Add a redirect</UI.Text>
            <UI.Text color="subdued">
              For an old address that now shows a “page not found”. {words.redirectRule} Send visitors to a page on your store.
            </UI.Text>
            <UI.QueryContainer>
              <UI.Grid gridTemplateColumns="@container (inline-size > 640px) 1fr 1fr auto, 1fr" gap="small-200" alignItems="end">
                <UI.TextField label="From (old address)" placeholder="/products/old-name" value={manual.path} maxLength={500} onInput={(e) => setManual((m) => ({ ...m, path: e.currentTarget.value }))}/>
                <UI.TextField label="To" placeholder={words.redirectExample} value={manual.target} maxLength={500} onInput={(e) => setManual((m) => ({ ...m, target: e.currentTarget.value }))}/>
                <UI.Box>
                  <UI.Button variant="primary" disabled={!manual.path.trim() || !manual.target.trim() || busy !== null || undefined} loading={busy === 'add' || undefined} onClick={() => void addRedirect()}>
                    Add redirect
                  </UI.Button>
                </UI.Box>
              </UI.Grid>
            </UI.QueryContainer>
            {added ? (<UI.Stack direction="inline" gap="small-200" alignItems="center">
                <StatusBadge status={added.verified ? 'saved' : 'saved_unconfirmed'}/>
                <UI.Text color="subdued">{`${added.path} → ${added.target}`}</UI.Text>
                {added.changeId ? (<UI.Button variant="tertiary" disabled={busy !== null || undefined} loading={busy === 'undo:add' || undefined} onClick={() => void undoAdded()}>
                    Undo
                  </UI.Button>) : null}
              </UI.Stack>) : null}
          </UI.Stack>
          {csvAvailable ? (<UI.Stack direction="inline" gap="small-200">
              <UI.Button disabled={busy !== null || undefined} loading={busy === 'export' || undefined} onClick={() => void exportCsv()}>
                Export CSV
              </UI.Button>
              <UI.Button disabled={busy !== null || undefined} onClick={() => fileRef.current?.click()}>
                Import CSV
              </UI.Button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" hidden aria-label="Import CSV" onChange={(e) => void readFile(e.currentTarget.files?.[0])}/>
            </UI.Stack>) : null}
          <BatchProgress handle={batch} setError={setError}/>
          {list.error ? (<UI.Paragraph>{list.error}</UI.Paragraph>) : !list.data ? (<UI.Text color="subdued">Reading your redirects…</UI.Text>) : list.data.redirects.length === 0 ? (<UI.EmptyState heading="No redirects yet">
              <UI.Paragraph>A redirect sends visitors from an old address to a page that exists. Add one above, or import a CSV.</UI.Paragraph>
            </UI.EmptyState>) : (<UI.Table variant="auto">
              <UI.TableHeaderRow>
                <UI.TableHeader listSlot="primary">From</UI.TableHeader>
                <UI.TableHeader listSlot="secondary">To</UI.TableHeader>
                <UI.TableHeader listSlot="inline">Action</UI.TableHeader>
              </UI.TableHeaderRow>
              <UI.TableBody>
                {list.data.redirects.map((r) => (<UI.TableRow key={r.id}>
                    <UI.TableCell>{r.path}</UI.TableCell>
                    <UI.TableCell>{r.target}</UI.TableCell>
                    <UI.TableCell>
                      <UI.Button variant="tertiary" disabled={busy !== null || undefined} loading={busy === r.id || undefined} onClick={() => void act(() => api('fixes/redirects/delete', { method: 'POST', body: { redirectId: r.id } }), (b) => setBusy(b ? r.id : null), setError).then(async (res) => {
                    if (res.ok) {
                        toastSuccess('Redirect removed and confirmed');
                        await list.reload();
                    }
                })}>
                        Remove
                      </UI.Button>
                    </UI.TableCell>
                  </UI.TableRow>))}
              </UI.TableBody>
            </UI.Table>)}
          {list.data?.truncated ? <UI.Text color="subdued">Your store has more redirects than are listed here. Export them to see every one.</UI.Text> : null}
        </UI.Stack>
      </UI.Section>

      <UI.Modal id={importModal.id} heading={csv ? `Import ${csv.name}` : 'Import redirects'} size="large">
        {csv ? (<UI.Stack gap="base">
            <ErrorBanner error={importError} onDismiss={importError ? () => setImportError(null) : undefined}/>
            <UI.Paragraph>
              {csv.rows.length === 0
                ? 'No redirect in this file can be imported.'
                : `${fmtCount(csv.rows.length, 'redirect', 'redirects')} ready. Each is checked on your store after it is created, and the import can be undone as one.`}
            </UI.Paragraph>
            {csv.rows.length > 0 ? (<UI.Table variant="auto">
                <UI.TableHeaderRow>
                  <UI.TableHeader listSlot="primary">From</UI.TableHeader>
                  <UI.TableHeader listSlot="secondary">To</UI.TableHeader>
                </UI.TableHeaderRow>
                <UI.TableBody>
                  {csv.rows.slice(0, 20).map((r) => (<UI.TableRow key={r.path}>
                      <UI.TableCell>{r.path}</UI.TableCell>
                      <UI.TableCell>{r.target}</UI.TableCell>
                    </UI.TableRow>))}
                </UI.TableBody>
              </UI.Table>) : null}
            {csv.rows.length > 20 ? <UI.Text color="subdued">{`and ${fmtNumber(csv.rows.length - 20)} more.`}</UI.Text> : null}
            {csv.problems.length > 0 ? (<UI.Stack gap="small-100">
                <UI.Text type="strong">{`${fmtCount(csv.problems.length, 'line', 'lines')} left out`}</UI.Text>
                {csv.problems.slice(0, 10).map((p) => (<UI.Text key={p.line} color="subdued">{`Line ${fmtNumber(p.line)}: ${p.reason}`}</UI.Text>))}
              </UI.Stack>) : null}
            <UI.Text color="subdued">The file needs two columns: the old address (starting with /) and where to send visitors.</UI.Text>
          </UI.Stack>) : null}
        <UI.Button slot="primary-action" variant="primary" disabled={!csv || csv.rows.length === 0 || busy !== null || undefined} loading={busy === 'import' || undefined} onClick={() => void importRows()}>
          {csv && csv.rows.length > 0 ? `Import ${fmtCount(csv.rows.length, 'redirect', 'redirects')}` : 'Import'}
        </UI.Button>
        <UI.Button slot="secondary-actions" commandFor={importModal.id} command="--hide">
          Cancel
        </UI.Button>
      </UI.Modal>
    </>);
}
