import { api } from './api';
import { isStaleChunk } from './PageBoundary';
import { createReportGate } from './error-gate';
export { createReportGate, isNoise, MAX_REPORTS } from './error-gate';
function describe(reason: unknown): {
    message: string;
    stack: string | null;
} {
    if (reason instanceof Error)
        return { message: reason.message, stack: reason.stack ?? null };
    if (typeof reason === 'string')
        return { message: reason, stack: null };
    return { message: 'Unhandled rejection', stack: null };
}
let installed = false;
export function installErrorReporter(ours: (where: string) => boolean = () => true): void {
    if (installed || typeof window === 'undefined')
        return;
    installed = true;
    const allow = createReportGate();
    const report = (source: 'error' | 'rejection', reason: unknown, filename = '') => {
        const { message, stack } = describe(reason);
        if (!ours(`${filename}\n${stack ?? ''}`))
            return;
        if (!allow(message))
            return;
        void api('client-error', {
            method: 'POST',
            body: { message, stack, path: window.location.pathname, staleChunk: isStaleChunk(message), source },
            keepalive: true,
        }).catch(() => undefined);
    };
    window.addEventListener('error', (e) => report('error', e.error ?? e.message, e.filename ?? ''));
    window.addEventListener('unhandledrejection', (e) => report('rejection', e.reason));
}
