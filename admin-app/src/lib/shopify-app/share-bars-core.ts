export type ShareRate = {
    shown: true;
    k: number;
    n: number;
    p: number;
    lo: number;
    hi: number;
    precise?: boolean;
} | {
    shown: false;
    n: number;
    needed: number;
};
export interface BarGeometry {
    fill: number;
    lo: number;
    hi: number;
}
const clamp = (x: number) => (Number.isFinite(x) ? Math.min(100, Math.max(0, Math.round(x * 1000) / 10)) : 0);
export function barGeometry(rate: ShareRate): BarGeometry | null {
    if (!rate.shown)
        return null;
    const fill = clamp(rate.p);
    const lo = Math.min(clamp(rate.lo), fill);
    const hi = Math.max(clamp(rate.hi), fill);
    return { fill, lo, hi };
}
export interface ShareSurfaceLike {
    label: string;
    own: {
        label: string;
        rate: ShareRate;
    } | null;
    stores: Array<{
        label: string;
        isOwn: boolean;
        rate: ShareRate;
    }>;
}
export function headlineShare(surfaces: readonly ShareSurfaceLike[]): {
    surfaceLabel: string;
    rate: ShareRate;
} | null {
    const own = surfaces
        .map((s) => ({ surfaceLabel: s.label, rate: s.own?.rate ?? s.stores.find((x) => x.isOwn)?.rate ?? null }))
        .filter((x): x is {
        surfaceLabel: string;
        rate: ShareRate;
    } => x.rate !== null);
    if (own.length === 0)
        return null;
    return own.slice().sort((a, b) => Number(b.rate.shown) - Number(a.rate.shown) || b.rate.n - a.rate.n)[0]!;
}
