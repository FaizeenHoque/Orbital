import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import A from 'aladin-lite';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');
const BANDS = ['SPHEREx-D1', 'SPHEREx-D2', 'SPHEREx-D3', 'SPHEREx-D4', 'SPHEREx-D5', 'SPHEREx-D6'];

function initialState() {
  const params = new URLSearchParams(window.location.search);
  const requestedZoom = Number(params.get('zoom'));
  return { ra: Number(params.get('ra')) || 210.80227, dec: Number(params.get('dec')) || 54.34895, zoom: requestedZoom > 0 ? Math.min(requestedZoom, 170) : 60, band: 'SPHEREx-D6' };
}

// Aladin appends the HiPS tile path itself. Keep this base URL slash-free so
// generated requests are /D2/Norder... rather than /D2//Norder....
const hipsUrl = (band) => `${API_URL}/api/spherex/sky/hips/${band.replace('SPHEREx-', '')}`;
const formatRa = (ra) => `${(((Number(ra) % 360) + 360) % 360).toFixed(3)}°`;
const formatDec = (dec) => `${dec >= 0 ? '+' : ''}${Number(dec).toFixed(3)}°`;
function equatorialToGalactic(ra, dec) {
  const radians = Math.PI / 180;
  const alpha = ra * radians; const delta = dec * radians;
  const alphaPole = 192.85948 * radians; const deltaPole = 27.12825 * radians;
  const deltaAlpha = alpha - alphaPole;
  const latitude = Math.asin(Math.sin(delta) * Math.sin(deltaPole) + Math.cos(delta) * Math.cos(deltaPole) * Math.cos(deltaAlpha));
  const longitude = 122.93192 * radians - Math.atan2(Math.cos(delta) * Math.sin(deltaAlpha), Math.sin(delta) * Math.cos(deltaPole) - Math.cos(delta) * Math.sin(deltaPole) * Math.cos(deltaAlpha));
  return { longitude: (longitude / radians + 360) % 360, latitude: latitude / radians };
}
async function hipsResolution(band, signal) {
  const response = await fetch(`${hipsUrl(band)}/properties`, { signal });
  if (!response.ok) throw new Error(`Could not read ${band} HiPS properties (${response.status}).`);
  const properties = Object.fromEntries((await response.text()).split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([\w]+)\s*=\s*(.*?)\s*$/);
    return match ? [[match[1], match[2]]] : [];
  }));
  const order = Number(properties.hips_order);
  const pixelScale = Number(properties.hips_pixel_scale);
  const tileWidth = Number(properties.hips_tile_width);
  const scale = pixelScale > 0 ? pixelScale : Math.sqrt(Math.PI / 3) / (2 ** order * tileWidth) * 180 / Math.PI;
  if (!(order >= 0 && scale > 0)) throw new Error(`${band} HiPS properties do not declare a valid maximum resolution.`);
  return { order, pixelScale: scale };
}
const formatFov = (fov) => fov < 1 / 60 ? `${(fov * 3600).toFixed(1)}″` : `${fov.toFixed(2)}°`;

export default function SkyMapPage({ onBack }) {
  const initial = useMemo(initialState, []);
  const mapRef = useRef(null); const aladinRef = useRef(null); const coverageRef = useRef(null); const metadataTimer = useRef(null);
  const [center, setCenter] = useState({ ra: initial.ra, dec: initial.dec }); const [zoom, setZoom] = useState(initial.zoom); const [band, setBand] = useState(initial.band);
  const [observations, setObservations] = useState([]); const [selectedIndex, setSelectedIndex] = useState(0); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [showGrid, setShowGrid] = useState(false); const [showCoverage, setShowCoverage] = useState(false); const [debug, setDebug] = useState(false); const [tileRequests, setTileRequests] = useState(0); const [tileLatency, setTileLatency] = useState(0); const [aladinReady, setAladinReady] = useState(false); const [surveyResolution, setSurveyResolution] = useState(null); const [mapWidth, setMapWidth] = useState(1);

  const updateViewport = useCallback(() => { const aladin = aladinRef.current; if (!aladin) return; const [ra, dec] = aladin.getRaDec(); const fov = aladin.getFov()[0]; setCenter({ ra, dec }); setZoom(fov); }, []);
  const loadMetadata = useCallback(() => { const started = performance.now(); setLoading(true); setTileRequests((count) => count + 1); const controller = new AbortController(); fetch(`${API_URL}/api/spherex/observations?ra=${center.ra}&dec=${center.dec}&radius=0.1&band=${encodeURIComponent(band)}`, { signal: controller.signal }).then((response) => { if (!response.ok) throw new Error('Local sky metadata request failed.'); return response.json(); }).then((data) => { setObservations(data); setSelectedIndex(0); setTileLatency(Math.round(performance.now() - started)); }).catch((reason) => { if (reason.name !== 'AbortError') setError(reason.message); }).finally(() => setLoading(false)); return () => controller.abort(); }, [band, center]);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    let observer;
    const setSurveyLimit = (aladin, resolution) => {
      if (!mapRef.current) return;
      const width = Math.max(1, mapRef.current.clientWidth);
      setMapWidth(width);
      // At this FOV one screen pixel maps to one finest-resolution survey pixel.
      // This prevents zooming past the data and enlarging the deepest tile.
      aladin.setFoVRange(Math.max(1e-8, resolution.pixelScale * width), 170);
    };
    setError(''); setSurveyResolution(null);
    Promise.all([A.init, hipsResolution(band, controller.signal)]).then(([, resolution]) => {
      if (disposed || !mapRef.current) return;
      setSurveyResolution(resolution);
      if (!aladinRef.current) {
        const target = equatorialToGalactic(initial.ra, initial.dec);
        const aladin = A.aladin(mapRef.current, { survey: A.HiPS(hipsUrl(band), { name: band }), fov: initial.zoom, target: `${target.longitude} ${target.latitude}`, projection: 'TAN', cooFrame: 'galactic', showCooGrid: showGrid, showCooGridControl: false, showZoomControl: false, showFullscreenControl: false, showShareControl: false, showLayersControl: false });
        aladinRef.current = aladin; setAladinReady(true);
        aladin.on('positionChanged', updateViewport); aladin.on('zoomChanged', updateViewport);
        observer = new ResizeObserver(() => setSurveyLimit(aladin, resolution));
        observer.observe(mapRef.current);
      } else {
        const aladin = aladinRef.current;
        aladin.setImageSurvey(A.HiPS(hipsUrl(band), { name: band }));
        setSurveyLimit(aladin, resolution);
        observer = new ResizeObserver(() => setSurveyLimit(aladin, resolution));
        observer.observe(mapRef.current);
      }
    }).catch((reason) => { if (!disposed && reason.name !== 'AbortError') setError(`HiPS viewer failed to initialize: ${reason.message || reason}`); });
    return () => { disposed = true; controller.abort(); observer?.disconnect(); };
  }, [band]);
  useEffect(() => { const timer = window.setTimeout(() => loadMetadata(), 450); return () => window.clearTimeout(timer); }, [band, center, loadMetadata]);
  useEffect(() => { const aladin = aladinRef.current; if (!aladin) return; aladin.setCooGrid({ enabled: showGrid }); }, [showGrid]);
  useEffect(() => { const params = new URLSearchParams({ ra: Number(center.ra).toFixed(5), dec: Number(center.dec).toFixed(5), zoom: Number(zoom).toFixed(2), band: band.replace('SPHEREx-', '') }); window.history.replaceState({}, '', `/sky?${params}`); }, [band, center, zoom]);
  useEffect(() => { const aladin = aladinRef.current; if (!aladin || !aladin.view) return; coverageRef.current?.remove?.(); if (!showCoverage || !observations.length) return; const overlay = A.graphicOverlay({ name: 'spherex-coverage', color: '#d6ff62', lineWidth: 1 }); observations.slice(0, 100).forEach((record) => { const polygon = parsePolygon(record.footprint); if (polygon) overlay.add(A.polygon(polygon, { color: '#d6ff62', opacity: .5, lineWidth: 1, fill: false }), false); }); aladin.addOverlay(overlay); coverageRef.current = overlay; return () => { overlay.remove?.(); }; }, [aladinReady, observations, showCoverage]);

  const selected = observations[selectedIndex];
  function changeBand(nextBand) { setBand(nextBand); }
  function zoomBy(direction) { const aladin = aladinRef.current; if (!aladin) return; direction > 0 ? aladin.increaseZoom() : aladin.decreaseZoom(); }
  const atDataLimit = Boolean(surveyResolution && zoom <= surveyResolution.pixelScale * mapWidth * 1.015);
  const galacticCenter = equatorialToGalactic(center.ra, center.dec);
  return <main className="sky-map-page"><header className="sky-map-header"><button className="map-back" onClick={onBack}>← ORBITAL</button><div className="map-title"><strong>SKY ATLAS</strong><span>SPHEREx HiPS Galactic sky navigator</span></div><div className="map-header-coords">GAL L {formatRa(galacticCenter.longitude)} · B {formatDec(galacticCenter.latitude)}</div></header><div className="sky-map-layout"><section className="sky-map-viewer"><div className="sky-map-frame aladin-frame"><div className="aladin-container" ref={mapRef}/><div className="map-zoom"><button onClick={() => zoomBy(1)} disabled={atDataLimit} aria-label={atDataLimit ? 'Maximum survey resolution reached' : 'Zoom in'}>+</button><span>{formatFov(zoom)}</span><button onClick={() => zoomBy(-1)}>−</button></div>{atDataLimit && <div className="map-resolution-limit" role="status">MAX SURVEY DETAIL · ORDER {surveyResolution.order}</div>}{debug && <div className="map-debug">HIPS LOCAL PROXY<br/>BAND {band.replace('SPHEREx-', '')}<br/>ORDER {surveyResolution?.order ?? '…'}<br/>PIXEL {surveyResolution ? formatFov(surveyResolution.pixelScale) : '…'}<br/>OBS {observations.length}<br/>REQUESTS {tileRequests}<br/>LAST {tileLatency}ms</div>}</div></section><aside className="sky-map-controls"><div className="map-control-heading">LAYERS</div><button className={showGrid ? 'active' : ''} onClick={() => setShowGrid(!showGrid)}>GRID <small>{showGrid ? 'ON' : 'OFF'}</small></button><button className={showCoverage ? 'active' : ''} onClick={() => setShowCoverage(!showCoverage)}>COVERAGE <small>{showCoverage ? 'ON' : 'OFF'}</small></button><button className={debug ? 'active' : ''} onClick={() => setDebug(!debug)}>DEBUG <small>{debug ? 'ON' : 'OFF'}</small></button><div className="map-control-heading">SPHEREx HiPS BAND</div><div className="map-band-grid">{BANDS.map((item) => <button className={band === item ? 'active' : ''} key={item} onClick={() => changeBand(item)}>{item.replace('SPHEREx-', '')}</button>)}</div><div className="map-control-heading">SELECTED FRAME</div><div className="map-selection">{selected ? <><strong>{selected.obs_id}</strong><span>{selected.obs_date ? new Date(selected.obs_date).toLocaleDateString() : 'Date unavailable'}</span><span>{selected.wavelength_min_microns?.toFixed(2)}–{selected.wavelength_max_microns?.toFixed(2)} μm</span></> : <span>Pan the HiPS sky to query observations.</span>}</div></aside></div><section className="sky-map-timeline"><div className="map-timeline-label"><span>OBSERVATIONS / {observations.length || '—'}</span><span>{selected ? `${selectedIndex + 1} OF ${observations.length}` : 'WHOLE SKY'}</span></div><input type="range" min="0" max={Math.max(0, observations.length - 1)} value={selectedIndex} onChange={(event) => setSelectedIndex(Number(event.target.value))} disabled={observations.length < 2} aria-label="Scrub loaded sky observations"/><div className="map-timeline-dates"><span>{observations[0]?.obs_date ? new Date(observations[0].obs_date).toLocaleDateString() : 'FULL SKY'}</span><span>{observations[observations.length - 1]?.obs_date ? new Date(observations[observations.length - 1].obs_date).toLocaleDateString() : 'SPHEREx HiPS'}</span></div></section></main>;
}

function parsePolygon(value) { if (!value?.startsWith('POLYGON')) return null; const values = value.match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g)?.map(Number) || []; const polygon = []; for (let index = 0; index + 1 < values.length; index += 2) polygon.push([values[index], values[index + 1]]); return polygon.length > 2 ? polygon : null; }
