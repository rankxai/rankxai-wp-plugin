const IMAGE = /!\[[^\]]*\]\([^)]*\)/g;
const LINK = /\[([^\]]+)\]\([^)]+\)/g;
const CITATION_CHIP = /\[(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\/?\]\([^)]*\)/gi;
const BARE_URL_LINE = /^[ \t]*<?https?:\/\/\S+>?[ \t]*$/gm;
const EMPTY_SOURCES_LINE = /^[ \t]*(?:\*\*)?Sources?:?(?:\*\*)?:?[ \t]*$/gim;
const ESCAPED = /\\([!-/:-@[-`{-~])/g;
export function cleanAnswerMarkdown(text: string): string {
    return text
        .replace(IMAGE, '')
        .replace(CITATION_CHIP, '')
        .replace(BARE_URL_LINE, '')
        .replace(EMPTY_SOURCES_LINE, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
export function plainAnswerText(text: string): string {
    return text
        .replace(IMAGE, '')
        .replace(CITATION_CHIP, '')
        .replace(LINK, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g, '$1$2')
        .replace(/`([^`]+)`/g, '$1')
        .replace(ESCAPED, '$1')
        .trim();
}
export function isEmptyParagraph(text: string): boolean {
    return /^[-*_\s]{3,}$/.test(text) || plainAnswerText(text) === '';
}
export function boldHeading(text: string): string | null {
    const m = /^\*\*([^*]+)\*\*:?$/.exec(text.trim());
    return m ? plainAnswerText(m[1]!) : null;
}
export function answerExcerpt(text: string, max = 200): string {
    const lines = cleanAnswerMarkdown(text).split('\n').map((l) => l.trim());
    const prose = lines.find((l) => l && !/^(#|\||[-*_]{3,}$)/.test(l) && !/^[-*+]\s|^\d+[.)]\s/.test(l) && boldHeading(l) === null);
    const first = prose ?? lines.find((l) => /^[-*+]\s|^\d+[.)]\s/.test(l))?.replace(/^[-*+]\s|^\d+[.)]\s/, '') ?? '';
    const plain = plainAnswerText(first);
    if (plain.length <= max)
        return plain;
    const cut = plain.slice(0, max);
    return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).replace(/[\s,;:.–-]+$/, '')}…`;
}
