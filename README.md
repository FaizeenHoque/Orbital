# ORBITAL / SPHEREx Sky Explorer

ORBITAL is a public-facing viewer for real NASA SPHEREx Quick Release spectral-image metadata and cutout previews. It is designed around the mission's core time-domain question: what changed when SPHEREx observed the same region again?

The interface opens with a focused NSAC landing page and a dedicated all-sky navigator. The map uses the SPHEREx HiPS pyramid, with band selection, coordinate readouts, observation coverage, and a time scrubber. Departure Mono is bundled locally under the SIL Open Font License.

## Run locally

Requires Node.js 18+ and Python 3.10+.

```bash
npm install
npm run backend:install
npm run server   # Python API on :5000
npm run dev      # Vite app on :5173
```

Open <http://localhost:5173> and choose **OPEN SKY MAP**. The sky map starts in Tangential (TAN) projection, Galactic coordinates, and SPHEREx D6 with grid and coverage overlays off.

Development uses the local Python API at `http://localhost:5000`. Install its pinned dependencies with `npm run backend:install`, start it with `npm run server`, then start the frontend with `npm run dev`. For a deployed frontend, set `VITE_API_URL` to the deployed backend URL at build time.

Open `/sky` directly for the celestial navigator. It uses Aladin Lite with the official CDS SPHEREx HiPS pyramid, local HiPS tile proxying, Galactic coordinate readouts, coverage overlays, and a time scrubber. Startup projection, coordinate frame, band, and layer visibility are fixed to the defaults above; center and zoom are preserved in the URL.

## Deploy to Vercel

The frontend and backend are separate Vercel projects:

- `orbital` builds the Vite frontend from the repository root.
- `orbital-api` uses `backend/` as its root directory and runs the Flask WSGI app from `backend/api/index.py`.
- Set `VITE_API_URL` on the frontend project to the public backend project URL.

```bash
npm install -g vercel
vercel
```

Configure the backend project's environment variables for `SPHEREX_SIA_URL`, `SPHEREX_RELEASES`, `SPHEREX_UPSTREAM_TIMEOUT_MS`, `SPHEREX_QUERY_CACHE_TTL_MS`, `SPHEREX_IMAGE_CACHE_TTL_MS`, `SPHEREX_IMAGE_CACHE_MAX_BYTES`, and `SPHEREX_PREVIEW_SIZE_DEGREES`. The Python dependencies are pinned in `backend/requirements.txt`.

## Architecture

```text
ORBITAL React UI
      │ http://localhost:5000/api/spherex
      ▼
Python/Flask data layer
      │ on-demand SIA2 metadata / cutout requests
      ▼
NASA/IPAC IRSA SPHEREx QR3 + QR2
```

The backend does not require or generate a local catalog. It queries IRSA SIA2 for the requested coordinate, radius, release, spectral band, or visible tile. This avoids downloading the archive and keeps the result current as IRSA publishes weekly Quick Release products.

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

### `GET /api/spherex/sky/tiles/:z/:x/:y`

Returns metadata for an equirectangular celestial tile. Low levels (`z<6`) are local coordinate-overview tiles and do not trigger archive requests. Higher levels query only the requested tile's RA/Dec region and return real SPHEREx observations whose bounded previews can be loaded by the viewer.

### `GET /api/spherex/sky/hips/:band/*`

Proxies the official CDS SPHEREx HiPS assets locally. The HiPS layer is the primary all-sky navigation surface; supported bands are D1–D6 and the proxy serves the HiPS `properties` file plus PNG/FITS hierarchical tiles from `https://alasky.cds.unistra.fr/SPHEREx/Dn/`.

## Sky map integrity

The `/sky` page uses HiPS/WCS-aware Aladin rendering for the all-sky layer, with equatorial coordinates and RA wrapping handled by the astronomy renderer. Observation footprints use the archive-provided polygon when available and otherwise use a visibly derived field-of-view approximation from real SIA metadata; the latter is not presented as a WCS boundary. SPHEREx HiPS tiles provide the whole-sky image at progressive resolutions, while SIA/cutout metadata remains a separate detail layer.

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

The backend was tested against M101 (`210.80227, 54.34895`, `radius=0.1`, `SPHEREx-D2`). IRSA returned 40 real QR2 D2 spectral-image products with the requested coordinate inside a safe margin for a default 0.1° detailed preview, spanning 15 observation dates. A real cutout returned a valid FITS MEF, while the HiPS preview arrives first for fast visual continuity. Explicit cutout requests may use up to 0.5° when a larger science preview is needed.

The available products are archive observations, not a guarantee of a moving object. ORBITAL uses cautious language and does not label positional changes as comets, asteroids, planets, or Planet X without validated downstream analysis.

## Interaction notes

- HiPS tiles load progressively as the map zooms, using the selected survey's declared maximum order as the resolution limit.
- Observation metadata is queried through the local backend after the camera settles.
- Coverage polygons are optional and start hidden. The coordinate grid also starts hidden.
- The band selector can switch between SPHEREx D1 through D6; each new visit starts on D6.

## Team

- **Hasnat** — <https://www.hasnat4763.me/>
- **Fynr1x** — <https://faizeenhoque.dev/>
- **imtua**
- **Mohaimen**
