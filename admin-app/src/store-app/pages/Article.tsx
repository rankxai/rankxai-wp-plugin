import { useEffect, useState } from 'react';
import { APP_PATHS, searchHref } from '@/lib/shopify-app/app-routes-core';
import { articleContents, prePublishChecks } from '@/lib/shopify-app/article-contents-core';
import type { QualityView } from '@/lib/shopify-app/article-contents-core';
import { api, toastSuccess } from '../api';
import { AdminLink, BackLink, ErrorBanner, act, fieldError, formatDate, useLoad, usePageError, type PageError } from '../kit';
import { SkeletonSection } from '../components/Status';
import { PageColumns } from '../components/PageColumns';
import { FeaturedImagePicker, type ChosenImage } from '../components/FeaturedImagePicker';
import { ImproveCard, ImprovePreview, type ImproveView } from '../components/ArticleImprove';
import { ArticleRunCard, type ShopifyRun } from '../components/ArticleRun';
import type { BlogData } from './Blog';
import { useStore } from '../plan-context';
import * as UI from '../ui';
interface ArticleData {
    article: {
        id: string;
        title: string | null;
        metaTitle: string | null;
        metaDescription: string | null;
        status: string;
        stateLabel: string;
        html: string | null;
        updatedAt: string;
        editable: boolean;
        keyword: string | null;
        slug: string | null;
        words: number | null;
        targetWords: number | null;
        briefId?: string | null;
    };
    quality: QualityView;
    publication: {
        state: string;
        remoteStatus: string | null;
        url: string | null;
        publishedAt: string | null;
        error: string | null;
        adminPath: string | null;
        scheduledFor: string | null;
    } | null;
}
const PUBLISHING = new Set(['queued', 'publishing']);
const pad = (n: number) => String(n).padStart(2, '0');
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TIMES = Array.from({ length: 48 }, (_, i) => `${pad(Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`);
const ZONE = (() => {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
    catch {
        return null;
    }
})();
const fmtWhen = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export function ArticlePage({ id }: {
    id: string;
}) {
    const article = useLoad<ArticleData>(`blog/articles/${id}`);
    const blog = useLoad<BlogData>('blog');
    const improve = useLoad<{
        improve: ImproveView;
    }>(`blog/articles/${id}/improve`);
    const [error, setError] = usePageError();
    const [busy, setBusy] = useState<string | null>(null);
    const [chosenBlogId, setBlogId] = useState('');
    const { platform } = useStore();
    const wordpress = platform === 'woocommerce';
    const [categoryIds, setCategoryIds] = useState<number[] | null>(null);
    const [unsaved, setUnsaved] = useState(false);
    const [image, setImage] = useState<ChosenImage | null>(null);
    const imageIncomplete = !wordpress && !!image && !image.altText.trim();
    const a = article.data?.article;
    const pub = article.data?.publication ?? null;
    const scheduled = pub?.remoteStatus === 'scheduled';
    const live = pub?.remoteStatus === 'published';
    const [when, setWhen] = useState<'now' | 'later'>('now');
    const [openedAt] = useState(() => Date.now());
    const tomorrow = localDay(new Date(openedAt + 86400000));
    const [dayPick, setDay] = useState<string | null>(null);
    const [timePick, setTime] = useState<string | null>(null);
    const sched = scheduled && pub?.scheduledFor ? new Date(pub.scheduledFor) : null;
    const schedValid = !!sched && !Number.isNaN(sched.getTime());
    const day = dayPick ?? (schedValid ? localDay(sched!) : tomorrow);
    const time = timePick ?? (schedValid ? `${pad(sched!.getHours())}:${sched!.getMinutes() < 30 ? '00' : '30'}` : '09:00');
    const scheduleAt = new Date(`${day}T${time}:00`);
    const scheduleOk = !Number.isNaN(scheduleAt.getTime()) && scheduleAt.getTime() > openedAt + 5 * 60000;
    const later = when === 'later' || scheduled;
    const blogId = chosenBlogId || blog.data?.blogs?.defaultBlogId || '';
    useEffect(() => {
        if (!pub || !PUBLISHING.has(pub.state))
            return;
        const t = setTimeout(() => void article.reload(), 5000);
        return () => clearTimeout(t);
    }, [pub, article]);
    async function publish(action: 'publish' | 'draft' | 'schedule') {
        if (wordpress)
            return publishToWordPress(action);
        const blogs = blog.data?.blogs?.blogs ?? [];
        if (blogs.length === 0) {
            setError({ message: 'Your store has no blog yet. Create one on the Blog page first.', planLink: false });
            return;
        }
        if (!blogId) {
            setError({ message: 'Choose the blog to publish to.', planLink: false });
            return;
        }
        const r = await act(() => api(`blog/articles/${id}/publish`, {
            method: 'POST',
            body: { action, blogId, ...(action === 'schedule' ? { scheduledFor: scheduleAt.toISOString() } : {}), ...(image ? { image: { url: image.url, altText: image.altText.trim() } } : {}) },
        }), (b) => setBusy(b ? action : null), setError);
        if (r.ok) {
            toastSuccess(action === 'publish' ? 'Publishing to your store' : action === 'schedule' ? `Scheduling for ${fmtWhen(scheduleAt.toISOString())}` : 'Saving as a draft on your blog');
            setWhen('now');
            setDay(null);
            setTime(null);
            await article.reload();
        }
    }
    async function publishToWordPress(action: 'publish' | 'draft' | 'schedule') {
        if (image && !image.id?.startsWith('woo://media/')) {
            setError({ message: 'Choose the featured image from your Media Library.', planLink: false });
            return;
        }
        const r = await act(() => api(`blog/articles/${id}/publish`, {
            method: 'POST',
            body: { action, categoryIds: categoryIds ?? [], ...(action === 'schedule' ? { scheduledFor: scheduleAt.toISOString() } : {}), ...(image ? { image: { id: image.id } } : {}) },
        }), (b) => setBusy(b ? action : null), setError);
        if (r.ok) {
            toastSuccess(action === 'publish' ? 'Publishing to your site' : action === 'schedule' ? `Scheduling for ${fmtWhen(scheduleAt.toISOString())}` : 'Saving as a draft on your site');
            setWhen('now');
            setDay(null);
            setTime(null);
            await article.reload();
        }
    }
    async function change(c: 'publish_now' | 'cancel_schedule') {
        const r = await act(() => api(`blog/articles/${id}/publication`, { method: 'POST', body: { change: c } }), (b) => setBusy(b ? c : null), setError);
        if (r.ok) {
            toastSuccess(c === 'publish_now' ? 'Publishing to your store' : 'Cancelling the schedule');
            await article.reload();
        }
    }
    const blogs = blog.data?.blogs?.blogs ?? [];
    return (<UI.Page heading={a?.title ?? 'Article'} inlineSize="large">
      <BackLink href={APP_PATHS.blog} label="Blog"/>
      <ErrorBanner error={error ?? article.error} onDismiss={error ? () => setError(null) : undefined}/>
      {!a && article.loading ? <SkeletonSection lines={4}/> : null}
      {a ? (<PageColumns main={<>
                
                {a.briefId && (a.status === 'generating' || a.status === 'quality_review') ? <RunOnArticle briefId={a.briefId} onSettled={() => void article.reload()}/> : null}
                <ImprovePreview id={id} view={improve.data?.improve ?? null} reload={improve.reload} onKept={article.reload} setError={setError}/>
                <UI.Section heading="Article">
                  {a.html ? (<>
                      <style>{ARTICLE_PREVIEW_CSS}</style>
                      <div className="rx-article" dangerouslySetInnerHTML={{ __html: a.html }}/>
                    </>) : (<UI.Paragraph>The article text is not ready yet.</UI.Paragraph>)}
                </UI.Section>
            </>} side={<>
                <ContentsSection html={a.html} words={a.words}/>

                <UI.Section heading="Publish">
                  <UI.Stack gap="base">
                    <UI.Text color="subdued">
                      {a.stateLabel} · updated {formatDate(a.updatedAt)}
                    </UI.Text>
                    {pub ? (<UI.Stack gap="small-200">
                        {PUBLISHING.has(pub.state) ? (<UI.Text>Publishing…</UI.Text>) : pub.state === 'failed' || pub.state === 'unconfirmed' ? (<UI.Text>{pub.error ?? 'Publishing did not complete. You can try again.'}</UI.Text>) : (<UI.Badge tone={scheduled ? 'info' : live ? 'success' : undefined}>{scheduled ? 'Scheduled' : live ? 'Published on your store' : pub.remoteStatus === 'draft' ? 'Draft on your blog' : 'Not on your blog'}</UI.Badge>)}
                        {scheduled && pub.scheduledFor ? <UI.Text>{`Shows on your blog on ${fmtWhen(pub.scheduledFor)}. Until then it stays hidden.`}</UI.Text> : null}
                        {pub.url && pub.remoteStatus === 'published' ? <UI.Link href={pub.url} target="_blank">View on your store</UI.Link> : null}
                        {pub.adminPath ? <AdminLink path={pub.adminPath}>Edit the post</AdminLink> : null}
                      </UI.Stack>) : null}
                    {wordpress ? (<WordPressCategories data={blog.data ?? null} value={categoryIds ?? []} onChange={setCategoryIds}/>) : blogs.length > 1 ? (<UI.Select label="Blog" value={blogId} onChange={(e) => setBlogId(e.currentTarget.value)}>
                        <UI.Option value="">Choose a blog</UI.Option>
                        {blogs.map((b) => (<UI.Option key={b.id} value={b.id}>
                            {b.title}
                          </UI.Option>))}
                      </UI.Select>) : blog.data && blog.data.blogs === null ? (<UI.Paragraph>{blog.data.blogsError ?? 'We could not read your blogs just now. Reload the page to try again.'}</UI.Paragraph>) : blogs.length === 0 && blog.data ? (<UI.Paragraph>
                        Your store has no blog yet. Create one on the <UI.Link href={APP_PATHS.blog}>Blog page</UI.Link>.
                      </UI.Paragraph>) : null}
                    {!pub || !PUBLISHING.has(pub.state) ? (<FeaturedImagePicker articleId={id} value={image} onChange={setImage} error={error} defaultAlt={a.title ?? ''}/>) : null}
                    
                    {!pub ? <PrePublish checks={prePublishChecks({ ...a, hasFeaturedImage: !!image && !imageIncomplete })}/> : null}
                    
                    {(!pub || !PUBLISHING.has(pub.state)) && !live ? (<UI.Stack gap="small-200">
                        {!scheduled ? (<UI.ChoiceList name="publish-when" label="When" values={[when]} onChange={(e) => setWhen(((e.currentTarget as unknown as {
                        values: string[];
                    }).values[0] as 'now' | 'later') ?? 'now')}>
                            <UI.Choice value="now" selected={when === 'now' || undefined}>
                              Now
                            </UI.Choice>
                            <UI.Choice value="later" selected={when === 'later' || undefined}>
                              On a date
                            </UI.Choice>
                          </UI.ChoiceList>) : null}
                        {later ? (<UI.Stack gap="small-200">
                            <UI.Grid gridTemplateColumns="1fr 1fr" gap="small-200">
                              <UI.DateField label="Date" value={day} allow={`${localDay(new Date(openedAt))}--`} error={fieldError(error, 'scheduledFor')} onChange={(e) => setDay((e.currentTarget as unknown as {
                        value: string;
                    }).value || day)}/>
                              <UI.Select label="Time" value={time} onChange={(e) => setTime(e.currentTarget.value)}>
                                {TIMES.map((t) => (<UI.Option key={t} value={t}>
                                    {t}
                                  </UI.Option>))}
                              </UI.Select>
                            </UI.Grid>
                            <UI.Text color="subdued">{scheduleOk ? `Shows on your blog on ${fmtWhen(scheduleAt.toISOString())}${ZONE ? ` (${ZONE} time)` : ''}.` : 'Choose a time at least a few minutes from now.'}</UI.Text>
                          </UI.Stack>) : null}
                      </UI.Stack>) : null}
                    {!pub || !PUBLISHING.has(pub.state) ? (<UI.Stack direction="inline" gap="base">
                        {later && !live ? (<UI.Button variant="primary" disabled={busy !== null || unsaved || imageIncomplete || !scheduleOk || undefined} loading={busy === 'schedule' || undefined} onClick={() => void publish('schedule')}>
                            {scheduled ? 'Change the date' : 'Schedule'}
                          </UI.Button>) : (<UI.Button variant="primary" disabled={busy !== null || unsaved || imageIncomplete || undefined} loading={busy === 'publish' || undefined} onClick={() => void publish('publish')}>
                            {live ? 'Update on your store' : pub?.remoteStatus === 'draft' ? 'Publish the draft' : 'Publish'}
                          </UI.Button>)}
                        
                        {!pub || (pub.remoteStatus !== 'published' && pub.remoteStatus !== 'draft' && !scheduled) ? (when === 'now' ? (<UI.Button disabled={busy !== null || unsaved || imageIncomplete || undefined} loading={busy === 'draft' || undefined} onClick={() => void publish('draft')}>
                              Save as a draft on your blog
                            </UI.Button>) : null) : null}
                        {scheduled ? (<>
                            <UI.Button disabled={busy !== null || unsaved || undefined} loading={busy === 'publish_now' || undefined} onClick={() => void change('publish_now')}>
                              Publish now
                            </UI.Button>
                            <UI.Button variant="tertiary" disabled={busy !== null || undefined} loading={busy === 'cancel_schedule' || undefined} onClick={() => void change('cancel_schedule')}>
                              Cancel the schedule
                            </UI.Button>
                          </>) : null}
                      </UI.Stack>) : null}
                    <UI.Text color="subdued">
                      
                      {unsaved ? 'Save or discard your changes to the title and search fields first.' : 'Publishing approves the article. Nothing is published without your click.'}
                    </UI.Text>
                  </UI.Stack>
                </UI.Section>

                <QualitySection q={article.data!.quality}/>

                <ImproveCard id={id} view={improve.data?.improve ?? null} reload={improve.reload} error={error} setError={setError} onChanged={article.reload}/>

                <UI.Section heading="Title and search">
                  {a.editable ? (<SearchFieldsForm key={`${a.updatedAt}`} article={a} error={error} onDirty={setUnsaved} onSave={async (fields) => {
                        const r = await act(() => api(`blog/articles/${id}`, { method: 'PATCH', body: fields }), (b) => setBusy(b ? 'save' : null), setError);
                        if (r.ok) {
                            toastSuccess('Saved');
                            await article.reload();
                        }
                    }}/>) : (<UI.Stack gap="small-200">
                      <UI.Text>Search title: {a.metaTitle ?? '(none)'}</UI.Text>
                      <UI.Text>Search description: {a.metaDescription ?? '(none)'}</UI.Text>
                      
                      {live || scheduled || pub?.remoteStatus === 'draft' ? (<UI.Text color="subdued">
                          Change them in <UI.Link href={searchHref('listings')}>SEO › Listings</UI.Link>, which writes them on your blog.
                        </UI.Text>) : (<UI.Text color="subdued">This article is approved. Edit the post on your blog after it is published.</UI.Text>)}
                    </UI.Stack>)}
                </UI.Section>
            </>}/>) : null}
    </UI.Page>);
}
function RunOnArticle({ briefId, onSettled }: {
    briefId: string;
    onSettled: () => void;
}) {
    const run = useLoad<{
        run: ShopifyRun;
    }>(`blog/runs/${briefId}`);
    return run.data ? (<UI.Section heading="Being written">
      <ArticleRunCard initial={run.data.run} onSettled={onSettled}/>
    </UI.Section>) : null;
}
function PrePublish({ checks }: {
    checks: ReturnType<typeof prePublishChecks>;
}) {
    const open = checks.filter((c) => !c.passed).length;
    return (<UI.Stack gap="small-200">
      <UI.Text type="strong">{open === 0 ? 'Ready to publish' : `Before you publish: ${open} to check`}</UI.Text>
      {checks.map((c) => (<UI.Stack key={c.key} direction="inline" gap="small-200" alignItems="center">
          {c.passed ? <UI.Icon type="check-circle" tone="success" size="small"/> : <UI.Icon type="alert-triangle" tone="warning" size="small"/>}
          <UI.Text color={c.passed ? 'subdued' : undefined}>{c.label}</UI.Text>
        </UI.Stack>))}
    </UI.Stack>);
}
function ContentsSection({ html, words: stored }: {
    html: string | null;
    words: number | null;
}) {
    const contents = articleContents(html);
    const words = stored ?? contents.words;
    const c = { ...contents, words, readingMinutes: words > 0 ? Math.max(1, Math.ceil(words / 230)) : 0 };
    if (c.words === 0)
        return null;
    return (<UI.Section heading="Contents">
      <UI.Stack gap="small-200">
        <UI.Text color="subdued">{`${c.words.toLocaleString()} words · ${c.readingMinutes} min read${c.hasFaq ? ' · answers shoppers’ questions' : ''}`}</UI.Text>
        {c.headings.length > 0 ? (<UI.OrderedList>
            {c.headings.map((h, i) => (<UI.ListItem key={`${i}-${h}`}>{h}</UI.ListItem>))}
          </UI.OrderedList>) : null}
      </UI.Stack>
    </UI.Section>);
}
function QualitySection({ q }: {
    q: QualityView;
}) {
    if (!q.search && !q.aiAnswers)
        return null;
    return (<UI.Section heading="Checks">
      <UI.Stack gap="base">
        <UI.Stack direction="inline" gap="small-200">
          {q.search ? <UI.Badge tone={q.search.passed ? 'success' : 'caution'}>{q.search.passed ? 'Search: all passed' : `Search: ${q.search.failed} to check`}</UI.Badge> : null}
          {q.aiAnswers ? <UI.Badge tone={q.aiAnswers.passed ? 'success' : 'caution'}>{q.aiAnswers.passed ? 'AI answers: all passed' : `AI answers: ${q.aiAnswers.failed} to check`}</UI.Badge> : null}
        </UI.Stack>
        {q.fixes.length === 0 ? (<UI.Text color="subdued">Every check passed: it reads well for search and for AI answers.</UI.Text>) : (q.fixes.map((f) => (<UI.Stack key={f.key} gap="small-100">
              <UI.Text type="strong">{f.line}</UI.Text>
              {f.fix ? <UI.Text color="subdued">{f.fix}</UI.Text> : null}
            </UI.Stack>)))}
      </UI.Stack>
    </UI.Section>);
}
export const ARTICLE_PREVIEW_CSS = `
.rx-article { font-family: Inter, "Noto Sans Arabic", "Noto Sans Hebrew", -apple-system, BlinkMacSystemFont, "San Francisco", "Segoe UI", Roboto, "Helvetica Neue", sans-serif; font-size: 13px; line-height: 20px; color: inherit; overflow-wrap: anywhere; }
.rx-article h1, .rx-article h2, .rx-article h3, .rx-article h4 { font-weight: 650; line-height: 1.3; margin: 1.2em 0 0.4em; }
.rx-article h1 { font-size: 20px; } .rx-article h2 { font-size: 16px; } .rx-article h3, .rx-article h4 { font-size: 14px; }
.rx-article p, .rx-article ul, .rx-article ol, .rx-article table { margin: 0 0 0.8em; }
.rx-article ul, .rx-article ol { padding-inline-start: 1.4em; }
.rx-article img { max-width: 100%; height: auto; }
.rx-article table { border-collapse: collapse; display: block; overflow-x: auto; }
.rx-article th, .rx-article td { border: 1px solid rgba(0, 0, 0, 0.12); padding: 4px 8px; text-align: start; }
`;
function SearchFieldsForm({ article: a, error, onSave, onDirty }: {
    article: ArticleData['article'];
    error: PageError | null;
    onSave: (fields: {
        title: string;
        metaTitle: string;
        metaDescription: string;
    }) => Promise<void>;
    onDirty: (dirty: boolean) => void;
}) {
    const initial = { title: a.title ?? '', metaTitle: a.metaTitle ?? '', metaDescription: a.metaDescription ?? '' };
    const [fields, setFields] = useState(initial);
    const dirty = fields.title !== initial.title || fields.metaTitle !== initial.metaTitle || fields.metaDescription !== initial.metaDescription;
    useEffect(() => {
        onDirty(dirty);
    }, [dirty, onDirty]);
    return (<UI.SaveBarForm onSubmit={(e) => {
            e.preventDefault();
            void onSave(fields);
        }} onReset={() => setFields(initial)}>
      <UI.Stack gap="base">
        <UI.TextField label="Title" name="title" value={fields.title} defaultValue={initial.title} maxLength={500} error={fieldError(error, 'title')} onInput={(e) => setFields((f) => ({ ...f, title: e.currentTarget.value }))}/>
        <UI.TextField label="Search title" name="metaTitle" value={fields.metaTitle} defaultValue={initial.metaTitle} maxLength={200} details={`${fields.metaTitle.length} of 60 characters show in search results`} onInput={(e) => setFields((f) => ({ ...f, metaTitle: e.currentTarget.value }))}/>
        <UI.TextArea label="Search description" name="metaDescription" value={fields.metaDescription} defaultValue={initial.metaDescription} maxLength={500} details={`${fields.metaDescription.length} of 158 characters show in search results`} onInput={(e) => setFields((f) => ({ ...f, metaDescription: e.currentTarget.value }))}/>
      </UI.Stack>
    </UI.SaveBarForm>);
}
function WordPressCategories({ data, value, onChange }: {
    data: BlogData | null;
    value: number[];
    onChange: (ids: number[]) => void;
}) {
    if (!data)
        return null;
    if (!data.categories)
        return <UI.Paragraph>{data.categoriesError ?? 'We could not read your site’s post categories just now. Reload the page to try again.'}</UI.Paragraph>;
    if (data.categories.length === 0)
        return <UI.Text color="subdued">Your site has no post categories, so the post goes in WordPress’s default category.</UI.Text>;
    return (<UI.ChoiceList name="post-categories" label="Categories" multiple values={value.map(String)} details="None chosen: WordPress files the post under its default category." onChange={(e) => onChange(e.currentTarget.values.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))}>
      {data.categories.map((c) => (<UI.Choice key={c.id} value={String(c.id)} selected={value.includes(c.id) || undefined}>
          {c.name}
        </UI.Choice>))}
    </UI.ChoiceList>);
}
