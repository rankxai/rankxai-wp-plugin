import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
export interface SlotScope {
    targets: Record<string, HTMLElement | null>;
    owns: ReadonlySet<string>;
    parent: SlotScope | null;
}
const SlotContext = createContext<SlotScope | null>(null);
export function SlotProvider({ scope, children }: {
    scope: SlotScope;
    children: ReactNode;
}) {
    return <SlotContext.Provider value={scope}>{children}</SlotContext.Provider>;
}
export function useSlotOwner(slots: readonly string[]): {
    ref: (name: string) => (el: HTMLElement | null) => void;
    scope: SlotScope;
} {
    const parent = useContext(SlotContext);
    const [targets, setTargets] = useState<Record<string, HTMLElement | null>>({});
    const callbacks = useRef(new Map<string, (el: HTMLElement | null) => void>());
    const ref = useCallback((name: string) => {
        let cb = callbacks.current.get(name);
        if (!cb) {
            cb = (el: HTMLElement | null) => setTargets((t) => (t[name] === el ? t : { ...t, [name]: el }));
            callbacks.current.set(name, cb);
        }
        return cb;
    }, []);
    const key = slots.join('|');
    const scope = useMemo<SlotScope>(() => ({ targets, owns: new Set(key.split('|')), parent }), [targets, key, parent]);
    return { ref, scope };
}
export function Slotted({ slot, children }: {
    slot: string | undefined;
    children: ReactNode;
}): ReactNode {
    let scope = useContext(SlotContext);
    if (!slot)
        return children;
    while (scope && !scope.owns.has(slot))
        scope = scope.parent;
    if (!scope)
        return children;
    const target = scope.targets[slot];
    if (!target)
        return null;
    return createPortal(children, target);
}
