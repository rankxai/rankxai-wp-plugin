export function sessionExpiry(json: {
    expiresAt?: unknown;
    expiresIn?: unknown;
}, receivedAt: number): number {
    if (typeof json.expiresIn === 'number' && Number.isFinite(json.expiresIn) && json.expiresIn > 0)
        return receivedAt + json.expiresIn * 1000;
    const at = typeof json.expiresAt === 'string' ? Date.parse(json.expiresAt) : NaN;
    return Number.isFinite(at) ? at : receivedAt + 9 * 60000;
}
