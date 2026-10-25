import { useState } from 'react';
import { api, toastSuccess } from '../api';
import { act, PagePrimaryAction, type PageError } from '../kit';
export function CheckAgainAction({ running, setError, onStarted }: {
    running: boolean;
    setError: (e: PageError | null) => void;
    onStarted: () => Promise<void> | void;
}) {
    const [busy, setBusy] = useState(false);
    async function run() {
        const r = await act(() => api<{
            running: boolean;
        }>('catalogue/scan', { method: 'POST' }), setBusy, setError);
        if (r.ok) {
            toastSuccess('Checking your store again');
            await onStarted();
        }
    }
    return (<PagePrimaryAction disabled={busy || running} loading={busy} onClick={() => void run()}>
      {running ? 'Checking now' : 'Check again'}
    </PagePrimaryAction>);
}
