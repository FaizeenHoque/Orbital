const axios = require('axios');

const HIPS2FITS_URL = process.env.SPHEREX_HIPS2FITS_URL || 'https://alasky.cds.unistra.fr/hips-image-services/hips2fits';

module.exports = async function previewHandler(req, res) {
  try {
    const band = String(req.query.band || 'D2').toUpperCase(); const ra = Number(req.query.ra); const dec = Number(req.query.dec); const fov = Number(req.query.fov || .1); const width = Math.min(1024, Math.max(128, Number(req.query.width) || 512)); const height = Math.min(1024, Math.max(128, Number(req.query.height) || 512));
    if (!/^D[1-6]$/.test(band) || !Number.isFinite(ra) || !Number.isFinite(dec) || ra < 0 || ra > 360 || dec < -90 || dec > 90 || fov < .01 || fov > .5) return res.status(400).json({ error: 'INVALID_PREVIEW_REQUEST' });
    const params = new URLSearchParams({ hips: `CDS/P/SPHEREx/QR2/${band}`, ra: String(ra), dec: String(dec), fov: String(fov), width: String(width), height: String(height), projection: 'SIN', format: 'png' });
    const response = await axios.get(`${HIPS2FITS_URL}?${params}`, { responseType: 'arraybuffer', timeout: 60000, maxContentLength: 10 * 1024 * 1024 });
    res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Cache-Control', 'public, max-age=1800'); res.setHeader('Content-Type', 'image/png'); res.setHeader('X-Data-Source', 'CDS SPHEREx HiPS2FITS'); res.status(200).send(Buffer.from(response.data));
  } catch (error) { res.status(502).json({ error: 'PREVIEW_UPSTREAM_ERROR', message: error.message }); }
};
