export interface Shopping {
    hero: {
        state: string;
        headline: string;
        subline: string | null;
    };
    freeSnapshot: {
        line: string;
        lastAt: string | null;
        nextAt: string | null;
    } | null;
    findings: Array<{
        kind: string;
        title: string;
        detail: string;
        remedy?: string | null;
    }>;
    surfaces: Array<{
        id: string;
        label: string;
    }>;
    denominators: Array<{
        surface: string;
        checks: number;
        answered: number;
        showedProducts: number;
        showedYours: number;
        couldNotRun: number;
    }>;
    questions: Array<{
        id: string;
        text: string;
        source: string;
        carousels: number;
        knownChecks: number;
        carouselPct: number | null;
    }> | null;
    products: {
        rows: Array<{
            id: string;
            title: string | null;
            imageUrl: string | null;
            price: string | null;
            availability: string | null;
        }>;
        meter: string;
        pausedNote: string | null;
        full: boolean;
        cap: number | null;
        active: number;
    } | null;
    competitors: Array<{
        merchant: string;
        surface: string;
        appearances: number;
        bestPosition: number | null;
    }>;
    prices: {
        checkQuestion: number | null;
        generateQuestions: number | null;
        diagnose: number | null;
        rewrite: number | null;
    };
}
