import type { VerifyData } from './api';
import { DISCLAIMER, VERDICT_INFO, reasonText } from './verdictInfo';

export function ResultCard({ data, onAgain }: { data: VerifyData; onAgain: () => void }) {
  const info = VERDICT_INFO[data.verdict] ?? VERDICT_INFO.unverified;
  const reasons = (data.reasons ?? []).map(reasonText).filter(Boolean);

  return (
    <section className={`card tone-${info.tone}`} aria-live="polite">
      <h2>{info.title}</h2>
      <p>{info.summary}</p>

      {data.product?.name && (
        <p className="product">
          <strong>Product:</strong> {data.product.name}
        </p>
      )}

      {reasons.length > 0 && (
        <>
          <h3>Why</h3>
          <ul>{reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </>
      )}

      <h3>What to do next</h3>
      <p>{data.nextStep || info.nextStep}</p>

      <p className="disclaimer">{DISCLAIMER}</p>
      <button className="btn primary" onClick={onAgain}>Check another packet</button>
    </section>
  );
}