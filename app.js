/* ධීවර මිතුරා — app */
(function () {
  'use strict';
  var C = window.DMCalc;
  var KEY = 'dheewaraMithura_';          // all storage keys use this prefix (shared origin!)
  var TZ = 'Asia/Colombo';
  var PFZ_MAX_AGE = 6 * 3600 * 1000;      // re-download satellite data after 6 h
  var WX_MAX_AGE = 60 * 60 * 1000;        // weather: 1 h
  var ERDDAP = 'https://coastwatch.pfeg.noaa.gov/erddap/griddap/';

  var HARBOURS = [
    ['මුතුවල් (කොළඹ)', 6.955, 79.855], ['දික්කොවිට', 7.005, 79.865], ['පානදුර', 6.712, 79.895],
    ['බේරුවල', 6.478, 79.982], ['ගාල්ල', 6.030, 80.218], ['මිරිස්ස', 5.945, 80.460],
    ['දෙවුන්දර', 5.930, 80.590], ['තංගල්ල', 6.018, 80.797], ['හම්බන්තොට', 6.120, 81.115],
    ['කිරින්ද', 6.210, 81.330], ['පොතුවිල්', 6.875, 81.835], ['ඔලුවිල්', 7.290, 81.860],
    ['කල්මුණේ', 7.410, 81.830], ['මඩකලපුව', 7.730, 81.700], ['වාලච්චේන', 7.925, 81.540],
    ['ත්‍රිකුණාමලය', 8.570, 81.235], ['මුලතිව්', 9.270, 80.820], ['පේදුරුතුඩුව', 9.830, 80.235],
    ['මයිලිඩ්ඩි', 9.820, 80.045], ['පේසාලෙයි (මන්නාරම)', 9.085, 79.820], ['කල්පිටිය', 8.230, 79.760],
    ['හලාවත (චිලාව)', 7.575, 79.790], ['මීගමුව', 7.210, 79.830]
  ];

  // open-sea points for the "danger" layer
  var SEA_PTS = [
    [6.0, 79.6], [7.0, 79.5], [8.0, 79.45], [8.6, 79.7], [9.9, 80.6], [9.5, 81.1], [8.7, 81.6],
    [7.9, 82.0], [7.0, 82.2], [6.3, 82.0], [5.7, 81.5], [5.4, 80.8], [5.5, 80.0], [4.8, 79.4],
    [4.6, 81.0], [5.0, 82.4], [6.5, 83.2], [8.2, 83.0], [9.6, 82.2], [6.2, 78.9]
  ];

  // ---------- storage (own keys only, never clear()) ----------
  function sget(k, def) { try { var v = localStorage.getItem(KEY + k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function sset(k, v) { try { localStorage.setItem(KEY + k, JSON.stringify(v)); return true; } catch (e) { return false; } }

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(x) { return typeof x === 'number' && isFinite(x); }
  function n1(x) { return num(x) ? (Math.round(x * 10) / 10).toFixed(1) : '-'; }
  function n0(x) { return num(x) ? String(Math.round(x)) : '-'; }
  function colomboNowStr() { return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 16); }
  var DAYS_SI = ['ඉරිදා', 'සඳුදා', 'අඟහරුවාදා', 'බදාදා', 'බ්‍රහස්පතින්දා', 'සිකුරාදා', 'සෙනසුරාදා'];
  function dayName(dateStr, idx) {
    if (idx === 0) return 'අද';
    if (idx === 1) return 'හෙට';
    return DAYS_SI[new Date(dateStr + 'T00:00:00Z').getUTCDay()];
  }
  function fmtDateTime(ms) {
    try { return new Date(ms).toLocaleString('si-LK', { timeZone: TZ, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return new Date(ms).toLocaleString(); }
  }
  function arrow(deg) {  // arrow showing where wind/waves GO (from-direction + 180)
    if (!isFinite(deg)) return '';
    return '<span class="arrow" style="transform:rotate(' + Math.round(deg + 180) + 'deg)">↑</span>';
  }
  function fetchJSON(url, ms) {
    var ctl = ('AbortController' in window) ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 45000);
    return fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) {
      clearTimeout(t);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }, function (e) { clearTimeout(t); throw e; });
  }

  // ---------- state ----------
  var S = {
    pfz: null, hotspots: [], ref: null, wx: null, me: null,
    dangerDay: 0, danger: null, marks: sget('marks', [])
  };

  // ---------- tabs ----------
  var map;
  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); });
  });
  function showTab(name) {
    document.querySelectorAll('.tabs button').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-tab') === name); });
    document.querySelectorAll('.tab').forEach(function (x) { x.classList.toggle('active', x.id === 'tab-' + name); });
    if (name === 'map' && map) setTimeout(function () { map.invalidateSize(); }, 50);
    sset('tab', name);
  }

  // ---------- map ----------
  map = L.map('map', { preferCanvas: true, zoomControl: false, attributionControl: true }).setView([7.8, 80.9], 7);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 13, attribution: '© OpenStreetMap'
  }).addTo(map);
  var lyrPfz = L.layerGroup().addTo(map);
  var lyrHot = L.layerGroup().addTo(map);
  var lyrDanger = L.layerGroup();
  var lyrMarks = L.layerGroup().addTo(map);
  var lyrMe = L.layerGroup().addTo(map);
  var lyrHarb = L.layerGroup().addTo(map);
  var lyrBounds = L.layerGroup().addTo(map);
  var lyrShips = L.layerGroup().addTo(map);
  var lyrSeamark = L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
    maxZoom: 13, opacity: 0.9, attribution: '© OpenSeaMap'
  });
  var canvasR = L.canvas({ padding: 0.3 });
  drawBounds();
  drawShips();

  HARBOURS.forEach(function (h) {
    L.circleMarker([h[1], h[2]], { radius: 4, color: '#0b3d5c', weight: 1, fillColor: '#fff', fillOpacity: 1, renderer: canvasR })
      .bindTooltip('⚓ ' + h[0]).addTo(lyrHarb);
  });

  $('lyrPfz').addEventListener('change', function () {
    if (this.checked) { lyrPfz.addTo(map); lyrHot.addTo(map); } else { map.removeLayer(lyrPfz); map.removeLayer(lyrHot); }
  });
  $('lyrBounds').addEventListener('change', function () {
    if (this.checked) lyrBounds.addTo(map); else map.removeLayer(lyrBounds);
    $('legendBounds').classList.toggle('hidden', !this.checked);
  });
  $('lyrShips').addEventListener('change', function () {
    if (this.checked) lyrShips.addTo(map); else map.removeLayer(lyrShips);
    $('legendShips').classList.toggle('hidden', !this.checked);
  });
  $('lyrSeamark').addEventListener('change', function () {
    if (this.checked) { lyrSeamark.addTo(map); if (map.getZoom() < 9) mapMsg('නාවික සලකුණු (ප්‍රදීපාගාර, බෝයා, කේබල්, නැංගුරම් පොළ) පෙනෙන්නේ zoom කළ විට — වරායක් ළඟට zoom කරන්න.'); setTimeout(function () { mapMsg(''); }, 6000); }
    else map.removeLayer(lyrSeamark);
  });
  $('lyrMarks').addEventListener('change', function () { if (this.checked) lyrMarks.addTo(map); else map.removeLayer(lyrMarks); });
  $('lyrDanger').addEventListener('change', function () {
    var on = this.checked;
    $('dangerDays').classList.toggle('hidden', !on);
    $('legendDanger').classList.toggle('hidden', !on);
    if (on) { lyrDanger.addTo(map); loadDanger(); } else map.removeLayer(lyrDanger);
  });
  document.querySelectorAll('#dangerDays .chip').forEach(function (c) {
    c.addEventListener('click', function () {
      S.dangerDay = +c.getAttribute('data-day');
      document.querySelectorAll('#dangerDays .chip').forEach(function (x) { x.classList.toggle('on', x === c); });
      drawDanger();
    });
  });

  function mapMsg(html) {
    var el = $('mapMsg');
    if (!html) { el.classList.add('hidden'); return; }
    el.innerHTML = html; el.classList.remove('hidden');
  }

  function nearestCell(lat, lon) {
    if (!S.pfz) return null;
    var best = null, bd = Infinity, lim = S.pfz.step * 0.8;
    S.pfz.cells.forEach(function (c) {
      var d = Math.abs(c[0] - lat) + Math.abs(c[1] - lon);
      if (d < bd) { bd = d; best = c; }
    });
    if (!best || Math.abs(best[0] - lat) > lim || Math.abs(best[1] - lon) > lim) return null;
    return best;
  }

  function scoreLabel(cls) { return cls === 2 ? 'මාළු ඉඩ වැඩියි' : (cls === 1 ? 'මාළු ඉඩ මධ්‍යම' : 'සාමාන්‍යයි'); }

  function popupHtml(lat, lon, title) {
    var c = nearestCell(lat, lon);
    var h = '<div class="pop">';
    if (title) h += '<b>' + esc(title) + '</b><br>';
    h += '<span class="small">' + C.fmtDM(lat, lon) + '</span><br>';
    if (c) {
      h += 'ලකුණු: <b>' + c[2] + '/100</b> — ' + scoreLabel(c[3]) + '<br>';
      h += 'මුහුදු උෂ්ණත්වය: ' + n1(c[4]) + '°C';
      if (isFinite(c[5]) && c[5] !== null) h += '<br>හරිතප්‍රද: ' + c[5].toFixed(2) + ' mg/m³';
    }
    h += '<br>' + boundaryNote(lat, lon);
    var sn = shipNote(lat, lon);
    if (sn) h += '<br>' + sn;
    if (S.ref) {
      var d = C.distKm(S.ref.lat, S.ref.lon, lat, lon), b = C.bearingDeg(S.ref.lat, S.ref.lon, lat, lon);
      h += '<br><span class="small">' + esc(S.ref.name) + ' සිට ' + n1(d) + ' km (' + n1(d / 1.852) + ' NM), ' + C.compassSi(b) + ' ' + n0(b) + '°</span>';
    }
    h += '<div class="btns"><button class="btn small" data-act="wx" data-lat="' + lat + '" data-lon="' + lon + '">🌊 කාලගුණය</button>' +
      '<button class="btn small" data-act="mark" data-lat="' + lat + '" data-lon="' + lon + '">📌 සටහන් කරන්න</button></div></div>';
    return h;
  }

  map.on('click', function (e) {
    var lat = +e.latlng.lat.toFixed(4), lon = +e.latlng.lng.toFixed(4);
    if (C.isLandApprox(lat, lon)) return;
    L.popup().setLatLng(e.latlng).setContent(popupHtml(lat, lon)).openOn(map);
  });

  // delegated buttons inside popups / lists
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act'), lat = +b.getAttribute('data-lat'), lon = +b.getAttribute('data-lon');
    if (act === 'wx') {
      var nm = b.getAttribute('data-name') || ('මුහුදේ ස්ථානය ' + C.fmtDM(lat, lon));
      setPlace({ name: nm, lat: lat, lon: lon, custom: true });
      showTab('wx');
    } else if (act === 'mark') {
      addMark(lat, lon, '', 'සිතියමෙන්');
      map.closePopup();
    } else if (act === 'show') {
      showTab('map');
      setTimeout(function () {
        map.setView([lat, lon], 10);
        L.popup().setLatLng([lat, lon]).setContent(popupHtml(lat, lon, b.getAttribute('data-name'))).openOn(map);
      }, 80);
    } else if (act === 'delmark') {
      var id = b.getAttribute('data-id');
      if (b.getAttribute('data-sure') !== '1') { b.setAttribute('data-sure', '1'); b.textContent = 'ඇත්තටම මකන්නද?'; return; }
      S.marks = S.marks.filter(function (m) { return String(m.id) !== id; });
      sset('marks', S.marks); renderMarks();
    }
  });

  // ---------- my location ----------
  function getPos() {
    return new Promise(function (res, rej) {
      if (!navigator.geolocation) return rej(new Error('GPS නැත'));
      navigator.geolocation.getCurrentPosition(function (p) {
        res({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy });
      }, function (err) { rej(err); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
    });
  }
  function gpsErr(e) {
    if (e && e.code === 1) return 'GPS අවසරය ලබා දී නැත. දුරකථන සැකසුම් වලින් Location අවසරය දෙන්න.';
    return 'ස්ථානය සොයාගත නොහැක. GPS සක්‍රීය කර නැවත උත්සාහ කරන්න.';
  }
  $('locateBtn').addEventListener('click', function () {
    mapMsg('<span class="spin"></span> ස්ථානය සොයමින්…');
    getPos().then(function (p) {
      mapMsg('');
      S.me = p;
      lyrMe.clearLayers();
      L.circle([p.lat, p.lon], { radius: Math.max(p.acc, 30), color: '#1565c0', weight: 1, fillOpacity: 0.15 }).addTo(lyrMe);
      L.circleMarker([p.lat, p.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#1565c0', fillOpacity: 1 })
        .bindPopup(popupHtml(+p.lat.toFixed(4), +p.lon.toFixed(4), 'මා සිටින තැන')).addTo(lyrMe).openPopup();
      map.setView([p.lat, p.lon], 9);
      var im = C.imblInfo(p.lat, p.lon), nm = im.km / 1.852;
      if (!im.slSide) { mapMsg('🚨 <b>ඔබ ඉන්දීය මුහුදු සීමාව පසුකර ඇත!</b> වහාම ශ්‍රී ලංකා මුහුදට ආපසු යන්න.'); buzz(); }
      else if (nm < 5) { mapMsg('⚠️ <b>ඉන්දීය සීමාවට ' + n1(nm) + ' NM පමණයි.</b> ඉදිරියට නොයන්න.'); buzz(); }
      else {
        var ts = C.tssInfo(p.lat, p.lon);
        if (ts.part) { mapMsg('🚢 <b>ඔබ කප්පල් ගමන් මාර්ගයේ (TSS) ඇත!</b> මෙහි නවතින්න / දැල් දමන්න එපා. ඉක්මනින් ඉවත් වන්න.'); buzz(); }
        else if (ts.nm < 2) { mapMsg('🚢 <b>කප්පල් ගමන් මාර්ගයට (TSS) ' + n1(ts.nm) + ' NM පමණයි.</b> ලයිට් දල්වා, අවධානයෙන් සිටින්න.'); buzz(); }
      }
    }).catch(function (e) { mapMsg(gpsErr(e)); setTimeout(function () { mapMsg(''); }, 6000); });
  });

  // ---------- maritime boundaries ----------
  function buzz() { try { if (navigator.vibrate) navigator.vibrate([300, 150, 300]); } catch (e) {} }
  function boundaryNote(lat, lon) {
    var im = C.imblInfo(lat, lon), nm = im.km / 1.852;
    if (!im.slSide) return '<span class="small" style="color:#c62828"><b>🚫 ඉන්දීය මුහුද</b> — ශ්‍රී ලංකා ධීවරයන්ට ඇතුළු වීම තහනම් (සීමාවේ සිට ' + n1(nm) + ' NM)</span>';
    var cn = C.coastDistKm(lat, lon) / 1.852, zone;
    if (cn > 200) zone = 'ශ්‍රී ලංකා EEZ ඉන් පිටත (මහ මුහුද)';
    else if (cn > 24) zone = 'ශ්‍රී ලංකා සුවිශේෂ ආර්ථික කලාපය (EEZ)';
    else if (cn > 12) zone = 'ශ්‍රී ලංකා ආසන්න කලාපය (12–24 NM)';
    else zone = 'ශ්‍රී ලංකා භෞමික මුහුද (12 NM ඇතුළත)';
    var warn = nm < 5 ? '<b style="color:#c62828">⚠️ ඉන්දීය සීමාවට ' + n1(nm) + ' NM පමණි</b>' : 'ඉන්දීය සීමාවට ' + n0(nm) + ' NM';
    return '<span class="small">🛟 ' + zone + ' • ' + warn + '</span>';
  }
  function drawBounds() {
    var B = window.DMBounds;
    var imbl = C.IMBL.map(function (p) { return [p[0], p[1]]; });
    var tip = '<b>ඉන්දියා–ශ්‍රී ලංකා ජාත්‍යන්තර මුහුදු සීමාව (IMBL)</b><br><span class="small">1974 / 1976 ගිවිසුම් — පසුකර යාම තහනම්</span>';
    L.polyline(imbl, { color: '#fff', weight: 7, opacity: 0.8, renderer: canvasR, interactive: false }).addTo(lyrBounds);
    L.polyline(imbl, { color: '#d50000', weight: 4, renderer: canvasR }).bindTooltip(tip, { sticky: true }).addTo(lyrBounds);
    var t = C.IMBL[C.IMBL.length - 1];
    L.circleMarker([t[0], t[1]], { radius: 6, color: '#d50000', weight: 2, fillColor: '#fff', fillOpacity: 1, renderer: canvasR })
      .bindTooltip('<b>ත්‍රි-සන්ධිය (Point T)</b><br><span class="small">ශ්‍රී ලංකා • ඉන්දියාව • මාලදිවයින<br>' + C.fmtDM(t[0], t[1]) + '</span>').addTo(lyrBounds);
    if (!B) return;
    function lines(arr, style, label) {
      arr.forEach(function (l) { L.polyline(l, Object.assign({ renderer: canvasR }, style)).bindTooltip(label, { sticky: true }).addTo(lyrBounds); });
    }
    lines(B.eez200, { color: '#6a1b9a', weight: 2.5, dashArray: '10 6' }, '<b>සුවිශේෂ ආර්ථික කලාප (EEZ) සීමාව — 200 NM</b><br><span class="small">ආසන්න රේඛාව</span>');
    lines(B.cz24, { color: '#2e7d32', weight: 1.5, dashArray: '6 6' }, '<b>ආසන්න කලාප සීමාව — 24 NM</b><br><span class="small">ආසන්න රේඛාව</span>');
    lines(B.ts12, { color: '#1565c0', weight: 1.5, dashArray: '4 4' }, '<b>භෞමික මුහුදු සීමාව — 12 NM</b><br><span class="small">ආසන්න රේඛාව</span>');
    lines([B.histMannar, B.histPalk], { color: '#555', weight: 1.5, dashArray: '2 5' }, '<b>ඓතිහාසික ජල සීමාව</b><br><span class="small">පෝක් සමුද්‍ර සන්ධිය / මන්නාරම් බොක්ක</span>');
  }

  // ---------- ship lanes ----------
  function routeDistNm(lat, lon) {
    var B = window.DMBounds, m = Infinity;
    if (!B || !B.routes) return m;
    Object.keys(B.routes).forEach(function (k) {
      var r = B.routes[k];
      for (var i = 0; i < r.length - 1; i++) m = Math.min(m, C.segDistKm(lat, lon, r[i][0], r[i][1], r[i + 1][0], r[i + 1][1]).d / 1.852);
    });
    return m;
  }
  function shipNote(lat, lon) {
    var ts = C.tssInfo(lat, lon);
    if (ts.part) return '<span class="small" style="color:#ad1457"><b>🚢 දොන්ද්‍ර තුඩුව කප්පල් මාර්ගය (TSS)</b> — නැව් අධිකයි, මෙහි මාළු ඇල්ලීම අනතුරුදායකයි</span>';
    if (ts.nm < 3) return '<span class="small" style="color:#ad1457">🚢 කප්පල් මාර්ගයට (TSS) ' + n1(ts.nm) + ' NM — අවධානයෙන් සිටින්න</span>';
    if (routeDistNm(lat, lon) < 4) return '<span class="small" style="color:#6a1b9a">🚢 නැව් ගමනාගමනය අධික විය හැකි ප්‍රදේශයක් (ආසන්න)</span>';
    return '';
  }
  function drawShips() {
    var B = window.DMBounds;
    if (!B || !B.tss) return;
    var TSS_TEXT = {
      sepA: '<b>වෙන්කිරීමේ කලාපය (Separation zone)</b> — නැව් ගමන් මාර්ග දෙක අතර/වෙරළ පැත්තේ ආරක්ෂිත කලාපය',
      laneW: '<b>⬅ බටහිරට යන නැව් මාර්ගය</b> (Westbound lane, 3 NM)',
      sepB: '<b>වෙන්කිරීමේ කලාපය (Separation zone)</b> — ප්‍රතිවිරුද්ධ දිශාවට යන නැව් වෙන් කරයි',
      laneE: '<b>➡ නැගෙනහිරට යන නැව් මාර්ගය</b> (Eastbound lane, 3 NM)'
    };
    var r = B.routes || {};
    var rl = {
      west: 'අරාබි මුහුද / රතු මුහුද / යුරෝපය දෙසට', east: 'මලක්කා සමුද්‍ර සන්ධිය / සිංගප්පූරුව දෙසට',
      colombo: 'කොළඹ වරාය දෙසට', bengal: 'බෙංගාල බොක්ක / චෙන්නායි / කල්කටා දෙසට',
      offshore: 'TSS ට ~15 NM දකුණින් යන මාර්ගය (බොහෝ විශාල නැව් භාවිතා කරයි)'
    };
    Object.keys(r).forEach(function (k) {
      var tip = '<b>🚢 නැව් ගමන් මාර්ගය (ආසන්න)</b><br><span class="small">' + (rl[k] || '') + '<br>රාත්‍රියේ ලයිට් දල්වා සිටින්න</span>';
      L.polyline(r[k], { color: '#8e24aa', weight: 14, opacity: 0.15, renderer: canvasR, lineCap: 'round' }).bindTooltip(tip, { sticky: true }).addTo(lyrShips);
      L.polyline(r[k], { color: '#8e24aa', weight: 1.5, opacity: 0.8, dashArray: '8 6', renderer: canvasR, interactive: false }).addTo(lyrShips);
    });
    ['laneW', 'laneE', 'sepA', 'sepB'].forEach(function (k) {
      var sep = k.indexOf('sep') === 0;
      L.polygon(B.tss[k], { color: '#ad1457', weight: 1, fillColor: sep ? '#d81b60' : '#f48fb1', fillOpacity: sep ? 0.55 : 0.3, renderer: canvasR })
        .bindTooltip('<b>දොන්ද්‍ර තුඩුව කප්පල් ගමන් මාර්ග (TSS)</b><br>' + TSS_TEXT[k] + '<br><span class="small">IMO 1980 • ලොව කාර්යබහුලම නැව් මාර්ගවලින් එකක්. වෙරළ සහ TSS අතර ප්‍රදේශය “වෙරළබඩ ගමනාගමන කලාපය” (inshore traffic zone) — කුඩා යාත්‍රා සහ ධීවරයන් සඳහා.</span>', { sticky: true })
        .addTo(lyrShips);
    });
    function arrowAt(poly, ch) {
      var la = (poly[0][0] + poly[2][0]) / 2, lo = (poly[0][1] + poly[1][1]) / 2;
      L.marker([la, lo], { interactive: false, icon: L.divIcon({ className: '', html: '<div class="lane-arrow">' + ch + '</div>', iconSize: [30, 16], iconAnchor: [15, 8] }) }).addTo(lyrShips);
    }
    arrowAt(B.tss.laneW, '⬅'); arrowAt(B.tss.laneE, '➡');
  }

  // ---------- fishing zones (PFZ) ----------
  function loadMUR() {
    var q = 'analysed_sst[(last)][(' + C.BOX.latMin + '):10:(' + C.BOX.latMax + ')][(' + C.BOX.lonMin + '):10:(' + C.BOX.lonMax + ')]';
    return fetchJSON(ERDDAP + 'jplMURSST41.json?' + encodeURIComponent(q), 60000).then(function (j) {
      var t = j.table.rows.length ? j.table.rows[0][0] : null;
      return { grid: C.parseErddapGrid(j, 'analysed_sst'), date: t, src: 'MUR' };
    });
  }
  // coarse fallback: model SST from Open-Meteo on a 0.5° grid
  function loadOMSST() {
    var lats = [], lons = [];
    for (var a = C.BOX.latMin; a <= C.BOX.latMax + 1e-9; a += 0.5) for (var b = C.BOX.lonMin; b <= C.BOX.lonMax + 1e-9; b += 0.5) {
      if (!C.isLandApprox(a, b)) { lats.push(a.toFixed(2)); lons.push(b.toFixed(2)); }
    }
    var url = 'https://marine-api.open-meteo.com/v1/marine?latitude=' + lats.join(',') + '&longitude=' + lons.join(',') +
      '&current=sea_surface_temperature&timezone=' + encodeURIComponent(TZ);
    return fetchJSON(url, 45000).then(function (arr) {
      if (!Array.isArray(arr)) arr = [arr];
      var pts = arr.map(function (r, k) { return { lat: +lats[k], lon: +lons[k], val: r.current ? r.current.sea_surface_temperature : null }; });
      return { grid: C.gridFromPoints(pts), date: arr[0] && arr[0].current ? arr[0].current.time : null, src: 'OM' };
    });
  }
  function loadCHL() {
    var ds = 'nesdisVHNnoaaSNPPnoaa20NRTchlaGapfilledDaily';
    function q(desc) {
      var la = desc ? '[(' + C.BOX.latMax + '):(' + C.BOX.latMin + ')]' : '[(' + C.BOX.latMin + '):(' + C.BOX.latMax + ')]';
      return ERDDAP + ds + '.json?' + encodeURIComponent('chlor_a[(last)][(0.0)]' + la + '[(' + C.BOX.lonMin + '):(' + C.BOX.lonMax + ')]');
    }
    function done(j) { return { grid: C.parseErddapGrid(j, 'chlor_a'), date: j.table.rows.length ? j.table.rows[0][0] : null }; }
    return fetchJSON(q(true), 60000).then(done).catch(function () { return fetchJSON(q(false), 60000).then(done); });
  }

  function loadPFZ(force) {
    var cached = sget('pfz3', null);
    if (cached && cached.cells) { S.pfz = cached; drawPFZ(); }
    if (!force && cached && Date.now() - cached.time < PFZ_MAX_AGE) return;
    if (!navigator.onLine && cached) return;
    mapMsg('<span class="spin"></span> චන්ද්‍රිකා දත්ත බාගනිමින්… (විනාඩියක් පමණ ගත විය හැක)');
    var sstP = loadMUR().catch(function () { return loadOMSST(); });
    var chlP = loadCHL().catch(function () { return null; });
    Promise.all([sstP, chlP]).then(function (res) {
      var sst = res[0], chl = res[1];
      var r = C.computePFZ(sst.grid, chl ? chl.grid : null);
      var pack = {
        time: Date.now(), step: r.step, hasChl: r.hasChl, src: sst.src,
        sstDate: sst.date, chlDate: chl ? chl.date : null,
        cells: r.cells.map(function (c) {
          return [c.lat, c.lon, c.score, c.cls, Math.round(c.sst * 100) / 100, isFinite(c.chl) ? Math.round(c.chl * 1000) / 1000 : null];
        })
      };
      S.pfz = pack;
      sset('pfz3', pack);
      mapMsg('');
      drawPFZ();
    }).catch(function () {
      mapMsg(cached ? 'නව චන්ද්‍රිකා දත්ත ලබාගත නොහැකි විය — පැරණි දත්ත පෙන්වයි.' : 'මාළු කලාප දත්ත ලබාගත නොහැකි විය. අන්තර්ජාලය පරීක්ෂා කර ⟳ ඔබන්න.');
      setTimeout(function () { mapMsg(''); }, 8000);
    });
  }

  function drawPFZ() {
    var p = S.pfz;
    lyrPfz.clearLayers(); lyrHot.clearLayers();
    if (!p) return;
    var h = p.step / 2;
    p.cells.forEach(function (c) {
      if (c[3] === 0) return;
      L.rectangle([[c[0] - h, c[1] - h], [c[0] + h, c[1] + h]], {
        renderer: canvasR, stroke: false, fillColor: c[3] === 2 ? '#ff6d00' : '#ffd600', fillOpacity: c[3] === 2 ? 0.6 : 0.4, interactive: false
      }).addTo(lyrPfz);
    });
    var cellsObj = p.cells.map(function (c) { return { lat: c[0], lon: c[1], score: c[2], cls: c[3], sst: c[4], chl: c[5] }; });
    S.hotspots = C.pickHotspots(cellsObj, 10, 25);
    S.hotspots.forEach(function (hs, k) {
      L.marker([hs.lat, hs.lon], {
        icon: L.divIcon({ className: '', html: '<div class="hs-icon" style="width:26px;height:26px">' + (k + 1) + '</div>', iconSize: [26, 26], iconAnchor: [13, 13] })
      }).on('click', function () {
        L.popup().setLatLng([hs.lat, hs.lon]).setContent(popupHtml(hs.lat, hs.lon, 'කලාපය #' + (k + 1))).openOn(map);
      }).addTo(lyrHot);
    });
    updateStamp();
    renderZones();
    renderSrcInfo();
  }

  function shortDate(t) { return t ? String(t).slice(0, 10) : '-'; }
  function updateStamp() {
    var p = S.pfz;
    $('dataStamp').textContent = p ? ('යාවත්කාලීන: ' + fmtDateTime(p.time)) : 'දත්ත නැත';
  }
  function renderSrcInfo() {
    var p = S.pfz; if (!p) return;
    var t = 'මුහුදු උෂ්ණත්ව දත්ත දිනය: ' + shortDate(p.sstDate) + (p.src === 'OM' ? ' (ආකෘති දත්ත — අඩු නිරවද්‍යතාව)' : ' (චන්ද්‍රිකා)') +
      ' • හරිතප්‍රද දත්ත දිනය: ' + (p.hasChl ? shortDate(p.chlDate) : 'ලබාගත නොහැකි විය') +
      '. චන්ද්‍රිකා දත්ත දින කිහිපයක් පැරණි විය හැක; මාළු ගමන් කරන නිසා කලාප දිනෙන් දින වෙනස් වේ.';
    $('srcInfo').textContent = t;
  }

  function renderZones() {
    var el = $('zoneList');
    $('refName').textContent = S.ref ? S.ref.name : '-';
    if (!S.hotspots.length) { el.innerHTML = '<p class="muted">තවම කලාප නැත.</p>'; return; }
    el.innerHTML = S.hotspots.map(function (h, k) {
      var d = S.ref ? C.distKm(S.ref.lat, S.ref.lon, h.lat, h.lon) : NaN;
      var b = S.ref ? C.bearingDeg(S.ref.lat, S.ref.lon, h.lat, h.lon) : NaN;
      var nm = 'කලාපය #' + (k + 1);
      return '<div class="card zone"><div class="num">' + (k + 1) + '</div><div class="body">' +
        '<div><span class="badge">' + h.score + '/100</span></div>' +
        '<div class="coords">' + C.fmtDM(h.lat, h.lon) + '</div>' +
        (S.ref ? '<div>📏 <b>' + n0(d) + ' km</b> (' + n0(d / 1.852) + ' NM) — ' + C.compassSi(b) + ' දෙසට ' + n0(b) + '°</div>' : '') +
        '<div class="small muted">උෂ්ණත්වය ' + n1(h.sst) + '°C' + (h.chl !== null && isFinite(h.chl) ? ' • හරිතප්‍රද ' + h.chl.toFixed(2) + ' mg/m³' : '') + '</div>' +
        '<div class="btns"><button class="btn small" data-act="show" data-name="' + nm + '" data-lat="' + h.lat + '" data-lon="' + h.lon + '">🗺️ සිතියමේ</button>' +
        '<button class="btn small" data-act="wx" data-name="' + nm + '" data-lat="' + h.lat + '" data-lon="' + h.lon + '">🌊 එහි කාලගුණය</button></div>' +
        '</div></div>';
    }).join('');
  }

  // ---------- danger layer ----------
  function loadDanger() {
    var cached = sget('danger', null);
    if (cached && Date.now() - cached.time < WX_MAX_AGE * 3) { S.danger = cached; drawDanger(); return; }
    if (cached) { S.danger = cached; drawDanger(); }
    var la = SEA_PTS.map(function (p) { return p[0]; }).join(','), lo = SEA_PTS.map(function (p) { return p[1]; }).join(',');
    var tz = '&timezone=' + encodeURIComponent(TZ) + '&forecast_days=3';
    var u1 = 'https://api.open-meteo.com/v1/forecast?latitude=' + la + '&longitude=' + lo +
      '&daily=wind_speed_10m_max,wind_gusts_10m_max,weather_code,wind_direction_10m_dominant&wind_speed_unit=kmh' + tz;
    var u2 = 'https://marine-api.open-meteo.com/v1/marine?latitude=' + la + '&longitude=' + lo + '&daily=wave_height_max' + tz;
    mapMsg('<span class="spin"></span> මුහුදු අවදානම ලබාගනිමින්…');
    Promise.all([fetchJSON(u1), fetchJSON(u2)]).then(function (r) {
      var A = Array.isArray(r[0]) ? r[0] : [r[0]], B = Array.isArray(r[1]) ? r[1] : [r[1]];
      var pts = SEA_PTS.map(function (p, k) {
        var a = A[k].daily, b = B[k] ? B[k].daily : null;
        return {
          lat: p[0], lon: p[1], days: a.time.map(function (t, d) {
            return { date: t, wind: a.wind_speed_10m_max[d], gust: a.wind_gusts_10m_max[d], dir: a.wind_direction_10m_dominant[d], code: a.weather_code[d], wave: b ? b.wave_height_max[d] : null };
          })
        };
      });
      S.danger = { time: Date.now(), pts: pts };
      sset('danger', S.danger);
      mapMsg(''); drawDanger();
    }).catch(function () {
      mapMsg('අවදානම් දත්ත ලබාගත නොහැකි විය.'); setTimeout(function () { mapMsg(''); }, 6000);
    });
  }
  function drawDanger() {
    lyrDanger.clearLayers();
    if (!S.danger) return;
    var cols = ['#2e7d32', '#f9a825', '#e53935'];
    S.danger.pts.forEach(function (p) {
      var d = p.days[S.dangerDay]; if (!d) return;
      var lvl = C.safetyLevel({ wind: d.wind, gust: d.gust, wave: d.wave === null ? 0 : d.wave, code: d.code });
      L.circle([p.lat, p.lon], { radius: 35000, color: cols[lvl], weight: 1, fillColor: cols[lvl], fillOpacity: lvl ? 0.35 : 0.15, renderer: canvasR })
        .bindPopup('<b>' + C.SAFETY_TEXT[lvl] + '</b><br>' + dayName(d.date, S.dangerDay) + ' (උපරිම)<br>සුළඟ: ' + n0(d.wind) + ' km/h ' + C.compassSi(d.dir) +
          '<br>සුළං රැළි: ' + n0(d.gust) + ' km/h<br>රළ උස: ' + n1(d.wave) + ' m<br>' + C.weatherTextSi(d.code))
        .addTo(lyrDanger);
    });
  }

  // ---------- weather for a place ----------
  var sel = $('placeSel');
  function fillPlaces(custom) {
    var h = HARBOURS.map(function (x, k) { return '<option value="h' + k + '">⚓ ' + x[0] + '</option>'; }).join('');
    if (custom) h = '<option value="c">📍 ' + esc(custom.name) + '</option>' + h;
    sel.innerHTML = h;
  }
  sel.addEventListener('change', function () {
    var v = sel.value;
    if (v.charAt(0) === 'h') { var x = HARBOURS[+v.slice(1)]; setPlace({ name: x[0], lat: x[1], lon: x[2] }); }
  });
  $('wxGpsBtn').addEventListener('click', function () {
    $('wxBody').innerHTML = '<p><span class="spin"></span> ස්ථානය සොයමින්…</p>';
    getPos().then(function (p) {
      S.me = p;
      setPlace({ name: 'මා සිටින තැන', lat: +p.lat.toFixed(4), lon: +p.lon.toFixed(4), custom: true });
    }).catch(function (e) { $('wxBody').innerHTML = '<div class="note err">' + gpsErr(e) + '</div>'; });
  });

  function setPlace(pl) {
    S.ref = pl;
    sset('place', pl);
    fillPlaces(pl.custom ? pl : null);
    if (!pl.custom) {
      for (var k = 0; k < HARBOURS.length; k++) if (HARBOURS[k][0] === pl.name) { sel.value = 'h' + k; break; }
    } else sel.value = 'c';
    renderZones();
    loadWx(pl);
  }

  function loadWx(pl) {
    var ck = 'wx_' + pl.lat.toFixed(2) + '_' + pl.lon.toFixed(2);
    var cached = sget('wxlast', null);
    var useCache = cached && cached.key === ck;
    if (useCache) renderWx(pl, cached);
    if (useCache && Date.now() - cached.time < WX_MAX_AGE) return;
    if (!useCache) $('wxBody').innerHTML = '<p><span class="spin"></span> කාලගුණය ලබාගනිමින්…</p>';
    var tz = '&timezone=' + encodeURIComponent(TZ) + '&forecast_days=4';
    var u1 = 'https://api.open-meteo.com/v1/forecast?latitude=' + pl.lat + '&longitude=' + pl.lon +
      '&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation_probability,precipitation,weather_code,visibility' +
      '&daily=sunrise,sunset' + '&wind_speed_unit=kmh' + tz;
    var u2 = 'https://marine-api.open-meteo.com/v1/marine?latitude=' + pl.lat + '&longitude=' + pl.lon +
      '&hourly=wave_height,wave_direction,wave_period,swell_wave_height,ocean_current_velocity,ocean_current_direction,sea_surface_temperature' + tz;
    Promise.all([fetchJSON(u1), fetchJSON(u2).catch(function () { return null; })]).then(function (r) {
      var data = { key: ck, time: Date.now(), f: r[0], m: r[1] };
      sset('wxlast', data);
      if (S.ref === pl) renderWx(pl, data);
    }).catch(function () {
      if (!useCache) $('wxBody').innerHTML = '<div class="note err">කාලගුණ දත්ත ලබාගත නොහැකි විය. අන්තර්ජාලය පරීක්ෂා කරන්න.</div>';
    });
  }

  function hourRows(data) {
    var f = data.f.hourly, m = data.m ? data.m.hourly : null;
    var mi = {};
    if (m) m.time.forEach(function (t, k) { mi[t] = k; });
    return f.time.map(function (t, k) {
      var j = mi[t];
      function mv(name) { return (m && j !== undefined && m[name] && m[name][j] !== undefined) ? m[name][j] : null; }
      function fv(name) { return (f[name] && f[name][k] !== undefined) ? f[name][k] : null; }
      var row = {
        t: t, wind: fv('wind_speed_10m'), gust: fv('wind_gusts_10m'), dir: fv('wind_direction_10m'),
        rain: fv('precipitation_probability'), mm: fv('precipitation'), code: fv('weather_code'), vis: fv('visibility'),
        wave: mv('wave_height'), wdir: mv('wave_direction'), per: mv('wave_period'), swell: mv('swell_wave_height'),
        cur: mv('ocean_current_velocity'), cdir: mv('ocean_current_direction'), sst: mv('sea_surface_temperature')
      };
      row.lvl = C.safetyLevel({ wind: row.wind, gust: row.gust, wave: row.wave === null ? 0 : row.wave, code: row.code });
      return row;
    });
  }

  function renderWx(pl, data) {
    if (!data || !data.f || !data.f.hourly) return;
    var rows = hourRows(data);
    var now = colomboNowStr().slice(0, 13);
    var i0 = 0;
    for (var k = 0; k < rows.length; k++) if (rows[k].t.slice(0, 13) >= now) { i0 = k; break; }
    var cur = rows[i0];
    var next12 = rows.slice(i0, i0 + 12);
    var worst = next12.reduce(function (a, r) { return Math.max(a, r.lvl); }, 0);
    var moon = C.moonInfo(new Date());
    var html = '';
    html += '<div class="banner s' + worst + '"><div class="big">' + C.SAFETY_TEXT[worst] + '</div>' +
      '<div class="small">ඉදිරි පැය 12 සඳහා • ' + esc(pl.name) + '</div></div>';
    if (!data.m) html += '<div class="note warn">රළ දත්ත ලබාගත නොහැකි විය — සුළඟ පමණක් සලකා ඇත.</div>';
    html += '<div class="card"><div class="grid2">' +
      kv('සුළඟ', n0(cur.wind) + ' km/h', arrow(cur.dir) + ' ' + C.compassSi(cur.dir) + ' සිට • ' + n0(cur.wind / 1.852) + ' knots') +
      kv('සුළං රැළි (gust)', n0(cur.gust) + ' km/h', '') +
      kv('රළ උස', n1(cur.wave) + ' m', (cur.wdir !== null ? arrow(cur.wdir) + ' ' + C.compassSi(cur.wdir) + ' සිට' : '') + (cur.per ? ' • ' + n0(cur.per) + 's' : '')) +
      kv('වැසි ඉඩ', n0(cur.rain) + '%', C.weatherTextSi(cur.code)) +
      kv('මුහුදු උෂ්ණත්වය', n1(cur.sst) + '°C', '') +
      kv('සාගර ධාරාව', n1(cur.cur) + ' km/h', cur.cdir !== null ? C.compassSi(cur.cdir) + ' දෙසට' : '') +
      kv('දෘශ්‍යතාව', isFinite(cur.vis) ? n1(cur.vis / 1000) + ' km' : '-', '') +
      kv('සඳ', moon.name, 'ආලෝකය ' + moon.illum + '%') +
      '</div><p class="small muted" style="margin:8px 0 0">' + C.fmtDM(pl.lat, pl.lon) + '</p></div>';

    // daily
    var days = {};
    rows.forEach(function (r) { var d = r.t.slice(0, 10); (days[d] = days[d] || []).push(r); });
    var dk = Object.keys(days).slice(0, 4);
    var sun = data.f.daily || {};
    html += '<h3>දින 4 පුරෝකථනය</h3><div class="days">' + dk.map(function (d, idx) {
      var rs = days[d];
      var mx = function (f) { return rs.reduce(function (a, r) { return Math.max(a, isFinite(r[f]) && r[f] !== null ? r[f] : -1); }, -1); };
      var lvl = rs.reduce(function (a, r) { return Math.max(a, r.lvl); }, 0);
      var good = rs.filter(function (r) { return r.lvl === 0; }).length;
      var si = sun.time ? sun.time.indexOf(d) : -1;
      return '<div class="card day s' + lvl + '"><h4>' + dayName(d, idx) + ' <span class="small muted">' + d.slice(5) + '</span></h4>' +
        '<div><span class="dot s' + lvl + '"></span>' + C.SAFETY_TEXT[lvl] + '</div>' +
        '<div class="small">සුළඟ උපරිම ' + n0(mx('wind')) + ' • රැළි ' + n0(mx('gust')) + ' km/h</div>' +
        '<div class="small">රළ උපරිම ' + (mx('wave') >= 0 ? n1(mx('wave')) + ' m' : '-') + ' • වැසි ' + n0(mx('rain')) + '%</div>' +
        '<div class="small muted">සුදුසු පැය: ' + good + '/24</div>' +
        (si >= 0 ? '<div class="small muted">🌅 ' + sun.sunrise[si].slice(11) + ' • 🌇 ' + sun.sunset[si].slice(11) + '</div>' : '') +
        '</div>';
    }).join('') + '</div>';

    // hourly table, next 36 h every 3 h
    var hr = rows.slice(i0, i0 + 36).filter(function (r, k) { return k % 3 === 0; });
    html += '<h3>පැය අනුව</h3><table class="tbl"><tr><th>වේලාව</th><th>සුළඟ</th><th>රැළි</th><th>රළ m</th><th>වැසි</th><th></th></tr>' +
      hr.map(function (r) {
        return '<tr><td>' + (r.t.slice(0, 10) !== rows[i0].t.slice(0, 10) ? '<span class="small muted">' + r.t.slice(5, 10) + '</span> ' : '') + r.t.slice(11, 16) + '</td>' +
          '<td>' + arrow(r.dir) + ' ' + n0(r.wind) + '</td><td>' + n0(r.gust) + '</td><td>' + n1(r.wave) + '</td><td>' + n0(r.rain) + '%</td>' +
          '<td><span class="dot s' + r.lvl + '"></span></td></tr>';
      }).join('') + '</table>';
    html += '<p class="small muted">km/h • ඊතලය පෙන්වන්නේ සුළඟ හමන දිශාවයි • යාවත්කාලීන: ' + fmtDateTime(data.time) + '</p>';
    html += '<div class="note warn">⚠️ නිල කාලගුණ අනතුරු ඇඟවීමක් ඇත්නම් එය අනුගමනය කරන්න. ඇස්තමේන්තු ආකෘති දත්ත මත පදනම් වේ.</div>';
    $('wxBody').innerHTML = html;
  }
  function kv(k, v, sub) { return '<div class="kv"><div class="k">' + k + '</div><div class="v">' + v + '</div>' + (sub ? '<div class="small">' + sub + '</div>' : '') + '</div>'; }

  // ---------- my spots ----------
  function addMark(lat, lon, note, how) {
    S.marks.unshift({ id: Date.now(), lat: lat, lon: lon, note: note || '', t: Date.now(), how: how || '' });
    sset('marks', S.marks);
    renderMarks();
  }
  $('markForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = $('markMsg');
    msg.innerHTML = '<span class="spin"></span> GPS ස්ථානය ලබාගනිමින්…';
    getPos().then(function (p) {
      addMark(+p.lat.toFixed(5), +p.lon.toFixed(5), $('markNote').value.trim(), 'GPS ±' + Math.round(p.acc) + 'm');
      $('markNote').value = '';
      msg.textContent = 'සටහන් කළා ✔';
    }).catch(function (err) { msg.textContent = gpsErr(err); });
  });
  function renderMarks() {
    lyrMarks.clearLayers();
    S.marks.forEach(function (m) {
      L.marker([m.lat, m.lon], { icon: L.divIcon({ className: '', html: '<div class="mark-icon">📌</div>', iconSize: [22, 22], iconAnchor: [6, 22] }) })
        .bindPopup('<b>' + esc(m.note || 'මගේ ස්ථානය') + '</b><br><span class="small">' + C.fmtDM(m.lat, m.lon) + '<br>' + fmtDateTime(m.t) + '</span>')
        .addTo(lyrMarks);
    });
    var el = $('markList');
    if (!S.marks.length) { el.innerHTML = '<p class="muted small">තවම සටහන් නැත. සිතියමේ මුහුද මත ඔබා “සටහන් කරන්න” ද භාවිතා කළ හැක.</p>'; return; }
    el.innerHTML = S.marks.map(function (m) {
      var d = S.ref ? C.distKm(S.ref.lat, S.ref.lon, m.lat, m.lon) : NaN;
      return '<div class="card"><b>📌 ' + esc(m.note || 'මගේ ස්ථානය') + '</b>' +
        '<div class="coords" style="font-family:ui-monospace,monospace">' + C.fmtDM(m.lat, m.lon) + '</div>' +
        '<div class="small muted">' + fmtDateTime(m.t) + (m.how ? ' • ' + esc(m.how) : '') + (S.ref ? ' • ' + esc(S.ref.name) + ' සිට ' + n0(d) + ' km' : '') + '</div>' +
        '<div class="btns"><button class="btn small" data-act="show" data-name="' + esc(m.note || 'මගේ ස්ථානය') + '" data-lat="' + m.lat + '" data-lon="' + m.lon + '">🗺️ සිතියමේ</button>' +
        '<button class="btn small" data-act="wx" data-name="' + esc(m.note || 'මගේ ස්ථානය') + '" data-lat="' + m.lat + '" data-lon="' + m.lon + '">🌊 කාලගුණය</button>' +
        '<button class="btn small danger" data-act="delmark" data-id="' + m.id + '">මකන්න</button></div></div>';
    }).join('');
  }

  // ---------- refresh / online / install ----------
  $('refreshBtn').addEventListener('click', function () {
    loadPFZ(true);
    if (S.ref) { var c = sget('wxlast', null); if (c) { c.time = 0; sset('wxlast', c); } loadWx(S.ref); }
    if ($('lyrDanger').checked) { var d = sget('danger', null); if (d) { d.time = 0; sset('danger', d); } loadDanger(); }
  });
  function onlineUI() { $('offlineBar').classList.toggle('hidden', navigator.onLine); }
  window.addEventListener('online', onlineUI); window.addEventListener('offline', onlineUI); onlineUI();

  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredPrompt = e; $('installBtn').classList.remove('hidden'); });
  $('installBtn').addEventListener('click', function () {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function () { deferredPrompt = null; $('installBtn').classList.add('hidden'); });
  });
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function () {}); });
  }

  // ---------- start ----------
  try { localStorage.removeItem(KEY + 'pfz'); localStorage.removeItem(KEY + 'pfz2'); } catch (e) {}   // old caches
  var place = sget('place', null);
  if (place && isFinite(place.lat)) setPlace(place);
  else setPlace({ name: HARBOURS[0][0], lat: HARBOURS[0][1], lon: HARBOURS[0][2] });
  renderMarks();
  loadPFZ(false);
  var lastTab = sget('tab', 'map');
  if (lastTab && $('tab-' + lastTab)) showTab(lastTab);
})();
