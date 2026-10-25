import { useEffect, useState } from 'react';
import { formatDate, useLoad } from '../kit';
import { fmtNumber } from '../format';
import { StatusBadge } from '../components/Status';
import { askAfterOutcome } from '../reviews';
import * as UI from '../ui';
interface Cell {
    k: number;
    n: number;
    p: number | null;
}
type Verdict = {
    kind: 'waiting';
    reason: string;
    sentence: string;
    excludedDraws: number;
    cells: Record<string, Cell>;
} | {
    kind: 'no_control';
    sentence: string;
} | {
    kind: 'measured';
    direction: 'more' | 'less' | 'no_measurable_change';
    sentence: string;
    excludedDraws: number;
    cells: Record<string, Cell>;
};
type Outcome = {
    kind: 'no_plan' | 'not_product';
    sentence: string;
} | {
    kind: 'undone' | 'not_monitored';
    appliedAt: string;
    sentence: string;
} | {
    kind: 'verdict';
    appliedAt: string;
    measuredUntil: string;
    treatedProducts: Array<{
        id: string;
        title: string;
    }>;
    controlProducts: number;
    verdict: Verdict;
    storeOnlyNote: string | null;
};
type ScanOutcome = {
    state: 'not_applicable';
} | {
    state: 'waiting';
    changed: number;
    sentence: string;
} | {
    state: 'measured';
    checkedAt: string;
    measured: number;
    cleared: number;
    still: number;
    sentence: string;
};
function ScanBody({ scan }: {
    scan: ScanOutcome;
}) {
    if (scan.state === 'not_applicable')
        return null;
    return (<UI.Stack gap="small-200">
      <UI.Stack direction="inline" gap="base" alignItems="center">
        <UI.Text type="strong">Your product check</UI.Text>
        {scan.state === 'measured' ? (scan.still === 0 && scan.measured > 0 ? <UI.Badge tone="success">Fixed</UI.Badge> : <UI.Badge tone="neutral">{`${fmtNumber(scan.cleared)} of ${fmtNumber(scan.measured)} fixed`}</UI.Badge>) : (<StatusBadge status="measuring"/>)}
      </UI.Stack>
      <UI.Paragraph>{scan.sentence}</UI.Paragraph>
      {scan.state === 'measured' ? <UI.Text color="subdued">Checked {formatDate(scan.checkedAt)}.</UI.Text> : null}
    </UI.Stack>);
}
const TONE: Record<'more' | 'less' | 'no_measurable_change', {
    label: string;
    tone: 'success' | 'warning' | 'neutral';
}> = {
    more: { label: 'Appeared more', tone: 'success' },
    less: { label: 'Appeared less', tone: 'warning' },
    no_measurable_change: { label: 'No measurable change', tone: 'neutral' },
};
function OutcomeBody({ outcome }: {
    outcome: Outcome;
}) {
    if (outcome.kind !== 'verdict')
        return <UI.Paragraph>{outcome.sentence}</UI.Paragraph>;
    const v = outcome.verdict;
    const names = outcome.treatedProducts.map((p) => p.title).filter(Boolean);
    return (<UI.Stack gap="small-200">
      <UI.Stack direction="inline" gap="base" alignItems="center">
        <UI.Text type="strong">ChatGPT shopping answers</UI.Text>
        {v.kind === 'measured' ? <UI.Badge tone={TONE[v.direction].tone}>{TONE[v.direction].label}</UI.Badge> : <StatusBadge status="measuring"/>}
      </UI.Stack>
      <UI.Paragraph>{v.sentence}</UI.Paragraph>
      <UI.Text color="subdued">
        Changed: {names.length ? names.slice(0, 3).join(', ') + (names.length > 3 ? ` and ${names.length - 3} more` : '') : 'your products'}. Compared with{' '}
        {fmtNumber(outcome.controlProducts)} unchanged monitored products, from 28 days before {formatDate(outcome.appliedAt)} to {formatDate(outcome.measuredUntil)}.
      </UI.Text>
      {v.kind !== 'no_control' && v.excludedDraws > 0 ? (<UI.Text color="subdued">{fmtNumber(v.excludedDraws)} checks on days when ChatGPT was showing products unusually rarely are left out.</UI.Text>) : null}
      {outcome.storeOnlyNote ? <UI.Text color="subdued">{outcome.storeOnlyNote}</UI.Text> : null}
    </UI.Stack>);
}
export function FixOutcome({ batchId }: {
    batchId: string;
}) {
    const [open, setOpen] = useState(false);
    const res = useLoad<{
        outcome: Outcome;
        scan?: ScanOutcome | null;
    }>(open ? `changes/batches/${batchId}/outcome` : null);
    const scan = res.data?.scan;
    const outcome = res.data?.outcome;
    useEffect(() => {
        if (!scan && !outcome)
            return;
        askAfterOutcome({
            scanFixed: scan?.state === 'measured' && scan.still === 0 && scan.measured > 0,
            verdictMore: outcome?.kind === 'verdict' && outcome.verdict.kind === 'measured' && outcome.verdict.direction === 'more',
        });
    }, [scan, outcome]);
    if (!open) {
        return (<UI.Button variant="tertiary" onClick={() => setOpen(true)}>
        See result
      </UI.Button>);
    }
    return (<UI.Box padding="base" background="subdued" borderRadius="base">
      
      {res.error ? <UI.Text color="subdued">{res.error}</UI.Text> : null}
      {res.loading && !res.data ? <UI.Text color="subdued">Reading the checks before and after…</UI.Text> : null}
      {res.data ? (<UI.Stack gap="base">
          {res.data.scan ? <ScanBody scan={res.data.scan}/> : null}
          <OutcomeBody outcome={res.data.outcome}/>
        </UI.Stack>) : null}
    </UI.Box>);
}
