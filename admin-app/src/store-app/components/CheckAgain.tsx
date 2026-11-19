import { useEffect, useRef, useState } from 'react';
import { api, toastSuccess } from '../api';
import { act, PagePrimaryAction, type PageError } from '../kit';
const FOLLOW_EVERY_MS = 4000;
const FOLLOW_FOR_MS = 120000;
export function CheckAgainAction({ running, setError, onStarted, onFinished, }: {
    running: boolean;
    setError: (e: PageError | null) => void;
    onStarted: () => Promise<void> | void;
    onFinished: () => Promise<void> | void;
}) {
    const [busy, setBusy] = useState(false);
    const [started, setStarted] = useState(false);
    const checking = running || started;
    const finished = useRef(onFinished);
    const report = useRef(setError);
    useEffect(() => {
        finished.current = onFinished;
        report.current = setError;
    });
    useEffect(() => {
        if (!checking)
            return;
        let stopped = false;
        let timer: ReturnType<typeof setTimeout>;
        const giveUpAt = Date.now() + FOLLOW_FOR_MS;
        const look = async () => {
            const r = await api<{
                running: unknown;
            }>('catalogue');
            if (stopped)
                return;
            if (r.ok && r.data && !r.data.running) {
                setStarted(false);
                await finished.current();
                return;
            }
            if (Date.now() >= giveUpAt) {
                setStarted(false);
                report.current({ message: 'This check is taking longer than usual. Reload the page in a few minutes to see the result.', planLink: false, kind: 'too_soon' });
                return;
            }
            timer = setTimeout(() => void look(), FOLLOW_EVERY_MS);
        };
        timer = setTimeout(() => void look(), FOLLOW_EVERY_MS);
        return () => {
            stopped = true;
            clearTimeout(timer);
        };
    }, [checking]);
    async function run() {
        const r = await act(() => api<{
            running: boolean;
        }>('catalogue/scan', { method: 'POST' }), setBusy, setError);
        if (r.ok) {
            toastSuccess('Checking your store again');
            setStarted(true);
            await onStarted();
        }
    }
    return (<PagePrimaryAction disabled={busy || checking} loading={busy} onClick={() => void run()}>
      {checking ? 'Checking now' : 'Check again'}
    </PagePrimaryAction>);
}
