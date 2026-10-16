import { useState } from 'react';
import { useT } from './i18n';
import { getLocation } from './local';

const round2 = (n: number) => String(Math.round(n * 100) / 100);

export function ReportForm({ code, onDone }: { code: string; onDone: () => void }) {
  const { t } = useT();
  const [category, setCategory] = useState('suspected_fake');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const wantLoc = fd.get('useLoc') === 'on';
    fd.delete('useLoc');
    fd.set('code', code);
    fd.set('category', category);
    setBusy(true);
    setMsg('');
    try {
      if (wantLoc) {
        const p = await getLocation();
        if (p) { fd.set('lat', round2(p.lat)); fd.set('lng', round2(p.lng)); }
      }
      const res = await fetch('/api/reports', { method: 'POST', body: fd });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) throw new Error('fail');
      setSent(true);
    } catch {
      setMsg(t('reportFail'));
    } finally {
      setBusy(false);
    }
  }

  if (sent) return (<><p role="status">{t('thanks')}</p><button className="btn" onClick={onDone}>{t('done')}</button></>);

  return (
    <form onSubmit={submit} className="app">
      <h2>{t('report')}</h2>
      {msg && <div className="error" role="alert">{msg}</div>}
      <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
        <option value="suspected_fake">{t('catFake')}</option>
        <option value="wrong_product">{t('catWrong')}</option>
        <option value="damaged_seal">{t('catSeal')}</option>
        <option value="overpriced">{t('catPrice')}</option>
        <option value="other">{t('catOther')}</option>
      </select>
      <textarea className="input" name="description" placeholder={t('descPh')} maxLength={2000} />
      <input className="input" name="purchasePlace" placeholder={t('placePh')} maxLength={300} />
      <input className="input" name="contact" placeholder={t('contactPh')} maxLength={200} />
      <label><input type="checkbox" name="useLoc" /> {t('reportLoc')}</label>
      <input type="file" name="evidence" accept="image/jpeg,image/png,image/webp" multiple />
      <button className="btn primary" disabled={busy}>{busy ? t('sending') : t('send')}</button>
      <button type="button" className="btn" onClick={onDone}>{t('cancel')}</button>
    </form>
  );
}