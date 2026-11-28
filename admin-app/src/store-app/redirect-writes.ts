import type { WriteResult } from './components/FixModals';
export type RedirectWriteResult = WriteResult & {
    localId: string | null;
};
export { AutoRedirectSetting, addRedirect, applyRedirectSuggestion, importRedirectRows, redirectsWrittenLocally, removeRedirect, } from '@store-host/redirect-writer';
