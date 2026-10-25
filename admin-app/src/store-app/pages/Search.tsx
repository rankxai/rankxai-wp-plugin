import { SEARCH_TABS, searchHref, type SearchTab } from '@/lib/shopify-app/app-routes-core';
import { useRouter } from '../router';
import { ErrorBanner, ViewTabs, useLoad, usePageError } from '../kit';
import { RedirectsSection } from './Redirects';
import { SearchFixes, type FixesData } from './SearchFixes';
import { TemplatesSection } from './Templates';
import { SearchPerformanceTab } from './SearchPerformanceTab';
import { ContentTab } from './ContentTab';
import { SeoOverview } from './SeoOverview';
import { Listings } from './Listings';
import { RichResults } from './RichResults';
import * as UI from '../ui';
export function SearchPage({ tab, product = null, issue = null, bulk = false, select = false, target = null }: {
    tab: SearchTab;
    product?: string | null;
    issue?: string | null;
    bulk?: boolean;
    select?: boolean;
    target?: string | null;
}) {
    const { navigate } = useRouter();
    const [error, setError] = usePageError();
    const fixes = useLoad<FixesData>(tab === 'links' ? 'fixes' : null);
    return (<UI.Page heading="SEO" inlineSize="large">
      <ViewTabs>
        {SEARCH_TABS.map((t) => (<UI.PressButton key={t.id} pressed={t.id === tab} onClick={() => navigate(searchHref(t.id))}>
            {t.label}
          </UI.PressButton>))}
      </ViewTabs>
      <ErrorBanner error={error ?? fixes.error} onDismiss={error ? () => setError(null) : undefined}/>
      {tab === 'overview' ? <SeoOverview setError={setError}/> : null}
      {tab === 'listings' && !bulk ? <Listings setError={setError} issue={issue} product={product} select={select}/> : null}
      {tab === 'listings' && bulk ? <TemplatesSection setError={setError} target={target}/> : null}
      {tab === 'links' ? (<>
          <SearchFixes load={fixes} group="links" setError={setError}/>
          
          {fixes.data || fixes.error ? <RedirectsSection setError={setError}/> : null}
        </>) : null}
      {tab === 'rich' ? <RichResults setError={setError}/> : null}
      {tab === 'google' ? <SearchPerformanceTab /> : null}
      {tab === 'content' ? <ContentTab setError={setError}/> : null}
    </UI.Page>);
}
