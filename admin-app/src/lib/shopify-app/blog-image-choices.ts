export interface BlogChoiceOption {
    id: string;
    label: string;
}
export interface BlogStyleOption extends BlogChoiceOption {
    withProduct: boolean;
}
export const BLOG_STYLE_OPTIONS: readonly BlogStyleOption[] = [
    { id: 'auto', label: 'Automatic', withProduct: true },
    { id: 'photo', label: 'Photographic', withProduct: true },
    { id: 'flat_lay', label: 'Flat-lay', withProduct: true },
    { id: 'minimal', label: 'Minimal', withProduct: true },
    { id: 'illustration', label: 'Illustration', withProduct: false },
    { id: 'render_3d', label: '3D render', withProduct: false },
    { id: 'watercolour', label: 'Watercolour', withProduct: false },
];
export const BLOG_PALETTE_OPTIONS: readonly BlogChoiceOption[] = [
    { id: 'auto', label: 'Automatic' },
    { id: 'warm', label: 'Warm' },
    { id: 'cool', label: 'Cool' },
    { id: 'neutral', label: 'Neutral' },
    { id: 'vivid', label: 'Vivid' },
    { id: 'muted', label: 'Muted' },
    { id: 'dark', label: 'Dark' },
];
export const BLOG_TWEAK_OPTIONS: readonly BlogChoiceOption[] = [
    { id: 'again', label: 'More like this' },
    { id: 'closer', label: 'Closer' },
    { id: 'wider', label: 'Wider' },
    { id: 'simpler', label: 'Simpler' },
    { id: 'brighter', label: 'Brighter' },
    { id: 'warmer', label: 'Warmer' },
];
export interface BlogImageOptions {
    style: string;
    palette: string;
}
export const DEFAULT_BLOG_OPTIONS: BlogImageOptions = { style: 'auto', palette: 'auto' };
export function blogStyleOptionsFor(withProduct: boolean): readonly BlogStyleOption[] {
    return withProduct ? BLOG_STYLE_OPTIONS.filter((s) => s.withProduct) : BLOG_STYLE_OPTIONS;
}
export function readBlogImageOptions(raw: unknown, withProduct = false): BlogImageOptions {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const style = typeof o.style === 'string' && blogStyleOptionsFor(withProduct).some((s) => s.id === o.style) ? o.style : 'auto';
    const palette = typeof o.palette === 'string' && BLOG_PALETTE_OPTIONS.some((p) => p.id === o.palette) ? o.palette : 'auto';
    return { style, palette };
}
export const BLOG_CROPS = [
    { id: 'card', label: 'Blog card (5:3)', ratio: 5 / 3 },
    { id: 'four_three', label: '4:3', ratio: 4 / 3 },
    { id: 'square', label: 'Square', ratio: 1 },
] as const;
export function cropBox(ratio: number, imageRatio = 16 / 9): {
    widthPct: number;
    heightPct: number;
} {
    if (!(ratio > 0) || !(imageRatio > 0))
        return { widthPct: 100, heightPct: 100 };
    if (ratio >= imageRatio)
        return { widthPct: 100, heightPct: Math.round((imageRatio / ratio) * 10000) / 100 };
    return { widthPct: Math.round((ratio / imageRatio) * 10000) / 100, heightPct: 100 };
}
export interface BlogConcept {
    title: string;
    description: string;
    style: string;
    product: boolean;
}
