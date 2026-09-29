# ORBITAL — 240-second Space Apps pitch

**Project:** ORBITAL / SPHEREx Sky Explorer  
**Challenge:** Planet X and SPHEREx  
**Length:** 4 minutes. Bracketed notes are stage directions; do not read them aloud.

## 0:00–0:45 — Who we are and the opportunity

[Show the ORBITAL landing page.]

Hello, we’re Team Larpers: Hasnat, Fynr1x, imtua, and Mohaimen. We built ORBITAL, a sky explorer for people who want to investigate real SPHEREx observations without starting in a specialist archive interface.

SPHEREx surveys the whole sky in infrared light. Looking at the same region in different wavelength bands and at different observation times can reveal details that are easy to miss in a single image. But the data is valuable only if people can find a region, understand what they’re seeing, and follow up on interesting observations.

## 0:45–1:30 — Why this matters

The challenge asks how the public can help explore SPHEREx data and look for objects that move or change. Our opportunity is to make the first step approachable: let someone navigate the sky, choose a spectral band, and inspect the observation records for the place they’re looking at.

ORBITAL is an exploration tool, not an automatic discovery claim. It doesn’t label a source as a planet, asteroid, or comet. Instead, it gives users a clearer path from “something caught my eye” to real archive observations they can examine further.

## 1:30–2:20 — What we built

[Click **OPEN SKY MAP**.]

This is the Sky Atlas. The all-sky image comes from the official SPHEREx HiPS survey, and we can switch between its six displayed bands. We can pan and zoom, read the Galactic coordinates at the map center, and turn on a coordinate grid or observation coverage outlines.

When we settle on a region, ORBITAL requests matching observation metadata from NASA’s IRSA archive. The list is ordered by observation time. We can move through those records here and inspect the selected observation’s date and wavelength range. The map gives us the sky-wide context; the selected record connects that view to a real archive product.

## 2:20–3:15 — Demo and how it works

[Choose a band, pan to a region, enable coverage if useful, then move the observation slider.]

I’ll switch bands, move to a region, and browse its available observations. Each record includes its date and spectral range, with links behind the scenes to a bounded image preview and the original FITS cutout. That lets someone move from a broad view toward the underlying data.

The frontend is built with React and Aladin Lite. A small Python and Flask API queries IRSA’s SIA service when a region is requested, normalizes the returned metadata, and fetches previews on demand. The all-sky HiPS imagery is served through a local proxy. We cache metadata and previews to reduce repeat requests, while keeping the original FITS available from the archive route.

## 3:15–4:00 — Impact and next step

Our goal is to lower the barrier to taking part in sky exploration. A student, a curious observer, or an astronomer can start with a place in the sky and see which real SPHEREx observations are available there. Making those observations easier to reach can help more people ask useful questions and identify candidates for careful follow-up.

The next step is to add validated comparison and candidate-review workflows, with clear uncertainty and scientific checks before any object is classified. ORBITAL gives people a way into the data; the evidence must determine what the data means.

Explore the sky with ORBITAL. The next interesting change may be waiting in an observation most of us haven’t looked at yet. Thank you.

## Presenter notes

- Keep the Sky Atlas already loaded before the pitch; avoid spending demo time waiting on network requests.
- If the live archive is slow, use the landing page and explain the intended browse flow rather than claiming a result that is not visible.
- Do not claim that ORBITAL detects moving objects, classifies candidates, or compares image frames automatically; those features are not implemented in the current project.
- The interface exposes six SPHEREx bands (D1–D6); the landing page describes SPHEREx’s 102 infrared colors.
