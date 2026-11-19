import { useCallback, useEffect, useRef, useState } from 'react';
import { APP_PATHS } from '@/lib/shopify-app/app-routes-core';
import { BATCH_POLL_MS, batchFromStart, batchFromView, batchSummary, canUndoBatch, failedItems, type BatchState, } from '@/lib/shopify-app/batch-progress-core';
import { api, toastSuccess } from '../api';
import { askAfterBatch } from '../reviews';
import { fmtNumber } from '../format';
import { act, type PageError } from '../kit';
import * as UI from '../ui';
export type BatchKind = 'apply' | 'undo';
export interface BatchHandle {
    state: BatchState | null;
    kind: BatchKind;
    begin: (raw: unknown, kind?: BatchKind) => boolean;
    clear: () => void;
}
export function useBatch(onSettled?: (s: BatchState, kind: BatchKind) => void): BatchHandle {
    const [state, setState] = useState<BatchState | null>(null);
    const [kind, setKind] = useState<BatchKind>('apply');
    const settled = useRef(onSettled);
    useEffect(() => {
        settled.current = onSettled;
    });
    const misses = useRef(0);
    const begin = useCallback((raw: unknown, k: BatchKind = 'apply') => {
        const s = batchFromStart(raw);
        if (!s)
            return false;
        misses.current = 0;
        setKind(k);
        setState(s);
        if (s.status !== 'running')
            settled.current?.(s, k);
        return true;
    }, []);
    useEffect(() => {
        if (!state || state.status !== 'running' || !state.batchId)
            return;
        const id = state.batchId;
        let cancelled = false;
        const t = setTimeout(async () => {
            const r = await api(`batches/${id}`);
            if (cancelled)
                return;
            const next = r.ok ? batchFromView(r.data) : null;
            if (next) {
                misses.current = 0;
                setState(next);
                if (next.status !== 'running')
                    settled.current?.(next, kind);
                return;
            }
            misses.current += 1;
            if (r.status === 404 || misses.current >= 5) {
                const stopped: BatchState = { ...state, status: 'failed' };
                setState(stopped);
                settled.current?.(stopped, kind);
            }
            else
                setState({ ...state });
        }, BATCH_POLL_MS);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [state, kind]);
    return { state, kind, begin, clear: () => setState(null) };
}
async function undoAll(handle: BatchHandle, setBusy: (b: boolean) => void, setError: (e: PageError | null) => void) {
    const id = handle.state?.batchId;
    if (!id)
        return;
    const r = await act(() => api(`changes/batches/${id}/undo`, { method: 'POST' }), setBusy, setError);
    if (r.ok)
        handle.begin(r.data, 'undo');
}
export function BatchProgress({ handle, setError, heading }: {
    handle: BatchHandle;
    setError: (e: PageError | null) => void;
    heading?: string;
}) {
    const [busy, setBusy] = useState(false);
    const s = handle.state;
    const toasted = useRef<string | null>(null);
    useEffect(() => {
        if (!s || s.status !== 'done')
            return;
        const key = `${s.batchId ?? 'none'}-${handle.kind}`;
        if (toasted.current === key)
            return;
        toasted.current = key;
        const done = s.counts.applied + s.counts.unconfirmed;
        if (done > 0)
            toastSuccess(handle.kind === 'undo' ? `${fmtNumber(done)} put back` : `${fmtNumber(done)} saved`);
        askAfterBatch(handle.kind, { applied: s.counts.applied, failed: failedItems(s).length });
    }, [s, handle.kind]);
    if (!s)
        return null;
    const verb = handle.kind === 'undo' ? 'put back' : 'saved';
    const failed = failedItems(s);
    return (<UI.Box padding="base" background="subdued" borderRadius="base">
      <UI.Stack gap="small-200">
        {heading ? <UI.Text type="strong">{heading}</UI.Text> : null}
        {s.status === 'running' ? (<>
            <UI.Progress value={s.processed} max={Math.max(1, s.total)} accessibilityLabel={`${fmtNumber(s.processed)} of ${fmtNumber(s.total)} done`}/>
            <UI.Text color="subdued">{`${fmtNumber(s.processed)} of ${fmtNumber(s.total)} done. You can leave this page; the rest carries on.`}</UI.Text>
          </>) : (<>
            <UI.Stack direction="inline" gap="small-200" alignItems="center">
              {s.counts.applied > 0 ? <UI.Badge tone="success">{`${fmtNumber(s.counts.applied)} confirmed`}</UI.Badge> : null}
              {s.counts.unconfirmed > 0 ? <UI.Badge tone="warning">{`${fmtNumber(s.counts.unconfirmed)} not yet confirmed`}</UI.Badge> : null}
              {s.counts.failed > 0 ? <UI.Badge tone="critical">{`${fmtNumber(s.counts.failed)} not changed`}</UI.Badge> : null}
            </UI.Stack>
            <UI.Paragraph>{batchSummary(s, verb, fmtNumber)}</UI.Paragraph>
            {s.freeAllowanceUsed === true ? <UI.Text color="subdued">This used this month’s free bulk fix on the Free plan.</UI.Text> : null}
            {failed.length > 0 ? (<UI.Stack gap="small-100">
                {failed.slice(0, 5).map((f, i) => (<UI.Text key={i} color="subdued">{`${f.label ?? 'An item'}: ${f.message}`}</UI.Text>))}
                {failed.length > 5 ? (<UI.Text color="subdued">
                    {`and ${fmtNumber(failed.length - 5)} more, listed in `}
                    <UI.Link href={APP_PATHS.changes}>Changes</UI.Link>.
                  </UI.Text>) : null}
              </UI.Stack>) : null}
            <UI.Stack direction="inline" gap="small-200">
              {canUndoBatch(s, handle.kind) ? (<UI.Button disabled={busy || undefined} loading={busy || undefined} onClick={() => void undoAll(handle, setBusy, setError)}>
                  Undo all
                </UI.Button>) : null}
              <UI.Button variant="tertiary" onClick={handle.clear}>
                Close
              </UI.Button>
            </UI.Stack>
          </>)}
      </UI.Stack>
    </UI.Box>);
}
