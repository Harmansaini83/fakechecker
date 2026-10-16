import { useState } from 'react';
import { useT } from './i18n';
import { clearLocal } from './local';

export function Privacy({ onBack, onCleared }: { onBack: () => void; onCleared: () => void }) {
  const { t } = useT();
  const [done, setDone] = useState(false);
  return (
    <>
      <h2>{t('privacy')}</h2>
      <p>{t('p1')}</p>
      <p>{t('p2')}</p>
      <p>{t('p3')}</p>
      <button className="btn" onClick={() => { clearLocal(); onCleared(); setDone(true); }}>{t('clearData')}</button>
      {done && <p role="status">{t('cleared')}</p>}
      <button className="btn primary" onClick={onBack}>{t('back')}</button>
    </>
  );
}