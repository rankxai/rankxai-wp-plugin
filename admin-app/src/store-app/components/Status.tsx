import * as UI from '../ui';
export type StatusKey = 'can_be_shown' | 'cant_be_shown' | 'cant_tell' | 'measuring' | 'needs_attention' | 'saved' | 'saved_unconfirmed' | 'not_saved' | 'undone' | 'locked';
type Tone = 'success' | 'critical' | 'neutral' | 'info' | 'warning';
const STATUS: Record<StatusKey, {
    label: string;
    tone: Tone;
}> = {
    can_be_shown: { label: 'Can be shown', tone: 'success' },
    cant_be_shown: { label: 'Can’t be shown', tone: 'warning' },
    cant_tell: { label: 'We can’t tell', tone: 'neutral' },
    measuring: { label: 'Measuring', tone: 'info' },
    needs_attention: { label: 'Needs attention', tone: 'warning' },
    saved: { label: 'Saved and confirmed', tone: 'success' },
    saved_unconfirmed: { label: 'Saved, not yet confirmed', tone: 'warning' },
    not_saved: { label: 'Not saved', tone: 'critical' },
    undone: { label: 'Undone', tone: 'neutral' },
    locked: { label: 'Locked', tone: 'neutral' },
};
export function StatusBadge({ status, label }: {
    status: StatusKey;
    label?: string;
}) {
    const s = STATUS[status];
    return <UI.Badge tone={s.tone}>{label ?? s.label}</UI.Badge>;
}
export function ProductCell({ title, imageUrl, sub, href }: {
    title: string | null;
    imageUrl?: string | null;
    sub?: string | null;
    href?: string | null;
}) {
    return (<UI.Grid gridTemplateColumns="auto minmax(0, 1fr)" gap="small-200" alignItems="center">
      {imageUrl ? <UI.Thumbnail src={imageUrl} alt="" size="small-200"/> : <UI.Thumbnail alt="" size="small-200"/>}
      <UI.Stack gap="small-100">
        {href ? <UI.Link href={href}>{title ?? 'Untitled product'}</UI.Link> : <UI.Text type="strong">{title ?? 'Untitled product'}</UI.Text>}
        {sub ? <UI.Text color="subdued">{sub}</UI.Text> : null}
      </UI.Stack>
    </UI.Grid>);
}
function Line({ width }: {
    width: `${number}%`;
}) {
    return <UI.Box background="subdued" borderRadius="base" blockSize="12px" inlineSize={width}/>;
}
export function SkeletonSection({ lines = 3, label = 'Loading' }: {
    lines?: number;
    label?: string;
}) {
    const widths: Array<`${number}%`> = ['92%', '78%', '64%', '85%', '70%'];
    return (<div data-skeleton="">
      <UI.Section accessibilityLabel={label}>
        <UI.Stack gap="base">
          <Line width="35%"/>
          {Array.from({ length: lines }, (_, i) => (<Line key={i} width={widths[i % widths.length]!}/>))}
        </UI.Stack>
      </UI.Section>
    </div>);
}
export function SkeletonCards({ count = 3 }: {
    count?: number;
}) {
    return (<div data-skeleton="">
      <UI.Grid gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap="base">
        {Array.from({ length: count }, (_, i) => (<UI.Box key={i} padding="base" background="base" border="base" borderRadius="large" accessibilityLabel="Loading">
            <UI.Stack gap="small-200">
              <Line width="55%"/>
              <UI.Box background="subdued" borderRadius="base" blockSize="28px" inlineSize="40%"/>
              <Line width="80%"/>
            </UI.Stack>
          </UI.Box>))}
      </UI.Grid>
    </div>);
}
