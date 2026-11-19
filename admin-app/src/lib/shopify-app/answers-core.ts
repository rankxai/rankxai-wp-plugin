export interface ObservedBrand {
    name: string;
    mentions: number;
}
const norm = (s: string) => s.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
function isOwnBrandName(name: string, own: string | null): boolean {
    if (!own)
        return false;
    const n = norm(name);
    if (n === own)
        return true;
    return own.length < 3 || n.length < 3 ? false : n.includes(own) || own.includes(n);
}
export function isOwnBrand(name: string, ownBrand: string | null): boolean {
    return isOwnBrandName(name, ownBrand ? norm(ownBrand) : null);
}
export function observedCompetitors(totals: ReadonlyMap<string, number>, listed: readonly string[], ownBrand: string | null, limit = 8): ObservedBrand[] {
    const listedSet = new Set(listed.map(norm));
    const own = ownBrand ? norm(ownBrand) : null;
    return [...totals.entries()]
        .map(([name, mentions]) => ({ name: name.trim(), mentions }))
        .filter((b) => b.name.length > 0 && b.mentions > 0)
        .filter((b) => !listedSet.has(norm(b.name)))
        .filter((b) => !isOwnBrandName(b.name, own))
        .sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name))
        .slice(0, limit);
}
