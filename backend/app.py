import io
import json
import math
import os
import re
import struct
import threading
import time
from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import requests
from flask import Flask, Response, jsonify, request
from flask_cors import CORS
from PIL import Image

app = Flask(__name__)
CORS(app)

SIA_URL = os.getenv("SPHEREX_SIA_URL", "https://irsa.ipac.caltech.edu/SIA")
HIPS_BASE_URL = os.getenv("SPHEREX_HIPS_BASE_URL", "https://alasky.cds.unistra.fr/SPHEREx")
HIPS2FITS_URL = os.getenv("SPHEREX_HIPS2FITS_URL", "https://alasky.cds.unistra.fr/hips-image-services/hips2fits")
RELEASES = [item.strip() for item in os.getenv("SPHEREX_RELEASES", "spherex_qr3,spherex_qr2").split(",") if item.strip()]
TIMEOUT = float(os.getenv("SPHEREX_UPSTREAM_TIMEOUT_MS", "60000")) / 1000
QUERY_TTL = float(os.getenv("SPHEREX_QUERY_CACHE_TTL_MS", "600000")) / 1000
IMAGE_TTL = float(os.getenv("SPHEREX_IMAGE_CACHE_TTL_MS", "1800000")) / 1000
IMAGE_CACHE_BYTES = int(os.getenv("SPHEREX_IMAGE_CACHE_MAX_BYTES", "67108864"))
PREVIEW_SIZE = float(os.getenv("SPHEREX_PREVIEW_SIZE_DEGREES", "0.1"))

BANDS = {
    "SPHEREx-D1": (0.75, 1.10), "SPHEREx-D2": (1.10, 1.62),
    "SPHEREx-D3": (1.63, 2.41), "SPHEREx-D4": (2.42, 3.82),
    "SPHEREx-D5": (3.83, 4.41), "SPHEREx-D6": (4.42, 5.00),
}

_query_cache = OrderedDict()
_image_cache = OrderedDict()
_preview_cache = OrderedDict()
_hips_cache = OrderedDict()
_cache_lock = threading.Lock()
_record_by_product = {}
_cache_bytes = 0


def error_response(status, code, message):
    return jsonify(error=code, message=message), status


def number(value):
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def coordinate(value, name, minimum, maximum):
    result = number(value)
    if result is None or result < minimum or result > maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}.")
    return result


def radius(value):
    result = number(value if value is not None else 0.1)
    if result is None or result <= 0 or result > 5:
        raise ValueError("radius must be greater than 0 and no more than 5 degrees.")
    return result


def mjd_iso(value):
    mjd = number(value)
    if mjd is None:
        return None
    return (datetime(1858, 11, 17, tzinfo=timezone.utc) + timedelta(days=mjd)).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def angular_distance(ra1, dec1, ra2, dec2):
    if None in (ra1, dec1, ra2, dec2):
        return None
    radians = math.pi / 180
    value = math.sin((dec2 - dec1) * radians / 2) ** 2 + math.cos(dec1 * radians) * math.cos(dec2 * radians) * math.sin((ra2 - ra1) * radians / 2) ** 2
    return 2 * math.asin(math.sqrt(min(1, value))) / radians


def point_in_polygon(footprint, ra, dec):
    if not footprint or not footprint.startswith("POLYGON"):
        return None
    values = [float(value) for value in re.findall(r"-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?", footprint)]
    points = [(((values[index] - ra + 540) % 360) - 180, values[index + 1]) for index in range(0, len(values) - 1, 2)]
    inside = False
    for index, current in enumerate(points):
        previous = points[index - 1]
        if ((current[1] > dec) != (previous[1] > dec)) and 0 < (previous[0] - current[0]) * (dec - current[1]) / (previous[1] - current[1]) + current[0]:
            inside = not inside
    return inside


def parse_sia(payload):
    resources = payload.get("VOTABLE", {}).get("RESOURCE_ARRAY", [])
    result = next((resource for resource in resources if resource.get("<xmlattr>", {}).get("type") == "results"), None)
    table = (result or {}).get("TABLE", {})
    fields = [field.get("<xmlattr>", {}).get("name") for field in table.get("FIELD_ARRAY", [])]
    rows = table.get("DATA", {}).get("TABLEDATA", [])
    if not fields or not isinstance(rows, list):
        raise RuntimeError("IRSA returned an unexpected SIA response.")
    return [dict(zip(fields, row)) for row in rows]


def normalize(row, ra, dec, release):
    product = row.get("obs_publisher_did") or row.get("access_url")
    band = row.get("energy_bandpassname") or "SPHEREx-D2"
    record = {
        "obs_id": row.get("obs_id") or product, "product_id": product,
        "ra": number(row.get("s_ra")), "dec": number(row.get("s_dec")),
        "distance": angular_distance(ra, dec, number(row.get("s_ra")), number(row.get("s_dec"))),
        "coverage_at_query": point_in_polygon(row.get("s_region"), ra, dec),
        "footprint": row.get("s_region") or None,
        "obs_date": mjd_iso(row.get("t_min")), "obs_date_end": mjd_iso(row.get("t_max")),
        "mjd": number(row.get("t_min")), "mjd_end": number(row.get("t_max")),
        "wavelength_band": band,
        "wavelength_min_microns": (number(row.get("em_min")) or 0) * 1e6,
        "wavelength_max_microns": (number(row.get("em_max")) or 0) * 1e6,
        "spectral_resolution": number(row.get("em_res_power")),
        "data_release": row.get("obs_collection") or release,
        "access_url": row.get("access_url"), "original_archive_url": row.get("access_url"),
        "access_format": row.get("access_format"), "estimated_size_bytes": number(row.get("access_estsize")),
        "exposure_seconds": number(row.get("t_exptime")),
        "detector_pixels": f"{row.get('s_xel1')} × {row.get('s_xel2')}" if row.get("s_xel1") else None,
        "pixel_scale_arcsec": number(row.get("s_pixel_scale")), "field_of_view_degrees": number(row.get("s_fov")),
        "target_name": row.get("target_name") or None, "target_type": row.get("target_type") or None,
        "target_moving": row.get("target_moving") == "1",
        "quality": {"calibration_level": number(row.get("calib_level")), "intent": row.get("obs_intent") or None},
        "provenance": {"service": "IRSA SIA2", "collection": row.get("obs_collection") or release, "publisher_did": row.get("obs_publisher_did") or None},
    }
    params = urlencode({"product": product, "ra": ra, "dec": dec, "size": PREVIEW_SIZE})
    record["image_url"] = f"/api/spherex/image/{record['obs_id']}?{params}"
    record["cutout_url"] = f"/api/spherex/cutout?{params}"
    record["hips_preview_url"] = f"/api/spherex/sky/preview?{urlencode({'band': band.replace('SPHEREx-', ''), 'ra': ra, 'dec': dec, 'fov': PREVIEW_SIZE, 'width': 512, 'height': 512})}"
    _record_by_product[product] = {**record, "_upstream_url": row.get("access_url")}
    return record


def cache_get(cache, key):
    with _cache_lock:
        value = cache.get(key)
        if not value or value[0] < time.time():
            cache.pop(key, None); return None
        cache.move_to_end(key); return value[1]


def cache_set(cache, key, value, ttl, size=0):
    global _cache_bytes
    with _cache_lock:
        old = cache.pop(key, None)
        if old: _cache_bytes -= old[2]
        cache[key] = (time.time() + ttl, value, size); _cache_bytes += size
        while cache is _image_cache and _cache_bytes > IMAGE_CACHE_BYTES:
            _, (_, _, removed) = cache.popitem(last=False); _cache_bytes -= removed


def query_observations(ra, dec, search_radius, band):
    key = f"{ra:.6f}:{dec:.6f}:{search_radius:.5f}:{band}:{','.join(RELEASES)}"
    cached = cache_get(_query_cache, key)
    if cached is not None: return cached
    rows = []
    failures = 0
    for release in RELEASES:
        try:
            params = {"COLLECTION": release, "POS": f"circle {ra} {dec} {search_radius}", "RESPONSEFORMAT": "JSON", "MAXREC": "500"}
            low, high = BANDS.get(band, (None, None))
            if low: params["BAND"] = f"{low * 1e-6} {high * 1e-6}"
            rows.extend(parse_sia(requests.get(SIA_URL, params=params, timeout=TIMEOUT).json()))
        except requests.RequestException:
            failures += 1
    if not rows and failures == len(RELEASES):
        raise RuntimeError("IRSA did not return observation metadata.")
    records, seen = [], set()
    for index, row in enumerate(rows):
        record = normalize(row, ra, dec, RELEASES[min(index, len(RELEASES) - 1)])
        if not record["access_url"] or record["ra"] is None or record["dec"] is None or record["coverage_at_query"] is False or record["wavelength_band"] != band or record["product_id"] in seen: continue
        if record["field_of_view_degrees"] and record["distance"] and record["distance"] > record["field_of_view_degrees"] / 2 - PREVIEW_SIZE / 2: continue
        seen.add(record["product_id"]); records.append(record)
    records.sort(key=lambda item: (item["mjd"] if item["mjd"] is not None else float("inf"), item["distance"] or float("inf")))
    cache_set(_query_cache, key, records, QUERY_TTL)
    return records


def fits_image(buffer):
    offset = 0
    while offset < len(buffer):
        cards = []
        for cursor in range(offset, len(buffer), 80):
            card = buffer[cursor:cursor + 80].decode("ascii", "ignore"); cards.append(card)
            if card[:8].strip() == "END": break
        header_bytes = math.ceil(len(cards) * 80 / 2880) * 2880; header = {}
        for card in cards:
            key = card[:8].strip()
            if key and key != "END" and card[8:9] == "=":
                raw = card[10:].split("/")[0].strip()
                try: header[key] = float(raw.replace("D", "E"))
                except ValueError: header[key] = raw.strip("'")
        width, height, bitpix = int(header.get("NAXIS1", 0)), int(header.get("NAXIS2", 0)), int(header.get("BITPIX", 0)); pixels = width * height; bytes_per = abs(bitpix) // 8
        data_start = offset + header_bytes; data_bytes = pixels * bytes_per
        if width and height and data_start + data_bytes <= len(buffer):
            values = []
            formats = {8: "B", 16: "h", 32: "i", -32: "f", -64: "d"}
            fmt = formats.get(bitpix)
            if not fmt: raise RuntimeError("Unsupported FITS pixel format.")
            bscale, bzero = float(header.get("BSCALE", 1)), float(header.get("BZERO", 0))
            values = [value[0] * bscale + bzero for value in struct.iter_unpack(">" + fmt, memoryview(buffer)[data_start:data_start + data_bytes])]
            return width, height, values
        offset = data_start + math.ceil(max(data_bytes, 0) / 2880) * 2880
    raise RuntimeError("FITS image extension not found.")


def png_from_fits(buffer):
    width, height, values = fits_image(buffer); valid = sorted(value for value in values if math.isfinite(value))
    if not valid: raise RuntimeError("FITS image contains no valid pixels.")
    low = valid[int(len(valid) * .01)]; high = valid[min(len(valid) - 1, int(len(valid) * .995))]; scale = max(high - low, 1); stretch = math.asinh(scale / 3)
    pixels = []
    for value in values:
        normalized = max(0, min(1, math.asinh(max(0, value - low) / (scale / 3)) / stretch)); level = int(normalized * 255); pixels.append((int(level * .72), int(level * .86), level, 255))
    output = io.BytesIO(); image = Image.new("RGBA", (width, height)); image.putdata(pixels); image.save(output, "PNG", optimize=True); return output.getvalue()


def record_for(product, obs_id=None):
    if product in _record_by_product: return _record_by_product[product]
    return next((record for record in _record_by_product.values() if record["obs_id"] == obs_id), None)


def tile_response(z, x, y, band):
    dimension = 2 ** z; x %= dimension; ra_min, ra_max = x / dimension * 360, (x + 1) / dimension * 360; dec_max, dec_min = 90 - y / dimension * 180, 90 - (y + 1) / dimension * 180; center_ra, center_dec = (ra_min + ra_max) / 2, (dec_min + dec_max) / 2
    records = query_observations(center_ra, center_dec, min(5, max(.1, math.hypot((ra_max - ra_min) / 2, (dec_max - dec_min) / 2))), band) if z >= 6 else []
    return {"tile": {"z": z, "x": x, "y": y, "bounds": {"raMin": ra_min, "raMax": ra_max, "decMin": dec_min, "decMax": dec_max}, "resolution": "SPHEREx-cutout" if z >= 6 else "coordinate-overview"}, "observations": records, "coverage_available": bool(records)}


def hips_asset(band, asset):
    if not re.match(r"^D[1-6]$", band) or ".." in asset or not re.match(r"^(properties|Norder\d+/Dir\d+/Npix\d+\.(png|jpg|fits))$", asset): raise ValueError("Invalid HiPS asset.")
    key = (band, asset or "properties")
    with _cache_lock:
        cached = _hips_cache.get(key)
        if cached:
            _hips_cache.move_to_end(key)
            return cached
    response = requests.get(f"{HIPS_BASE_URL}/{band}/{key[1]}", timeout=TIMEOUT)
    response.raise_for_status()
    result = (response.content, response.headers.get("Content-Type", "text/plain" if key[1] == "properties" else "image/png"))
    with _cache_lock:
        _hips_cache[key] = result
        _hips_cache.move_to_end(key)
        while len(_hips_cache) > 512:
            _hips_cache.popitem(last=False)
    return result


def hips_preview(band, ra, dec, fov, width, height):
    key = (band, round(ra, 6), round(dec, 6), round(fov, 7), width, height)
    cached = cache_get(_preview_cache, key)
    if cached is not None: return cached
    params = {"hips": f"CDS/P/SPHEREx/QR2/{band}", "ra": ra, "dec": dec, "fov": fov, "width": width, "height": height, "projection": "SIN", "format": "png"}
    response = requests.get(HIPS2FITS_URL, params=params, timeout=TIMEOUT)
    response.raise_for_status()
    body = response.content
    with _cache_lock:
        _preview_cache[key] = (time.time() + IMAGE_TTL, body, 0)
        _preview_cache.move_to_end(key)
        while len(_preview_cache) > 192: _preview_cache.popitem(last=False)
    return body


def dispatch(path):
    normalized = path.lstrip("/")
    if normalized in ("health", "api/health"): return jsonify(status="ok")
    if normalized.startswith("api/spherex/observations"):
        ra = coordinate(request.args.get("ra"), "ra", 0, 360); dec = coordinate(request.args.get("dec"), "dec", -90, 90); return jsonify(query_observations(ra, dec, radius(request.args.get("radius")), request.args.get("band", "SPHEREx-D2")))
    if normalized == "api/spherex/stats": return jsonify(source="NASA/IPAC IRSA SIA2", releases=RELEASES, query_mode="on-demand")
    if normalized.startswith("api/spherex/sky/tiles/"):
        parts = normalized.split("/"); return jsonify(tile_response(int(parts[4]), int(parts[5]), int(parts[6]), request.args.get("band", "SPHEREx-D2")))
    if normalized.startswith("api/spherex/sky/hips/"):
        parts = normalized.split("/"); asset = "/".join(parts[5:]) or "properties"; body, content_type = hips_asset(parts[4].upper(), asset); max_age = 3600 if asset == "properties" else 2592000; return Response(body, content_type=content_type, headers={"Cache-Control": f"public, max-age={max_age}, immutable" if asset != "properties" else f"public, max-age={max_age}", "Access-Control-Allow-Origin": "*"})
    if normalized.startswith("api/spherex/sky/preview"):
        band = request.args.get("band", "D2").upper()
        body = hips_preview(
            band,
            coordinate(request.args.get("ra"), "ra", 0, 360),
            coordinate(request.args.get("dec"), "dec", -90, 90),
            min(.5, max(.0001, float(request.args.get("fov", PREVIEW_SIZE)))),
            min(1024, max(128, int(request.args.get("width", 512)))),
            min(1024, max(128, int(request.args.get("height", 512)))),
        )
        return Response(body, content_type="image/png", headers={"Cache-Control": "public, max-age=1800", "Access-Control-Allow-Origin": "*"})
    if normalized.startswith("api/spherex/image/"):
        obs_id = normalized.split("/")[3]; record = record_for(request.args.get("product"), obs_id)
        if not record: return error_response(404, "OBSERVATION_NOT_FOUND", "Query observations before requesting an image.")
        ra = coordinate(request.args.get("ra"), "ra", 0, 360); dec = coordinate(request.args.get("dec"), "dec", -90, 90); size = min(.5, max(.0001, float(request.args.get("size", PREVIEW_SIZE)))); cache_key = (record["product_id"], round(ra, 6), round(dec, 6), round(size, 7)); cached = cache_get(_image_cache, cache_key)
        if cached is None:
            response = requests.get(f"{record['_upstream_url']}?{urlencode({'center': f'{ra},{dec}d', 'size': size})}", timeout=TIMEOUT); response.raise_for_status(); cached = png_from_fits(response.content); cache_set(_image_cache, cache_key, cached, IMAGE_TTL, len(cached))
        return Response(cached, content_type="image/png", headers={"Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*"})
    return error_response(404, "NOT_FOUND", "API route not found.")


@app.route("/", defaults={"path": ""}, methods=["GET", "POST", "OPTIONS"])
@app.route("/<path:path>", methods=["GET", "POST", "OPTIONS"])
def catch_all(path):
    if request.method == "OPTIONS": return Response(status=204)
    try: return dispatch(path)
    except ValueError as error: return error_response(400, "INVALID_REQUEST", str(error))
    except Exception as error: return error_response(502, "UPSTREAM_ERROR", str(error))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=False)
