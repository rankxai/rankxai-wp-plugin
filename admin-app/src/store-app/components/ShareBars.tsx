import { barGeometry, type ShareRate } from '@/lib/shopify-app/share-bars-core';
import { fmtNumber, fmtPercent } from '../format';
import * as UI from '../ui';
export function rateText(r: ShareRate, noun = 'answers'): string {
    if (!r.shown)
        return `Not enough checks yet (${fmtNumber(r.n)} of the ${fmtNumber(r.needed)} needed)`;
    return `${fmtNumber(r.k)} of ${fmtNumber(r.n)} ${noun} (${fmtPercent(r.p)}, likely ${fmtPercent(r.lo)}–${fmtPercent(r.hi)})`;
}
export function ShareBar({ rate, own }: {
    rate: ShareRate;
    own?: boolean;
}) {
    const g = barGeometry(rate);
    if (!g)
        return null;
    const pc = (x: number) => `${x}%`;
    return (<svg width="100%" height="18" aria-hidden="true" focusable="false" style={{ display: 'block', overflow: 'visible' }}>
      <rect x="0" y="1" width="100%" height="8" rx="4" fill="currentColor" fillOpacity={0.1}/>
      {g.fill > 0 ? <rect x="0" y="1" width={pc(g.fill)} height="8" rx="4" fill="currentColor" fillOpacity={own ? 0.85 : 0.6}/> : null}
      <line x1={pc(g.lo)} x2={pc(g.hi)} y1="14" y2="14" stroke="currentColor" strokeOpacity={0.7} strokeWidth="1.5"/>
      <line x1={pc(g.lo)} x2={pc(g.lo)} y1="11" y2="17" stroke="currentColor" strokeOpacity={0.7} strokeWidth="1.5"/>
      <line x1={pc(g.hi)} x2={pc(g.hi)} y1="11" y2="17" stroke="currentColor" strokeOpacity={0.7} strokeWidth="1.5"/>
    </svg>);
}
export interface ShareRow {
    label: string;
    isOwn: boolean;
    rate: ShareRate;
}
export function ShareBars({ rows, noun, ownBadge = true }: {
    rows: ShareRow[];
    noun: string;
    ownBadge?: boolean;
}) {
    return (<UI.Stack gap="base">
      {rows.map((r) => (<UI.Stack key={`${r.label}-${r.isOwn ? 'own' : 'x'}`} gap="small-100">
          <UI.Stack direction="inline" gap="small-200" alignItems="center" justifyContent="space-between">
            <UI.Stack direction="inline" gap="small-200" alignItems="center">
              <UI.Text type={r.isOwn ? 'strong' : undefined}>{r.label}</UI.Text>
              {r.isOwn && ownBadge ? <UI.Badge tone="info">You</UI.Badge> : null}
            </UI.Stack>
            <UI.Text color="subdued">{rateText(r.rate, noun)}</UI.Text>
          </UI.Stack>
          <ShareBar rate={r.rate} own={r.isOwn}/>
        </UI.Stack>))}
    </UI.Stack>);
}
export function ShareKey() {
    return <UI.Text color="subdued">Bar: the rate seen. Line under it: where the true rate likely lies after this many checks. Sponsored cards are not counted.</UI.Text>;
}
