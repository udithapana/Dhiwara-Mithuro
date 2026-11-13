/* ධීවර මිතුරා — ගණනය කිරීම් (pure functions, browser + node) */
(function (root) {
  'use strict';

  // ---------- Area ----------
  // Sri Lanka waters box used for the fishing-zone estimate
  var BOX = { latMin: 4.5, latMax: 10.6, lonMin: 79.0, lonMax: 83.5 };

  // India–Sri Lanka International Maritime Boundary Line (IMBL), treaty positions
  // (1974 Palk Strait, 1976 Gulf of Mannar & Bay of Bengal, Nov 1976 extension to
  // trijunction point T). Ordered Bay of Bengal -> Palk Strait -> Gulf of Mannar -> T.
  // Sri Lanka's side is on the LEFT when travelling along this order.
  var IMBL = [
    [11.44333, 83.36667, '6b'], [11.26667, 82.40667, '5b'], [11.045, 81.93333, '4b'], [10.695, 81.04167, '3b'],
    [10.55, 80.76667, '2b'], [10.14, 80.15833, '1bb'], [10.09667, 80.08333, '1ba'], [10.08333, 80.05, '1'],
    [9.95, 79.58333, '2'], [9.66917, 79.37667, '3'], [9.36333, 79.51167, '4'], [9.21667, 79.53333, '5'],
    [9.1, 79.53333, '6/1m'], [9.0, 79.52167, '2m'], [8.89667, 79.48833, '3m'], [8.66667, 79.30333, '4m'],
    [8.62, 79.21667, '5m'], [8.52, 79.07833, '6m'], [8.37, 78.92333, '7m'], [8.20333, 78.895, '8m'],
    [7.58833, 78.76167, '9m'], [7.35, 78.64667, '10m'], [6.51333, 78.20333, '11m'], [5.89833, 77.845, '12m'],
    [5.0, 77.17667, '13m'], [4.784, 77.02333, 'T']
  ];

  // Simplified Sri Lanka coastline (lat, lon) — for land tests and distance from shore
  var SL_POLY = [
    [9.835, 80.215], [9.818, 80.165], [9.815, 80.045], [9.80, 79.98], [9.76, 79.88], [9.70, 79.86], [9.62, 79.92],
    [9.58, 80.00], [9.52, 80.12], [9.50, 80.20], [9.42, 80.15], [9.33, 80.10], [9.15, 80.10], [9.02, 80.06],
    [8.98, 79.95], [9.04, 79.84], [9.08, 79.77], [9.10, 79.72], [9.06, 79.74], [9.00, 79.86], [8.96, 79.92],
    [8.88, 79.93], [8.79, 79.92], [8.68, 79.92], [8.60, 79.90], [8.53, 79.87], [8.42, 79.80], [8.35, 79.73],
    [8.25, 79.71], [8.12, 79.70], [8.00, 79.73], [7.85, 79.78], [7.70, 79.80], [7.575, 79.795], [7.41, 79.82],
    [7.21, 79.83], [7.05, 79.85], [6.93, 79.84], [6.84, 79.86], [6.71, 79.90], [6.58, 79.96], [6.48, 79.98],
    [6.42, 79.995], [6.235, 80.05], [6.14, 80.10], [6.03, 80.215], [6.01, 80.25], [5.97, 80.42], [5.945, 80.46],
    [5.92, 80.59], [5.96, 80.70], [6.02, 80.80], [6.07, 80.95], [6.12, 81.12], [6.21, 81.33], [6.30, 81.50],
    [6.42, 81.62], [6.52, 81.72], [6.76, 81.83], [6.875, 81.835], [7.00, 81.85], [7.12, 81.86], [7.29, 81.86],
    [7.41, 81.83], [7.58, 81.77], [7.73, 81.70], [7.92, 81.56], [8.05, 81.50], [8.16, 81.42], [8.30, 81.38],
    [8.45, 81.38], [8.53, 81.32], [8.57, 81.235], [8.70, 81.19], [8.82, 81.10], [8.95, 81.00], [9.10, 80.92],
    [9.27, 80.82], [9.40, 80.68], [9.47, 80.60], [9.60, 80.45], [9.72, 80.32]
  ];

  // distance (km) from a point to the segment a-b, local flat approximation
  function segDistKm(lat, lon, a1, o1, a2, o2) {
    var kx = 111.32 * Math.cos(lat * Math.PI / 180), ky = 110.57;
    var px = (lon - o1) * kx, py = (lat - a1) * ky, dx = (o2 - o1) * kx, dy = (a2 - a1) * ky;
    var t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1e-12)));
    return { d: Math.sqrt(Math.pow(px - t * dx, 2) + Math.pow(py - t * dy, 2)), t: t, cross: dx * py - dy * px };
  }
  // {km: distance to IMBL, slSide: true if on Sri Lanka's side}
  function imblInfo(lat, lon) {
    var best = null;
    for (var i = 0; i < IMBL.length - 1; i++) {
      var r = segDistKm(lat, lon, IMBL[i][0], IMBL[i][1], IMBL[i + 1][0], IMBL[i + 1][1]);
      if (!best || r.d < best.d) best = r;
    }
    return { km: best.d, slSide: best.cross > 0 };
  }
  function coastDistKm(lat, lon) {
    var m = Infinity;
    for (var i = 0; i < SL_POLY.length; i++) {
      var a = SL_POLY[i], b = SL_POLY[(i + 1) % SL_POLY.length];
      m = Math.min(m, segDistKm(lat, lon, a[0], a[1], b[0], b[1]).d);
    }
    return m;
  }

  // Cells kept OUT of the fishing-zone estimate: India's side of the IMBL,
  // within 2 NM of the IMBL, or beyond Sri Lanka's 200 NM EEZ (approx.).
  function isExcluded(lat, lon) {
    var im = imblInfo(lat, lon);
    if (!im.slSide || im.km < 2 * 1.852) return true;
    if (coastDistKm(lat, lon) > 200 * 1.852) return true;
    return false;
  }
  function isLandApprox(lat, lon) {
    var inside = false;
    for (var i = 0, j = SL_POLY.length - 1; i < SL_POLY.length; j = i++) {
      var yi = SL_POLY[i][0], xi = SL_POLY[i][1], yj = SL_POLY[j][0], xj = SL_POLY[j][1];
      if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  // ---------- Grids ----------
  // ERDDAP griddap .json -> {lats asc, lons asc, v Float64Array (NaN = no data)}
  function parseErddapGrid(json, varName) {
    var t = json.table, cols = t.columnNames;
    var iLat = cols.indexOf('latitude'), iLon = cols.indexOf('longitude'), iV = cols.indexOf(varName);
    var latSet = {}, lonSet = {};
    t.rows.forEach(function (r) { latSet[r[iLat]] = 1; lonSet[r[iLon]] = 1; });
    var lats = Object.keys(latSet).map(Number).sort(function (a, b) { return a - b; });
    var lons = Object.keys(lonSet).map(Number).sort(function (a, b) { return a - b; });
    var li = {}, lo = {};
    lats.forEach(function (x, k) { li[x] = k; });
    lons.forEach(function (x, k) { lo[x] = k; });
    var v = new Float64Array(lats.length * lons.length).fill(NaN);
    t.rows.forEach(function (r) {
      var val = r[iV];
      if (val === null || val === undefined || !isFinite(val) || val <= -900) return;
      v[li[r[iLat]] * lons.length + lo[r[iLon]]] = val;
    });
    return { lats: lats, lons: lons, v: v };
  }

  // points [{lat,lon,val}] on a regular grid -> grid object
  function gridFromPoints(points) {
    return parseErddapGrid({
      table: {
        columnNames: ['latitude', 'longitude', 'x'],
        rows: points.map(function (p) { return [p.lat, p.lon, p.val]; })
      }
    }, 'x');
  }

  function gAt(g, i, j) {
    if (i < 0 || j < 0 || i >= g.lats.length || j >= g.lons.length) return NaN;
    return g.v[i * g.lons.length + j];
  }

  function smoothGrid(g) {
    var out = new Float64Array(g.v.length).fill(NaN), nl = g.lats.length, nn = g.lons.length;
    for (var i = 0; i < nl; i++) for (var j = 0; j < nn; j++) {
      if (isNaN(gAt(g, i, j))) continue;
      var s = 0, c = 0;
      for (var a = -1; a <= 1; a++) for (var b = -1; b <= 1; b++) {
        var x = gAt(g, i + a, j + b);
        if (!isNaN(x)) { s += x; c++; }
      }
      out[i * nn + j] = s / c;
    }
    return { lats: g.lats, lons: g.lons, v: out };
  }

  // gradient magnitude in units per 10 km
  function gradientGrid(g) {
    var out = new Float64Array(g.v.length).fill(NaN), nl = g.lats.length, nn = g.lons.length;
    for (var i = 0; i < nl; i++) for (var j = 0; j < nn; j++) {
      var c = gAt(g, i, j);
      if (isNaN(c)) continue;
      var n = gAt(g, i + 1, j), s = gAt(g, i - 1, j), e = gAt(g, i, j + 1), w = gAt(g, i, j - 1);
      var dyKm, dxKm, dy, dx;
      if (!isNaN(n) && !isNaN(s)) { dy = n - s; dyKm = (g.lats[i + 1] - g.lats[i - 1]) * 111.32; }
      else if (!isNaN(n)) { dy = n - c; dyKm = (g.lats[i + 1] - g.lats[i]) * 111.32; }
      else if (!isNaN(s)) { dy = c - s; dyKm = (g.lats[i] - g.lats[i - 1]) * 111.32; }
      else { dy = 0; dyKm = 1; }
      var k = 111.32 * Math.cos(g.lats[i] * Math.PI / 180);
      if (!isNaN(e) && !isNaN(w)) { dx = e - w; dxKm = (g.lons[j + 1] - g.lons[j - 1]) * k; }
      else if (!isNaN(e)) { dx = e - c; dxKm = (g.lons[j + 1] - g.lons[j]) * k; }
      else if (!isNaN(w)) { dx = c - w; dxKm = (g.lons[j] - g.lons[j - 1]) * k; }
      else { dx = 0; dxKm = 1; }
      out[i * nn + j] = Math.sqrt(Math.pow(dy / dyKm, 2) + Math.pow(dx / dxKm, 2)) * 10;
    }
    return { lats: g.lats, lons: g.lons, v: out };
  }

  function nearestIndex(arr, x) {
    var lo = 0, hi = arr.length - 1;
    if (x <= arr[0]) return 0;
    if (x >= arr[hi]) return hi;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (arr[m] <= x) lo = m; else hi = m; }
    return (x - arr[lo] < arr[hi] - x) ? lo : hi;
  }

  // mean of grid values within +/- win cells of the nearest cell
  function sampleGrid(g, lat, lon, win) {
    if (!g || !g.lats.length) return NaN;
    var i = nearestIndex(g.lats, lat), j = nearestIndex(g.lons, lon);
    if (Math.abs(g.lats[i] - lat) > 0.3 || Math.abs(g.lons[j] - lon) > 0.3) return NaN;
    var s = 0, c = 0;
    for (var a = -win; a <= win; a++) for (var b = -win; b <= win; b++) {
      var x = gAt(g, i + a, j + b);
      if (!isNaN(x)) { s += x; c++; }
    }
    return c ? s / c : NaN;
  }

  function percentile(values, p) {
    var a = values.filter(function (x) { return isFinite(x); }).sort(function (x, y) { return x - y; });
    if (!a.length) return NaN;
    var idx = Math.min(a.length - 1, Math.max(0, Math.round((p / 100) * (a.length - 1))));
    return a[idx];
  }

  // chlorophyll suitability 0..1 (rich but not turbid/bloom water scores best)
  function chlSuitability(chl) {
    if (!isFinite(chl) || chl <= 0) return NaN;
    var L = Math.log10(chl);
    var lo = Math.log10(0.12), best = Math.log10(1.5), hi = Math.log10(12);
    if (L <= lo) return 0;
    if (L <= best) return (L - lo) / (best - lo);
    if (L >= hi) return 0.4;
    return 1 - 0.6 * (L - best) / (hi - best);
  }

  /*
   * Potential fishing zone score 0..100 for every SST cell.
   * Fish gather at thermal fronts (sharp SST change) and where plankton
   * (chlorophyll) is rich, especially at chlorophyll fronts.
   */
  function computePFZ(sstGrid, chlGrid) {
    var sm = smoothGrid(sstGrid);
    var gr = gradientGrid(sm);
    var hasChl = !!(chlGrid && chlGrid.lats.length);
    var chlLogGrad = null, chlLog = null;
    if (hasChl) {
      chlLog = { lats: chlGrid.lats, lons: chlGrid.lons, v: chlGrid.v.map(function (x) { return x > 0 ? Math.log10(x) : NaN; }) };
      chlLogGrad = gradientGrid(smoothGrid(chlLog));
    }
    var cells = [];
    var step = sstGrid.lats.length > 1 ? Math.abs(sstGrid.lats[1] - sstGrid.lats[0]) : 0.1;
    var win = hasChl ? Math.max(0, Math.round((step / 2) / (Math.abs(chlGrid.lats[1] - chlGrid.lats[0]) || step))) : 0;
    for (var i = 0; i < sstGrid.lats.length; i++) for (var j = 0; j < sstGrid.lons.length; j++) {
      var lat = sstGrid.lats[i], lon = sstGrid.lons[j];
      var sst = gAt(sm, i, j);
      if (isNaN(sst)) continue;
      if (isExcluded(lat, lon) || isLandApprox(lat, lon)) continue;
      var c = { lat: lat, lon: lon, sst: sst, g: gAt(gr, i, j), chl: NaN, cg: NaN };
      if (hasChl) {
        var lc = sampleGrid(chlLog, lat, lon, win);
        c.chl = isFinite(lc) ? Math.pow(10, lc) : NaN;
        c.cg = sampleGrid(chlLogGrad, lat, lon, win);
      }
      cells.push(c);
    }
    var g90 = percentile(cells.map(function (c) { return c.g; }), 90) || 1;
    var cg90 = hasChl ? (percentile(cells.map(function (c) { return c.cg; }), 90) || 1) : 1;
    cells.forEach(function (c) {
      var gN = Math.min(1, (c.g || 0) / g90);
      var chlF = chlSuitability(c.chl);
      var cgN = isFinite(c.cg) ? Math.min(1, c.cg / cg90) : NaN;
      var s;
      if (hasChl && isFinite(chlF)) s = 0.45 * gN + 0.35 * chlF + 0.20 * (isFinite(cgN) ? cgN : 0);
      else s = gN;
      c.score = Math.round(100 * s);
    });
    // relative classes: top 10% = high, next 15% = medium
    var p90 = percentile(cells.map(function (c) { return c.score; }), 90);
    var p75 = percentile(cells.map(function (c) { return c.score; }), 75);
    cells.forEach(function (c) { c.cls = c.score >= p90 ? 2 : (c.score >= p75 ? 1 : 0); });
    return { cells: cells, step: step, hasChl: hasChl };
  }

  // greedy pick of the best separated spots
  function pickHotspots(cells, n, minKm) {
    var sorted = cells.filter(function (c) { return c.cls === 2; }).sort(function (a, b) { return b.score - a.score; });
    var out = [];
    for (var k = 0; k < sorted.length && out.length < n; k++) {
      var c = sorted[k], ok = true;
      for (var m = 0; m < out.length; m++) if (distKm(c.lat, c.lon, out[m].lat, out[m].lon) < minKm) { ok = false; break; }
      if (ok) out.push(c);
    }
    return out;
  }

  // ---------- Geo ----------
  function distKm(lat1, lon1, lat2, lon2) {
    var R = 6371, toR = Math.PI / 180;
    var dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  function bearingDeg(lat1, lon1, lat2, lon2) {
    var toR = Math.PI / 180;
    var y = Math.sin((lon2 - lon1) * toR) * Math.cos(lat2 * toR);
    var x = Math.cos(lat1 * toR) * Math.sin(lat2 * toR) - Math.sin(lat1 * toR) * Math.cos(lat2 * toR) * Math.cos((lon2 - lon1) * toR);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  var COMPASS_SI = ['උතුර', 'ඊසාන', 'නැගෙනහිර', 'ගිනිකොන', 'දකුණ', 'නිරිත', 'බටහිර', 'වයඹ'];
  function compassSi(deg) {
    if (!isFinite(deg)) return '-';
    return COMPASS_SI[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
  }
  function fmtDM(lat, lon) {
    function one(v, pos, neg) {
      var a = Math.abs(v), d = Math.floor(a), m = (a - d) * 60;
      if (m >= 59.95) { d += 1; m = 0; }
      return d + '°' + m.toFixed(1) + "'" + (v >= 0 ? pos : neg);
    }
    return one(lat, 'N', 'S') + '  ' + one(lon, 'E', 'W');
  }

  // ---------- Safety ----------
  // h: {wind, gust (km/h), wave (m), code (WMO), rain (%)}
  // 0 = suitable, 1 = be careful, 2 = do not go
  function safetyLevel(h) {
    var lvl = 0;
    var wind = h.wind, gust = h.gust, wave = h.wave, code = h.code;
    if (wind >= 45 || gust >= 60 || wave >= 2.5 || code === 96 || code === 99) lvl = 2;
    else if (wind >= 30 || gust >= 45 || wave >= 1.5 || code === 95 || code === 82) lvl = 1;
    return lvl;
  }
  var SAFETY_TEXT = ['මුහුදු යාමට සුදුසුයි', 'පරිස්සමින් — කුඩා යාත්‍රා අවදානම්', 'මුහුදු යාම නුසුදුසුයි'];

  function weatherTextSi(code) {
    if (code === 0) return 'පැහැදිලි අහස';
    if (code === 1 || code === 2) return 'අර්ධ වලාකුළු';
    if (code === 3) return 'වලාකුළු සහිතයි';
    if (code === 45 || code === 48) return 'මීදුම';
    if (code >= 51 && code <= 57) return 'පොද වැසි';
    if (code >= 61 && code <= 67) return code >= 65 ? 'තද වැසි' : 'වැසි';
    if (code >= 80 && code <= 82) return code === 82 ? 'තද වැසි ඇලි' : 'වැසි ඇලි';
    if (code === 95) return 'ගිගුරුම් සහිත වැසි';
    if (code === 96 || code === 99) return 'තද ගිගුරුම් / අකුණු';
    return '-';
  }

  // ---------- Moon ----------
  function moonInfo(date) {
    var syn = 29.530588853;
    var ref = Date.UTC(2000, 0, 6, 18, 14) / 86400000;
    var days = date.getTime() / 86400000 - ref;
    var age = ((days % syn) + syn) % syn;
    var illum = Math.round((1 - Math.cos(2 * Math.PI * age / syn)) / 2 * 100);
    var name;
    if (age < 1.5 || age > syn - 1.5) name = 'අමාවක';
    else if (Math.abs(age - syn / 2) < 1.5) name = 'පසළොස්වක (පොහොය)';
    else if (age < syn / 2) name = 'පුර පක්ෂය';
    else name = 'අව පක්ෂය';
    return { age: age, illum: illum, name: name };
  }

  var api = {
    BOX: BOX, IMBL: IMBL, isExcluded: isExcluded, isLandApprox: isLandApprox,
    imblInfo: imblInfo, coastDistKm: coastDistKm,
    parseErddapGrid: parseErddapGrid, gridFromPoints: gridFromPoints,
    smoothGrid: smoothGrid, gradientGrid: gradientGrid, sampleGrid: sampleGrid,
    percentile: percentile, chlSuitability: chlSuitability, computePFZ: computePFZ,
    pickHotspots: pickHotspots, distKm: distKm, bearingDeg: bearingDeg,
    compassSi: compassSi, fmtDM: fmtDM, safetyLevel: safetyLevel,
    SAFETY_TEXT: SAFETY_TEXT, weatherTextSi: weatherTextSi, moonInfo: moonInfo
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DMCalc = api;
})(this);
