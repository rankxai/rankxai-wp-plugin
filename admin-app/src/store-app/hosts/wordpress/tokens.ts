const SPACE: Record<string, string> = {
    none: '0',
    'small-500': '2px',
    'small-400': '4px',
    'small-300': '6px',
    'small-200': '8px',
    'small-100': '12px',
    small: '12px',
    base: '16px',
    large: '20px',
    'large-100': '20px',
    'large-200': '24px',
    'large-300': '32px',
    'large-400': '40px',
    'large-500': '48px',
};
const RADIUS: Record<string, string> = {
    none: '0',
    'small-500': '2px',
    'small-400': '4px',
    'small-300': '4px',
    'small-200': '4px',
    'small-100': '6px',
    small: '6px',
    base: '8px',
    large: '12px',
    'large-100': '12px',
    'large-200': '16px',
    'large-300': '16px',
    'large-400': '16px',
    'large-500': '16px',
    max: '9999px',
};
export function space(token: string | undefined): string | undefined {
    if (token === undefined)
        return undefined;
    return token
        .trim()
        .split(/\s+/)
        .map((t) => SPACE[t] ?? t)
        .join(' ');
}
export function radius(token: string | undefined): string | undefined {
    if (token === undefined)
        return undefined;
    return RADIUS[token] ?? token;
}
export function border(value: string | undefined): string | undefined {
    if (value === undefined)
        return undefined;
    const [size = 'base', color = 'base', style = 'solid'] = value.trim().split(/\s+/);
    if (size === 'none')
        return 'none';
    const width = size === 'large' || size === 'large-100' ? '2px' : '1px';
    const ink = color === 'strong' ? 'var(--rx-foreground)' : color === 'subdued' ? 'var(--rx-muted)' : 'var(--rx-border)';
    return `${width} ${style} ${ink}`;
}
export function background(value: string | undefined): string | undefined {
    switch (value) {
        case undefined:
            return undefined;
        case 'base':
            return 'var(--rx-card)';
        case 'subdued':
            return 'var(--rx-muted)';
        case 'strong':
            return 'var(--rx-border)';
        case 'transparent':
            return 'transparent';
        default:
            return undefined;
    }
}
export interface ResponsiveValue {
    base: string;
    queries: Array<{
        condition: string;
        value: string;
    }>;
}
function topLevelParts(value: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < value.length; i++) {
        const c = value[i];
        if (c === '(')
            depth++;
        else if (c === ')')
            depth = Math.max(0, depth - 1);
        else if (c === ',' && depth === 0) {
            parts.push(value.slice(start, i));
            start = i + 1;
        }
    }
    parts.push(value.slice(start));
    return parts.map((p) => p.trim()).filter(Boolean);
}
function leadingCondition(s: string): {
    condition: string;
    rest: string;
} | null {
    if (!s.startsWith('('))
        return null;
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
        if (s[i] === '(')
            depth++;
        else if (s[i] === ')') {
            depth--;
            if (depth === 0)
                return { condition: s.slice(0, i + 1), rest: s.slice(i + 1).trim() };
        }
    }
    return null;
}
export function parseResponsive(value: string): ResponsiveValue {
    const trimmed = value.trim();
    if (!trimmed.startsWith('@container'))
        return { base: trimmed, queries: [] };
    const parts = topLevelParts(trimmed.slice('@container'.length).trim());
    const queries: ResponsiveValue['queries'] = [];
    let base = '';
    for (const part of parts) {
        const named = part.replace(/^[a-zA-Z_][\w-]*\s+(?=\()/, '');
        const c = leadingCondition(named);
        if (c && c.rest)
            queries.push({ condition: c.condition, value: c.rest });
        else
            base = part;
    }
    return { base, queries };
}
