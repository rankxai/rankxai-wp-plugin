import { useStore } from '../plan-context';
import { useState } from 'react';
import { APP_PATHS, blogHref, blogNewHref, searchHref, blogArticleHref } from '@/lib/shopify-app/app-routes-core';
import { alreadyWritten } from '@/lib/shopify-app/article-contents-core';
import { OWNER_ANSWER_MAX, OWNER_NOTE_MAX, FEATURED_PRODUCTS_MAX, STORE_ARTICLE_TYPES, STORE_ARTICLE_TYPE_COPY, type StoreArticleType } from '@/lib/content/store-article-types';
import { storeWordRange } from '@/lib/content/store-article-length';
import { api, toastSuccess } from '../api';
import { planToName, usePlan } from '../plan-context';
import { ErrorBanner, GoButton, ViewTabs, PagePrimaryAction, act, creditsLabel, fieldError, formatDate, useLoad, usePagedRows, usePageError } from '../kit';
import { MissingImagesNotice } from '../components/MissingImagesNotice';
import { SkeletonSection } from '../components/Status';
import { ArticleRunCard, type ShopifyRun } from '../components/ArticleRun';
import { MetricCard, MetricRow } from '../components/MetricCard';
import { fmtCount, fmtNumber } from '../format';
import { useRouter } from '../router';
import { BlogScheduleView } from './BlogSchedule';
import * as UI from '../ui';
export interface BlogData {
    blogs: {
        blogs: Array<{
            id: string;
            title: string;
            handle: string;
        }>;
        truncated: boolean;
        defaultBlogId: string | null;
    } | null;
    blogsError: string | null;
    categories?: Array<{
        id: number;
        name: string;
        count: number;
    }> | null;
    categoriesError?: string | null;
    articles: Array<{
        id: string;
        title: string | null;
        status: string;
        state: string | null;
        stateLabel: string;
        updatedAt: string;
        kind?: string | null;
        words?: number | null;
        quality?: {
            search: {
                passed: boolean;
                failed: number;
            } | null;
            aiAnswers: {
                passed: boolean;
                failed: number;
            } | null;
            toCheck: number;
        };
        clicks?: number | null;
        publication: {
            state: string;
            remoteStatus: string | null;
            url: string | null;
            publishedAt: string | null;
        } | null;
    }>;
    runs: ShopifyRun[];
    searchConnected?: boolean;
    ideas: Array<{
        key: string;
        topic: string;
        reason: string;
        source: string;
        evidence?: string | null;
    }> | null;
    prices: Record<'short' | 'standard' | 'long', number | null>;
    lengths: Array<{
        tier: 'short' | 'standard' | 'long';
        words: number;
    }> | null;
    canWrite: boolean;
}
export const LENGTHS = [
    { id: 'short', label: 'Short' },
    { id: 'standard', label: 'Standard' },
    { id: 'long', label: 'Long' },
] as const;
export function lengthLabel(d: BlogData, id: 'short' | 'standard' | 'long', label: string): string {
    const words = d.lengths?.find((l) => l.tier === id)?.words;
    const credits = d.prices[id];
    const range = storeWordRange(words);
    const length = range ? ` (${fmtNumber(range.min)} to ${fmtNumber(range.max)} words)` : words ? ` (about ${fmtNumber(words)} words)` : '';
    return `${label}${length}${credits !== null ? ` · ${creditsLabel(credits)}` : ''}`;
}
export function OwnerInputFields(props: {
    type: StoreArticleType;
    guessed: boolean;
    onType: (t: StoreArticleType) => void;
    answers: string[];
    onAnswer: (i: number, v: string) => void;
    featured: Array<{
        id: string;
        title: string | null;
    }>;
    onChooseProducts: () => void;
    onClearProducts: () => void;
    mustInclude: string;
    onMustInclude: (v: string) => void;
    avoid: string;
    onAvoid: (v: string) => void;
}) {
    const spec = STORE_ARTICLE_TYPE_COPY[props.type];
    return (<UI.Stack gap="base">
      <UI.Select label="Kind of article" value={props.type} details={props.guessed ? `${spec.hint} Chosen from your topic; change it if it fits better.` : spec.hint} onChange={(e) => props.onType(e.currentTarget.value as StoreArticleType)}>
        {STORE_ARTICLE_TYPES.map((t) => (<UI.Option key={t} value={t}>
            {STORE_ARTICLE_TYPE_COPY[t].label}
          </UI.Option>))}
      </UI.Select>
      <UI.Stack gap="small-200">
        <UI.Text type="strong">What you know (optional)</UI.Text>
        <UI.Text color="subdued">
          This is what makes the article yours. Answer the way you would answer a customer in your shop: what you recommend, what you have seen, the
          mistakes people make. We build the article on your answers, and it never claims experience you did not describe.
        </UI.Text>
      </UI.Stack>
      {spec.questions.map((q, i) => (<UI.TextArea key={`${props.type}-${i}`} id={`owner-question-${i}`} label={q} value={props.answers[i] ?? ''} rows={3} maxLength={OWNER_ANSWER_MAX} onInput={(e) => props.onAnswer(i, e.currentTarget.value)}/>))}
      <UI.Stack gap="small-200">
        <UI.Text type="strong">Products to feature (optional)</UI.Text>
        <UI.Text color="subdued">{`Choose up to ${FEATURED_PRODUCTS_MAX}. If you choose none, we pick the products that fit the topic.`}</UI.Text>
        <UI.Stack direction="inline" gap="small-200" alignItems="center">
          <UI.Button onClick={props.onChooseProducts}>{props.featured.length ? 'Change products' : 'Choose products'}</UI.Button>
          {props.featured.length ? (<>
              <UI.Text color="subdued">{props.featured.map((p) => p.title ?? 'A product').join(', ')}</UI.Text>
              <UI.Button variant="tertiary" onClick={props.onClearProducts}>
                Clear
              </UI.Button>
            </>) : null}
        </UI.Stack>
      </UI.Stack>
      <UI.TextField label="Must include (optional)" placeholder="Our free engraving, the winter care routine" value={props.mustInclude} maxLength={OWNER_NOTE_MAX} onInput={(e) => props.onMustInclude(e.currentTarget.value)}/>
      <UI.TextField label="Leave out (optional)" placeholder="Anything you do not want mentioned" value={props.avoid} maxLength={OWNER_NOTE_MAX} onInput={(e) => props.onAvoid(e.currentTarget.value)}/>
    </UI.Stack>);
}
export function blogWriteLock(plan: ReturnType<typeof usePlan>['plan'], d: BlogData | null) {
    const access = plan?.locks.access ? { ...plan.locks.access, reason: 'Writing articles is included in every paid plan.' } : null;
    return access ?? (d && !d.canWrite ? { locked: true as const, reason: 'Your plan does not include writing articles.', planNeeded: planToName(plan) } : null);
}
export function BlogPage({ view = null }: {
    view?: 'plan' | null;
}) {
    const blog = useLoad<BlogData>('blog');
    const { navigate } = useRouter();
    const { plan, ready: planReady } = usePlan();
    const [error, setError] = usePageError();
    const [busy, setBusy] = useState<string | null>(null);
    const [blogName, setBlogName] = useState('');
    const d = planReady ? blog.data : null;
    const writeLock = blogWriteLock(plan, d);
    const { platform } = useStore();
    const wordpress = platform === 'woocommerce';
    const hasBlog = wordpress || (!!d?.blogs && d.blogs.blogs.length > 0);
    const articles = usePagedRows(d?.articles ?? []);
    const ideas = usePagedRows(d?.ideas ?? [], 10);
    const published = d ? d.articles.filter((a) => a.publication?.remoteStatus === 'published').length : 0;
    const writing = d ? d.runs.filter((r) => r.stage !== 'failed' && r.stage !== 'not_started' && r.stage !== 'plan_ready').length : 0;
    async function createBlog() {
        const r = await act(() => api('blog/blogs', { method: 'POST', body: { title: blogName.trim() } }), (b) => setBusy(b ? 'blog' : null), setError);
        if (r.ok) {
            setBlogName('');
            toastSuccess('Blog created');
            await blog.reload();
        }
    }
    return (<UI.Page heading="Blog" inlineSize="large">
      {hasBlog ? (<PagePrimaryAction href={APP_PATHS.blogNew} disabled={!!writeLock}>
          Write an article
        </PagePrimaryAction>) : null}
      
      <ViewTabs>
        <UI.PressButton pressed={view !== 'plan'} onClick={() => navigate(blogHref())}>
          Articles
        </UI.PressButton>
        <UI.PressButton pressed={view === 'plan'} onClick={() => navigate(blogHref('plan'))}>
          Plan
        </UI.PressButton>
      </ViewTabs>
      <ErrorBanner error={error ?? blog.error} onDismiss={error ? () => setError(null) : undefined}/>
      {!d && (blog.loading || (blog.data && !planReady)) ? <SkeletonSection lines={4}/> : null}
      {d && view === 'plan' ? <BlogScheduleView blog={d} error={error} setError={setError}/> : null}
      {d && view !== 'plan' ? (<UI.Stack gap="base">
          
          {hasBlog ? (<MetricRow>
              <MetricCard label="Published" value={fmtNumber(published)} unit={published === 1 ? 'article' : 'articles'} basis="Live on your blog"/>
              <MetricCard label="Being written" value={fmtNumber(writing)} unit={writing === 1 ? 'article' : 'articles'} basis="About 10 minutes each"/>
              <MetricCard label="Waiting for you" value={fmtNumber(d.articles.filter((a) => a.state === 'review').length + d.runs.filter((r) => r.stage === 'plan_ready').length)} unit="to review" basis="Nothing is published without your click"/>
            </MetricRow>) : null}
          {wordpress ? null : d.blogs === null ? (<UI.Section heading="Your blog">
              <UI.Paragraph>{d.blogsError ?? 'We could not read your blogs just now.'}</UI.Paragraph>
            </UI.Section>) : d.blogs.blogs.length === 0 ? (<UI.Section heading="Create your blog">
              <UI.Stack gap="small-200">
                <UI.Paragraph>Your store has no blog yet. Create one to publish articles.</UI.Paragraph>
                <UI.TextField label="Blog name" placeholder="News" value={blogName} maxLength={255} error={fieldError(error, 'blogName')} onInput={(e) => setBlogName(e.currentTarget.value)}/>
                <UI.Stack direction="inline">
                  <UI.Button variant="primary" disabled={!blogName.trim() || busy !== null} loading={busy === 'blog' || undefined} onClick={() => void createBlog()}>
                    Create blog
                  </UI.Button>
                </UI.Stack>
              </UI.Stack>
            </UI.Section>) : null}

          <UI.Section heading="Articles">
            <UI.Stack gap="base">
              
              {hasBlog ? (<UI.Text color="subdued">
                  {wordpress
                    ? 'Published as posts on your WordPress site; you choose their categories when you publish. '
                    : d.blogs!.blogs.length === 1 ? `Published to “${d.blogs!.blogs[0]!.title}”. ` : `Your store has ${d.blogs!.blogs.length} blogs; you choose one when you publish. `}
                  Check how every post does for search and AI answers in <UI.Link href={searchHref('content')}>SEO › Content</UI.Link>.
                </UI.Text>) : null}
              {writeLock ? <UI.Text color="subdued">{`${writeLock.reason}${writeLock.planNeeded ? ` Available on ${writeLock.planNeeded}.` : ''}`}</UI.Text> : null}
              
              {hasBlog && d.articles.length > 0 ? <MissingImagesNotice /> : null}
              {d.runs.length > 0 ? (<UI.Stack gap="small-200">
                  {d.runs.map((r) => (<ArticleRunCard key={r.briefId} initial={r} onSettled={() => void blog.reload()}/>))}
                </UI.Stack>) : null}
              {d.articles.length === 0 ? (<UI.EmptyState heading="No articles yet">
                  <UI.Paragraph>Write an article built on what you know about your products, researched and ready for you to review before it is published.</UI.Paragraph>
                  
                  <UI.UnorderedList>
                    <UI.ListItem>Researched from the pages that rank and the questions shoppers ask</UI.ListItem>
                    <UI.ListItem>Your products linked where they help, and your own answers written in</UI.ListItem>
                    <UI.ListItem>A short questions-and-answers part, and the sources it relied on</UI.ListItem>
                  </UI.UnorderedList>
                  <UI.Paragraph>Write it in one go (Quick), or choose the title and shape the sections first (Guided). Same price.</UI.Paragraph>
                  {hasBlog ? (<UI.Button slot="primary-action" href={APP_PATHS.blogNew} disabled={!!writeLock || undefined}>
                      Write an article
                    </UI.Button>) : null}
                </UI.EmptyState>) : (<UI.Table variant="auto" {...articles.tableProps}>
                  <UI.TableHeaderRow>
                    <UI.TableHeader listSlot="primary">Title</UI.TableHeader>
                    <UI.TableHeader listSlot="secondary">State</UI.TableHeader>
                    <UI.TableHeader listSlot="labeled">Checks</UI.TableHeader>
                    <UI.TableHeader listSlot="labeled">Search clicks</UI.TableHeader>
                    <UI.TableHeader listSlot="labeled">Updated</UI.TableHeader>
                  </UI.TableHeaderRow>
                  <UI.TableBody>
                    {articles.rows.map((a) => (<UI.TableRow key={a.id} clickDelegate={`article-${a.id}`}>
                        <UI.TableCell>
                          <UI.Stack gap="small-100">
                            <UI.Link id={`article-${a.id}`} href={blogArticleHref(a.id)}>
                              {a.title ?? 'Untitled'}
                            </UI.Link>
                            {a.kind || a.words ? <UI.Text color="subdued">{[a.kind, a.words ? fmtCount(a.words, 'word', 'words') : null].filter(Boolean).join(' · ')}</UI.Text> : null}
                          </UI.Stack>
                        </UI.TableCell>
                        <UI.TableCell>
                          <ArticleState a={a}/>
                        </UI.TableCell>
                        <UI.TableCell>
                          <ChecksCell q={a.quality}/>
                        </UI.TableCell>
                        <UI.TableCell>
                          
                          {a.publication?.remoteStatus === 'published' ? (d.searchConnected ? (<UI.Stack gap="small-100">
                                <UI.Text>{fmtNumber(a.clicks ?? 0)}</UI.Text>
                                {a.publication.url ? (<UI.Link href={a.publication.url} target="_blank">
                                    View post
                                  </UI.Link>) : null}
                              </UI.Stack>) : (<UI.Stack gap="small-100">
                                <UI.Link href={searchHref('google')}>Connect Search Console</UI.Link>
                                {a.publication.url ? (<UI.Link href={a.publication.url} target="_blank">
                                    View post
                                  </UI.Link>) : null}
                              </UI.Stack>)) : (<UI.Text color="subdued">Not live yet</UI.Text>)}
                        </UI.TableCell>
                        <UI.TableCell>{formatDate(a.updatedAt)}</UI.TableCell>
                      </UI.TableRow>))}
                  </UI.TableBody>
                </UI.Table>)}
            </UI.Stack>
          </UI.Section>

          <UI.Section heading="Ideas from your buyers’ questions">
            {d.ideas === null ? (<UI.Paragraph>We could not read your questions just now.</UI.Paragraph>) : d.ideas.length === 0 ? (<UI.Paragraph>
                Add shopper questions in <UI.Link href={APP_PATHS.aiVisibility}>AI search</UI.Link>, and ideas appear here.
              </UI.Paragraph>) : (<UI.Table variant="auto" {...ideas.tableProps}>
                <UI.TableHeaderRow>
                  <UI.TableHeader listSlot="primary">Topic</UI.TableHeader>
                  <UI.TableHeader listSlot="secondary">Why</UI.TableHeader>
                  <UI.TableHeader listSlot="inline">Action</UI.TableHeader>
                </UI.TableHeaderRow>
                <UI.TableBody>
                  {ideas.rows.map((i) => {
                    const done = alreadyWritten(i.topic, d.articles);
                    return (<UI.TableRow key={i.key}>
                      <UI.TableCell>
                        <UI.Stack gap="small-100">
                          <UI.Text>{i.topic}</UI.Text>
                          {done ? (<UI.Stack direction="inline" gap="small-100" alignItems="center">
                              <UI.Badge>Already written</UI.Badge>
                              <UI.Link href={blogArticleHref(done.id)}>{done.title ?? 'Open it'}</UI.Link>
                            </UI.Stack>) : null}
                        </UI.Stack>
                      </UI.TableCell>
                      <UI.TableCell>
                        
                        <UI.Stack gap="small-100">
                          <UI.Text>{i.evidence ?? i.reason}</UI.Text>
                          {i.evidence ? <UI.Text color="subdued">{i.reason}</UI.Text> : null}
                        </UI.Stack>
                      </UI.TableCell>
                      <UI.TableCell>
                        {!hasBlog ? null : writeLock ? (<UI.Button disabled accessibilityLabel={`Write about: ${i.topic}. ${writeLock.planNeeded ? `Available on ${writeLock.planNeeded}` : writeLock.reason}`}>
                            {writeLock.planNeeded ? `Available on ${writeLock.planNeeded}` : 'Write about this'}
                          </UI.Button>) : (<GoButton href={blogNewHref(i.topic)} label="Write about this" accessibilityLabel={`Write about: ${i.topic}`}/>)}
                      </UI.TableCell>
                    </UI.TableRow>);
                })}
                </UI.TableBody>
              </UI.Table>)}
          </UI.Section>
        </UI.Stack>) : null}
    </UI.Page>);
}
function ChecksCell({ q }: {
    q: BlogData['articles'][number]['quality'];
}) {
    if (!q || (!q.search && !q.aiAnswers))
        return <UI.Text color="subdued">Not checked</UI.Text>;
    return (<UI.Stack direction="inline" gap="small-100">
      {q.search ? <UI.Badge tone={q.search.passed ? 'success' : 'caution'}>{q.search.passed ? 'Search ✓' : `Search: ${q.search.failed} to check`}</UI.Badge> : null}
      {q.aiAnswers ? <UI.Badge tone={q.aiAnswers.passed ? 'success' : 'caution'}>{q.aiAnswers.passed ? 'AI answers ✓' : `AI answers: ${q.aiAnswers.failed} to check`}</UI.Badge> : null}
    </UI.Stack>);
}
function ArticleState({ a }: {
    a: BlogData['articles'][number];
}) {
    const remote = a.publication?.remoteStatus;
    if (remote === 'published')
        return <UI.Badge tone="success">Published</UI.Badge>;
    if (remote === 'draft')
        return <UI.Badge>Draft on your blog</UI.Badge>;
    const tone = a.state === 'published' ? 'success' : a.state === 'review' || a.state === 'approved' ? 'info' : a.state === 'failed' ? 'warning' : 'neutral';
    return <UI.Badge tone={tone}>{a.stateLabel}</UI.Badge>;
}
