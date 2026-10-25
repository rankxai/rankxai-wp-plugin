import { createRoot } from 'react-dom/client';
import { App } from '../../App';
import { prefetch, setApiBase } from '../../api';
import { preloadPage } from '../../page-modules';
import { dataPathsFor, matchAppPath } from '@/lib/shopify-app/app-routes-core';
import { servesDataPath } from '@/lib/store-app/capabilities-core';
import { config, host } from './host';
import { LeavePrompt, Toasts, WordPressNav } from './shell';
import { watchLabels } from './label-in-name';
import './store.css';
if (config.apiBase)
    setApiBase(config.apiBase);
const loc = host.location();
const openedPage = matchAppPath(loc.path, loc.search, { aiOrders: true });
for (const path of dataPathsFor(openedPage, 'woocommerce'))
    if (servesDataPath('woocommerce', path))
        prefetch(path);
preloadPage(openedPage.name);
const root = document.getElementById('rx-store');
if (root) {
    root.classList.add('rx-store');
    watchLabels(root);
    createRoot(root).render(<>
      <App menu={<WordPressNav />}/>
      <Toasts />
      <LeavePrompt />
    </>);
}
