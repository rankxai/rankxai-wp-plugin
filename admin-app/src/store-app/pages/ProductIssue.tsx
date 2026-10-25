import { useStore } from '../plan-context';
import type { ReactNode } from 'react';
import { APP_PATHS, searchHref } from '@/lib/shopify-app/app-routes-core';
import { FIX_GUIDE, fixGuideFor } from '@/lib/shopify-app/product-detail-core';
import { bulkable, fixModeFor } from '@/lib/shopify-app/fix-index-core';
import type { GapCode } from '@/lib/shopify-app/catalogue-copy';
import { fmtCount, fmtNumber } from '../format';
import { isHiddenIssueCode, hiddenIssues, type HiddenIssueCode } from '@/lib/shopify-app/product-issues-core';
import { AdminLink, BackLink, ErrorBanner, GoButton, settled, useLoad, usePageError } from '../kit';
import { ProductCell, SkeletonSection } from '../components/Status';
import { GapTable, sharePercent, type CatalogueData, type QueueItem } from './CatalogueFixes';
import type { FixesData } from './SearchFixes';
import * as UI from '../ui';
export function ProductIssuePage({ code }: {
    code: string;
}) {
    return isHiddenIssueCode(code) ? <HiddenIssuePage code={code}/> : <CatalogueIssuePage code={code}/>;
}
function Frame({ heading, children }: {
    heading: string;
    children: ReactNode;
}) {
    return (<UI.Page heading={heading} inlineSize="large">
      <BackLink href={APP_PATHS.products} label="Products"/>
      {children}
    </UI.Page>);
}
function NothingToFix() {
    return (<UI.Section>
      <UI.EmptyState heading="No products have this issue">
        <UI.Paragraph>Either it has been fixed since, or your latest product check did not find it.</UI.Paragraph>
        <UI.Button slot="primary-action" href={APP_PATHS.products}>
          Back to Products
        </UI.Button>
      </UI.EmptyState>
    </UI.Section>);
}
function CatalogueIssuePage({ code }: {
    code: string;
}) {
    const cat = useLoad<CatalogueData>('catalogue');
    const [error, setError] = usePageError();
    const item = cat.data?.queue?.find((i) => i.code === code) ?? null;
    return (<Frame heading={item?.title ?? 'Product issue'}>
      <ErrorBanner error={error ?? cat.error} onDismiss={error ? () => setError(null) : undefined}/>
      {!settled(cat) ? (<SkeletonSection lines={8} label="Reading your product check"/>) : cat.data && !cat.data.scan ? (<UI.Section>
          <UI.Paragraph>{cat.data.running ? 'We are checking your products now. This takes about a minute.' : 'Your store has not been checked yet.'}</UI.Paragraph>
        </UI.Section>) : item ? (<>
          <IssueSummary item={item} checked={cat.data?.scan?.products ?? null}/>
          <GapTable item={item} setError={setError} onChanged={() => void cat.reload()}/>
          
          {item.group === 'images' ? (<UI.Section>
              <UI.Stack direction="inline" gap="base" alignItems="center">
                <UI.Text>Want a matching set of new photos? Show your products on a model in one setting.</UI.Text>
                <GoButton href={APP_PATHS.productImages} label="Open image studio"/>
              </UI.Stack>
            </UI.Section>) : null}
        </>) : cat.data ? (<NothingToFix />) : null}
    </Frame>);
}
const GROUP: Record<string, {
    label: string;
    tone: 'warning' | 'caution' | 'info';
    why: string;
}> = {
    cant_be_shown: { label: 'Stops it being shown', tone: 'warning', why: 'AI shopping channels and Google leave a product with this out of their answers, whatever else it has.' },
    missing_details: { label: 'Missing details', tone: 'caution', why: 'Shoppers filter and compare on these details, and AI answers pick out the products that have them.' },
    search_basics: { label: 'Search basics', tone: 'info', why: 'Search engines and AI assistants read these first to work out what the page is about.' },
    images: { label: 'Images', tone: 'info', why: 'The photo is the first thing a shopper sees in an AI shopping answer, and search engines read its text.' },
};
function IssueSummary({ item, checked }: {
    item: QueueItem;
    checked: number | null;
}) {
    const { words, platform } = useStore();
    const group = GROUP[item.group] ?? null;
    const guide = item.code in FIX_GUIDE ? fixGuideFor(item.code as GapCode, platform) : null;
    const mode = fixModeFor(item.code);
    const share = checked && checked > 0 ? Math.min(1, item.products / checked) : null;
    return (<UI.Section>
      <UI.QueryContainer>
        <UI.Grid gridTemplateColumns="@container (inline-size > 820px) 1fr 1fr 1fr, 1fr" gap="large">
          <UI.Stack gap="small-200">
            <UI.Stack direction="inline" gap="small-200" alignItems="baseline">
              <UI.Heading fontSize="large-300" accessibilityRole="presentation">
                {fmtNumber(item.products)}
              </UI.Heading>
              <UI.Text color="subdued">{item.products === 1 ? 'product' : 'products'}</UI.Text>
            </UI.Stack>
            {share !== null ? (<>
                <UI.Text color="subdued">{`${sharePercent(item.products, checked!)}% of the ${fmtCount(checked!, 'product', 'products')} checked`}</UI.Text>
                <UI.Progress value={item.products} max={checked!} accessibilityLabel={`${item.products} of ${checked} products checked`}/>
              </>) : null}
            {group ? (<UI.Stack direction="inline">
                <UI.Badge tone={group.tone}>{group.label}</UI.Badge>
              </UI.Stack>) : null}
          </UI.Stack>
          <UI.Stack gap="small-200">
            <UI.Text type="strong">Why it matters</UI.Text>
            <UI.Text color="subdued">{group?.why ?? item.title}</UI.Text>
          </UI.Stack>
          <UI.Stack gap="small-200">
            <UI.Text type="strong">How to fix it</UI.Text>
            <UI.Text>{item.fix}</UI.Text>
            {mode === 'search' ? (<UI.Text>
                Write it in <UI.Link href={searchHref('listings')}>SEO › Listings</UI.Link>, one page at a time or several at once.
              </UI.Text>) : guide && guide.place.kind === 'here' ? (<UI.Text>
                {bulkable(mode)
                ? 'Fix each product in the list below, or tick several and choose Fix selected. Each change is read back from your store, and you can undo it.'
                : 'Fix each product in the list below. Each change is read back from your store, and you can undo it.'}
              </UI.Text>) : guide ? (<>
                <UI.Text>{guide.place.kind === 'admin' ? `In ${guide.place.label.replace(/^Open /, '')}:` : 'On each product’s page (Edit product opens it in a new tab):'}</UI.Text>
                <UI.OrderedList>
                  {guide.steps.map((st) => (<UI.ListItem key={st}>{st}</UI.ListItem>))}
                </UI.OrderedList>
                {guide.place.kind === 'admin' ? <AdminLink path={guide.place.path}>{guide.place.label}</AdminLink> : null}
                {words.bulkTips[item.code] && item.products > 1 ? (<UI.Text color="subdued">
                    {words.bulkTips[item.code]} <AdminLink path="/products">Open Products</AdminLink>
                  </UI.Text>) : null}
              </>) : null}
          </UI.Stack>
        </UI.Grid>
      </UI.QueryContainer>
    </UI.Section>);
}
function HiddenIssuePage({ code }: {
    code: HiddenIssueCode;
}) {
    const fixes = useLoad<FixesData>('fixes');
    const issue = fixes.data ? (hiddenIssues(fixes.data.items).find((i) => i.code === code) ?? null) : null;
    return (<Frame heading={issue?.title ?? 'Product issue'}>
      <ErrorBanner error={fixes.error}/>
      {!settled(fixes) ? (<SkeletonSection lines={6} label="Reading your products"/>) : issue ? (<UI.Section heading={`${issue.items.length} ${issue.items.length === 1 ? 'product' : 'products'}`}>
          <UI.Stack gap="base">
            <UI.Paragraph>{`${issue.why} ${issue.fix}`}</UI.Paragraph>
            <UI.Table variant="auto">
              <UI.TableHeaderRow>
                <UI.TableHeader listSlot="primary">Product</UI.TableHeader>
                <UI.TableHeader listSlot="secondary">What we found</UI.TableHeader>
                <UI.TableHeader listSlot="inline">Action</UI.TableHeader>
              </UI.TableHeaderRow>
              <UI.TableBody>
                {issue.items.map((i) => (<UI.TableRow key={i.key}>
                    <UI.TableCell>
                      <ProductCell title={i.objectLabel}/>
                    </UI.TableCell>
                    <UI.TableCell>{i.title}</UI.TableCell>
                    <UI.TableCell>
                      {i.action.kind === 'shopify_admin' ? <AdminLink path={i.action.adminPath}>{i.action.label}</AdminLink> : null}
                    </UI.TableCell>
                  </UI.TableRow>))}
              </UI.TableBody>
            </UI.Table>
          </UI.Stack>
        </UI.Section>) : fixes.data ? (<NothingToFix />) : null}
    </Frame>);
}
