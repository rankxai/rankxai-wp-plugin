import type { ReactNode } from 'react';
import * as UI from '../ui';
export function PageColumns({ main, side }: {
    main: ReactNode;
    side: ReactNode;
}) {
    return (<UI.QueryContainer>
      <UI.Grid gridTemplateColumns="@container (inline-size > 900px) 2fr 1fr, 1fr" gap="base" alignItems="start">
        <UI.Stack gap="base">{main}</UI.Stack>
        <UI.Stack gap="base">{side}</UI.Stack>
      </UI.Grid>
    </UI.QueryContainer>);
}
