# ORBITAL / SPHEREx Sky Explorer

ORBITAL is a public-facing viewer for real NASA SPHEREx Quick Release spectral-image metadata and cutout previews. It is designed around the mission's core time-domain question: what changed when SPHEREx observed the same region again?

The interface opens with a focused NSAC landing page explaining the workflow, then enters a single instrument view: one sky frame, one timeline, and minimal controls for compare, blink, bands, metadata, and real-region random discovery. The viewport is locked to the display so changing frames never turns into page navigation or scrolling. Departure Mono is bundled locally under the SIL Open Font License.

## Run locally

Requires Node.js 18+.

```bash
npm install
npm run server   # Express API on :5000
npm run dev      # Vite app on :5173
```

Open <http://localhost:5173>. The default region is M101 (RA 210.80227°, Dec 54.34895°), the coordinate used in IRSA's official SPHEREx cutout tutorial.

Copy `.env.example` to `.env` when changing server settings. In local development, Vite proxies `/api` to `http://localhost:5000`; set `VITE_API_URL` when the frontend and API are deployed separately.

## Deploy to Render

The repository includes `render.yaml`, which creates two Render services:

- `orbital-api`: Node/Express web service running the live IRSA backend.
- `orbital`: static site serving the Vite build.

Create a Render Blueprint from this repository and deploy. The static site receives the API service's public `RENDER_EXTERNAL_URL` automatically as `VITE_API_URL`. The API service uses `/health` as its health check and has all SPHEREx cache/upstream settings defined in the Blueprint.

For a manual deployment, use `npm install && npm run build` with `dist` as the static publish directory for the frontend, and `npm install` / `npm run server` for the API web service. Set `VITE_API_URL` on the static site to the public URL of the API service.

## Architecture

```text
ORBITAL React UI
      │ /api/spherex
      ▼
Express data layer
      │ on-demand SIA2 metadata / cutout requests
      ▼
NASA/IPAC IRSA SPHEREx QR3 + QR2
```

The backend does not require or generate a local catalog. It queries IRSA SIA2 for the requested coordinate, radius, release, and spectral band. This avoids downloading the archive and keeps the result current as IRSA publishes weekly Quick Release products.

## API

### `GET /api/spherex/observations`

Required query parameters:

- `ra`: 0–360 degrees
- `dec`: −90–90 degrees

Optional parameters:

- `radius`: 0–5 degrees, default `0.1`
- `band`: `SPHEREx-D1` through `SPHEREx-D6`, or `all`; default `SPHEREx-D2`

Results are normalized from the real IRSA SIA2 response and sorted by observation MJD. They include coordinates, MJD/ISO observation bounds, wavelength range, spectral resolution, release, archive URL, detector/pixel metadata, quality metadata, AWS provenance when supplied by IRSA, and backend `image_url`/`cutout_url` routes.

### `GET /api/spherex/image/:obsId`

Returns a bounded PNG preview generated from the IMAGE HDU of a real IRSA SPHEREx cutout. The frontend receives these URLs in the observation response. Required query parameters are `product`, `ra`, and `dec`; `size` is optional and constrained to `0.01–0.5` degrees.

The preview is intentionally a visualization product, not a science-grade replacement for FITS. Pixel values are linearly scaled between robust percentile limits and encoded as a display PNG. The original FITS remains available through the raw cutout route.

### `GET /api/spherex/cutout`

Returns the original IRSA SPHEREx cutout MEF as `application/fits`. Query parameters: `product`, `ra`, `dec`, and optional `size`.

### Other routes

- `GET /health` — process health.
- `GET /api/spherex/stats` — live-service and cache configuration status; this is an on-demand service, not a fabricated global catalog count.
- `POST /api/spherex/detect-moving-objects` — deliberately returns `501`; the service does not make unsupported object classifications or homemade orbital claims.
- `GET /api/spherex/search` — deliberately returns `501`; coordinate search is the supported archive query path.

## Caching and resilience

- Metadata queries are cached in memory for 10 minutes by coordinate, radius, band, and configured releases.
- PNG previews are cached in memory for 30 minutes with a 64 MiB maximum and oldest-entry eviction.
- Full FITS files are never stored in the application cache.
- Upstream timeouts, malformed SIA responses, invalid coordinates, unavailable products, and cutout failures return machine-readable errors without stack traces.
- QR3 and QR2 are queried concurrently. If one release is temporarily unavailable, valid results from the other release are retained; if all configured releases fail, the API returns `502`.

## Real data sources and attribution

- IRSA SIA2: <https://irsa.ipac.caltech.edu/SIA>
- SPHEREx mission page: <https://irsa.ipac.caltech.edu/Missions/spherex.html>
- Quick Release documentation: <https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_qr.html>
- Cutout documentation: <https://irsa.ipac.caltech.edu/data/SPHEREx/docs/cutout_tool.html>
- SPHEREx archive data access guide: <https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access>

IRSA QR2 uses DOI `10.26131/IRSA652`; QR3 uses DOI `10.26131/IRSA662`. Include the official acknowledgement in published material:

> This publication makes use of data products from the Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer (SPHEREx), which is a joint project of the Jet Propulsion Laboratory and the California Institute of Technology, and is funded by the National Aeronautics and Space Administration.

## Verified live example

The backend was tested against M101 (`210.80227, 54.34895`, `radius=0.1`, `SPHEREx-D2`). IRSA returned 40 real QR2 D2 spectral-image products with the requested coordinate inside a safe margin for a full 0.5° preview, spanning 15 observation dates. A real cutout returned a valid FITS MEF from IRSA, and the backend converted its IMAGE HDU into a consistent 293×293 PNG preview for the ORBITAL viewer. Repeated requests are served consistently from the bounded preview cache.

The available products are archive observations, not a guarantee of a moving object. ORBITAL uses cautious language and does not label positional changes as comets, asteroids, planets, or Planet X without validated downstream analysis.

## Interaction notes

- The timeline is a single image-to-image slider with no individual marker clutter. It keeps the current frame visible while the next frame loads, then crossfades the cached preview in.
- The selected observation date is shown once in the viewer header; the timeline uses frame position and earliest/latest labels without repeating dates.
- The current observation's immediate neighbors are prefetched into a bounded eight-image browser cache. Unneeded in-flight fetches are aborted as the user moves quickly.
- Compare blends the earliest and latest compatible frames. Blink alternates those real observations at a measured cadence.
- `RANDOM` selects from curated real sky coordinates validated against the live IRSA/SPHEREx D2 service: M101, M31, M51, NGC 6946, Orion, and Vega fields. It does not generate synthetic coordinates or observations.
- The stopwatch indicator is used only while the archive or a new frame is being retrieved; a previously displayed frame remains visible during normal timeline changes.
- The application is viewport-locked with no page scrolling during image retrieval. A visible `RANDOM REGION` action loads one of the validated coordinates above, and the `INFO` drawer has an explicit `× CLOSE` control.
- All primary actions live in a high-contrast control rail. Loading displays a real elapsed `MM:SS` timer inside the stopwatch, not only an animated icon.
- The Info panel opens beside the control rail on larger displays and docks above the controls on mobile.
- Compare and Blink are mutually exclusive. Compare uses a draggable divider directly on the image rather than adding a second slider.

## Team

- **Hasnat** — <https://www.hasnat4763.me/>
- **Fynr1x** — <https://faizeenhoque.dev/>
- **imtua**
- **Mohaimen**
