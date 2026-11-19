export interface OutlineSection {
    id: string;
    heading: string;
    keyPoints: string[];
}
export interface BriefOutline {
    sections: OutlineSection[];
}
function generateOutlineNodeId(): string {
    return crypto.randomUUID();
}
export function normaliseBriefOutline(value: unknown, priorSectionIds?: ReadonlyArray<string | undefined | null> | null): BriefOutline | null {
    if (!value || typeof value !== 'object')
        return null;
    const v = value as Record<string, unknown>;
    if (!Array.isArray(v.sections))
        return null;
    const sections: OutlineSection[] = [];
    v.sections.forEach((s, index) => {
        if (!s || typeof s !== 'object')
            return;
        const sec = s as Record<string, unknown>;
        const heading = typeof sec.heading === 'string' ? sec.heading : '';
        if (heading.trim().length === 0)
            return;
        sections.push({
            id: (typeof sec.id === 'string' && sec.id) || (priorSectionIds?.[index] as string | undefined) || generateOutlineNodeId(),
            heading,
            keyPoints: Array.isArray(sec.keyPoints) ? sec.keyPoints.filter((k): k is string => typeof k === 'string') : [],
        });
    });
    return { sections };
}
export function isValidApprovedOutline(value: unknown): value is BriefOutline {
    if (!value || typeof value !== 'object')
        return false;
    const v = value as Record<string, unknown>;
    if (!Array.isArray(v.sections) || v.sections.length === 0)
        return false;
    return v.sections.every((raw) => {
        if (!raw || typeof raw !== 'object')
            return false;
        const s = raw as Record<string, unknown>;
        return (typeof s.id === 'string' &&
            s.id.length > 0 &&
            typeof s.heading === 'string' &&
            s.heading.trim().length > 0);
    });
}
