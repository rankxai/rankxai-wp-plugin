export type CandidateReason = 'shown' | 'matches' | null;
const MAX_MATCH_LABELS = 5;
const STOPWORDS = new Set([
    'the', 'and', 'for', 'with', 'what', 'which', 'best', 'good', 'top', 'buy', 'should', 'need', 'actually', 'new', 'first',
    'how', 'are', 'that', 'this', 'from', 'your', 'you', 'can', 'get', 'any', 'one', 'set', 'setup', 'season', 'vs', 'versus',
    'online', 'store', 'stores', 'shop', 'cheap', 'affordable', 'review', 'reviews', 'someone', 'just', 'starting', 'out',
]);
export function contentWords(text: string): Set<string> {
    const out = new Set<string>();
    for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
        if (raw.length < 3 || STOPWORDS.has(raw))
            continue;
        out.add(raw.length > 3 && raw.endsWith('s') && !raw.endsWith('ss') ? raw.slice(0, -1) : raw);
    }
    return out;
}
export function rankListingCandidates<P extends {
    id: string;
    title: string | null;
}>(products: readonly P[], ctx: {
    shownIds: readonly string[];
    question: string;
}): Array<P & {
    reason: CandidateReason;
}> {
    const shown = new Set(ctx.shownIds);
    const wanted = contentWords(ctx.question);
    const scores = products.map((p) => {
        let score = 0;
        for (const w of contentWords(p.title ?? ''))
            if (wanted.has(w))
                score += 1;
        return score;
    });
    const unshown = scores.filter((_, i) => !shown.has(products[i]!.id));
    const top = unshown.length > 0 ? Math.max(...unshown) : 0;
    const atTop = unshown.filter((s) => s === top).length;
    const separates = top > 0 && top > Math.min(...unshown) && atTop <= Math.max(1, Math.min(MAX_MATCH_LABELS, Math.floor(unshown.length / 3)));
    const scored = products.map((p, index) => {
        const score = scores[index]!;
        const best = separates && score === Math.max(...unshown);
        const reason: CandidateReason = shown.has(p.id) ? 'shown' : best ? 'matches' : null;
        return { p: { ...p, reason }, score, index, rank: reason === 'shown' ? 0 : reason === 'matches' ? 1 : 2 };
    });
    scored.sort((a, b) => a.rank - b.rank || b.score - a.score || a.index - b.index);
    return scored.map((s) => s.p);
}
