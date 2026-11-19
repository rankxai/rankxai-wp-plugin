export const MAX_REPORTS = 3;
export function isNoise(message: string): boolean {
    return message === '' || /^Script error\.?$/i.test(message) || /ResizeObserver loop/i.test(message);
}
export function createReportGate(max = MAX_REPORTS): (message: string) => boolean {
    const seen = new Set<string>();
    return (message: string) => {
        if (isNoise(message) || seen.has(message) || seen.size >= max)
            return false;
        seen.add(message);
        return true;
    };
}
