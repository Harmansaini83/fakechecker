import { useEffect, useState } from 'react';
import { verify, ApiError, type ScanMode, type VerifyData } from './api';
import { Scanner } from './Scanner';
import { ResultCard } from './ResultCard';
import { ReportForm } from './ReportForm';
import { Heatmap } from './Heatmap';
import { Privacy } from './Privacy';
import { LANGS, setLang, useT, type Lang } from './i18n';
import { verdictKey } from './verdictInfo';
import {
  enqueue,
  getQueue,
  flushQueue,
  getLocation,
  loadLocPref,
  saveLocPref,
  type Processed,
} from './local';

type View =
  | 'home'
  | 'scanning'
  | 'loading'
  | 'result'
  | 'report'
  | 'privacy'
  | 'map'
  | 'saved';

export default function App() {
  const { lang, t } = useT();

  const [view, setView] = useState<View>('home');
  const [manual, setManual] = useState('');
  const [mode, setMode] = useState<ScanMode>('farmer');
  const [shareLoc, setShareLoc] = useState(loadLocPref);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<VerifyData | null>(null);
  const [lastCode, setLastCode] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [queued, setQueued] = useState(getQueue().length);
  const [saved, setSaved] = useState<Processed[]>([]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);

    window.addEventListener('online', on);
    window.addEventListener('offline', off);

    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  async function check(code: string) {
    const trimmed = code.trim();

    if (!trimmed) {
      setError(t('needCode'));
      return;
    }

    setLastCode(trimmed);
    setError('');
    setNotice('');
    setView('loading');

    try {
      const location = shareLoc ? await getLocation() : undefined;

      const data = await verify(trimmed, mode, location);

      setResult(data);
      setView('result');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'NETWORK') {
        setQueued(enqueue(trimmed, mode));
        setNotice(t('savedOffline'));
      } else {
        setError(
          e instanceof ApiError && e.code === 'RATE_LIMITED'
            ? t('rateLimited')
            : t('genericErr')
        );
      }

      setView('home');
    }
  }

  async function checkSaved() {
    setView('loading');

    const done = await flushQueue();

    setQueued(getQueue().length);

    if (!done.length) {
      setNotice(t('savedOffline'));
      setView('home');
      return;
    }

    setSaved(done);
    setView('saved');
  }

  function reset() {
    setResult(null);
    setManual('');
    setError('');
    setNotice('');
    setView('home');
  }

  return (
    <main className="app">
      <header>
        <select
          className="lang"
          aria-label={t('language')}
          value={lang}
          onChange={(e) => setLang(e.target.value as Lang)}
        >
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>

        <h1>FakeChecker</h1>
        <p className="sub">{t('subtitle')}</p>
      </header>

      {!online && (
        <div className="notice">{t('offlineBanner')}</div>
      )}

      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      {view === 'home' && (
        <>
          {queued > 0 && (
            <div className="notice">
              {t('pending')}: {queued}{' '}
              <button
                className="btn"
                disabled={!online}
                onClick={checkSaved}
              >
                {t('checkSaved')}
              </button>
            </div>
          )}

          <button
            className="btn primary big"
            onClick={() => {
              setError('');
              setNotice('');
              setView('scanning');
            }}
          >
            {t('scan')}
          </button>

          <div className="or">{t('orType')}</div>

          <input
            className="input"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder={t('enterCode')}
            maxLength={500}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />

          <button className="btn" onClick={() => check(manual)}>
            {t('check')}
          </button>

          <fieldset className="opts">
            <legend>{t('options')}</legend>

            <label>
              <input
                type="radio"
                checked={mode === 'farmer'}
                onChange={() => setMode('farmer')}
              />{' '}
              {t('farmer')}
            </label>

            <label>
              <input
                type="radio"
                checked={mode === 'retailer'}
                onChange={() => setMode('retailer')}
              />{' '}
              {t('retailer')}
            </label>

            <label>
              <input
                type="checkbox"
                checked={shareLoc}
                onChange={(e) => {
                  setShareLoc(e.target.checked);
                  saveLocPref(e.target.checked);
                }}
              />{' '}
              {t('shareLoc')}
            </label>
          </fieldset>

          <div className="linkrow">
            <button className="btn" onClick={() => setView('map')}>
              {t('hotspots')}
            </button>

            <button
              className="btn"
              onClick={() => setView('privacy')}
            >
              {t('privacy')}
            </button>
          </div>
        </>
      )}

      {view === 'scanning' && (
        <>
          <Scanner
            onCode={(code) => check(code)}
            onError={(kind) => {
              setError(
                t(kind === 'denied' ? 'camDenied' : 'camFailed')
              );
              setView('home');
            }}
          />

          <p className="sub">{t('pointCamera')}</p>

          <button className="btn" onClick={() => setView('home')}>
            {t('cancel')}
          </button>
        </>
      )}

      {view === 'loading' && (
        <p className="loading" aria-live="polite">
          {t('checking')}
        </p>
      )}

      {view === 'result' && result && (
        <ResultCard
          data={result}
          onAgain={reset}
          onReport={() => setView('report')}
        />
      )}

      {view === 'report' && (
        <ReportForm code={lastCode} onDone={reset} />
      )}

      {view === 'privacy' && (
        <Privacy
          onBack={reset}
          onCleared={() => {
            setQueued(0);
            setShareLoc(false);
          }}
        />
      )}

      {view === 'map' && <Heatmap onBack={reset} />}

      {view === 'saved' && (
        <>
          <h2>{t('savedResults')}</h2>

          <ul className="saved">
            {saved.map((s, i) => (
              <li key={i}>
                <code>
                  {s.code.slice(0, 24)}
                  {s.code.length > 24 ? '…' : ''}
                </code>
                :{' '}
                <strong>
                  {s.data
                    ? t(verdictKey(s.data.verdict, 'title'))
                    : t('genericErr')}
                </strong>
              </li>
            ))}
          </ul>

          <p className="disclaimer">{t('disclaimer')}</p>

          <button className="btn primary" onClick={reset}>
            {t('back')}
          </button>
        </>
      )}
    </main>
  );
}