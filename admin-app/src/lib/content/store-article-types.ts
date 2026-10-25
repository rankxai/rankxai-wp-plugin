export const STORE_ARTICLE_TYPES = ['buying_guide', 'comparison', 'how_to', 'gift_guide', 'behind_the_product', 'question'] as const;
export type StoreArticleType = (typeof STORE_ARTICLE_TYPES)[number];
export interface StoreArticleTypeCopy {
    label: string;
    hint: string;
    questions: readonly string[];
    keyQuestions: readonly [
        number,
        number
    ];
}
export const STORE_ARTICLE_TYPE_COPY: Record<StoreArticleType, StoreArticleTypeCopy> = {
    buying_guide: {
        label: 'Buying guide',
        hint: 'How to choose, and which of your products suits whom.',
        keyQuestions: [1, 2],
        questions: [
            'Who is this for, and who should choose something else?',
            'Which of your products would you recommend to most people, and why?',
            'What do customers most often ask or get wrong before buying?',
            'Anything you have measured, tried or seen first-hand (how it lasts, returns, feedback)?',
        ],
    },
    comparison: {
        label: 'Comparison',
        hint: 'This or that: which suits whom.',
        keyQuestions: [0, 1],
        questions: [
            'Which would you choose for most people, and why?',
            'Where does each one fall short?',
            'What do customers ask when they are deciding between them?',
            'Anything you have measured or seen first-hand?',
        ],
    },
    how_to: {
        label: 'How-to or care guide',
        hint: 'Using, caring for, fitting or sizing a product.',
        keyQuestions: [0, 1],
        questions: [
            'What method do you recommend, step by step?',
            'What mistake do you see most often?',
            'What do customers ask you about it?',
            'Anything you have learned the hard way?',
        ],
    },
    gift_guide: {
        label: 'Gift guide',
        hint: 'Gift ideas from your range, by person or budget.',
        keyQuestions: [1, 3],
        questions: [
            'Who are these gifts for?',
            'Which of your products make the best gifts, and why?',
            'Which price ranges should it cover?',
            'What do gift buyers usually ask you?',
        ],
    },
    behind_the_product: {
        label: 'Behind the product',
        hint: 'How you choose, source or make what you sell.',
        keyQuestions: [0, 2],
        questions: [
            'How do you choose or make these products?',
            'What do you look for in materials or suppliers, and what do you turn down?',
            'What is something most people do not know about how it is made?',
            'Why does that matter to the person buying it?',
        ],
    },
    question: {
        label: 'Answer a customer question',
        hint: 'One question your customers ask, answered properly.',
        keyQuestions: [0, 1],
        questions: [
            'What is your short answer?',
            'When does the answer change?',
            'What do customers usually do next?',
            'Anything from your own experience?',
        ],
    },
};
export function guessArticleType(topic: string): StoreArticleType {
    const t = topic.toLowerCase();
    if (/\b(?:vs\.?|versus|compared?\s+(?:to|with)|or)\b/.test(t) && /\b(?:vs\.?|versus|compare|compared|difference|better)\b/.test(t))
        return 'comparison';
    if (/\bgifts?\b/.test(t))
        return 'gift_guide';
    if (/\bhow\b.{0,40}\bmade\b|\bbehind\s+the\b|\bour\s+story\b|\bsourc(?:e|ed|ing)\b|\bcraft(?:ed|ing|smanship)?\b|\bhandmade\b|\bmade\s+in\b/.test(t))
        return 'behind_the_product';
    if (/\bhow\s+to\s+(?!choose\b|pick\b|buy\b|find\b|select\b)\w+|\bcare\s+guide\b|\bsize\s+guide\b|\bsizing\b/.test(t))
        return 'how_to';
    if (/\b(?:best|how\s+to\s+choose|choosing|buyer'?s\s+guide|guide\s+to|which\b.*\b(?:buy|choose|get))\b/.test(t))
        return 'buying_guide';
    if (/^\s*(?:can|do|does|is|are|should|what|why|when|how|which|will)\b/.test(t))
        return 'question';
    return 'buying_guide';
}
export const OWNER_ANSWER_MAX = 800;
export const OWNER_NOTE_MAX = 400;
export const FEATURED_PRODUCTS_MAX = 6;
export function isStoreArticleType(v: unknown): v is StoreArticleType {
    return typeof v === 'string' && (STORE_ARTICLE_TYPES as readonly string[]).includes(v);
}
