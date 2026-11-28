import { host } from './host';
import type { ApiResult } from './api';
import type { LocalRedirectResult } from './host-types';
import type { WriteResult } from './components/FixModals';
export type RedirectWriteResult = WriteResult & {
    localId: string | null;
};
export const redirectsWrittenLocally = (): boolean => !!host.redirects;
function fromLocal(r: LocalRedirectResult): ApiResult<RedirectWriteResult> {
    if (!r.ok)
        return { ok: false, status: 409, data: null, error: r.message, code: 'refused', remedy: null, field: null };
    return {
        ok: true,
        status: 200,
        data: { verdict: 'verified', verified: true, message: r.message, changeId: null, batchId: null, localId: r.id },
        error: null,
        code: null,
        remedy: null,
        field: null,
    };
}
export async function addRedirect(path: string, target: string): Promise<ApiResult<RedirectWriteResult>> {
    if (host.redirects)
        return fromLocal(await host.redirects.add(path, target));
    if (!host.serverRedirects)
        return unavailable();
    const r = await host.serverRedirects.add(path, target);
    return { ...r, data: r.data ? { ...r.data, localId: null } : null };
}
export async function removeRedirect(id: string): Promise<ApiResult<unknown>> {
    if (host.redirects)
        return fromLocal(await host.redirects.remove(id));
    if (!host.serverRedirects)
        return unavailable();
    return host.serverRedirects.remove(id);
}
function unavailable<T>(): ApiResult<T> {
    return { ok: false, status: 409, data: null, error: 'Redirects cannot be changed from here.', code: 'unavailable', remedy: null, field: null };
}
