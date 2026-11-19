const DISCONNECTED = new Set(['rankxai_invalid_site_token', 'rankxai_link_ended', 'rankxai_site_token_expired']);
export const DEFAULT_SESSION_PROBLEM = 'Your RankX AI session ended. Reload this page; if it keeps happening, reconnect your store in RankX AI › Settings.';
export function sessionProblem(status: number, body: unknown): string {
    const code = body && typeof body === 'object' && typeof (body as {
        code?: unknown;
    }).code === 'string' ? (body as {
        code: string;
    }).code : '';
    const raw = body && typeof body === 'object' && typeof (body as {
        message?: unknown;
    }).message === 'string' ? (body as {
        message: string;
    }).message : '';
    const message = raw.trim().length > 0 && raw.length <= 300 && !/[<>]/.test(raw) ? raw.trim() : '';
    if (DISCONNECTED.has(code)) {
        return 'This store is no longer connected to RankX AI. Reconnect it in RankX AI › Settings.';
    }
    if (code === 'rankxai_not_connected') {
        return 'This store is not connected to RankX AI. Connect it in RankX AI › Settings.';
    }
    if (code === 'rest_cookie_invalid_nonce' || code === 'rankxai_bad_nonce') {
        return 'This page has expired. Reload it and try again.';
    }
    if (status === 0) {
        return 'This page could not reach your WordPress site. Check your connection and reload.';
    }
    return message || DEFAULT_SESSION_PROBLEM;
}
