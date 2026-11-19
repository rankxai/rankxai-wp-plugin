export function withReference(message: string | null, status: number, requestId: string | null): string | null {
    if (message === null || status < 500 || !requestId || !/^[0-9a-f]{6,32}$/.test(requestId))
        return message;
    return `${message} Reference: ${requestId}.`;
}
