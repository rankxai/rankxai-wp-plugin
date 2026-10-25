export interface BundleFinding {
    file: string;
    marker: string;
}
const MARKERS: Array<{
    marker: string;
    re: RegExp;
}> = [
    { marker: 'react.element (a bundled React before 19)', re: /(['"`])react\.element\1/ },
    { marker: '__reactFiber$ (a bundled react-dom)', re: /__reactFiber\$|__reactInternalInstance\$/ },
    { marker: 'React internals assigned (a bundled react)', re: /__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED\s*[:=][^=]/ },
    { marker: '_owner: (a bundled element factory)', re: /\b_owner\s*:/ },
    { marker: 'window.React assigned (replaces WordPress’s copy)', re: /\bwindow\.(?:React|ReactDOM|ReactJSXRuntime)\b\s*(?:\|\||&&|\?\?)?=[^=]/ },
];
export function checkChunk(file: string, code: string): BundleFinding[] {
    return MARKERS.filter((m) => m.re.test(code)).map((m) => ({ file, marker: m.marker }));
}
export function readsWordPressReact(chunks: string[]): boolean {
    const all = chunks.join('\n');
    return /\bwindow\.React\b/.test(all) && /\bwindow\.ReactJSXRuntime\b/.test(all);
}
