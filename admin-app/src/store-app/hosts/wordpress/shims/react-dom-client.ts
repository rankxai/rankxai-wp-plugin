import type { createRoot as CreateRoot } from 'react-dom/client';
type Globals = {
    ReactDOM?: {
        createRoot?: typeof CreateRoot;
    };
    wp?: {
        element?: {
            createRoot?: typeof CreateRoot;
        };
    };
};
const g = window as unknown as Globals;
export const createRoot: typeof CreateRoot = (container, options) => {
    const make = g.ReactDOM?.createRoot ?? g.wp?.element?.createRoot;
    if (!make)
        throw new Error('RankX AI needs WordPress 6.6 or later (React is missing on this page).');
    return make(container, options);
};
