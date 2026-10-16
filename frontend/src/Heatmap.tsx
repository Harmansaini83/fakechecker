import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useT } from './i18n';

type Cell = { lat: number; lng: number; n: number };

export function Heatmap({ onBack }: { onBack: () => void }) {
  const { t } = useT();
  const el = useRef<HTMLDivElement>(null);
  const [cells, setCells] = useState<Cell[] | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    fetch('/api/heatmap')
      .then((r) => r.json())
      .then((b) => { if (!b?.ok) throw new Error('fail'); setCells(b.data.cells as Cell[]); })
      .catch(() => setErr(true));
  }, []);

  useEffect(() => {
    if (!el.current || !cells?.length) return;
    const map = L.map(el.current).setView([21.1458, 79.0882], 5);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 12,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);
    cells.forEach((c) =>
      L.circleMarker([c.lat, c.lng], { radius: Math.min(30, 8 + c.n * 3), color: '#dc2626', fillOpacity: 0.4 })
        .bindTooltip(String(c.n))
        .addTo(map)
    );
    map.fitBounds(L.latLngBounds(cells.map((c) => [c.lat, c.lng] as [number, number])).pad(0.5), { maxZoom: 9 });
    return () => { map.remove(); };
  }, [cells]);

  return (
    <>
      <h2>{t('hotspots')}</h2>
      <p className="sub">{t('mapNote')}</p>
      {err && <div className="error" role="alert">{t('mapFail')}</div>}
      {cells && cells.length === 0 && <p>{t('mapEmpty')}</p>}
      {cells && cells.length > 0 && <div ref={el} className="map" />}
      <button className="btn" onClick={onBack}>{t('back')}</button>
    </>
  );
}