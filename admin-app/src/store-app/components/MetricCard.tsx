import type { ReactNode } from 'react';
import { useRouter } from '../router';
import * as UI from '../ui';
export interface MetricCardProps {
    label: string;
    value: string | null;
    unit?: string;
    empty?: string;
    basis: string;
    badge?: ReactNode;
    href?: string;
    locked?: string | null;
}
function Body(p: MetricCardProps) {
    return (<UI.Stack gap="small-200" blockSize="100%">
      <UI.Stack direction="inline" gap="small-200" alignItems="center" justifyContent="space-between">
        <UI.Text color="subdued">{p.label}</UI.Text>
        {p.badge ?? null}
      </UI.Stack>
      {p.value !== null ? (<UI.Stack direction="inline" gap="small-200" alignItems="baseline">
          
          <UI.Heading fontSize="large-300" accessibilityRole="presentation">
            {p.value}
          </UI.Heading>
          {p.unit ? <UI.Text color="subdued">{p.unit}</UI.Text> : null}
        </UI.Stack>) : (<UI.Text type="strong">{p.empty ?? 'Not measured yet'}</UI.Text>)}
      <UI.Text color="subdued">{p.locked ?? p.basis}</UI.Text>
    </UI.Stack>);
}
export function MetricCard(p: MetricCardProps) {
    const { navigate } = useRouter();
    if (p.locked || !p.href) {
        return (<UI.Box padding="base" background={p.locked ? 'subdued' : 'base'} border="base" borderRadius="large">
        <Body {...p}/>
      </UI.Box>);
    }
    const href = p.href;
    return (<UI.Clickable padding="base" background="base" border="base" borderRadius="large" accessibilityLabel={`${p.label}: ${p.value ?? p.empty ?? ''}${p.unit ? ` ${p.unit}` : ''}. ${p.basis}`} onClick={() => navigate(href)}>
      <Body {...p}/>
    </UI.Clickable>);
}
export function MetricRow({ children }: {
    children: ReactNode;
}) {
    return (<UI.Grid gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap="base">
      {children}
    </UI.Grid>);
}
