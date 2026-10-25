import { useEffect, useState } from 'react';
import { api, toastSuccess } from '../api';
import { act, creditsLabel, fieldError, type PageError, useNoSpend } from '../kit';
import * as UI from '../ui';
export interface ImproveView {
    editable: boolean;
    sections: Array<{
        index: number;
        heading: string | null;
        words: number;
        blockedReason: string | null;
    }>;
    revision: {
        kind: 'running' | 'proposed' | 'no_changes' | 'failed' | 'cancelled';
        jobId: string;
        summary?: string;
    } | null;
    proposal: {
        batchId: string;
        summary: string | null;
        changes: Array<{
            id: string;
            heading: string | null;
            kind: 'changed' | 'added' | 'removed';
            before: string;
            after: string;
        }>;
    } | null;
    prices: {
        revision: number | null;
        section: number | null;
    };
    undo: {
        versionId: string;
        label: string;
        createdAt: string;
    } | null;
}
const sectionName = (h: string | null) => h ?? 'Introduction';
export function ImprovePreview({ id, view: v, reload, onKept, setError }: {
    id: string;
    view: ImproveView | null;
    reload: () => Promise<void>;
    onKept: () => Promise<void>;
    setError: (e: PageError | null) => void;
}) {
    const [busy, setBusy] = useState<string | null>(null);
    const [skip, setSkip] = useState<Set<string>>(new Set());
    const running = v?.revision?.kind === 'running';
    useEffect(() => {
        if (!running)
            return;
        const t = setTimeout(() => void reload(), 6000);
        return () => clearTimeout(t);
    }, [running, reload, v]);
    if (!v)
        return null;
    if (running) {
        return (<UI.Section heading="Your change is being written">
        <UI.Stack direction="inline" gap="small-200" alignItems="center">
          <UI.Spinner size="base" accessibilityLabel="Writing"/>
          <UI.Text color="subdued">It takes about two minutes. You can leave this page; the change waits here for you.</UI.Text>
        </UI.Stack>
      </UI.Section>);
    }
    if (!v.proposal) {
        if (v.revision?.kind === 'failed' || v.revision?.kind === 'cancelled') {
            return (<UI.Section heading="The change could not be made">
          <UI.Paragraph>Nothing was charged. Try again, or describe the change differently.</UI.Paragraph>
        </UI.Section>);
        }
        if (v.revision?.kind === 'no_changes') {
            return (<UI.Section heading="Nothing needed to change">
          <UI.Paragraph>{v.revision.summary || 'The article already does what you asked.'}</UI.Paragraph>
        </UI.Section>);
        }
        return null;
    }
    const changes = v.proposal.changes;
    const keepable = changes.filter((c) => c.kind !== 'added');
    const kept = keepable.filter((c) => !skip.has(c.id));
    async function keep() {
        const r = await act(() => api<{
            applied: number;
            skipped: Array<{
                message: string;
            }>;
        }>(`blog/articles/${id}/improve/keep`, { method: 'POST', body: { ids: kept.map((c) => c.id) } }), (b) => setBusy(b ? 'keep' : null), setError);
        if (r.ok && r.data) {
            if (r.data.skipped.length)
                setError({ message: `${r.data.applied ? 'Kept, except' : 'Not kept:'} ${r.data.skipped.map((s) => s.message).join(' ')}`, planLink: false });
            else
                toastSuccess('Change kept');
            setSkip(new Set());
            await Promise.all([reload(), onKept()]);
        }
    }
    async function discard() {
        const r = await act(() => api(`blog/articles/${id}/improve/discard`, { method: 'POST' }), (b) => setBusy(b ? 'discard' : null), setError);
        if (r.ok) {
            toastSuccess('Change discarded');
            await reload();
        }
    }
    return (<UI.Section heading="A change for you to review">
      <UI.Stack gap="base">
        {v.proposal.summary ? <UI.Paragraph>{v.proposal.summary}</UI.Paragraph> : null}
        {changes.map((c) => (<UI.Box key={c.id} padding="base" border="base" borderRadius="base">
            <UI.Stack gap="small-200">
              <UI.Stack direction="inline" gap="small-200" alignItems="center" justifyContent="space-between">
                <UI.Text type="strong">{sectionName(c.heading)}</UI.Text>
                {c.kind === 'added' ? (<UI.Badge>New section</UI.Badge>) : keepable.length > 1 ? (<UI.Checkbox label="Keep this" checked={!skip.has(c.id) || undefined} onChange={(e) => setSkip((s) => {
                    const next = new Set(s);
                    if (e.currentTarget.checked === true)
                        next.delete(c.id);
                    else
                        next.add(c.id);
                    return next;
                })}/>) : null}
              </UI.Stack>
              <UI.QueryContainer>
                <UI.Grid gridTemplateColumns="@container (inline-size > 640px) 1fr 1fr, 1fr" gap="base">
                  <UI.Stack gap="small-100">
                    <UI.Text color="subdued">{c.kind === 'added' ? 'Not added automatically' : 'Now'}</UI.Text>
                    <UI.Text color="subdued">{c.kind === 'added' ? 'A new section cannot be added by keeping a change yet. Copy it into the post after publishing if you want it.' : c.before}</UI.Text>
                  </UI.Stack>
                  <UI.Stack gap="small-100">
                    <UI.Text type="strong">{c.kind === 'removed' ? 'Removed' : 'After the change'}</UI.Text>
                    <UI.Text>{c.kind === 'removed' ? 'This section would be removed.' : c.after}</UI.Text>
                  </UI.Stack>
                </UI.Grid>
              </UI.QueryContainer>
            </UI.Stack>
          </UI.Box>))}
        <UI.Stack direction="inline" gap="base">
          <UI.Button variant="primary" disabled={busy !== null || kept.length === 0 || undefined} loading={busy === 'keep' || undefined} onClick={() => void keep()}>
            {keepable.length > 1 && kept.length < keepable.length ? `Keep ${kept.length} of ${keepable.length}` : 'Keep the change'}
          </UI.Button>
          <UI.Button disabled={busy !== null || undefined} loading={busy === 'discard' || undefined} onClick={() => void discard()}>
            Discard
          </UI.Button>
        </UI.Stack>
        <UI.Text color="subdued">The change has been paid for. Keeping or discarding it is free, and a kept change can be undone.</UI.Text>
      </UI.Stack>
    </UI.Section>);
}
export function ImproveCard({ id, view: v, reload, error, setError, onChanged }: {
    id: string;
    view: ImproveView | null;
    reload: () => Promise<void>;
    error: PageError | null;
    setError: (e: PageError | null) => void;
    onChanged: () => Promise<void>;
}) {
    const noSpend = useNoSpend();
    const [busy, setBusy] = useState<string | null>(null);
    const [whole, setWhole] = useState('');
    const [index, setIndex] = useState<number | null>(null);
    const [sectionAsk, setSectionAsk] = useState('');
    if (!v || !v.editable)
        return null;
    const busyElsewhere = v.revision?.kind === 'running' || !!v.proposal;
    const chosen = v.sections.find((s) => s.index === (index ?? v.sections.find((x) => !x.blockedReason)?.index ?? -1)) ?? null;
    const changed = reload;
    async function changeWhole() {
        const r = await act(() => api(`blog/articles/${id}/improve/revision`, { method: 'POST', body: { instruction: whole } }), (b) => setBusy(b ? 'whole' : null), setError);
        if (r.ok) {
            toastSuccess('Writing your change');
            setWhole('');
            await changed();
        }
    }
    async function rewrite() {
        if (!chosen)
            return;
        const r = await act(() => api<{
            lost: Array<{
                text: string;
            }>;
        }>(`blog/articles/${id}/improve/section`, { method: 'POST', body: { index: chosen.index, instruction: sectionAsk } }), (b) => setBusy(b ? 'section' : null), setError);
        if (r.ok) {
            toastSuccess('Section rewritten. Review it above the article.');
            setSectionAsk('');
            await changed();
        }
    }
    async function undo() {
        const versionId = v?.undo?.versionId;
        if (!versionId)
            return;
        const r = await act(() => api(`blog/articles/${id}/improve/undo`, { method: 'POST', body: { versionId } }), (b) => setBusy(b ? 'undo' : null), setError);
        if (r.ok) {
            toastSuccess('Change undone');
            await Promise.all([changed(), onChanged()]);
        }
    }
    return (<UI.Section heading="Improve this article">
      <UI.Stack gap="base">
        {v.revision?.kind === 'running' ? (<UI.Text color="subdued">A change is being written. It appears above the article when it is ready.</UI.Text>) : busyElsewhere ? (<UI.Text color="subdued">Review the change waiting above the article first.</UI.Text>) : null}
        <UI.Stack gap="small-200">
          <UI.Text type="strong">Change the whole article</UI.Text>
          <UI.TextArea label="What should change?" value={whole} rows={2} maxLength={2000} placeholder="Make it shorter and friendlier, and mention our free returns" error={busy === null ? fieldError(error, 'instruction') : undefined} onInput={(e) => setWhole(e.currentTarget.value)}/>
          <UI.Stack direction="inline">
            <UI.Button disabled={!whole.trim() || noSpend || busy !== null || busyElsewhere || undefined} loading={busy === 'whole' || undefined} onClick={() => void changeWhole()}>
              {`Change the article${v.prices.revision ? ` · ${creditsLabel(v.prices.revision)}` : ''}`}
            </UI.Button>
          </UI.Stack>
        </UI.Stack>
        <UI.Divider />
        <UI.Stack gap="small-200">
          <UI.Text type="strong">Rewrite one section</UI.Text>
          <UI.Select label="Section" value={chosen ? String(chosen.index) : ''} onChange={(e) => setIndex(Number(e.currentTarget.value))}>
            {v.sections.map((s) => (<UI.Option key={s.index} value={String(s.index)} disabled={!!s.blockedReason || undefined}>
                {`${sectionName(s.heading)}${s.blockedReason ? ' (change the whole article instead)' : ''}`}
              </UI.Option>))}
          </UI.Select>
          {chosen?.blockedReason ? <UI.Text color="subdued">{chosen.blockedReason}</UI.Text> : null}
          <UI.TextField label="How should it change?" value={sectionAsk} maxLength={500} placeholder="Add a tip for beginners" onInput={(e) => setSectionAsk(e.currentTarget.value)}/>
          <UI.Stack direction="inline">
            <UI.Button disabled={!chosen || !!chosen.blockedReason || noSpend || !sectionAsk.trim() || busy !== null || busyElsewhere || undefined} loading={busy === 'section' || undefined} onClick={() => void rewrite()}>
              {`Rewrite the section${v.prices.section ? ` · ${creditsLabel(v.prices.section)}` : ''}`}
            </UI.Button>
          </UI.Stack>
        </UI.Stack>
        <UI.Text color="subdued">You see every change before it is kept. Charged when the change is ready to review; if it cannot be made, nothing is charged.</UI.Text>
        {v.undo ? (<UI.Stack direction="inline">
            <UI.Button variant="tertiary" icon="undo" disabled={busy !== null || undefined} loading={busy === 'undo' || undefined} onClick={() => void undo()}>
              Undo the last change
            </UI.Button>
          </UI.Stack>) : null}
      </UI.Stack>
    </UI.Section>);
}
