type ReactModule = typeof import('react');
const R = (window as unknown as {
    React: ReactModule;
}).React;
export default R;
export const { Children, Component, Fragment, StrictMode, Suspense, cloneElement, createContext, createElement, createRef, forwardRef, isValidElement, lazy, memo, startTransition, useCallback, useContext, useDebugValue, useDeferredValue, useEffect, useId, useImperativeHandle, useInsertionEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, useTransition, version, } = R;
