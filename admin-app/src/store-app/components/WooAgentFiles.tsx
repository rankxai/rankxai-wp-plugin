import { useState } from 'react';
import { api, toastSuccess } from '../api';
import { useLoad, type PageError } from '../kit';
import * as UI from '../ui';
import { toastWrite } from '../reviews';
interface WooAgentFile {
    file: string;
    path: string;
    live: {
        state: 'read' | 'unreadable';
        status: number | null;
        score: {
            score: number;
            max: number;
        } | null;
        missing: string[];
        customisedByRankx: boolean;
        text: string | null;
    };
    published: {
        stored: boolean;
        serving: boolean;
        fileOnDisk: boolean;
        updated: string | null;
    } | null;
    proposed: {
        text: string;
        score: {
            score: number;
            max: number;
        } | null;
    };
}
interface WooAgentFilesInfo {
    host: string;
    canPublish: boolean;
    publishBlockedReason: string | null;
    files: WooAgentFile[];
}
export function WooAgentFilesSection({ setError }: {
    setError: (e: PageError | null) => void;
}) {
    const info = useLoad<WooAgentFilesInfo>('readiness/agent-files');
    const d = info.data;
    return (<UI.Section heading="llms.txt and agents.md">
      <UI.Stack gap="small-200">
        <UI.Paragraph>The files AI assistants read to learn what your store is, published at your site’s address by the RankX AI plugin. Free on every plan.</UI.Paragraph>
        <UI.Text color="subdued">Google says llms.txt will neither help nor harm a store in Google Search. AI assistants and shopping agents may read it.</UI.Text>
        {!d && info.loading ? <UI.Text color="subdued">Reading your files…</UI.Text> : null}
        {!d && !info.loading ? <UI.Paragraph>{info.error ?? 'We could not read your files just now.'}</UI.Paragraph> : null}
        {d && !d.canPublish && d.publishBlockedReason ? <UI.Banner tone="info">{d.publishBlockedReason}</UI.Banner> : null}
        {d?.files.map((f, i) => (<WooAgentFileRow key={f.file} f={f} host={d.host} canPublish={d.canPublish} first={i === 0} setError={setError} onPublished={() => void info.reload()}/>))}
      </UI.Stack>
    </UI.Section>);
}
function WooAgentFileRow({ f, host: siteHost, canPublish, first, setError, onPublished }: {
    f: WooAgentFile;
    host: string;
    canPublish: boolean;
    first: boolean;
    setError: (e: PageError | null) => void;
    onPublished: () => void;
}) {
    const [draft, setDraft] = useState<string | null>(null);
    const [open, setOpen] = useState(false);
    const [showLive, setShowLive] = useState(false);
    const [busy, setBusy] = useState(false);
    const editingPublished = !!(f.published?.stored && f.published.serving && f.live.text);
    const base = editingPublished && f.live.text ? f.live.text : f.proposed.text;
    const text = draft ?? base;
    const publish = async () => {
        setBusy(true);
        setError(null);
        const r = await api<{
            verified: boolean;
            message?: string;
        }>('readiness/agent-files', { method: 'PUT', body: { file: f.file, text } });
        setBusy(false);
        if (!r.ok) {
            setError({ message: r.error ?? 'The file could not be published.', planLink: false });
            return;
        }
        toastWrite(r.data?.verified, `${f.path} published`, `${f.path} saved; your site may take a moment to show it`);
        setDraft(null);
        onPublished();
    };
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            toastSuccess('File copied');
        }
        catch {
            setError({ message: 'Your browser did not allow copying. Select the text in the box and copy it yourself.', planLink: false });
        }
    };
    return (<UI.Stack gap="small-200">
      {first ? null : <UI.Divider />}
      <UI.Stack direction="inline" gap="small-200" alignItems="center">
        <UI.Text type="strong">{f.path}</UI.Text>
        {f.published?.serving ? <UI.Badge tone="success">Published</UI.Badge> : f.published?.fileOnDisk ? <UI.Badge tone="caution">A file on your server answers instead</UI.Badge> : <UI.Badge tone="neutral">Not published</UI.Badge>}
      </UI.Stack>
      {f.live.state === 'read' && f.live.score ? (<UI.Text>
          {`${siteHost}${f.path} covers ${f.live.score.score} of ${f.live.score.max} things assistants look for.`}
          {f.live.missing.length > 0 ? ` Missing: ${f.live.missing.slice(0, 4).join('; ')}.` : ''}
        </UI.Text>) : (<UI.Text color="subdued">{`Nothing is served at ${siteHost}${f.path} yet.`}</UI.Text>)}
      {f.published?.fileOnDisk && !f.published.serving ? (<UI.Text color="subdued">A real file on your server answers at this address, so the published copy is not shown. Remove that file to serve this one.</UI.Text>) : null}
      {f.live.text ? (<>
          <UI.Stack direction="inline">
            <UI.Button variant="tertiary" onClick={() => setShowLive((v) => !v)}>{showLive ? 'Hide the current file' : 'View the current file'}</UI.Button>
          </UI.Stack>
          {showLive ? <UI.TextArea label={`Current ${f.path} (read only)`} value={f.live.text} rows={10} readOnly/> : null}
        </>) : null}
      <UI.Stack direction="inline">
        <UI.Button variant="tertiary" onClick={() => setOpen((v) => !v)}>{open ? (editingPublished ? 'Hide the file' : 'Hide the suggested file') : f.published?.stored ? 'Edit the published file' : 'Write this file'}</UI.Button>
      </UI.Stack>
      {open ? (<>
          <UI.Text color="subdued">
            {editingPublished && draft === null
                ? 'This is the file your site publishes now. Edit it as you like.'
                : `Written from your products, categories, prices and policies${f.proposed.score ? `, covering ${f.proposed.score.score} of ${f.proposed.score.max} things assistants look for` : ''}. Edit it as you like.`}
          </UI.Text>
          <UI.TextArea label={f.path} value={text} rows={14} onInput={(ev) => setDraft(ev.currentTarget.value)}/>
          <UI.Stack direction="inline" gap="small-200">
            {canPublish ? (<UI.Button variant="primary" loading={busy || undefined} disabled={busy || text.trim() === '' || undefined} onClick={() => void publish()}>
                {`Publish ${f.path}`}
              </UI.Button>) : null}
            <UI.Button variant={canPublish ? 'tertiary' : 'primary'} onClick={() => void copy()}>Copy the file</UI.Button>
            {text !== f.proposed.text ? <UI.Button variant="tertiary" onClick={() => setDraft(editingPublished ? f.proposed.text : null)}>Start again from the suggestion</UI.Button> : null}
          </UI.Stack>
        </>) : null}
    </UI.Stack>);
}
