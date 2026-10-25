type JsxRuntime = typeof import('react/jsx-runtime');
const J = (window as unknown as {
    ReactJSXRuntime: JsxRuntime;
}).ReactJSXRuntime;
export const { Fragment, jsx, jsxs } = J;
