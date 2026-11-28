import { api, type ApiResult } from '../../api';
import type { LocalRedirectResult } from '../../host-types';
import type { RedirectWriteResult } from '../../redirect-writes';
import { host } from './host';
export const redirectsWrittenLocally = (): boolean => true;
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
function unavailable<T>(): ApiResult<T> {
    return { ok: false, status: 409, data: null, error: 'Redirects cannot be changed from here.', code: 'unavailable', remedy: null, field: null };
}
export async function addRedirect(path: string, target: string): Promise<ApiResult<RedirectWriteResult>> {
    if (!host.redirects)
        return unavailable();
    return fromLocal(await host.redirects.add(path, target));
}
export async function removeRedirect(id: string): Promise<ApiResult<unknown>> {
    if (!host.redirects)
        return unavailable();
    return fromLocal(await host.redirects.remove(id));
}
export async function applyRedirectSuggestion(id: string, path: string, target: string): Promise<ApiResult<RedirectWriteResult>> {
    const r = await addRedirect(path, target);
    if (r.ok)
        await api(`fixes/redirect-suggestions/${id}/resolved`, { method: 'POST' });
    return r;
}
export async function importRedirectRows(_rows: Array<{
    path: string;
    target: string;
}>): Promise<ApiResult<unknown>> {
    return unavailable();
}
export function AutoRedirectSetting(_props: AutoRedirectSettingProps): null {
    return null;
}
export interface AutoRedirectSettingProps {
    on: boolean;
    disabled: boolean;
    save: (patch: {
        autoRedirectDeleted: boolean;
    }, done: string) => void;
}
