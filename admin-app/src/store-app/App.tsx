import { APP_PATHS } from '@/lib/shopify-app/app-routes-core';
import { lazy, Suspense, type ReactNode } from 'react';
import { PlanProvider } from './plan-context';
import { RouterProvider, useRouter } from './router';
import { PAGE_LOADERS } from './page-modules';
import * as UI from './ui';
const HomePage = lazy(() => PAGE_LOADERS.home().then((m) => ({ default: m.HomePage })));
const AiVisibilityPage = lazy(() => PAGE_LOADERS['ai-visibility']().then((m) => ({ default: m.AiVisibilityPage })));
const ShoppingQuestionPage = lazy(() => PAGE_LOADERS['shopping-question']().then((m) => ({ default: m.ShoppingQuestionPage })));
const AnswerQuestionPage = lazy(() => PAGE_LOADERS['answer-question']().then((m) => ({ default: m.AnswerQuestionPage })));
const ProductsPage = lazy(() => PAGE_LOADERS.products().then((m) => ({ default: m.ProductsPage })));
const ProductIssuePage = lazy(() => PAGE_LOADERS['product-issue']().then((m) => ({ default: m.ProductIssuePage })));
const SearchPage = lazy(() => PAGE_LOADERS.search().then((m) => ({ default: m.SearchPage })));
const ContentItemPage = lazy(() => PAGE_LOADERS['content-item']().then((m) => ({ default: m.ContentItemPage })));
const StoreSetupPage = lazy(() => PAGE_LOADERS['store-setup']().then((m) => ({ default: m.StoreSetupPage })));
const ChangesPage = lazy(() => PAGE_LOADERS.changes().then((m) => ({ default: m.ChangesPage })));
const ProductImagesPage = lazy(() => PAGE_LOADERS['product-images']().then((m) => ({ default: m.ProductImagesPage })));
const ProductPage = lazy(() => PAGE_LOADERS.product().then((m) => ({ default: m.ProductPage })));
const BlogPage = lazy(() => PAGE_LOADERS.blog().then((m) => ({ default: m.BlogPage })));
const BlogWritePage = lazy(() => PAGE_LOADERS['blog-new']().then((m) => ({ default: m.BlogWritePage })));
const BlogPlanPage = lazy(() => PAGE_LOADERS['blog-plan']().then((m) => ({ default: m.BlogPlanPage })));
const ArticlePage = lazy(() => PAGE_LOADERS.article().then((m) => ({ default: m.ArticlePage })));
const PlanPage = lazy(() => PAGE_LOADERS.plan().then((m) => ({ default: m.PlanPage })));
const SettingsPage = lazy(() => PAGE_LOADERS.settings().then((m) => ({ default: m.SettingsPage })));
const NotificationsPage = lazy(() => PAGE_LOADERS.notifications().then((m) => ({ default: m.NotificationsPage })));
export interface InitialData {
    apiBase: string;
}
function Page() {
    const { page } = useRouter();
    switch (page.name) {
        case 'home':
            return <HomePage />;
        case 'ai-visibility':
            return <AiVisibilityPage key={page.tab} tab={page.tab}/>;
        case 'shopping-question':
            return <ShoppingQuestionPage key={page.id} id={page.id}/>;
        case 'answer-question':
            return <AnswerQuestionPage key={page.id} id={page.id}/>;
        case 'products':
            return <ProductsPage key={page.view ?? 'all'} view={page.view ?? null}/>;
        case 'product-issue':
            return <ProductIssuePage key={page.code} code={page.code}/>;
        case 'search':
            return <SearchPage key={`${page.tab}:${page.product ?? ''}:${page.issue ?? ''}:${page.bulk ? 'bulk' : ''}:${page.select ? 'select' : ''}:${page.target ?? ''}`} tab={page.tab} product={page.product ?? null} issue={page.issue ?? null} bulk={page.bulk ?? false} select={page.select ?? false} target={page.target ?? null}/>;
        case 'content-item':
            return <ContentItemPage key={`${page.type}:${page.num}`} type={page.type} num={page.num}/>;
        case 'store-setup':
            return <StoreSetupPage />;
        case 'changes':
            return <ChangesPage />;
        case 'product-images':
            return <ProductImagesPage key={page.product ?? 'choose'} product={page.product}/>;
        case 'product':
            return <ProductPage key={page.num} num={page.num}/>;
        case 'blog':
            return <BlogPage key={page.view ?? 'articles'} view={page.view ?? null}/>;
        case 'blog-new':
            return <BlogWritePage key={`${page.topic ?? ''}:${page.product?.num ?? ''}`} topic={page.topic} product={page.product ?? null}/>;
        case 'blog-plan':
            return <BlogPlanPage key={page.briefId} briefId={page.briefId}/>;
        case 'article':
            return <ArticlePage key={page.id} id={page.id}/>;
        case 'plan':
            return <PlanPage />;
        case 'settings':
            return <SettingsPage />;
        case 'notifications':
            return <NotificationsPage />;
        default:
            return (<UI.Page heading="Page not found" inlineSize="large">
          <UI.Section>
            <UI.Paragraph>This page does not exist.</UI.Paragraph>
            <UI.Link href={APP_PATHS.home}>Go to RankX AI home</UI.Link>
          </UI.Section>
        </UI.Page>);
    }
}
export function App({ menu }: {
    menu: ReactNode;
}) {
    return (<RouterProvider>
      
      <PlanProvider>
        {menu}
        
        <Suspense fallback={null}>
          <Page />
        </Suspense>
      </PlanProvider>
    </RouterProvider>);
}
