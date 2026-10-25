const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };
function decode(s: string): string {
    return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
        if (ENTITY[e.toLowerCase()] !== undefined)
            return ENTITY[e.toLowerCase()]!;
        if (e[0] === '#') {
            const code = e[1]?.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
            return Number.isFinite(code) ? String.fromCodePoint(code) : m;
        }
        return m;
    });
}
function stripTags(s: string): string {
    return decode(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}
export interface ArticleContents {
    headings: string[];
    words: number;
    readingMinutes: number;
    hasFaq: boolean;
}
export function articleContents(html: string | null | undefined): ArticleContents {
    const h = html ?? '';
    const headings = [...h.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => stripTags(m[1]!)).filter(Boolean);
    const words = stripTags(h).split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
    const hasFaq = /<h3\b[^>]*>[\s\S]*?\?[\s\S]*?<\/h3>/i.test(h);
    return { headings, words, readingMinutes: words > 0 ? Math.max(1, Math.ceil(words / 230)) : 0, hasFaq };
}
export interface QualityFix {
    key: string;
    area: 'search' | 'ai_answers';
    line: string;
    fix: string | null;
}
export interface QualityView {
    search: {
        passed: boolean;
        failed: number;
    } | null;
    aiAnswers: {
        passed: boolean;
        failed: number;
    } | null;
    fixes: QualityFix[];
}
export interface PrePublishCheck {
    key: 'keyword_in_title' | 'keyword_in_description' | 'keyword_in_address' | 'featured_image' | 'product_links' | 'faq' | 'length';
    label: string;
    passed: boolean;
}
const STOP = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'best', 'by', 'can', 'do', 'does', 'for', 'from', 'how', 'i', 'in', 'is', 'it', 'my', 'of', 'on', 'or', 'should', 'the', 'to', 'what', 'which', 'why', 'with', 'you', 'your']);
export function topicWords(text: string): string[] {
    return [...new Set(text
            .toLowerCase()
            .normalize('NFD')
            .replace(/\p{M}/gu, '')
            .split(/[^\p{L}\p{N}]+/u)
            .filter((w) => w.length > 1 && !STOP.has(w))
            .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)))];
}
function covers(keyword: string, text: string | null | undefined): boolean {
    const k = topicWords(keyword);
    if (k.length === 0)
        return true;
    const t = new Set(topicWords(text ?? ''));
    const hit = k.filter((w) => t.has(w)).length;
    return k.length <= 2 ? hit === k.length : hit / k.length >= 2 / 3;
}
export function prePublishChecks(a: {
    keyword: string | null;
    title: string | null;
    metaTitle: string | null;
    metaDescription: string | null;
    slug: string | null;
    html: string | null;
    hasFeaturedImage: boolean;
    targetWords: number | null;
    words?: number | null;
}): PrePublishCheck[] {
    const keyword = (a.keyword ?? '').trim();
    const contents = articleContents(a.html);
    const productLinks = /href="[^"]*\/products\/[^"]+"/i.test(a.html ?? '');
    const out: PrePublishCheck[] = [];
    if (keyword) {
        out.push({ key: 'keyword_in_title', label: 'The topic is in the search title', passed: covers(keyword, a.metaTitle || a.title) });
        out.push({ key: 'keyword_in_description', label: 'The topic is in the search description', passed: covers(keyword, a.metaDescription) });
        out.push({ key: 'keyword_in_address', label: 'The topic is in the web address', passed: covers(keyword, (a.slug ?? '').replace(/-/g, ' ')) });
    }
    out.push({ key: 'featured_image', label: 'A featured image is chosen', passed: a.hasFeaturedImage });
    out.push({ key: 'product_links', label: 'It links to your products', passed: productLinks });
    out.push({ key: 'faq', label: 'It answers shoppers’ questions at the end', passed: contents.hasFaq });
    if (a.targetWords && a.targetWords > 0) {
        const words = a.words ?? contents.words;
        out.push({ key: 'length', label: `It is close to its length (${words.toLocaleString('en-GB')} of about ${a.targetWords.toLocaleString('en-GB')} words)`, passed: words >= a.targetWords * 0.8 });
    }
    return out;
}
export function alreadyWritten<T extends {
    title: string | null;
}>(topic: string, existing: readonly T[]): T | null {
    const t = topicWords(topic);
    if (t.length < 2)
        return null;
    let best: {
        item: T;
        score: number;
    } | null = null;
    for (const e of existing) {
        const w = topicWords(e.title ?? '');
        if (w.length < 2)
            continue;
        const ws = new Set(w);
        const shared = t.filter((x) => ws.has(x)).length;
        const shorter = Math.min(t.length, w.length);
        if (shared >= 2 && shared / shorter >= 0.75) {
            const score = shared / Math.max(t.length, w.length);
            if (!best || score > best.score)
                best = { item: e, score };
        }
    }
    return best?.item ?? null;
}
