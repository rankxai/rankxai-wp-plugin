type ReactDomModule = typeof import('react-dom');
const D = (window as unknown as {
    ReactDOM: ReactDomModule;
}).ReactDOM;
export default D;
export const { createPortal, flushSync } = D;
