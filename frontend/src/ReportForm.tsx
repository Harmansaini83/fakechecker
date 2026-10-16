import { useState } from 'react';

export function ReportForm({ code, onDone }: { code: string; onDone: () => void }) {
  const [category, setCategory] = useState('suspected_fake');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set('code', code);
    fd.set('category', category);
    setBusy(true);
    setMsg('');
    try {
      // No Content-Type header: the browser sets the multipart boundary.
      const res = await fetch('/api/reports', { method: 'POST', body: fd });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) throw new Error(body?.error?.message ?? 'Could not send the report.');
      setSent(true);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not send the report.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) return (<><p>Thank you. Your report was sent for review.</p><button className="btn" onClick={onDone}>Done</button></>);

  return (
    <form onSubmit={submit} className="app">
      <h2>Report this packet</h2>
      {msg && <div className="error" role="alert">{msg}</div>}
      <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
        <option value="suspected_fake">Looks fake</option>
        <option value="wrong_product">Wrong product inside</option>
        <option value="damaged_seal">Seal broken or tampered</option>
        <option value="overpriced">Sold at unusual price</option>
        <option value="other">Other</option>
      </select>
      <textarea className="input" name="description" placeholder="What did you notice?" maxLength={2000} />
      <input className="input" name="purchasePlace" placeholder="Where did you buy it? (optional)" maxLength={300} />
      <input className="input" name="contact" placeholder="Phone or email (optional)" maxLength={200} />
      <input type="file" name="evidence" accept="image/jpeg,image/png,image/webp" multiple />
      <button className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Send report'}</button>
      <button type="button" className="btn" onClick={onDone}>Cancel</button>
    </form>
  );
}