import { useState } from 'react';
import { APP_PATHS } from '@/lib/shopify-app/app-routes-core';
import { api, toastSuccess } from '../api';
import { ErrorBanner, GoButton, act, fieldError, formatDate, settled, useLoad, usePageError, type Load, type PageError } from '../kit';
import { usePlan, useStore } from '../plan-context';
import { fmtCount } from '../format';
import { SkeletonSection } from '../components/Status';
import { PageColumns } from '../components/PageColumns';
import * as UI from '../ui';
interface Settings {
    store: {
        name: string | null;
        shopDomain: string;
        primaryHost: string | null;
        brandName: string | null;
    };
    connection: {
        state: 'connected' | 'missing' | 'unknown';
        status: string | null;
    };
    market: {
        explicit: boolean;
        countryCode: string | null;
        country: string | null;
        languageCode: string | null;
    };
    options: {
        countries: Array<{
            code: string;
            name: string;
        }>;
        languages: Array<{
            code: string;
            name: string;
        }>;
    };
    aiMode: {
        enabled: boolean | null;
        note: string;
    };
    checks?: {
        days: number | null;
    };
}
export function SettingsPage() {
    const { words } = useStore();
    const settings = useLoad<Settings>('settings');
    const prefs = useLoad<{
        preferences: Preferences;
    }>('settings/preferences');
    const { ready: planReady } = usePlan();
    const [error, setError] = usePageError();
    const ready = settled(settings) && settled(prefs) && planReady;
    const s = ready ? settings.data : null;
    return (<UI.Page heading="Settings" inlineSize="large">
      <ErrorBanner error={error ?? settings.error} onDismiss={error ? () => setError(null) : undefined}/>
      {!ready ? <SkeletonSection lines={6}/> : null}
      
      {ready ? (<PageColumns main={<>
              
              {s ? <SettingsForm key={JSON.stringify([s.store.brandName, s.market])} s={s} error={error} setError={setError} onSaved={() => settings.reload()}/> : null}
              {s ? <CheckFrequencySection key={String(s.checks?.days)} days={s.checks?.days ?? null} setError={setError} onSaved={() => settings.reload()}/> : null}
              {s ? <AiModeSection key={String(s.aiMode.enabled)} aiMode={s.aiMode} setError={setError} onSaved={() => settings.reload()}/> : null}
              {s ? <PreferencesSection prefs={prefs} setError={setError}/> : null}
            </>} side={<>
              <PlanSummary />
              
              <UI.Section heading="Changes">
                <UI.Stack gap="small-200">
                  <UI.Paragraph>Everything RankX AI has changed in your store, with the result of each change and a way to undo it.</UI.Paragraph>
                  <UI.Stack direction="inline">
                    <GoButton href={APP_PATHS.changes} label="See every change"/>
                  </UI.Stack>
                </UI.Stack>
              </UI.Section>
              
              <UI.Section heading="Advanced">
                <UI.Stack gap="small-200">
                  <UI.Paragraph>How AI assistants read your store: extra product info in your theme, {words.agentFilesPublisher} (llms.txt and agents.md), and the daily check of your site.</UI.Paragraph>
                  <UI.Stack direction="inline">
                    <GoButton href={APP_PATHS.storeSetup} label="Open advanced settings"/>
                  </UI.Stack>
                </UI.Stack>
              </UI.Section>
            </>}/>) : null}
    </UI.Page>);
}
function PlanSummary() {
    const { plan } = usePlan();
    if (!plan)
        return null;
    const credits = plan.credits?.available ?? null;
    return (<UI.Section heading="Plan">
      <UI.Stack gap="small-200">
        <UI.Stack direction="inline" gap="small-200" alignItems="center">
          <UI.Text type="strong">{plan.card.title}</UI.Text>
          {credits !== null ? (<UI.Badge tone={plan.credits?.paused ? 'caution' : 'info'}>{plan.credits?.paused ? `${fmtCount(credits, 'credit', 'credits')}, paused` : `${fmtCount(credits, 'credit', 'credits')} available`}</UI.Badge>) : null}
        </UI.Stack>
        <UI.Text color="subdued">{plan.card.body.replace('{date}', formatDate(plan.card.date))}</UI.Text>
        <UI.Stack direction="inline">
          <UI.Button href={APP_PATHS.plan}>See plans and credits</UI.Button>
        </UI.Stack>
      </UI.Stack>
    </UI.Section>);
}
function SettingsForm({ s, error, setError, onSaved }: {
    s: Settings;
    error: PageError | null;
    setError: (e: PageError | null) => void;
    onSaved: () => Promise<void>;
}) {
    const { words } = useStore();
    const initial = { brandName: s.store.brandName ?? '', countryCode: s.market.countryCode ?? '', languageCode: s.market.languageCode ?? '' };
    const [form, setForm] = useState(initial);
    const [busy, setBusy] = useState(false);
    async function save() {
        const body: Record<string, string> = {};
        if (form.brandName.trim() !== (s.store.brandName ?? ''))
            body.brandName = form.brandName.trim();
        if (form.countryCode && (form.countryCode !== (s.market.countryCode ?? '') || form.languageCode !== (s.market.languageCode ?? ''))) {
            body.countryCode = form.countryCode;
            if (form.languageCode)
                body.languageCode = form.languageCode;
        }
        if (Object.keys(body).length === 0)
            return;
        const r = await act(() => api('settings', { method: 'PATCH', body }), setBusy, setError);
        if (r.ok) {
            toastSuccess('Settings saved');
            await onSaved();
        }
    }
    return (<UI.SaveBarForm onSubmit={(e) => {
            e.preventDefault();
            void save();
        }} onReset={() => setForm(initial)}>
      <UI.Stack gap="base">
      <UI.Section heading="Your store">
        <UI.Stack gap="base">
          
          <UI.Stack gap="small-100">
            <UI.Stack direction="inline" gap="small-200" alignItems="center">
              <UI.Text type="strong">{s.store.name ?? s.store.shopDomain}</UI.Text>
              <UI.Badge tone={s.connection.state === 'connected' ? 'success' : 'warning'}>
                {s.connection.state === 'connected' ? 'Connected' : s.connection.state === 'missing' ? 'Not connected' : 'Connection not read'}
              </UI.Badge>
            </UI.Stack>
            <UI.Text color="subdued">{s.store.primaryHost ?? s.store.shopDomain}</UI.Text>
            {s.connection.state === 'missing' ? <UI.Text color="subdued">{words.reconnect}</UI.Text> : null}
          </UI.Stack>
          <UI.TextField label="Store name" name="brandName" details="The name we look for in AI assistants' answers." value={form.brandName} defaultValue={initial.brandName} maxLength={120} error={fieldError(error, 'brandName')} disabled={busy || undefined} onInput={(e) => setForm((f) => ({ ...f, brandName: e.currentTarget.value }))}/>
        </UI.Stack>
      </UI.Section>
      <UI.Section heading="Market">
        <UI.Stack gap="base">
          {!s.market.explicit ? <UI.Paragraph>Choose the country whose shoppers you sell to. We check AI answers as they appear there.</UI.Paragraph> : null}
          <UI.Select label="Country" name="countryCode" value={form.countryCode} error={fieldError(error, 'countryCode')} disabled={busy || undefined} onChange={(e) => setForm((f) => ({ ...f, countryCode: e.currentTarget.value }))}>
            <UI.Option value="" defaultSelected={initial.countryCode === '' || undefined}>Choose a country</UI.Option>
            {s.options.countries.map((c) => (<UI.Option key={c.code} value={c.code} defaultSelected={c.code === initial.countryCode || undefined}>
                {c.name}
              </UI.Option>))}
          </UI.Select>
          <UI.Select label="Language" name="languageCode" value={form.languageCode} disabled={busy || undefined} onChange={(e) => setForm((f) => ({ ...f, languageCode: e.currentTarget.value }))}>
            <UI.Option value="" defaultSelected={initial.languageCode === '' || undefined}>The country’s main language</UI.Option>
            {s.options.languages.map((l) => (<UI.Option key={l.code} value={l.code} defaultSelected={l.code === initial.languageCode || undefined}>
                {l.name}
              </UI.Option>))}
          </UI.Select>
        </UI.Stack>
      </UI.Section>
      </UI.Stack>
    </UI.SaveBarForm>);
}
const CHECK_CHOICES = [
    { days: 1, label: 'Every day' },
    { days: 3, label: 'Every 3 days' },
    { days: 7, label: 'Every week' },
] as const;
function CheckFrequencySection({ days, setError, onSaved }: {
    days: number | null;
    setError: (e: PageError | null) => void;
    onSaved: () => Promise<void>;
}) {
    const [busy, setBusy] = useState(false);
    async function change(value: string) {
        const next = Number(value);
        if (!CHECK_CHOICES.some((c) => c.days === next))
            return;
        const r = await act(() => api<{
            days: number;
        }>('settings/check-frequency', { method: 'POST', body: { days: next } }), setBusy, setError);
        if (r.ok) {
            toastSuccess('Saved');
            await onSaved();
        }
    }
    return (<UI.Section heading="How often we check your questions">
      <UI.Stack gap="base">
        <UI.Select label="Check every question" value={days === null ? '' : String(days)} disabled={busy || undefined} onChange={(e) => void change(e.currentTarget.value)}>
          {days === null ? <UI.Option value="">Choose how often</UI.Option> : null}
          {CHECK_CHOICES.map((c) => (<UI.Option key={c.days} value={String(c.days)}>
              {c.label}
            </UI.Option>))}
        </UI.Select>
        <UI.Text color="subdued">Each check asks the AI assistants and looks at the products shown. Checking less often uses fewer credits.</UI.Text>
      </UI.Stack>
    </UI.Section>);
}
function AiModeSection({ aiMode, setError, onSaved }: {
    aiMode: Settings['aiMode'];
    setError: (e: PageError | null) => void;
    onSaved: () => Promise<void>;
}) {
    const [busy, setBusy] = useState(false);
    async function change(enabled: boolean) {
        const r = await act(() => api<{
            enabled: boolean;
        }>('settings/ai-mode', { method: 'POST', body: { enabled } }), setBusy, setError);
        if (r.ok) {
            toastSuccess(enabled ? 'Google AI Mode switched on' : 'Google AI Mode switched off');
            await onSaved();
        }
    }
    return (<UI.Section heading="Where we look for the products shown">
      <UI.Stack gap="base">
        <UI.Text>We look at the products ChatGPT shows for each question.</UI.Text>
        {aiMode.enabled === null ? (<UI.Text color="subdued">Whether Google AI Mode is checked could not be read just now.</UI.Text>) : (<UI.Checkbox label="Also look at Google AI Mode" checked={aiMode.enabled || undefined} disabled={busy || undefined} onChange={(e) => void change(e.currentTarget.checked)}/>)}
        <UI.Text color="subdued">{aiMode.note}</UI.Text>
      </UI.Stack>
    </UI.Section>);
}
interface Preferences {
    autoRedirectDeleted: boolean;
    weeklyEmail: boolean;
}
function PreferencesSection({ prefs, setError }: {
    prefs: Load<{
        preferences: Preferences;
    }>;
    setError: (e: PageError | null) => void;
}) {
    const [busy, setBusy] = useState(false);
    const p = prefs.data?.preferences;
    async function change(patch: Partial<Preferences>, done: string) {
        const r = await act(() => api<{
            preferences: Preferences;
        }>('settings/preferences', { method: 'PUT', body: patch }), setBusy, setError);
        if (r.ok) {
            toastSuccess(done);
            await prefs.reload();
        }
    }
    if (!p)
        return null;
    return (<UI.Section heading="Automatic changes and emails">
      <UI.Stack gap="base">
        <UI.Checkbox label="Redirect a deleted product's address automatically" details="When you delete a product, its address is sent to your catalogue page so visitors and search engines do not reach a missing page. Each redirect can be undone." checked={p.autoRedirectDeleted || undefined} disabled={busy || undefined} onChange={(e) => void change({ autoRedirectDeleted: e.currentTarget.checked }, e.currentTarget.checked ? 'Deleted products will be redirected' : 'Automatic redirects switched off')}/>
        <UI.Text color="subdued">
          Every automatic change is listed in <UI.Link href={APP_PATHS.changes}>Changes</UI.Link>.
        </UI.Text>
        <UI.Checkbox label="Send me a weekly summary" details="Once a week: how many products AI shopping can show, what changed, and what to fix next." checked={p.weeklyEmail || undefined} disabled={busy || undefined} onChange={(e) => void change({ weeklyEmail: e.currentTarget.checked }, e.currentTarget.checked ? 'Weekly summary switched on' : 'Weekly summary switched off')}/>
      </UI.Stack>
    </UI.Section>);
}
