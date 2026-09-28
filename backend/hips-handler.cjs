const axios = require('axios');

const HIPS_BASE_URL = process.env.SPHEREX_HIPS_BASE_URL || 'https://alasky.cds.unistra.fr/SPHEREx';
const UPSTREAM_TIMEOUT_MS = Number(process.env.SPHEREX_UPSTREAM_TIMEOUT_MS || 60000);

module.exports = async function hipsHandler(req, res) {
  try {
    const path = String(req.url || '').split('?')[0].replace(/^\/api\/spherex\/sky\/hips\//, '').replace(/^\/+|\/+$/g, '');
    const segments = path.split('/').filter(Boolean);
    const band = String(segments.shift() || '').toUpperCase();
    const asset = segments.join('/') || 'properties';
    if (!/^D[1-6]$/.test(band) || asset.includes('..') || !/^(properties|Norder\d+\/Dir\d+\/Npix\d+\.(png|jpg|fits))$/.test(asset)) return res.status(400).json({ error: 'INVALID_HIPS_ASSET' });
    const response = await axios.get(`${HIPS_BASE_URL}/${band}/${asset}`, { responseType: 'arraybuffer', timeout: UPSTREAM_TIMEOUT_MS, maxContentLength: 10 * 1024 * 1024 });
    const contentType = asset === 'properties' ? 'text/plain; charset=utf-8' : (asset.endsWith('.fits') ? 'application/fits' : 'image/png');
    res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Cache-Control', 'public, max-age=86400'); res.setHeader('Content-Type', contentType); res.setHeader('X-Data-Source', 'CDS/IRSA SPHEREx HiPS'); res.status(200).send(Buffer.from(response.data));
  } catch (error) { res.status(error.response?.status === 404 ? 404 : 502).json({ error: 'HIPS_UPSTREAM_ERROR', message: error.message }); }
};
