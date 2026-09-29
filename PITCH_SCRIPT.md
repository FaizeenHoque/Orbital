# ORBITAL — 240-second Space Apps pitch

**Project:** ORBITAL / SPHEREx Sky Explorer  
**Challenge:** Planet X and SPHEREx  
**Length:** 4 minutes. This is a video voiceover script. Bracketed notes describe what to show on screen; do not read them aloud.

## 0:00–0:20 — Start in SkyMap

[Start the recording on the app's landing page. Click **OPEN SKY MAP**. Hold on the map while it loads, then begin the voiceover.]

Hello, we’re Team Larpers: Hasnat, Fynr1x, imtua, and Mohaimen. We built ORBITAL, a sky explorer that helps people navigate SPHEREx survey imagery and reach the real archive observations behind it. I’ll show you how to use it, starting from the sky map.

## 0:20–0:50 — Find your way around

This is the all-sky view. Drag to move around the sky and use the plus and minus controls to zoom. The value here shows the field of view, so you can tell how much sky you’re looking at. The image comes from the official SPHEREx HiPS survey.

## 0:50–1:25 — Choose what to inspect

[Move the cursor to **CONTROLS** and open the panel. Pause briefly on the map settings and layer switches, then move to the band buttons.]

Open **CONTROLS** to adjust the map view. The layer switches let you add a coordinate grid or show observation coverage. The band buttons switch between the six SPHEREx bands available here, D1 through D6. I’ll select another band to see that same part of the sky in a different wavelength range.

SPHEREx surveys the whole sky in infrared light. Its observations cover different wavelengths and times, which can help researchers investigate objects and changes in the sky. ORBITAL makes it easier to find a region, orient yourself, and see what was observed there.

## 1:25–2:00 — Navigate to the Whirlpool Galaxy

[In **MAP VIEW**, set the coordinate frame to ICRS and enter RA 13:29:52.70, Dec +47:11:43.0. Let the map center on the Whirlpool Galaxy (M51), then zoom in. In the video edit, place a clearly labeled comparison image beside the map; keep it visually distinct from the live SkyMap.]

Now let’s visit a specific object: the Whirlpool Galaxy, also known as M51. I’ll use its ICRS coordinates—right ascension 13 hours, 29 minutes, 52.70 seconds, and declination plus 47 degrees, 11 minutes, 43 seconds—to move the map to that region and zoom in. I’ve added a comparison image beside the live map in the video, so you can compare the galaxy with the surrounding survey view.

## 2:00–2:25 — Inspect an archive observation

[Pan the map a little and pause for the selected-frame details to update. Show the observation ID, date, and wavelength range. Optionally turn on coverage, then turn it off before continuing.]

As the map position or band changes, ORBITAL requests observation metadata for the current view. **SELECTED FRAME** shows the archive observation ID, date, and wavelength range. This connects what you see on the map to a real observation record. The coverage layer can help show where observations fall on the sky.

## 2:25–3:20 — How it works and why it matters

The Planet X and SPHEREx challenge invites people to explore survey data and help look for objects that may move or change. That work starts with access to the sky and trustworthy observations. ORBITAL brings the all-sky view, navigation, band choices, and archive metadata together. It helps users reach data for investigation; it does not claim to detect or classify a planet, asteroid, or comet.

The frontend uses React and Aladin Lite. A Python and Flask API queries NASA/IPAC IRSA’s SIA service for the current sky position and band, then normalizes the archive response for the interface. The official HiPS survey is served through a local proxy. Metadata and image previews use in-memory caching on the backend; original FITS cutouts remain available through the archive route for follow-up.

## 3:20–4:00 — Impact and next step

Our goal is to lower the barrier to exploring real mission data. Students, curious observers, and astronomers can navigate the sky, see which SPHEREx observations are available in a region, and use their metadata to guide further investigation.

The next step is to build validated tools for comparing observations across time and reviewing candidate objects, with clear uncertainty and scientific checks. Today, ORBITAL helps people find and inspect the data; any claim about what an object is must come from evidence and careful analysis.

Explore the sky with ORBITAL. A discovery begins with a good question and the right observation. Thank you.

## Video recording notes

- Record the app from its landing page so viewers see the entry point, then click **OPEN SKY MAP** and let the map finish loading before continuing. Keep the backend and network connection available for live metadata requests.
- Capture the cursor and move it deliberately. Pause after changing bands or moving the map so the viewer can see the imagery and metadata update; trim dead time in editing.
- For the M51 segment, use ICRS RA 13:29:52.70, Dec +47:11:43.0. Add the comparison image in post-production beside the recording, and label it as a comparison visual so it is clear it is not an in-app feature.
- The current interface does not provide a timeline slider, image comparison, or automated moving-object detection/classification; describe those as future work.
- The interface offers six SPHEREx bands (D1–D6); the landing page describes SPHEREx's 102 infrared colors.
