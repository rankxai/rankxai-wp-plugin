import { useState } from 'react';
import * as UI from '../ui';
export const PAGE_ROWS = 10;
export function usePaged<T>(items: readonly T[], size = PAGE_ROWS): {
    rows: T[];
    pager: React.ReactNode;
} {
    const [page, setPage] = useState(0);
    const pages = Math.max(1, Math.ceil(items.length / size));
    const current = Math.min(page, pages - 1);
    const rows = items.slice(current * size, (current + 1) * size);
    const pager = pages > 1 ? (<UI.Stack direction="inline" gap="small-200" alignItems="center">
      <UI.Button icon="chevron-left" disabled={current === 0 || undefined} onClick={() => setPage(current - 1)}>
        Previous
      </UI.Button>
      <UI.Text color="subdued">{`${current * size + 1}–${Math.min((current + 1) * size, items.length)} of ${items.length}`}</UI.Text>
      <UI.Button icon="chevron-right" disabled={current >= pages - 1 || undefined} onClick={() => setPage(current + 1)}>
        Next
      </UI.Button>
    </UI.Stack>) : null;
    return { rows, pager };
}
