import { useState } from 'react';
import { verify, ApiError, type ScanMode, type LatLng, type VerifyData } from './api';
import { Scanner } from './Scanner';
import { ResultCard } from './ResultCard';

type View = 'home' | 'scanning' | 'loading' | 'result';

function getLocation(): Promise<LatLng | undefined> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(undefined);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(undefined),
      { timeout: 5000, maximumAge: 60000 }
    );
  });
}

export default function App() {
  const [view, setView] = useState<View>('home');
  const [manual, setManual] = useState('');
  const [mode, setMode] = useState<ScanMode>('farmer');
  const [shareLoc, setShareLoc] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<VerifyData | null>(null);

  async function check(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return setError('Please enter the code.');
    setError('');
    setView('loading');
    try {
      const location = shareLoc ? await getLocation() : undefined;
      setResult(await verify(trimmed, mode, location));
      setView('result');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
      setView('home');
    }
  }

  function reset() {
    setResult(null);
    setManual('');
    setError('');
    setView('home');
  }

  return (
    <main className="app">
      <header>
        <h1>FakeChecker</h1>
        <p className="sub">Check seeds, pesticides and fertilizers</p>
      </header>

      {error && <div className="error" role="alert">{error}</div>}

      {view === 'home' && (
        <>
          <button className="btn primary big" onClick={() => { setError(''); setView('scanning'); }}>
            Scan QR code
          </button>

          <div className="or">or type the code printed on the packet</div>
          <input
            className="input"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Enter code"
            maxLength={500}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <button className="btn" onClick={() => check(manual)}>Check code</button>

          <fieldset className="opts">
            <legend>Options</legend>
            <label>
              <input type="radio" checked={mode === 'farmer'} onChange={() => setMode('farmer')} /> I am a farmer
            </label>
            <label>
              <input type="radio" checked={mode === 'retailer'} onChange={() => setMode('retailer')} /> I am a retailer
            </label>
            <label>
              <input type="checkbox" checked={shareLoc} onChange={(e) => setShareLoc(e.target.checked)} /> Share my
              location to improve fake detection (optional)
            </label>
          </fieldset>
        </>
      )}

      {view === 'scanning' && (
        <>
          <Scanner
            onCode={(c) => check(c)}
            onError={(m) => { setError(m); setView('home'); }}
          />
          <p className="sub">Point the camera at the QR code.</p>
          <button className="btn" onClick={() => setView('home')}>Cancel</button>
        </>
      )}

      {view === 'loading' && <p className="loading" aria-live="polite">Checking…</p>}

      {view === 'result' && result && <ResultCard data={result} onAgain={reset} />}
    </main>
  );
}