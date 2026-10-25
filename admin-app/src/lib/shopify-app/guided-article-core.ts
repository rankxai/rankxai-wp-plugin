import { isValidApprovedOutline, normaliseBriefOutline, type BriefOutline } from '@/lib/content/brief-outline';
export interface GuidedTitle {
    title: string;
}
export interface GuidedReview {
    state: 'awaiting' | 'approved';
    titles: GuidedTitle[] | null;
    title: string | null;
    titlesGeneratedAt: string | null;
    titleRuns: number;
    approvedAt: string | null;
}
export const TITLE_REFRESHES_MAX = 2;
export const TITLE_MAX = 200;
export const SECTIONS_MAX = 12;
export const HEADING_MAX = 160;
export const SECTION_NOTE_MAX = 400;
export const KEY_POINTS_MAX = 8;
export const KEY_POINT_MAX = 1000;
export function newGuidedReview(): GuidedReview {
    return { state: 'awaiting', titles: null, title: null, titlesGeneratedAt: null, titleRuns: 0, approvedAt: null };
}
export function readGuidedReview(stored: unknown): GuidedReview | null {
    if (!stored || typeof stored !== 'object' || Array.isArray(stored))
        return null;
    const o = stored as Record<string, unknown>;
    if (o.state !== 'awaiting' && o.state !== 'approved')
        return null;
    const titles = Array.isArray(o.titles)
        ? o.titles.filter((t): t is GuidedTitle => !!t && typeof t === 'object' && typeof (t as GuidedTitle).title === 'string' && (t as GuidedTitle).title.trim() !== '')
        : null;
    return {
        state: o.state,
        titles,
        title: typeof o.title === 'string' && o.title.trim() ? o.title : null,
        titlesGeneratedAt: typeof o.titlesGeneratedAt === 'string' ? o.titlesGeneratedAt : null,
        titleRuns: typeof o.titleRuns === 'number' && Number.isFinite(o.titleRuns) ? o.titleRuns : titles ? 1 : 0,
        approvedAt: typeof o.approvedAt === 'string' ? o.approvedAt : null,
    };
}
export function mayMakeTitles(review: GuidedReview, refresh: boolean): boolean {
    if (review.state !== 'awaiting')
        return false;
    if (!refresh)
        return review.titleRuns === 0;
    return review.titleRuns >= 1 && review.titleRuns <= TITLE_REFRESHES_MAX;
}
export interface PlanSectionInput {
    id?: string | null;
    heading: string;
    keyPoints?: string[];
    note?: string | null;
    productIds?: string[];
}
export interface PlanInput {
    title: string | null;
    sections: PlanSectionInput[];
}
export interface ApprovedPlan {
    title: string | null;
    outline: BriefOutline;
    sectionNotes: Array<{
        heading: string;
        note: string;
    }>;
    productIds: string[];
}
const PRODUCT_GID = /^(?:gid:\/\/shopify\/Product\/\d+|woo:\/\/product\/\d+)$/;
const clean = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
export function validatePlan(input: unknown, researchOutline: unknown): ApprovedPlan | null {
    const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const known = new Set((normaliseBriefOutline(researchOutline)?.sections ?? []).map((s) => s.id));
    const raw = Array.isArray(o.sections) ? (o.sections as unknown[]).slice(0, SECTIONS_MAX) : [];
    const sections: Array<{
        id: string | null;
        heading: string;
        keyPoints: string[];
    }> = [];
    const notes: Array<{
        heading: string;
        note: string;
    }> = [];
    const productIds: string[] = [];
    for (const r of raw) {
        if (!r || typeof r !== 'object')
            continue;
        const s = r as Record<string, unknown>;
        const heading = clean(s.heading, HEADING_MAX);
        if (!heading)
            continue;
        const id = typeof s.id === 'string' && known.has(s.id) ? s.id : null;
        const keyPoints = Array.isArray(s.keyPoints) ? (s.keyPoints as unknown[]).map((k) => clean(k, KEY_POINT_MAX)).filter(Boolean).slice(0, KEY_POINTS_MAX) : [];
        const note = clean(s.note, SECTION_NOTE_MAX);
        if (note)
            notes.push({ heading, note });
        for (const p of Array.isArray(s.productIds) ? (s.productIds as unknown[]) : []) {
            if (typeof p === 'string' && PRODUCT_GID.test(p) && !productIds.includes(p))
                productIds.push(p);
        }
        sections.push({ id, heading, keyPoints: note ? [...keyPoints, `From the owner: ${note}`] : keyPoints });
    }
    if (sections.length === 0)
        return null;
    const outline = normaliseBriefOutline({ sections: sections.map((s) => ({ heading: s.heading, keyPoints: s.keyPoints })) }, sections.map((s) => s.id));
    if (!outline || !isValidApprovedOutline(outline))
        return null;
    const title = clean(o.title, TITLE_MAX) || null;
    return { title, outline, sectionNotes: notes, productIds };
}
