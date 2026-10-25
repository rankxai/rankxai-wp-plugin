import { APP_PATHS, productsHref } from '@/lib/shopify-app/app-routes-core';
import { ErrorBanner, ViewTabs, settled, useLoad, usePageError } from '../kit';
import { usePlan } from '../plan-context';
import { useRouter } from '../router';
import { fmtNumber } from '../format';
import { CheckAgainAction } from '../components/CheckAgain';
import { SkeletonSection } from '../components/Status';
import { CatalogueIndex, CatalogueSummary, StoreBlocks, type CatalogueData } from './CatalogueFixes';
import { MonitoredProducts } from './MonitoredTab';
import { ProductList } from './ProductList';
import type { FixesData } from './SearchFixes';
import * as UI from '../ui';
export function ProductsPage({ view = null }: {
    view?: 'monitored' | null;
}) {
    const { navigate } = useRouter();
    const { plan } = usePlan();
    const [error, setError] = usePageError();
    const monitored = plan?.usage.products ?? null;
    return (<UI.Page heading="Products" inlineSize="large">
      <UI.Button slot="secondary-actions" href={APP_PATHS.productImages}>
        Image studio
      </UI.Button>
      <ViewTabs>
        <UI.PressButton pressed={view !== 'monitored'} onClick={() => navigate(productsHref())}>
          Product check
        </UI.PressButton>
        <UI.PressButton pressed={view === 'monitored'} onClick={() => navigate(productsHref('monitored'))}>
          {monitored === null ? 'Monitored in AI answers' : `Monitored in AI answers (${fmtNumber(monitored)})`}
        </UI.PressButton>
      </ViewTabs>
      {view === 'monitored' ? (<>
          <ErrorBanner error={error} onDismiss={error ? () => setError(null) : undefined}/>
          <UI.Section heading="Products monitored in AI answers">
            <MonitoredProducts setError={setError}/>
          </UI.Section>
        </>) : (<ProductCheck error={error} setError={setError}/>)}
    </UI.Page>);
}
function ProductCheck({ error, setError }: {
    error: ReturnType<typeof usePageError>[0];
    setError: ReturnType<typeof usePageError>[1];
}) {
    const cat = useLoad<CatalogueData>('catalogue');
    const fixes = useLoad<FixesData>('fixes');
    const storeBlocked = (cat.data?.blockers ?? []).some((b) => b.kind === 'blocks');
    return (<>
      <CheckAgainAction running={!!cat.data?.running} setError={setError} onStarted={() => cat.reload()}/>
      <ErrorBanner error={error ?? cat.error} onDismiss={error ? () => setError(null) : undefined}/>
      
      {!settled(cat) ? (<SkeletonSection lines={8} label="Reading your store"/>) : (<>
          <StoreBlocks data={cat.data}/>
          <CatalogueSummary cat={cat}/>
          <CatalogueIndex data={cat.data}/>
          <ProductList fixes={settled(fixes) ? fixes.data : null} storeBlocked={storeBlocked}/>
        </>)}
    </>);
}
