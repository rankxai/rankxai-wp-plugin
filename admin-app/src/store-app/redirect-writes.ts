import { host } from './host';
import { api, type ApiResult } from './api';
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
    const r = await api<WriteResult>('fixes/redirects', { method: 'POST', body: { path, target } });
    return { ...r, data: r.data ? { ...r.data, localId: null } : null };
}
export async function removeRedirect(id: string): Promise<ApiResult<unknown>> {
    if (host.redirects)
        return fromLocal(await host.redirects.remove(id));
    return api('fixes/redirects/delete', { method: 'POST', body: { redirectId: id } });
}
