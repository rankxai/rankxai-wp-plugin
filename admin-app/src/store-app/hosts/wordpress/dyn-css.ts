import { parseResponsive } from './tokens';
const made = new Map<string, string>();
let sheet: CSSStyleSheet | null = null;
function styleSheet(): CSSStyleSheet | null {
    if (sheet)
        return sheet;
    if (typeof document === 'undefined')
        return null;
    const el = document.createElement('style');
    el.id = 'rx-store-dynamic';
    document.head.appendChild(el);
    sheet = el.sheet;
    return sheet;
}
export function responsiveClass(property: string, value: string | undefined): string | null {
    if (!value || !value.trim().startsWith('@container'))
        return null;
    const key = `${property}\n${value}`;
    const known = made.get(key);
    if (known)
        return known;
    const parsed = parseResponsive(value);
    const name = `rx-r${made.size}`;
    const s = styleSheet();
    if (s) {
        s.insertRule(`#rx-store .${name} { ${property}: ${parsed.base}; }`, s.cssRules.length);
        for (const q of parsed.queries)
            s.insertRule(`@container ${q.condition} { #rx-store .${name} { ${property}: ${q.value}; } }`, s.cssRules.length);
    }
    made.set(key, name);
    return name;
}
