import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const SkyMapPage = lazy(() => import('./SkyMap.jsx'));

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');
const DEFAULT_REGION = { ra: '210.80227', dec: '54.34895', radius: '0.1' };
const BANDS = ['SPHEREx-D1', 'SPHEREx-D2', 'SPHEREx-D3', 'SPHEREx-D4', 'SPHEREx-D5', 'SPHEREx-D6'];
const MICRONS = [0.75, 1.10, 1.63, 2.42, 3.83, 4.42];
// Real sky positions with confirmed public SPHEREx coverage in D2.
const RANDOM_REGIONS = [
  { name: 'M101 / Pinwheel Galaxy', ra: '210.80227', dec: '54.34895', radius: '0.1' },
  { name: 'M31 / Andromeda Galaxy', ra: '10.68470', dec: '41.26870', radius: '0.1' },
  { name: 'M51 / Whirlpool Galaxy', ra: '202.46960', dec: '47.19520', radius: '0.1' },
  { name: 'NGC 6946 / Fireworks Galaxy', ra: '308.71800', dec: '60.15300', radius: '0.1' },
  { name: 'Orion field', ra: '83.63300', dec: '22.01400', radius: '0.1' },
  { name: 'Vega field', ra: '279.23470', dec: '38.78370', radius: '0.1' }
];
const browserImageCache = new Map();
const MAX_BROWSER_IMAGES = 8;

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}/api/spherex${path}`, options);
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'The archive request could not be completed.');
  return response.json();
}

function absoluteUrl(path) { return path?.startsWith('http') ? path : `${API_URL}${path || ''}`; }

function preload(url) {
  if (!url) return Promise.reject(new Error('No preview URL supplied.'));
  const existing = browserImageCache.get(url);
  if (existing) { browserImageCache.delete(url); browserImageCache.set(url, existing); return existing.promise; }
  const controller = new AbortController();
  const entry = { promise: null, controller, objectUrl: null };
  const promise = fetch(url, { signal: controller.signal }).then((response) => {
    if (!response.ok) throw new Error('Preview unavailable');
    return response.blob();
  }).then((blob) => {
    const objectUrl = URL.createObjectURL(blob);
    const currentEntry = browserImageCache.get(url);
    if (currentEntry === entry) entry.objectUrl = objectUrl;
    return objectUrl;
  }).catch((error) => { if (browserImageCache.get(url) === entry) browserImageCache.delete(url); throw error; });
  entry.promise = promise;
  browserImageCache.set(url, entry);
  return promise;
}

function cachedImage(url) { return browserImageCache.get(url)?.objectUrl || ''; }

function trimImageCache(keep = []) {
  while (browserImageCache.size > MAX_BROWSER_IMAGES) {
    const first = [...browserImageCache.keys()].find((url) => !keep.includes(url));
    if (!first) break;
    const entry = browserImageCache.get(first);
    entry?.controller?.abort();
    if (entry?.objectUrl) URL.revokeObjectURL(entry.objectUrl);
    browserImageCache.delete(first);
  }
}

function App() {
  const [screen, setScreen] = useState(() => window.location.pathname === '/sky' ? 'sky' : 'landing');
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [draft, setDraft] = useState(DEFAULT_REGION);
  const [band, setBand] = useState('SPHEREx-D2');
  const [observations, setObservations] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [displayIndex, setDisplayIndex] = useState(-1);
  const [loading, setLoading] = useState(true);
  const [frameLoading, setFrameLoading] = useState(true);
  const [, setQueryError] = useState('');
  const [imageError, setImageError] = useState(false);
  const [compare, setCompare] = useState(false);
  const [blink, setBlink] = useState(false);
  const [blinkFrame, setBlinkFrame] = useState(0);
  const [blend, setBlend] = useState(50);
  const [showBands, setShowBands] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const controller = useRef(null);
  const firstFramePreview = useRef(true);

  async function explore(next = draft, requestedBand = band) {
    controller.current?.abort();
    setScreen('explorer');
    const ra = Number(next.ra); const dec = Number(next.dec); const radius = Number(next.radius) || 0.1;
    if (!Number.isFinite(ra) || ra < 0 || ra > 360 || !Number.isFinite(dec) || dec < -90 || dec > 90) {
      setQueryError('Use an RA from 0–360° and a Dec from −90° to +90°.'); return;
    }
    const abortController = new AbortController(); controller.current = abortController;
    setRegion({ ra: ra.toFixed(5), dec: dec.toFixed(5), radius: String(radius) });
    setBand(requestedBand); setLoading(true); setFrameLoading(true); setQueryError(''); setImageError(false); setObservations([]); setCurrentIndex(0); setDisplayIndex(-1); setCompare(false); setBlink(false); firstFramePreview.current = true;
    try {
      const data = await request(`/observations?ra=${ra}&dec=${dec}&radius=${radius}&band=${encodeURIComponent(requestedBand)}`, { signal: abortController.signal });
      if (controller.current !== abortController) return;
      setObservations(data); setCurrentIndex(0);
      if (!data.length) setQueryError('No SPHEREx image footprint covers this position in the selected band.');
    } catch (error) {
      if (error.name !== 'AbortError' && controller.current === abortController) setQueryError(error.message);
    } finally { if (controller.current === abortController) setLoading(false); }
  }

  useEffect(() => { const syncRoute = () => setScreen(window.location.pathname === '/sky' ? 'sky' : 'landing'); window.addEventListener('popstate', syncRoute); return () => { window.removeEventListener('popstate', syncRoute); controller.current?.abort(); }; }, []);

  const current = observations[currentIndex];
  const comparison = useMemo(() => observations.length > 1 ? { earlier: observations[0], later: observations[observations.length - 1] } : null, [observations]);
  const visibleObservation = blink ? (blinkFrame ? comparison?.later : comparison?.earlier) : current;
  const visibleSourceUrl = absoluteUrl(visibleObservation?.image_url);
  const visiblePreviewUrl = absoluteUrl(visibleObservation?.hips_preview_url);
  const displayObservation = observations[displayIndex];
  const displaySourceUrl = absoluteUrl(displayObservation?.image_url);
  const displayPreviewUrl = absoluteUrl(displayObservation?.hips_preview_url);
  const displayUrl = cachedImage(displaySourceUrl) || cachedImage(displayPreviewUrl);

  useEffect(() => {
    if (!current || (!visibleSourceUrl && !visiblePreviewUrl)) return undefined;
    let cancelled = false;
    setImageError(false);
    setFrameLoading(true);
    const showDetailFrame = () => { if (!cancelled) { firstFramePreview.current = false; setDisplayIndex(blink ? (blinkFrame ? observations.length - 1 : 0) : currentIndex); setFrameLoading(false); } };
    const showFirstPreview = () => { if (!cancelled && firstFramePreview.current) { firstFramePreview.current = false; setDisplayIndex(blink ? (blinkFrame ? observations.length - 1 : 0) : currentIndex); setFrameLoading(false); } };
    const fastRequest = visiblePreviewUrl ? preload(visiblePreviewUrl).then(showFirstPreview) : Promise.reject();
    const detailRequest = visibleSourceUrl ? preload(visibleSourceUrl).then(showDetailFrame) : Promise.reject();
    Promise.allSettled([fastRequest, detailRequest]).then((results) => { if (!cancelled && results.every((result) => result.status === 'rejected')) { setFrameLoading(false); setImageError(true); } });
    const nearby = [observations[currentIndex - 1], observations[currentIndex + 1]];
    nearby.forEach((observation) => { if (observation?.hips_preview_url) preload(absoluteUrl(observation.hips_preview_url)).catch(() => {}); });
    if ((compare || blink) && comparison) [comparison.earlier, comparison.later].forEach((observation) => { if (observation?.hips_preview_url) preload(absoluteUrl(observation.hips_preview_url)).catch(() => {}); });
    const keep = [visibleSourceUrl, visiblePreviewUrl, displaySourceUrl, displayPreviewUrl, ...nearby.filter(Boolean).map((observation) => absoluteUrl(observation.hips_preview_url))];
    trimImageCache(keep);
    return () => { cancelled = true; };
  }, [current, currentIndex, visibleSourceUrl, visiblePreviewUrl, retryKey, compare, blink, blinkFrame, comparison, displaySourceUrl, displayPreviewUrl]);

  useEffect(() => {
    if (!blink || !comparison) return undefined;
    const timer = window.setInterval(() => setBlinkFrame((frame) => frame ? 0 : 1), 1100);
    return () => window.clearInterval(timer);
  }, [blink, comparison]);

  const dateLabel = (observation) => observation?.obs_date ? new Date(observation.obs_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  const canCompare = observations.length > 1;
  function randomRegion() {
    const available = RANDOM_REGIONS.filter((candidate) => candidate.ra !== draft.ra || candidate.dec !== draft.dec);
    const choice = available[Math.floor(Math.random() * available.length)] || RANDOM_REGIONS[0];
    setDraft(choice); explore(choice, band);
  }

  if (screen === 'sky') return <Suspense fallback={<main className="sky-map-page"><div className="map-status">LOADING SKY ATLAS</div></main>}><SkyMapPage onBack={() => { window.history.pushState({}, '', '/'); setScreen('landing'); }} /></Suspense>;
  if (screen === 'landing') return <Landing onExplore={() => explore(DEFAULT_REGION, 'SPHEREx-D2')} onSkyMap={() => { window.history.pushState({}, '', '/sky'); setScreen('sky'); }} />;

  return <main className="instrument">
    <header className="instrument-header">
      <button className="wordmark" onClick={() => { controller.current?.abort(); setScreen('landing'); }} title="Return to the ORBITAL landing page" aria-label="Return to the ORBITAL landing page"><span className="wordmark-star">✦</span><span>ORBITAL</span></button>
      <form className="coordinate-form" onSubmit={(event) => { event.preventDefault(); explore(); }} aria-label="Find a sky region">
        <label>RA <input value={draft.ra} onChange={(event) => setDraft({ ...draft, ra: event.target.value })} inputMode="decimal" aria-label="Right ascension in degrees" /></label>
        <label>DEC <input value={draft.dec} onChange={(event) => setDraft({ ...draft, dec: event.target.value })} inputMode="decimal" aria-label="Declination in degrees" /></label>
        <button type="submit" title="Find this sky region" aria-label="Find this sky region">↗</button>
      </form>
    </header>

    <section className="sky-stage" aria-label="SPHEREx sky viewer">
      <div className="stage-topline"><span>RA {region.ra}° &nbsp; DEC {region.dec}°</span><span className="selected-date">{current ? dateLabel(current) : '—'}</span></div>
      <div className={`sky-frame ${displayUrl ? 'has-image' : ''}`}>
        {displayUrl && <img className="sky-image sky-image-current" src={displayUrl} alt={`SPHEREx ${band} image near RA ${region.ra}, Dec ${region.dec}`} />}
        {compare && canCompare && <ComparisonOverlay earlier={comparison.earlier} later={comparison.later} blend={blend} onBlendChange={setBlend} />}
        {!displayUrl && <div className="first-load" role="status" aria-live="polite"><Stopwatch/><span>{loading ? 'READING THE ARCHIVE' : 'SEARCHING FOR A FRAME'}</span></div>}
        {frameLoading && displayUrl && <div className="frame-loading" role="status" aria-live="polite"><Stopwatch/><span>LOADING FRAME</span></div>}
        {imageError && displayUrl && <div className="image-status"><span>IMAGE UNAVAILABLE · HOLDING LAST FRAME</span><button onClick={() => { [visibleSourceUrl, visiblePreviewUrl].forEach((url) => { const entry = browserImageCache.get(url); entry?.controller?.abort(); if (entry?.objectUrl) URL.revokeObjectURL(entry.objectUrl); browserImageCache.delete(url); }); setRetryKey((key) => key + 1); }}>RETRY</button></div>}
        {displayUrl && <><div className="reticle" aria-hidden="true"/><div className="frame-corner frame-corner-a"/><div className="frame-corner frame-corner-b"/></>}
        {compare && canCompare && !blink && <div className="compare-labels"><span>EARLIER</span><span>LATER</span></div>}
      </div>
    </section>

    <section className="time-control" aria-label="Observation timeline">
      <div className="timeline-heading"><span>OBSERVATIONS / {observations.length || '—'}</span><span>{current ? `${currentIndex + 1} OF ${observations.length}` : 'WAITING'}</span></div>
      <div className="timeline-wrap"><div className="timeline-track"><div className="timeline-progress" style={{ width: observations.length > 1 ? `${currentIndex / (observations.length - 1) * 100}%` : '0%' }}/></div><input type="range" min="0" max={Math.max(0, observations.length - 1)} value={currentIndex} onChange={(event) => setCurrentIndex(Number(event.target.value))} disabled={observations.length < 2} title="Drag to move through observations" aria-label="Move through SPHEREx observations" /></div>
      <div className="timeline-dates"><span>EARLIEST FRAME</span><span>LATEST FRAME</span></div>
    </section>

    <aside className="control-sidebar" aria-label="Viewer controls"><div className="sidebar-label">CONTROLS</div><button className="random-button" onClick={randomRegion} title="Load a random real SPHEREx sky region" aria-label="Show a random real SPHEREx sky region"><span>⤨</span> RANDOM REGION</button><button className={compare ? 'selected' : ''} onClick={() => { if (canCompare) { setCompare(!compare); setBlink(false); } }} title="Blend the earliest and latest compatible observations" disabled={!canCompare}><span>◫</span> COMPARE</button><button className={blink ? 'selected' : ''} onClick={() => { if (canCompare) { setBlink(!blink); setCompare(false); } }} title="Alternate between the earliest and latest observations" disabled={!canCompare}><span>◌</span> BLINK</button><div className="tool-popover-wrap"><button className={showBands ? 'selected' : ''} onClick={() => setShowBands(!showBands)} title="Choose a SPHEREx spectral band"><span>◒</span> BANDS</button>{showBands && <div className="bands-popover">{BANDS.map((item, index) => <button key={item} aria-pressed={band === item} title={`Load ${item} observations`} className={band === item ? 'selected' : ''} onClick={() => { setShowBands(false); explore(region, item); }}>{item.replace('SPHEREx-', '')}<small>{MICRONS[index].toFixed(2)} μm</small></button>)}</div>}</div><button className={showInfo ? 'selected' : ''} onClick={() => setShowInfo(!showInfo)} title="Show observation metadata"><span>ⓘ</span> INFO</button></aside>

    {showInfo && <section className="info-drawer" role="dialog" aria-label="Observation metadata"><div className="info-heading"><span>OBSERVATION METADATA</span><button onClick={() => setShowInfo(false)} title="Close observation metadata" aria-label="Close observation metadata">× CLOSE</button></div><div className="metadata-grid"><Meta label="Right ascension" value={current?.ra ? `${current.ra.toFixed(5)}°` : '—'}/><Meta label="Declination" value={current?.dec ? `${current.dec.toFixed(5)}°` : '—'}/><Meta label="Modified Julian date" value={current?.mjd?.toFixed(6) || '—'}/><Meta label="Release" value={current?.data_release || '—'}/><Meta label="Pixel scale" value={current?.pixel_scale_arcsec ? `${current.pixel_scale_arcsec} arcsec / px` : '—'}/><Meta label="Provenance" value="NASA / IPAC IRSA SIA2"/></div><p className="data-note">Preview generated from the SPHEREx IMAGE HDU of an IRSA cutout. It is a visualization, not a replacement for the source FITS product.</p></section>}
  </main>;
}

function Landing({ onExplore, onSkyMap }) {
  return <main className="landing-page"><header className="landing-header"><div className="wordmark"><span className="wordmark-star">✦</span><span>ORBITAL</span></div><span className="landing-tag">NASA SPACE APPS CHALLENGE · 2026</span></header><div className="landing-content"><section className="landing-hero"><p className="landing-kicker">SPHEREx / TEMPORAL SKY INSTRUMENT</p><h1>See the sky<br/><em>change.</em></h1><p className="landing-lede">SPHEREx maps the entire sky in 102 infrared colors, then returns to see it again. ORBITAL makes those real observations simple to explore, frame by frame.</p><div className="landing-actions"><button className="landing-cta" onClick={onExplore}>ENTER THE SKY <span>↗</span></button><button className="landing-map-link" onClick={onSkyMap}>OPEN SKY MAP <span>↗</span></button></div></section><section className="landing-explain"><div className="landing-block"><span>01</span><div><strong>FIND A REGION</strong><p>Enter coordinates or choose a real SPHEREx field from the random region control.</p></div></div><div className="landing-block"><span>02</span><div><strong>MOVE THROUGH TIME</strong><p>Drag one continuous timeline through genuine observations from different dates.</p></div></div><div className="landing-block"><span>03</span><div><strong>NOTICE CHANGE</strong><p>Blend or blink compatible frames to inspect temporal differences without unsupported classifications.</p></div></div></section></div><footer className="landing-footer"><div><span className="landing-footer-label">MADE FOR</span><strong>NSAC / NASA SPACE APPS CHALLENGE</strong><small>Planet X and SPHEREx</small></div><div><span className="landing-footer-label">MADE BY</span><div className="team-links"><a href="https://www.hasnat4763.me/" target="_blank" rel="noreferrer">Hasnat ↗</a><a href="https://faizeenhoque.dev/" target="_blank" rel="noreferrer">Fynr1x ↗</a><span>imtua</span><span>Mohaimen</span></div></div></footer></main>;
}

function Stopwatch() {
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setElapsed(Date.now() - started.current), 100); return () => window.clearInterval(timer); }, []);
  const seconds = Math.floor(elapsed / 1000); const minutes = Math.floor(seconds / 60); const displaySeconds = String(seconds % 60).padStart(2, '0');
  return <span className="stopwatch" role="timer" aria-label={`Loading time ${minutes}:${displaySeconds}`}><span className="stopwatch-hand"/><span className="stopwatch-time">{minutes}:{displaySeconds}</span></span>;
}

function ComparisonOverlay({ earlier, later, blend, onBlendChange }) {
  const earlierUrl = absoluteUrl(earlier?.image_url); const laterUrl = absoluteUrl(later?.image_url); const earlierPreviewUrl = absoluteUrl(earlier?.hips_preview_url); const laterPreviewUrl = absoluteUrl(later?.hips_preview_url);
  const dragging = useRef(false);
  function updateBlend(event) { const rect = event.currentTarget.getBoundingClientRect(); onBlendChange(Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100))); }
  return <div className="comparison-overlay" aria-label="Earlier and later observation blend" onPointerDown={(event) => { dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); updateBlend(event); }} onPointerMove={(event) => { if (dragging.current) updateBlend(event); }} onPointerUp={() => { dragging.current = false; }} onPointerCancel={() => { dragging.current = false; }}><img src={cachedImage(laterUrl) || cachedImage(laterPreviewUrl) || laterPreviewUrl || laterUrl} alt="Later SPHEREx observation"/><img src={cachedImage(earlierUrl) || cachedImage(earlierPreviewUrl) || earlierPreviewUrl || earlierUrl} style={{ opacity: blend / 100 }} alt="Earlier SPHEREx observation"/><div className="blend-line" style={{ left: `${blend}%` }}/></div>;
}

function Meta({ label, value }) { return <div><span>{label}</span><strong>{value}</strong></div>; }

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
