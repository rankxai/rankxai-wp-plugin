import { useState } from 'react';
import { api, toastSuccess } from '../api';
import { act, fieldError, useLoad, type PageError } from '../kit';
import { SkeletonSection } from './Status';
import * as UI from '../ui';
interface PartnerStatus {
    paying: boolean;
    linked: {
        partner: string;
        confirmed: boolean;
        ended: boolean;
    } | null;
    claims: Array<{
        partner: string;
        confirmed: boolean;
    }>;
}
interface Partner {
    status: PartnerStatus;
    isCollaborator: boolean;
    isOwner: boolean;
}
export function AgencyCard({ error, setError }: {
    error: PageError | null;
    setError: (e: PageError | null) => void;
}) {
    const load = useLoad<Partner>('partner');
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [local, setLocal] = useState<Partner | null>(null);
    const data = local ?? load.data;
    if (!data) {
        return load.error
            ? <UI.Section heading="Agency"><UI.Text color="subdued">We could not read your agency link just now.</UI.Text></UI.Section>
            : <SkeletonSection lines={2} label="Reading your agency link"/>;
    }
    const { status, isCollaborator } = data;
    const partner = status.linked?.ended ? null : (status.linked?.partner ?? status.claims[0]?.partner ?? null);
    const confirmed = status.linked ? status.linked.confirmed : (status.claims[0]?.confirmed ?? false);
    async function send(path: string, body: unknown, done: string) {
        const r = await act(() => api<Partner>(path, { method: 'POST', body }), setBusy, setError);
        if (r.ok && r.data) {
            setLocal(r.data);
            setCode('');
            toastSuccess(done);
        }
    }
    return (<UI.Section heading="Agency">
      <UI.Stack gap="small-200">
      {partner ? (<>
          <UI.Paragraph>
            {confirmed
                ? `${partner} set up RankX AI for this store. RankX AI pays them a commission on your plan. It does not change what you pay.`
                : `${partner} says they set up RankX AI for you. RankX AI pays them a commission on your plan. It does not change what you pay.`}
          </UI.Paragraph>
          {isCollaborator ? (confirmed ? null : <UI.Paragraph>Waiting for the store owner to confirm.</UI.Paragraph>) : confirmed ? (<UI.Button disabled={busy} onClick={() => void send('partner/answer', { answer: 'withdraw' }, 'Link removed')}>Remove this link</UI.Button>) : (<UI.Stack direction="inline">
              <UI.Button variant="primary" disabled={busy} onClick={() => void send('partner/answer', { answer: 'confirm' }, 'Confirmed')}>Confirm</UI.Button>
              <UI.Button disabled={busy} onClick={() => void send('partner/answer', { answer: 'not_us' }, 'Thanks, we have noted that')}>Not us</UI.Button>
            </UI.Stack>)}
        </>) : status.paying ? (<UI.Paragraph>No agency is linked to this store.</UI.Paragraph>) : (<>
          <UI.Paragraph>Did an agency set this up? Enter the code they gave you.</UI.Paragraph>
          <UI.Stack direction="inline">
            <UI.TextField label="Agency code" name="agencyCode" value={code} maxLength={8} error={fieldError(error, 'code')} onInput={(e) => setCode(e.currentTarget.value)}/>
            <UI.Button disabled={busy || !code.trim()} onClick={() => void send('partner/code', { code }, 'Code added')}>Add code</UI.Button>
          </UI.Stack>
        </>)}
      </UI.Stack>
    </UI.Section>);
}
