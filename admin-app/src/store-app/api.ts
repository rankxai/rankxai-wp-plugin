import { fmtDateTime } from './format';
import { host } from './host';
import { routeClassForPath, SPEND_CONFIRM_HEADER, SPEND_CONFIRM_VALUE } from '@/lib/store-app/route-policy-core';
export interface ApiResult<T> {
    ok: boolean;
    status: number;
    data: T | null;
    error: string | null;
    code: string | null;
    remedy: string | null;
    field: string | null;
}
let apiBase = '/api/shopify-app';
export function setApiBase(base: string): void {
    apiBase = base.replace(/\/+$/, '');
}
export const GATEWAY_TIMEOUT_MESSAGE = 'This is taking longer than usual. It is still running and its result will appear here in a minute or two, so there is no need to try again.';
async function send(path: string, init: {
    method?: string;
    body?: unknown;
}, auth: Record<string, string>): Promise<Response> {
    const headers: Record<string, string> = { ...auth };
    if (init.body !== undefined)
        headers['Content-Type'] = 'application/json';
    const method = init.method ?? 'GET';
    if (method !== 'GET' && routeClassForPath(method, path.replace(/^\/+/, '')) === 'spend')
        headers[SPEND_CONFIRM_HEADER] = SPEND_CONFIRM_VALUE;
    return fetch(`${apiBase}/${path.replace(/^\/+/, '')}`, {
        method: init.method ?? 'GET',
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
}
export async function api<T>(path: string, init: {
    method?: string;
    body?: unknown;
} = {}): Promise<ApiResult<T>> {
    if ((init.method ?? 'GET') !== 'GET')
        shared.clear();
    try {
        const auth = await host.authorize();
        if (host.requiresCredentials && Object.keys(auth).length === 0) {
            return { ok: false, status: 401, data: null, error: host.sessionEndedMessage, code: 'session_ended', remedy: null, field: null };
        }
        let res = await send(path, init, auth);
        if (res.status === 401) {
            const again = await host.retryUnauthorized(res);
            if (again)
                res = await send(path, init, again);
        }
        const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        const rawError = json && typeof json.error === 'string' ? json.error : null;
        const error = rawError && rawError.includes('{date}') ? rawError.replace('{date}', typeof json?.nextAt === 'string' ? fmtDateTime(json.nextAt) || 'a little later' : 'a little later') : rawError;
        const ok = res.ok && error === null;
        const gatewayTimeout = json === null && (res.status === 524 || res.status === 504);
        const action = (init.method ?? 'GET') !== 'GET';
        return {
            ok,
            status: res.status,
            data: ok ? (json as T) : null,
            error: ok
                ? null
                : (error ??
                    (res.status === 401
                        ? host.sessionEndedMessage
                        : gatewayTimeout && action
                            ? GATEWAY_TIMEOUT_MESSAGE
                            : 'We could not reach RankX AI just now. Please try again.')),
            code: json && typeof json.code === 'string' ? json.code : gatewayTimeout ? 'gateway_timeout' : null,
            remedy: json && typeof json.remedy === 'string' ? json.remedy : null,
            field: !ok && json && typeof json.field === 'string' ? json.field : null,
        };
    }
    catch {
        return { ok: false, status: 0, data: null, error: 'We could not reach RankX AI just now. Please try again.', code: null, remedy: null, field: null };
    }
}
const prefetched = new Map<string, {
    at: number;
    promise: Promise<ApiResult<unknown>>;
}>();
const PREFETCH_TTL_MS = 30000;
export function prefetch(path: string): void {
    if (!prefetched.has(path))
        prefetched.set(path, { at: Date.now(), promise: api(path) });
}
const SHARED_READS = new Set(['fixes', 'shopping', 'shopping/buyer-queries']);
const SHARED_TTL_MS = 60000;
const shared = new Map<string, {
    at: number;
    promise: Promise<ApiResult<unknown>>;
}>();
export function sharedRead<T>(path: string): Promise<ApiResult<T>> | null {
    if (!SHARED_READS.has(path))
        return null;
    const hit = shared.get(path);
    if (hit && Date.now() - hit.at <= SHARED_TTL_MS)
        return hit.promise as Promise<ApiResult<T>>;
    const promise = api<T>(path).then((r) => {
        if (!r.ok)
            shared.delete(path);
        return r;
    });
    shared.set(path, { at: Date.now(), promise: promise as Promise<ApiResult<unknown>> });
    return promise;
}
export function forgetShared(path: string): void {
    shared.delete(path);
}
export function takePrefetched<T>(path: string): Promise<ApiResult<T>> | null {
    const p = prefetched.get(path);
    if (!p)
        return null;
    prefetched.delete(path);
    return Date.now() - p.at <= PREFETCH_TTL_MS ? (p.promise as Promise<ApiResult<T>>) : null;
}
export function toastSuccess(message: string): void {
    host.toast(message);
}
