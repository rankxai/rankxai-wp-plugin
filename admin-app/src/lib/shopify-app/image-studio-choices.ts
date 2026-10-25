export const IMAGE_PURPOSES = ['studio', 'on_model', 'in_action', 'blog'] as const;
export type ImagePurpose = (typeof IMAGE_PURPOSES)[number];
export const PRODUCT_SHOTS = ['studio', 'on_model', 'in_action'] as const;
export type ProductShot = (typeof PRODUCT_SHOTS)[number];
export const PURPOSE_LABEL: Record<ImagePurpose, {
    title: string;
    detail: string;
}> = {
    studio: { title: 'Studio', detail: 'Your product on its own on a lit studio set, with designed light, soft shadows and reflections: the hero shot a product studio charges for.' },
    on_model: { title: 'On a model', detail: 'Your product worn or held by a realistic model, for clothing, hats, bags, jewellery and anything a person carries.' },
    in_action: { title: 'In action', detail: 'Your product being used in a real moment: a board being ridden, a mug at breakfast, a tent at camp.' },
    blog: { title: 'Blog image', detail: 'A featured image for the article, made from its topic.' },
};
export const AGE_CHOICES = ['auto', 'adult', 'teen', 'child', 'young_child', 'toddler', 'baby'] as const;
export type AgeChoice = (typeof AGE_CHOICES)[number];
export const AGE_CHOICE_LABEL: Record<AgeChoice, string> = {
    auto: 'Automatic (from the product)',
    adult: 'Adult',
    teen: 'Teenager (13 to 17)',
    child: 'Child (6 to 12)',
    young_child: 'Young child (3 to 5)',
    toddler: 'Toddler (1 to 2)',
    baby: 'Baby (under 1)',
};
export function isAgeChoice(v: unknown): v is AgeChoice {
    return typeof v === 'string' && (AGE_CHOICES as readonly string[]).includes(v);
}
export const IMAGE_BRIEF_MAX = 1500;
export const IMAGE_REQUEST_MAX = 500;
export function imageChangeText(v: Record<string, unknown> | null, side: 'before' | 'after'): string {
    if (side === 'after')
        return v?.makeMain === true ? 'A new image, as the main image' : 'A new image, beside the others';
    const ids = typeof v?.mediaOrder === 'string' ? v.mediaOrder.split(',').filter(Boolean) : [];
    if (ids.length === 0)
        return 'No images';
    const images = ids.filter((id) => /\/MediaImage\//.test(id)).length;
    const other = ids.length - images;
    const parts = [images ? `${images} ${images === 1 ? 'image' : 'images'}` : null, other ? `${other} ${other === 1 ? 'video or 3D model' : 'videos or 3D models'}` : null];
    return parts.filter(Boolean).join(' and ');
}
export interface StyleChoice {
    id: string;
    label: string;
    swatch?: string;
}
export const BACKDROP_CHOICES: readonly StyleChoice[] = [
    { id: 'auto', label: 'Automatic' },
    { id: 'white', label: 'Warm white', swatch: '#F4F1EA' },
    { id: 'grey', label: 'Light grey', swatch: '#D9D9D6' },
    { id: 'stone', label: 'Stone', swatch: '#B9B2A6' },
    { id: 'sand', label: 'Sand', swatch: '#E3D3B8' },
    { id: 'sage', label: 'Sage', swatch: '#A9B8A0' },
    { id: 'blue', label: 'Dusty blue', swatch: '#A7B8C8' },
    { id: 'clay', label: 'Clay', swatch: '#C98A6B' },
    { id: 'charcoal', label: 'Charcoal', swatch: '#3A3A3C' },
    { id: 'black', label: 'Black', swatch: '#121212' },
];
export const SET_CHOICES: readonly StyleChoice[] = [
    { id: 'auto', label: 'Automatic' },
    { id: 'sweep', label: 'Seamless backdrop' },
    { id: 'plinth', label: 'Plinth' },
    { id: 'marble', label: 'Marble' },
    { id: 'wood', label: 'Wood' },
    { id: 'linen', label: 'Linen' },
    { id: 'reflective', label: 'Gloss' },
    { id: 'still_life', label: 'Styled with props' },
];
export const LIGHT_CHOICES: readonly StyleChoice[] = [
    { id: 'auto', label: 'Automatic' },
    { id: 'soft', label: 'Soft' },
    { id: 'bright', label: 'Bright' },
    { id: 'dramatic', label: 'Dramatic' },
    { id: 'window', label: 'Window' },
    { id: 'golden', label: 'Golden hour' },
];
export const MOOD_CHOICES: readonly StyleChoice[] = [
    { id: 'auto', label: 'Automatic' },
    { id: 'minimal', label: 'Minimal' },
    { id: 'luxury', label: 'Luxury' },
    { id: 'warm', label: 'Warm' },
    { id: 'bold', label: 'Bold' },
    { id: 'playful', label: 'Playful' },
    { id: 'natural', label: 'Natural' },
];
export const PLACE_CHOICES: readonly StyleChoice[] = [
    { id: 'auto', label: 'Automatic' },
    { id: 'studio', label: 'In a studio' },
    { id: 'location', label: 'On location' },
];
export const FRAMING_CHOICES: readonly StyleChoice[] = [
    { id: 'auto', label: 'Automatic' },
    { id: 'full', label: 'Full length' },
    { id: 'half', label: 'Waist up' },
    { id: 'close', label: 'Close on the product' },
];
export const SEASON_CHOICES: readonly StyleChoice[] = [
    { id: 'auto', label: 'No theme' },
    { id: 'spring', label: 'Spring' },
    { id: 'summer', label: 'Summer' },
    { id: 'autumn', label: 'Autumn' },
    { id: 'winter', label: 'Winter' },
    { id: 'festive', label: 'Festive' },
];
export interface ShootOptions {
    backdrop: string;
    set: string;
    light: string;
    mood: string;
    place: string;
    framing: string;
    season: string;
}
export const DEFAULT_SHOOT: ShootOptions = { backdrop: 'auto', set: 'auto', light: 'auto', mood: 'auto', place: 'auto', framing: 'auto', season: 'auto' };
export function shootChoices(shot: ProductShot, place: string = 'auto'): Array<keyof ShootOptions> {
    if (shot === 'studio')
        return ['set', 'backdrop', 'light', 'mood', 'season'];
    if (shot === 'on_model')
        return place === 'studio' ? ['place', 'backdrop', 'framing', 'light', 'mood', 'season'] : ['place', 'framing', 'light', 'mood', 'season'];
    return ['light', 'mood', 'season'];
}
export const SHOOT_CHOICE_LISTS: Record<keyof ShootOptions, readonly StyleChoice[]> = { backdrop: BACKDROP_CHOICES, set: SET_CHOICES, light: LIGHT_CHOICES, mood: MOOD_CHOICES, place: PLACE_CHOICES, framing: FRAMING_CHOICES, season: SEASON_CHOICES };
export const TAKE_CHOICES = [1, 2, 3, 4] as const;
export const TAKES_MAX = 4;
export const REFERENCES_MAX = 3;
export interface TweakChoice {
    id: string;
    label: string;
    shots: readonly ProductShot[];
}
export const TWEAK_CHOICES: readonly TweakChoice[] = [
    { id: 'again', label: 'More like this', shots: PRODUCT_SHOTS },
    { id: 'closer', label: 'Closer', shots: PRODUCT_SHOTS },
    { id: 'wider', label: 'Wider', shots: PRODUCT_SHOTS },
    { id: 'angle', label: 'Another angle', shots: PRODUCT_SHOTS },
    { id: 'pose', label: 'Another pose', shots: ['on_model', 'in_action'] },
    { id: 'warmer', label: 'Warmer light', shots: PRODUCT_SHOTS },
    { id: 'brighter', label: 'Brighter', shots: PRODUCT_SHOTS },
    { id: 'simpler', label: 'Simpler', shots: PRODUCT_SHOTS },
];
export const EXPIRY_WARNING_DAYS = 3;
export function keepingState(keptUntil: string | null | undefined, now: number = Date.now()): 'soon' | 'kept' | null {
    const t = keptUntil ? Date.parse(keptUntil) : NaN;
    if (!Number.isFinite(t))
        return null;
    return (t - now) / 86400000 <= EXPIRY_WARNING_DAYS ? 'soon' : 'kept';
}
export const GOOGLE_MIN_IMAGE_PX = 500;
export const GOOGLE_RECOMMENDED_IMAGE_PX = 1500;
export const GOOGLE_MIN_DATE = '31 January 2027';
export type MerchantReadiness = {
    state: 'unknown' | 'blocked' | 'small' | 'ok';
    line: string;
};
export function merchantReadiness(main: {
    width: number | null;
    height: number | null;
} | null): MerchantReadiness {
    if (!main || !main.width || !main.height)
        return { state: 'unknown', line: 'We could not read your main image’s size just now.' };
    const size = `${main.width} × ${main.height} px`;
    const shortest = Math.min(main.width, main.height);
    if (shortest < GOOGLE_MIN_IMAGE_PX) {
        return { state: 'blocked', line: `Your main image is ${size}. From ${GOOGLE_MIN_DATE}, Google Shopping stops showing products whose image is under ${GOOGLE_MIN_IMAGE_PX} × ${GOOGLE_MIN_IMAGE_PX} px. A studio photo is 2048 px: add one as the main image.` };
    }
    if (shortest < GOOGLE_RECOMMENDED_IMAGE_PX) {
        return { state: 'small', line: `Your main image is ${size}. Google recommends at least ${GOOGLE_RECOMMENDED_IMAGE_PX} × ${GOOGLE_RECOMMENDED_IMAGE_PX} px. A studio photo is 2048 px: add one as the main image.` };
    }
    return { state: 'ok', line: `Your main image is ${size}, which meets Google’s recommended size.` };
}
export const MERCHANT_IMAGE_RULES = 'Google also asks that the product fills most of the main image, with no text, logos, borders or watermarks added over it. Studio photos add none of these.';
export const CHANNEL_FORMATS = [
    { id: '4:5', label: 'Portrait 4:5', use: 'Instagram and Facebook feeds, Pinterest, and your product page', width: 1632, height: 2048, onProduct: true },
    { id: '9:16', label: 'Story 9:16', use: 'Stories, Reels and TikTok', width: 1152, height: 2048, onProduct: false },
    { id: '16:9', label: 'Wide 16:9', use: 'Banners, YouTube and your store’s slideshow', width: 2048, height: 1152, onProduct: false },
] as const;
export type ChannelFormat = (typeof CHANNEL_FORMATS)[number]['id'];
export function isChannelFormat(v: unknown): v is ChannelFormat {
    return CHANNEL_FORMATS.some((f) => f.id === v);
}
export function channelFormat(id: ChannelFormat): (typeof CHANNEL_FORMATS)[number] {
    return CHANNEL_FORMATS.find((f) => f.id === id)!;
}
export const LOOK_NAME_MAX = 40;
