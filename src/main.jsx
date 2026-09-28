import React, { Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const SkyMapPage = lazy(() => import('./SkyMap.jsx'));

function App() {
  const [screen, setScreen] = useState(() => window.location.pathname === '/sky' ? 'sky' : 'landing');

  useEffect(() => {
    const syncRoute = () => setScreen(window.location.pathname === '/sky' ? 'sky' : 'landing');
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, []);

  if (screen === 'sky') {
    return <Suspense fallback={<main className="sky-map-page"><div className="map-status">LOADING SKY ATLAS</div></main>}>
      <SkyMapPage onBack={() => { window.history.pushState({}, '', '/'); setScreen('landing'); }} />
    </Suspense>;
  }

  return <Landing onSkyMap={() => { window.history.pushState({}, '', '/sky'); setScreen('sky'); }} />;
}

function Landing({ onSkyMap }) {
  return <main className="landing-page">
    <header className="landing-header">
      <div className="wordmark"><span className="wordmark-star">✦</span><span>ORBITAL</span></div>
      <span className="landing-tag">NASA SPACE APPS CHALLENGE · 2026</span>
    </header>
    <div className="landing-content">
      <section className="landing-hero">
        <p className="landing-kicker">SPHEREx / TEMPORAL SKY INSTRUMENT</p>
        <h1>See the sky<br/><em>change.</em></h1>
        <p className="landing-lede">SPHEREx maps the entire sky in 102 infrared colors, then returns to see it again. ORBITAL makes those real observations simple to explore, frame by frame.</p>
        <div className="landing-actions">
          <button className="landing-cta" onClick={onSkyMap}>OPEN SKY MAP <span>↗</span></button>
        </div>
      </section>
      <section className="landing-explain">
        <div className="landing-block"><span>01</span><div><strong>FIND A REGION</strong><p>Explore the sky and select a SPHEREx spectral band.</p></div></div>
        <div className="landing-block"><span>02</span><div><strong>MOVE THROUGH TIME</strong><p>Inspect genuine SPHEREx observations across the sky.</p></div></div>
        <div className="landing-block"><span>03</span><div><strong>NOTICE CHANGE</strong><p>Compare the sky across infrared wavelengths.</p></div></div>
      </section>
    </div>
    <footer className="landing-footer">
      <div><span className="landing-footer-label">MADE FOR</span><strong>NSAC / NASA SPACE APPS CHALLENGE</strong><small>Planet X and SPHEREx</small></div>
      <div><span className="landing-footer-label">MADE BY</span><div className="team-links"><a href="https://www.hasnat4763.me/" target="_blank" rel="noreferrer">Hasnat ↗</a><a href="https://faizeenhoque.dev/" target="_blank" rel="noreferrer">Fynr1x ↗</a><span>imtua</span><span>Mohaimen</span></div></div>
    </footer>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
