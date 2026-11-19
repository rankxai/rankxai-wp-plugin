import type { AssistantCheckStatus } from './assistant-status';
export type DayStatus = AssistantCheckStatus | 'not_asked';
export interface DayAnswer {
    platform: string;
    status: DayStatus;
    answerId: string | null;
    checkedAt: string | null;
    searches: string[] | null;
}
function strength(a: Pick<DayAnswer, 'answerId' | 'status'>): number {
    return a.answerId !== null ? 0 : a.status === 'checking' ? 1 : a.status === 'failed' ? 2 : 3;
}
export function mergeChecksByDay<A extends Pick<DayAnswer, 'platform' | 'answerId' | 'status'>>(checks: Array<{
    checkedAt: string;
    answers: A[];
}>, dayOf: (iso: string) => string, nameOf: (a: A) => string = (a) => a.platform): Array<{
    key: string;
    checkedAt: string;
    answered: number;
    namedBy: string[];
    answers: A[];
}> {
    const days = new Map<string, Array<{
        checkedAt: string;
        answers: A[];
    }>>();
    for (const c of checks) {
        const d = dayOf(c.checkedAt);
        days.set(d, [...(days.get(d) ?? []), c]);
    }
    return [...days.entries()].map(([day, list]) => {
        const order: string[] = [];
        const best = new Map<string, A>();
        for (const c of list) {
            for (const a of c.answers) {
                if (!order.includes(a.platform))
                    order.push(a.platform);
                const prev = best.get(a.platform);
                if (!prev || strength(a) < strength(prev))
                    best.set(a.platform, a);
            }
        }
        const answers = order.map((p) => best.get(p)!);
        return {
            key: day,
            checkedAt: list[0]!.checkedAt,
            answered: answers.filter((a) => a.answerId !== null).length,
            namedBy: answers.filter((a) => a.status === 'named').map(nameOf),
            answers,
        };
    });
}
export const MAX_RANGE_DAYS = 30;
export function shiftDay(day: string, delta: number): string {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
}
export function daysBetween(from: string, to: string): number {
    return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
}
export function clampRange(a: string, b: string, max = MAX_RANGE_DAYS): {
    from: string;
    to: string;
    shortened: boolean;
} {
    const [from, to] = a <= b ? [a, b] : [b, a];
    if (daysBetween(from, to) <= max)
        return { from, to, shortened: false };
    return { from: shiftDay(to, -(max - 1)), to, shortened: true };
}
export function rangeEntries<D extends {
    key: string;
    answers: Array<Pick<DayAnswer, 'status' | 'platform'>>;
}>(days: D[], from: string, to: string, only: readonly string[] = []): Array<{
    day: D;
    answer: D['answers'][number];
}> {
    return days
        .filter((d) => d.key >= from && d.key <= to)
        .flatMap((day) => day.answers.filter((a) => a.status !== 'not_asked' && (only.length === 0 || only.includes(a.platform))).map((answer) => ({ day, answer })));
}
export function assistantsIn<A extends Pick<DayAnswer, 'status' | 'platform'>>(days: Array<{
    answers: A[];
}>): A[] {
    const seen = new Map<string, A>();
    for (const d of days)
        for (const a of d.answers)
            if (a.status !== 'not_asked' && !seen.has(a.platform))
                seen.set(a.platform, a);
    return [...seen.values()];
}
export function rangeLine(entries: Array<{
    day: {
        key: string;
    };
    answer: Pick<DayAnswer, 'status' | 'answerId'>;
}>): string {
    const answered = entries.filter((e) => e.answer.answerId !== null);
    const days = new Set(answered.map((e) => e.day.key)).size;
    const named = answered.filter((e) => e.answer.status === 'named').length;
    const base = `${answered.length} ${answered.length === 1 ? 'answer' : 'answers'} on ${days} ${days === 1 ? 'day' : 'days'}`;
    return named === 0 ? `${base}. Your store was not named in any of them.` : `${base}. Your store was named in ${named} of them.`;
}
export interface SearchSeen {
    query: string;
    answers: number;
    by: string[];
}
export function searchesAcross<A extends {
    searches: string[] | null;
    answerId: string | null;
}>(entries: Array<{
    answer: A;
}>, nameOf: (a: A) => string): {
    searches: SearchSeen[];
    answersReporting: number;
    answersTotal: number;
    silent: string[];
} {
    const seen = new Map<string, SearchSeen & {
        order: number;
    }>();
    let reporting = 0;
    let total = 0;
    const reported = new Set<string>();
    const answered = new Set<string>();
    for (const { answer } of entries) {
        if (answer.answerId === null)
            continue;
        total++;
        const name = nameOf(answer);
        answered.add(name);
        if (answer.searches === null)
            continue;
        reporting++;
        reported.add(name);
        const inThisAnswer = new Set<string>();
        for (const q of answer.searches) {
            const key = q.toLowerCase().replace(/\s+/g, ' ').trim();
            if (!key || inThisAnswer.has(key))
                continue;
            inThisAnswer.add(key);
            const prior = seen.get(key);
            if (prior) {
                prior.answers++;
                if (!prior.by.includes(name))
                    prior.by.push(name);
            }
            else
                seen.set(key, { query: q.trim(), answers: 1, by: [name], order: seen.size });
        }
    }
    const searches = [...seen.values()].sort((a, b) => b.answers - a.answers || a.order - b.order).map(({ query, answers, by }) => ({ query, answers, by }));
    return { searches, answersReporting: reporting, answersTotal: total, silent: [...answered].filter((n) => !reported.has(n)) };
}
