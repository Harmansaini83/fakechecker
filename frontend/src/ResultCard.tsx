import type { VerifyData, Verdict } from './api';
import { useT } from './i18n';
import { VERDICT_TONE, verdictKey, reasonText } from './verdictInfo';

type Props = { data: VerifyData; onAgain: () => void; onReport: () => void };

export function ResultCard({ data, onAgain, onReport }: Props) {
  const { t } = useT();
  const verdict: Verdict = data.verdict in VERDICT_TONE ? data.verdict : 'unverified';
  const reasons = (data.reasons ?? []).map(reasonText).filter(Boolean);

  return (
    <section className={`card tone-${VERDICT_TONE[verdict]}`} aria-live="polite">
      <h2>{t(verdictKey(verdict, 'title'))}</h2>
      <p>{t(verdictKey(verdict, 'summary'))}</p>

      {data.product?.name && (
        <p><strong>{t('product')}:</strong> {data.product.name}</p>
      )}

      {reasons.length > 0 && (
        <>
          <h3>{t('why')}</h3>
          <ul>{reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </>
      )}

      <h3>{t('next')}</h3>
      <p>{t(verdictKey(verdict, 'next'))}</p>

      <p className="disclaimer">{t('disclaimer')}</p>
      <button className="btn" onClick={onReport}>{t('report')}</button>
      <button className="btn primary" onClick={onAgain}>{t('again')}</button>
    </section>
  );
}