export const STRUCTURED_DATA_EMBED_HANDLE = 'rankx-structured-data';
export const STRUCTURED_DATA_EXTENSION_HANDLE = 'rankx-structured-data';
export type EmbedStatus = 'on' | 'off' | 'unknown';
export function themeEditorActivateLink(apiKey: string): string {
    return `shopify://admin/themes/current/editor?context=apps&activateAppId=${apiKey}/${STRUCTURED_DATA_EMBED_HANDLE}`;
}
export interface ExtensionInfoLike {
    handle: string;
    type: string;
    activations: ReadonlyArray<{
        handle?: string;
        target?: string;
        status?: string;
        activations?: ReadonlyArray<{
            target?: string;
            themeId?: string;
        }>;
    }>;
}
function themeKey(id: string | null | undefined): string | null {
    if (!id)
        return null;
    const m = /(\d+)\s*$/.exec(id);
    return m ? m[1]! : null;
}
export function embedStatusFromExtensions(list: readonly ExtensionInfoLike[] | null | undefined, mainThemeId: string | null): EmbedStatus {
    if (!Array.isArray(list))
        return 'unknown';
    const embed = list
        .filter((e) => e.type === 'theme_app_extension')
        .flatMap((e) => e.activations ?? [])
        .find((a) => a.handle === STRUCTURED_DATA_EMBED_HANDLE);
    if (!embed)
        return 'unknown';
    if (embed.status !== 'active')
        return embed.status === 'available' || embed.status === 'unavailable' ? 'off' : 'unknown';
    const main = themeKey(mainThemeId);
    if (!main)
        return 'on';
    const placements: ReadonlyArray<{
        target?: string;
        themeId?: string;
    }> = embed.activations ?? [];
    const themes = placements.map((a) => themeKey(a.themeId)).filter((k): k is string => !!k);
    if (themes.length === 0)
        return 'on';
    return themes.includes(main) ? 'on' : 'off';
}
const EMBED_TYPE_RE = new RegExp(`^shopify://apps/[^/]+/blocks/${STRUCTURED_DATA_EMBED_HANDLE}/[^/]+$`);
function stripLeadingComment(text: string): string {
    const t = text.trimStart();
    if (!t.startsWith('/*'))
        return t;
    const end = t.indexOf('*/');
    return end < 0 ? t : t.slice(end + 2);
}
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
export function embedStatusFromSettingsData(content: string | null | undefined): EmbedStatus {
    if (typeof content !== 'string' || content.trim() === '')
        return 'unknown';
    let data: unknown;
    try {
        data = JSON.parse(stripLeadingComment(content));
    }
    catch {
        return 'unknown';
    }
    if (!isObj(data))
        return 'unknown';
    let current: unknown = data.current;
    if (typeof current === 'string')
        current = isObj(data.presets) ? data.presets[current] : undefined;
    if (!isObj(current))
        return 'unknown';
    const blocks = current.blocks;
    if (blocks === undefined)
        return 'off';
    if (!isObj(blocks))
        return 'unknown';
    for (const b of Object.values(blocks)) {
        if (!isObj(b) || typeof b.type !== 'string' || !EMBED_TYPE_RE.test(b.type))
            continue;
        if (b.disabled !== true)
            return 'on';
    }
    return 'off';
}
