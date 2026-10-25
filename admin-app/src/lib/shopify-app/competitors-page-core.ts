import { isOwnBrand } from './answers-core';
export function siteHost(raw: string | null | undefined): string | null {
    const host = ((raw ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^(?:www|checkout)\./, '').split(/[/?#]/)[0] ?? '');
    return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(host) ? host : null;
}
export function hostInName(name: string): string | null {
    const t = name.trim();
    return /\s/.test(t) ? null : siteHost(t);
}
const STORE_SUFFIX = /^(?:snowboards?|skis?|bikes?|boards|sports?|shop|store|outlet|official|online|inc|co|ltd|llc|us|usa|uk|eu|europe|emea|america|canada|international|intl)$/i;
export function coreStoreName(name: string): string | null {
    const words = name.split(/\s+-\s+/)[0]!.trim().split(/\s+/);
    while (words.length > 1 && STORE_SUFFIX.test(words[words.length - 1]!))
        words.pop();
    if (/^(?:and|&|of|the|for)$/i.test(words[words.length - 1]!))
        return null;
    const core = words.join(' ');
    return core && core.toLowerCase() !== name.trim().toLowerCase() ? core : null;
}
export function siteHref(host: string): string {
    return `https://${host}`;
}
export interface AnswerBrandRow {
    brand_mentioned: boolean | null;
    competitor_mentions: unknown;
}
export interface ListedCompetitor {
    name: string;
    domain: string | null;
    aliases?: string[] | null;
}
export interface BrandRow {
    name: string;
    answers: number;
    domain: string | null;
    listed: boolean;
}
export interface BrandsRead {
    analysed: number;
    ownNamed: number;
    brands: BrandRow[];
}
const key = (s: string) => s.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
const words = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const squash = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
export function siteFitsName(host: string, name: string): boolean {
    const n = squash(name);
    if (n.length < 2)
        return false;
    const labels = host.split('.').slice(0, -1).map(squash);
    return labels.some((l) => l.includes(n) || (l.length >= 4 && n.includes(l)));
}
export function brandsFromAnswers(rows: readonly AnswerBrandRow[], opts: {
    ownBrand: string | null;
    listed: readonly ListedCompetitor[];
}): BrandsRead {
    const mentionsOf = (r: AnswerBrandRow) => (Array.isArray(r.competitor_mentions) ? (r.competitor_mentions as Array<Record<string, unknown>>) : [])
        .map((m) => ({ raw: typeof m?.brand === 'string' ? m.brand.trim() : '', domain: typeof m?.domain === 'string' ? m.domain : null }))
        .filter((m) => m.raw !== '' && words(m.raw) !== '' && !isOwnBrand(m.raw, opts.ownBrand));
    const read = rows.filter((r) => r.brand_mentioned !== null);
    const listedByWords = new Map<string, ListedCompetitor>();
    for (const c of opts.listed)
        for (const n of [c.name, ...(c.aliases ?? [])])
            if (n && words(n) && !listedByWords.has(words(n)))
                listedByWords.set(words(n), c);
    const named = new Set<string>();
    for (const r of read)
        for (const m of mentionsOf(r))
            named.add(words(m.raw));
    const bases = [...new Set([...listedByWords.keys(), ...named])].sort((a, b) => a.length - b.length || a.localeCompare(b));
    const groupOf = new Map<string, string>();
    for (const w of bases) {
        const base = bases.find((b) => b.length < w.length && w.startsWith(`${b} `));
        groupOf.set(w, base ? groupOf.get(base)! : w);
    }
    const groupKey = (w: string) => {
        const g = groupOf.get(w) ?? w;
        const listed = listedByWords.get(g);
        return listed ? `listed:${key(listed.name)}` : g;
    };
    const acc = new Map<string, {
        answers: number;
        spellings: Map<string, number>;
        domains: Map<string, number>;
        listed: ListedCompetitor | null;
    }>();
    let ownNamed = 0;
    for (const r of read) {
        if (r.brand_mentioned === true)
            ownNamed++;
        const seen = new Set<string>();
        for (const m of mentionsOf(r)) {
            const w = words(m.raw);
            const k = groupKey(w);
            const a = acc.get(k) ?? { answers: 0, spellings: new Map(), domains: new Map(), listed: listedByWords.get(groupOf.get(w) ?? w) ?? null };
            if (!seen.has(k)) {
                a.answers++;
                seen.add(k);
            }
            if ((groupOf.get(w) ?? w) === w)
                a.spellings.set(m.raw, (a.spellings.get(m.raw) ?? 0) + 1);
            const host = siteHost(m.domain);
            if (host)
                a.domains.set(host, (a.domains.get(host) ?? 0) + 1);
            acc.set(k, a);
        }
    }
    for (const c of opts.listed) {
        const k = `listed:${key(c.name)}`;
        if (!acc.has(k))
            acc.set(k, { answers: 0, spellings: new Map(), domains: new Map(), listed: c });
    }
    const ranked = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v]) => v);
    const brands = [...acc.values()].map((a) => {
        const name = a.listed ? a.listed.name : ranked(a.spellings)[0]!;
        return {
            name,
            answers: a.answers,
            domain: siteHost(a.listed?.domain) ?? ranked(a.domains).find((h) => siteFitsName(h, name)) ?? hostInName(name),
            listed: a.listed !== null,
        };
    });
    brands.sort((a, b) => b.answers - a.answers || Number(b.listed) - Number(a.listed) || a.name.localeCompare(b.name));
    return { analysed: read.length, ownNamed, brands };
}
export function ofAnswers(k: number, n: number): string {
    return n > 0 ? `${k} of ${n} ${n === 1 ? 'answer' : 'answers'} (${Math.round((k / n) * 100)}%)` : `${k} of 0 answers`;
}
