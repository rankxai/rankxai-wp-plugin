export function storeWordRange(targetWords: number | null | undefined): {
    min: number;
    max: number;
} | null {
    if (!targetWords || targetWords <= 0)
        return null;
    if (targetWords <= 1000)
        return { min: 700, max: 1000 };
    if (targetWords <= 1800)
        return { min: 1200, max: 1800 };
    return { min: 2000, max: 3000 };
}
