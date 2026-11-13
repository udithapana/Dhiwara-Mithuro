/* ධීවර මිතුරා — මඟ පෙන්වීම, මාර්ග, SOS, ඉන්ධන, දැනුවත් කිරීම් */
(function () {
  'use strict';
  var A = window.DMApp, C = window.DMCalc, I = window.DMI18N, t = I.t;
  if (!A) return;
  var L = window.L, map = A.map, S = A.S, esc = A.esc, n0 = A.n0, n1 = A.n1, num = A.num;
  function $(id) { return document.getElementById(id); }
  function nowStr() { return A.fmtDateTime(Date.now()); }
  function mapsUrl(lat, lon) { return 'https://maps.google.com/?q=' + lat.toFixed(5) + ',' + lon.toFixed(5); }
  function hm(hours) {
    if (!isFinite(hours)) return '-';
    var m = Math.round(hours * 60);
    return t('hm', { h: Math.floor(m / 60), m: m % 60 });
  }
  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // ===================== compass dial =====================
  (function drawDial() {
    var g = $('dial'); if (!g) return;
    var ns = 'http://www.w3.org/2000/svg', s = '';
    for (var d = 0; d < 360; d += 10) {
      var long = d % 30 === 0, r1 = long ? 86 : 92, rad = (d - 90) * Math.PI / 180;
      s += '<line x1="' + (110 + r1 * Math.cos(rad)).toFixed(1) + '" y1="' + (110 + r1 * Math.sin(rad)).toFixed(1) +
        '" x2="' + (110 + 100 * Math.cos(rad)).toFixed(1) + '" y2="' + (110 + 100 * Math.sin(rad)).toFixed(1) +
        '" stroke="#fff" stroke-width="' + (long ? 2 : 1) + '"/>';
    }
    [['N', 0, '#ff5252'], ['E', 90, '#fff'], ['S', 180, '#fff'], ['W', 270, '#fff']].forEach(function (p) {
      var rad = (p[1] - 90) * Math.PI / 180;
      s += '<text x="' + (110 + 70 * Math.cos(rad)).toFixed(1) + '" y="' + (110 + 70 * Math.sin(rad) + 7).toFixed(1) +
        '" text-anchor="middle" font-size="20" font-weight="700" fill="' + p[2] + '" transform="rotate(' + p[1] + ' ' +
        (110 + 70 * Math.cos(rad)).toFixed(1) + ' ' + (110 + 70 * Math.sin(rad)).toFixed(1) + ')">' + p[0] + '</text>';
    });
    // target arrow (rotated to the bearing inside the dial)
    s += '<g id="tgtArrow" style="display:none"><polygon points="110,30 100,58 110,52 120,58" fill="#00e676"/><line x1="110" y1="52" x2="110" y2="110" stroke="#00e676" stroke-width="3"/></g>';
    g.innerHTML = s;
  })();

  // ===================== navigation state =====================
  var N = { on: false, watch: null, compass: null, compassT: 0, course: null, speed: null, pos: null, wake: null, alertState: 'ok', target: null };
  var R = { on: false, pts: [], t0: 0, km: 0, line: null };
  var lyrRoutes = L.layerGroup().addTo(map);
  var lyrLive = L.layerGroup().addTo(map);
  var marksChk = $('lyrMarks');
  if (marksChk) marksChk.addEventListener('change', function () {
    if (this.checked) { lyrRoutes.addTo(map); } else { map.removeLayer(lyrRoutes); }
  });

  function onOrientation(e) {
    var h = null;
    if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
    else if (e.absolute === true && typeof e.alpha === 'number') h = 360 - e.alpha;
    if (h === null) return;
    var so = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (window.orientation || 0);
    N.compass = ((h + so) % 360 + 360) % 360;
    N.compassT = Date.now();
    render();
  }
  function startCompass() {
    try {
      if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(function (s) {
          if (s === 'granted') window.addEventListener('deviceorientation', onOrientation, true);
        }).catch(function () {});
      } else {
        window.addEventListener('deviceorientationabsolute', onOrientation, true);
        window.addEventListener('deviceorientation', onOrientation, true);
      }
    } catch (e) {}
  }
  function stopCompass() {
    window.removeEventListener('deviceorientationabsolute', onOrientation, true);
    window.removeEventListener('deviceorientation', onOrientation, true);
  }
  function wakeOn() {
    try { if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then(function (w) { N.wake = w; }).catch(function () {}); } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () { if (N.on && document.visibilityState === 'visible') wakeOn(); });

  function onFix(p) {
    var c = p.coords;
    N.pos = { lat: c.latitude, lon: c.longitude, acc: c.accuracy, t: Date.now() };
    S.me = { lat: c.latitude, lon: c.longitude, acc: c.accuracy };
    if (typeof c.speed === 'number' && c.speed >= 0) N.speed = c.speed;
    if (typeof c.heading === 'number' && !isNaN(c.heading) && N.speed > 0.8) N.course = c.heading;
    // live marker
    A.lyrMe.clearLayers();
    L.circleMarker([c.latitude, c.longitude], { radius: 7, color: '#fff', weight: 2, fillColor: '#1565c0', fillOpacity: 1 }).addTo(A.lyrMe);
    // route recording
    if (R.on && c.accuracy <= 100) {
      var last = R.pts[R.pts.length - 1];
      var d = last ? C.distKm(last[0], last[1], c.latitude, c.longitude) : 1;
      if (d >= 0.03) {
        if (last) R.km += d;
        R.pts.push([+c.latitude.toFixed(5), +c.longitude.toFixed(5)]);
        lyrLive.clearLayers();
        if (R.pts.length > 1) L.polyline(R.pts, { color: '#e65100', weight: 3 }).addTo(lyrLive);
      }
      renderRec();
    }
    checkBounds(c.latitude, c.longitude);
    $('navNote').textContent = N.noCmp ? t('noCompass') : '';
    render();
  }
  function onFixErr(e) { $('navNote').textContent = A.gpsErr(e); }

  function startNav() {
    if (N.on) return;
    if (!navigator.geolocation) { $('navNote').textContent = t('noGps'); return; }
    N.on = true;
    N.watch = navigator.geolocation.watchPosition(onFix, onFixErr, { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 });
    startCompass(); wakeOn();
    $('navBtn').textContent = t('navStop');
    N.noCmp = false;
    setTimeout(function () { if (N.on && !N.compassT) { N.noCmp = true; $('navNote').textContent = t('noCompass'); } }, 4000);
    render();
  }
  function stopNav() {
    if (R.on) stopRec();
    N.on = false;
    if (N.watch !== null) navigator.geolocation.clearWatch(N.watch);
    N.watch = null; stopCompass();
    try { if (N.wake) N.wake.release(); } catch (e) {}
    N.wake = null;
    $('navBtn').textContent = t('navStart');
    render();
  }
  $('navBtn').addEventListener('click', function () { if (N.on) stopNav(); else startNav(); });

  // live boundary / shipping lane alerts
  function checkBounds(lat, lon) {
    var im = C.imblInfo(lat, lon), ts = C.tssInfo(lat, lon), st = 'ok', html = '';
    var nmI = im.km / 1.852;
    if (!im.slSide) { st = 'india'; html = t('crossedImbl'); }
    else if (nmI < 5) { st = 'nearImbl'; html = t('nearImbl', { nm: n1(nmI) }); }
    else if (ts.part) { st = 'tss'; html = t('inTss'); }
    else if (ts.nm < 2) { st = 'nearTss'; html = t('nearTss', { nm: n1(ts.nm) }); }
    var box = $('navAlert');
    if (st === 'ok') box.classList.add('hidden'); else { box.innerHTML = html; box.classList.remove('hidden'); }
    if (st !== 'ok' && st !== N.alertState) { A.buzz(); A.mapMsg(html); }
    N.alertState = st;
  }

  function headingNow() {
    if (N.compass !== null && Date.now() - N.compassT < 3000) return N.compass;
    if (N.course !== null && N.speed > 0.8) return N.course;
    return null;
  }

  function kv(k, v) { return '<div class="kv"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>'; }
  function render() {
    var H = headingNow();
    $('dial').setAttribute('transform', 'rotate(' + (H === null ? 0 : -H).toFixed(1) + ' 110 110)');
    $('hdgBig').textContent = H === null ? '—' : (n0(H) + '° ' + C.compassSi(H));
    var p = N.pos, kn = N.speed !== null ? N.speed * 1.943844 : null;
    $('navReadout').innerHTML =
      kv(t('heading'), H === null ? '—' : n0(H) + '°') +
      kv(t('speed'), kn === null ? '—' : n1(kn) + ' kn <span class="small">(' + n1(N.speed * 3.6) + ' km/h)</span>') +
      kv(t('position'), p ? '<span style="font-size:14px">' + C.fmtDM(p.lat, p.lon) + '</span>' : (N.on ? t('waitGps') : '—')) +
      kv(t('accuracy'), p ? '±' + n0(p.acc) + ' m' : '—');
    if (!N.on) $('navNote').textContent = t('calib');
    renderTarget(H);
  }

  // ===================== targets =====================
  function targetList() {
    var out = [];
    A.HARBOURS.forEach(function (h, k) { out.push({ v: 'h:' + k, g: 'grpHarb', name: I.harbour(k), lat: h[1], lon: h[2] }); });
    (S.marks || []).forEach(function (m) { out.push({ v: 'm:' + m.id, g: 'grpSpots', name: m.note || t('mySpot'), lat: m.lat, lon: m.lon }); });
    (S.hotspots || []).forEach(function (z, k) { out.push({ v: 'z:' + k, g: 'grpZones', name: t('zoneN', { n: k + 1 }), lat: z.lat, lon: z.lon }); });
    loadRoutes().forEach(function (r) { if (r.pts && r.pts.length) out.push({ v: 'r:' + r.id, g: 'grpRoutes', name: r.name, lat: r.pts[0][0], lon: r.pts[0][1] }); });
    return out;
  }
  function findTarget(v) {
    var l = targetList();
    for (var i = 0; i < l.length; i++) if (l[i].v === v) return l[i];
    return null;
  }
  function fillSelect(sel, extraMyPos) {
    var cur = sel.value, groups = {}, order = ['grpHarb', 'grpSpots', 'grpZones', 'grpRoutes'];
    targetList().forEach(function (o) { (groups[o.g] = groups[o.g] || []).push(o); });
    var h = '<option value="">' + t('targetNone') + '</option>';
    if (extraMyPos) h += '<option value="me">' + t('fMyPos') + '</option>';
    order.forEach(function (g) {
      if (!groups[g]) return;
      h += '<optgroup label="' + esc(t(g)) + '">' + groups[g].map(function (o) {
        return '<option value="' + o.v + '">' + esc(o.name) + '</option>';
      }).join('') + '</optgroup>';
    });
    sel.innerHTML = h;
    sel.value = cur;
    if (sel.value !== cur) sel.value = '';
  }
  function refreshTargets() {
    fillSelect($('tgtSel'), false);
    var saved = A.sget('navTarget', '');
    if (!$('tgtSel').value && saved) { $('tgtSel').value = saved; }
    N.target = findTarget($('tgtSel').value);
    fillSelect($('fFrom'), true); fillSelect($('fTo'), true);
    renderTarget(headingNow());
  }
  $('tgtSel').addEventListener('change', function () {
    A.sset('navTarget', this.value);
    N.target = findTarget(this.value);
    render();
  });
  $('homeBtn').addEventListener('click', function () {
    var ref = S.ref, v = (ref && ref.hi !== undefined && ref.hi !== null) ? 'h:' + ref.hi : 'h:0';
    if (N.pos) {   // nearest harbour if the selected place is not a harbour
      if (!(ref && ref.hi !== undefined && ref.hi !== null)) {
        var best = 0, bd = Infinity;
        A.HARBOURS.forEach(function (h, k) { var d = C.distKm(N.pos.lat, N.pos.lon, h[1], h[2]); if (d < bd) { bd = d; best = k; } });
        v = 'h:' + best;
      }
    }
    $('tgtSel').value = v; A.sset('navTarget', v);
    N.target = findTarget(v);
    if (!N.on) startNav();
    render();
  });
  function setTarget(v) {
    refreshTargets();
    $('tgtSel').value = v; A.sset('navTarget', v); N.target = findTarget(v);
    A.showTab('marks');
    if (!N.on) startNav();
    render();
  }

  function renderTarget(H) {
    var el = $('tgtInfo'), arrow = document.getElementById('tgtArrow');
    var tg = N.target;
    if (!tg) { el.innerHTML = ''; el.style.display = 'none'; if (arrow) arrow.style.display = 'none'; return; }
    el.style.display = '';
    if (!N.pos) {
      el.innerHTML = '<b>' + esc(tg.name) + '</b><br><span class="small">' + C.fmtDM(tg.lat, tg.lon) + '</span><br>' + (N.on ? t('waitGps') : '');
      if (arrow) arrow.style.display = 'none';
      return;
    }
    var d = C.distKm(N.pos.lat, N.pos.lon, tg.lat, tg.lon), nm = d / 1.852;
    var b = C.bearingDeg(N.pos.lat, N.pos.lon, tg.lat, tg.lon);
    if (arrow) { arrow.style.display = ''; arrow.setAttribute('transform', 'rotate(' + b.toFixed(1) + ' 110 110)'); }
    var turn = '';
    if (nm < 0.1) turn = t('arrived');
    else if (H !== null) {
      var rel = ((b - H + 540) % 360) - 180;
      turn = Math.abs(rel) < 12 ? t('straight') : (rel < 0 ? t('turnL', { d: n0(-rel) }) : t('turnR', { d: n0(rel) }));
    }
    var kn = N.speed !== null ? N.speed * 1.943844 : 0;
    el.innerHTML = '<b>' + esc(tg.name) + '</b> <span class="small muted">' + C.fmtDM(tg.lat, tg.lon) + '</span>' +
      (turn ? '<div class="turn">' + turn + '</div>' : '') +
      '<div>' + t('dist') + ': <b>' + n1(nm) + ' NM</b> (' + n1(d) + ' km) • ' + t('bearing') + ': <b>' + n0(b) + '° ' + C.compassSi(b) + '</b></div>' +
      (kn > 1 ? '<div>' + t('eta') + ': <b>' + hm(nm / kn) + '</b></div>' : '');
  }

  // ===================== share location =====================
  function smsHref(nums, body) {
    var list = nums.join(',');
    if (isIOS) return 'sms:' + (nums.length > 1 ? '/open?addresses=' + list + '&' : list + '&') + 'body=' + encodeURIComponent(body);
    return 'sms:' + list + '?body=' + encodeURIComponent(body);
  }
  function shareButtons(msg, nums) {
    var h = '<div class="msg-box">' + esc(msg) + '</div><div class="btns">';
    if (nums && nums.length) h += '<a class="btn small" href="' + smsHref(nums, msg) + '">' + t('sosSms') + '</a>';
    else h += '<a class="btn small" href="' + smsHref([], msg) + '">SMS</a>';
    h += '<a class="btn small" href="https://wa.me/?text=' + encodeURIComponent(msg) + '" target="_blank" rel="noopener">WhatsApp</a>';
    if (navigator.share) h += '<button class="btn small" type="button" data-share="1">' + t('sosShare') + '</button>';
    h += '<button class="btn small" type="button" data-copy="1">' + t('sosCopy') + '</button></div>';
    return h;
  }
  function wireShare(box, msg) {
    var s = box.querySelector('[data-share]'), c = box.querySelector('[data-copy]');
    if (s) s.addEventListener('click', function () { navigator.share({ text: msg }).catch(function () {}); });
    if (c) c.addEventListener('click', function () {
      try { navigator.clipboard.writeText(msg).then(function () { c.textContent = t('copied'); }); } catch (e) {}
    });
  }
  function freshPos() {
    if (N.pos && Date.now() - N.pos.t < 60000) return Promise.resolve({ pos: N.pos, old: false });
    return A.getPos().then(function (p) { S.me = p; return { pos: p, old: false }; })
      .catch(function () { return S.me ? { pos: S.me, old: true } : { pos: null, old: false }; });
  }
  $('shareBtn').addEventListener('click', function () {
    var out = $('shareOut');
    out.innerHTML = '<span class="spin"></span> ' + t('locating');
    freshPos().then(function (r) {
      if (!r.pos) { out.innerHTML = '<div class="note err">' + t('gpsFail') + '</div>'; return; }
      var msg = t('shareMsg', { c: C.fmtDM(r.pos.lat, r.pos.lon), u: mapsUrl(r.pos.lat, r.pos.lon), tm: nowStr() });
      out.innerHTML = shareButtons(msg, contactNums());
      wireShare(out, msg);
    });
  });

  // ===================== routes =====================
  function loadRoutes() { return A.sget('routes', []); }
  function saveRoutes(list) { return A.sset('routes', list); }
  function renderRec() {
    var el = $('recStatus');
    if (!R.on) { el.textContent = ''; return; }
    el.textContent = t('recStatus', { km: n1(R.km), n: R.pts.length, tm: hm((Date.now() - R.t0) / 3600000) });
  }
  function startRec() {
    R.on = true; R.pts = []; R.km = 0; R.t0 = Date.now();
    $('recBtn').textContent = t('recStop');
    if (!N.on) startNav();
    if (N.pos) R.pts.push([+N.pos.lat.toFixed(5), +N.pos.lon.toFixed(5)]);
    renderRec();
  }
  function stopRec() {
    R.on = false;
    $('recBtn').textContent = t('recStart');
    lyrLive.clearLayers();
    var el = $('recStatus');
    if (R.pts.length < 2 || R.km < 0.05) { el.textContent = t('tooShort'); return; }
    var nm = $('routeName').value.trim() || t('routeDefault', { d: A.fmtDateTime(R.t0) });
    var list = loadRoutes();
    list.unshift({ id: Date.now(), name: nm, t0: R.t0, t1: Date.now(), km: Math.round(R.km * 100) / 100, pts: R.pts });
    if (!saveRoutes(list)) { el.textContent = t('storageFull'); return; }
    $('routeName').value = '';
    el.textContent = t('routeSaved');
    renderRoutes(); refreshTargets();
  }
  $('recBtn').addEventListener('click', function () { if (R.on) stopRec(); else startRec(); });

  function renderRoutes() {
    var list = loadRoutes();
    lyrRoutes.clearLayers();
    list.forEach(function (r) {
      if (r.pts && r.pts.length > 1) L.polyline(r.pts, { color: '#1565c0', weight: 2.5, dashArray: '6 5', renderer: A.canvasR })
        .bindTooltip(esc(r.name) + ' • ' + n1(r.km) + ' km', { sticky: true }).addTo(lyrRoutes);
    });
    var el = $('routeList');
    if (!list.length) { el.innerHTML = '<p class="small muted">' + t('noRoutes') + '</p>'; return; }
    el.innerHTML = list.map(function (r) {
      return '<div class="route-row"><b>🛤️ ' + esc(r.name) + '</b><div class="small muted">' + A.fmtDateTime(r.t0) + ' • ' + n1(r.km) + ' km (' +
        n1(r.km / 1.852) + ' NM) • ' + hm((r.t1 - r.t0) / 3600000) + '</div>' +
        '<div class="btns"><button class="btn small" type="button" data-rt="map" data-id="' + r.id + '">' + t('btnMap') + '</button>' +
        '<button class="btn small" type="button" data-rt="back" data-id="' + r.id + '">' + t('followBack') + '</button>' +
        '<button class="btn small danger" type="button" data-rt="del" data-id="' + r.id + '">' + t('btnDel') + '</button></div></div>';
    }).join('');
  }
  $('routeList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-rt]'); if (!b) return;
    var id = b.getAttribute('data-id'), act = b.getAttribute('data-rt');
    var list = loadRoutes(), r = list.filter(function (x) { return String(x.id) === id; })[0];
    if (!r) return;
    if (act === 'map') {
      A.showTab('map');
      setTimeout(function () { try { map.fitBounds(L.latLngBounds(r.pts), { padding: [30, 30] }); } catch (err) {} }, 80);
    } else if (act === 'back') setTarget('r:' + r.id);
    else if (act === 'del') {
      if (b.getAttribute('data-sure') !== '1') { b.setAttribute('data-sure', '1'); b.textContent = t('sureDel'); return; }
      saveRoutes(list.filter(function (x) { return String(x.id) !== id; }));
      renderRoutes(); refreshTargets();
    }
  });

  // ===================== SOS =====================
  var HOTLINES = [
    { n: '106', tel: '106', k: 'hl106' }, { n: '105', tel: '105', k: 'hl105' },
    { n: '011 242 1151 / 011 719 0000', tel: '+94112421151', k: 'hlNavy' },
    { n: '119', tel: '119', k: 'hl119' }, { n: '1990', tel: '1990', k: 'hl1990' }, { n: '117', tel: '117', k: 'hl117' },
    { n: '011 432 3389', tel: '+94114323389', k: 'hlFuel' }
  ];
  $('hotlines').innerHTML = HOTLINES.map(function (h) {
    return '<div class="call-row"><span class="small">' + t(h.k) + '<br><b>' + h.n + '</b></span><a class="btn small" href="tel:' + h.tel + '">📞 ' + h.n.split(' / ')[0] + '</a></div>';
  }).join('');

  function loadContacts() { return A.sget('contacts', []); }
  function contactNums() { return loadContacts().map(function (c) { return c.phone; }).filter(Boolean); }
  function renderContacts() {
    var list = loadContacts(), rows = '';
    for (var i = 0; i < 3; i++) {
      var c = list[i] || { name: '', phone: '' };
      rows += '<div class="contact-row"><input type="text" maxlength="40" data-c="name" placeholder="' + esc(t('cName')) + '" value="' + esc(c.name) + '">' +
        '<input type="tel" maxlength="20" data-c="phone" placeholder="' + esc(t('cPhone')) + '" value="' + esc(c.phone) + '"></div>';
    }
    $('contactsForm').innerHTML = (list.length ? '' : '<p class="small muted">' + t('noContacts') + '</p>') + rows +
      '<button class="btn" type="submit">' + t('cSave') + '</button> <span id="cMsg" class="small"></span>';
  }
  $('contactsForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var rows = this.querySelectorAll('.contact-row'), out = [];
    rows.forEach(function (r) {
      var name = r.querySelector('[data-c=name]').value.trim(), phone = r.querySelector('[data-c=phone]').value.replace(/[^\d+]/g, '');
      if (phone) out.push({ name: name, phone: phone });
    });
    A.sset('contacts', out);
    renderContacts();
    var m = $('cMsg'); if (m) m.textContent = t('saved');
  });

  function doSOS() {
    A.showTab('tools');
    var out = $('sosOut');
    out.innerHTML = '<p><span class="spin"></span> ' + t('locating') + '</p>';
    $('sosCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    A.buzz();
    freshPos().then(function (r) {
      var msg, who = whoText();
      if (r.pos) msg = t('sosMsg', { who: who, c: C.fmtDM(r.pos.lat, r.pos.lon) + (r.old ? ' ' + t('sosOld') : ''), u: mapsUrl(r.pos.lat, r.pos.lon), tm: nowStr() });
      else msg = t('sosMsg', { who: who, c: t('sosNoPos'), u: '', tm: nowStr() });
      var nums = contactNums();
      out.innerHTML = shareButtons(msg, nums) +
        '<div class="btns" style="margin-top:6px"><a class="btn small danger" href="tel:106">📞 106</a><a class="btn small danger" href="tel:105">📞 105</a><a class="btn small" href="tel:119">📞 119</a></div>' +
        '<button class="btn beacon-btn" type="button" data-beacon="1">' + t('beaconBtn') + '</button>' +
        (nums.length ? '' : '<p class="small muted">' + t('noContacts') + '</p>');
      wireShare(out, msg);
      var bb = out.querySelector('[data-beacon]'); if (bb) bb.addEventListener('click', startBeacon);
    });
  }
  $('sosBtn').addEventListener('click', doSOS);
  $('sosTop').addEventListener('click', function () {
    A.showTab('tools');
    setTimeout(function () { $('sosCard').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
  });

  // ===================== fuel calculator =====================
  var F = A.sget('fuel', { speed: 8, lph: 4, res: 20, price: '' });
  $('fSpeed').value = F.speed; $('fLph').value = F.lph; $('fRes').value = F.res; $('fPrice').value = F.price;
  function windNow() {
    var w = A.wxLast();
    if (!w || !w.f || !w.f.hourly) return null;
    var now = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 13), h = w.f.hourly;
    for (var i = 0; i < h.time.length; i++) if (h.time[i].slice(0, 13) >= now) return h.wind_speed_10m[i];
    return null;
  }
  var wn = windNow(); if (num(wn)) $('fWind').value = Math.round(wn);
  function posOf(v) {
    if (v === 'me') return S.me ? { lat: S.me.lat, lon: S.me.lon } : null;
    var o = findTarget(v); return o ? { lat: o.lat, lon: o.lon } : null;
  }
  $('fuelForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var out = $('fuelOut');
    var nm = parseFloat($('fNm').value);
    if (!(nm > 0)) {
      var a = posOf($('fFrom').value), b = posOf($('fTo').value);
      if (!a || !b) { out.innerHTML = '<div class="note err">' + t('fErr') + '</div>'; return; }
      nm = C.distKm(a.lat, a.lon, b.lat, b.lon) / 1.852;
    }
    if ($('fRound').checked) nm *= 2;
    var sp = parseFloat($('fSpeed').value) || 8, lph = parseFloat($('fLph').value) || 4;
    if ($('fWind').value === '') { var wn2 = windNow(); if (num(wn2)) $('fWind').value = Math.round(wn2); }
    var wind = parseFloat($('fWind').value) || 0, res = parseFloat($('fRes').value); if (!(res >= 0)) res = 20;
    var price = parseFloat($('fPrice').value);
    var wPct = Math.max(0, Math.min(50, Math.round(wind - 15)));
    var hours = nm / sp, litres = hours * lph * (1 + wPct / 100) * (1 + res / 100);
    A.sset('fuel', { speed: sp, lph: lph, res: res, price: isFinite(price) ? price : '' });
    out.innerHTML = t('fResult', { d: n1(nm), km: n1(nm * 1.852), tm: hm(hours), l: n1(litres), w: wPct, r: n0(res),
      cost: price > 0 ? t('fCost', { c: Math.round(litres * price).toLocaleString('en-US') }) : '' });
  });

  // ===================== checklist / awareness / services =====================
  (function checklist() {
    var items = t('chkItems'), today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
    var st = A.sget('chk', { d: today, v: [] });
    if (st.d !== today) st = { d: today, v: [] };
    function draw() {
      $('checklist').innerHTML = items.map(function (txt, i) {
        return '<label class="chk-item"><input type="checkbox" data-i="' + i + '"' + (st.v.indexOf(i) >= 0 ? ' checked' : '') + '> <span>' + esc(txt) + '</span></label>';
      }).join('') + '<button class="btn small" type="button" id="chkReset" style="margin-top:6px">' + t('chkReset') + '</button>';
    }
    draw();
    $('checklist').addEventListener('change', function (e) {
      var i = +e.target.getAttribute('data-i');
      if (e.target.checked) { if (st.v.indexOf(i) < 0) st.v.push(i); } else st.v = st.v.filter(function (x) { return x !== i; });
      A.sset('chk', st);
    });
    $('checklist').addEventListener('click', function (e) {
      if (e.target.id === 'chkReset') { st = { d: today, v: [] }; A.sset('chk', st); draw(); }
    });
  })();
  $('lifeList').innerHTML = t('lifeItems').map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
  $('ecoList').innerHTML = t('ecoItems').map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
  $('servList').innerHTML = [
    ['https://www.fisheries.gov.lk', 'servDfar'], ['https://www.nara.ac.lk', 'servNara'], ['https://www.meteo.gov.lk', 'servMeteo'],
    ['https://www.coastguard.gov.lk', 'servCg'], ['https://www.dialog.lk/sayuru', 'servSayuru']
  ].map(function (x) { return '<li><a href="' + x[0] + '" target="_blank" rel="noopener">' + t(x[1]) + '</a></li>'; }).join('');

  // weather alert bar → weather tab
  var ab = $('alertBar'); if (ab) ab.addEventListener('click', function () { A.showTab('wx'); });

  // ===================== my details (first-run page) =====================
  function validPhone(p) {
    var d = String(p || '').replace(/[\s\-().]/g, '');
    return /^\+?\d{9,13}$/.test(d) ? d : null;
  }
  function whoText() {
    var p = A.sget('profile', null); if (!p) return '';
    var parts = [];
    if (p.name) parts.push(t('lblName') + ': ' + p.name);
    if (p.phone) parts.push(t('lblPhone') + ': ' + p.phone);
    var boat = [p.boat, p.reg].filter(Boolean).join(' / ');
    if (boat) parts.push(t('lblBoat') + ': ' + boat);
    if (p.crew) parts.push(t('lblCrew') + ': ' + p.crew);
    if (p.hi !== undefined && p.hi !== null && p.hi !== '') parts.push(t('lblHarb') + ': ' + I.harbour(+p.hi));
    return parts.length ? ' ' + parts.join(', ') + '.' : '';
  }
  function openSetup(editing) {
    var p = A.sget('profile', {}) || {}, cs = loadContacts();
    $('pName').value = p.name || ''; $('pPhone').value = p.phone || '';
    $('pBoat').value = p.boat || ''; $('pReg').value = p.reg || ''; $('pCrew').value = p.crew || '';
    $('pHarb').innerHTML = A.HARBOURS.map(function (h, k) { return '<option value="' + k + '">⚓ ' + esc(I.harbour(k)) + '</option>'; }).join('');
    var hi = (p.hi !== undefined && p.hi !== null && p.hi !== '') ? p.hi : (S.ref && S.ref.hi !== undefined ? S.ref.hi : 0);
    $('pHarb').value = String(hi);
    var rows = '';
    for (var i = 0; i < 3; i++) {
      var c = cs[i] || { name: '', phone: '' };
      rows += '<div class="contact-row"><input type="text" maxlength="40" data-c="name" placeholder="' + esc(t('cName')) + (i === 0 ? ' *' : '') + '" value="' + esc(c.name) + '">' +
        '<input type="tel" maxlength="20" inputmode="tel" data-c="phone" placeholder="' + esc(t('cPhone')) + (i === 0 ? ' *' : '') + '" value="' + esc(c.phone) + '"></div>';
    }
    $('pContacts').innerHTML = rows;
    $('setupLang').value = I.lang;
    $('setupCancel').classList.toggle('hidden', !editing);
    $('setupErr').classList.add('hidden');
    $('setup').classList.remove('hidden');
    $('setup').scrollTop = 0;
  }
  $('setupLang').addEventListener('change', function () {
    // keep what was typed, then reload in the new language
    try { sessionStorage.setItem('dheewaraMithura_setupDraft', JSON.stringify(readSetup())); } catch (e) {}
    I.setLang(this.value); location.reload();
  });
  function readSetup() {
    var contacts = [];
    $('pContacts').querySelectorAll('.contact-row').forEach(function (r) {
      contacts.push({ name: r.querySelector('[data-c=name]').value.trim(), phone: r.querySelector('[data-c=phone]').value.trim() });
    });
    return {
      name: $('pName').value.trim(), phone: $('pPhone').value.trim(), boat: $('pBoat').value.trim(), reg: $('pReg').value.trim(),
      crew: $('pCrew').value.trim(), hi: $('pHarb').value, contacts: contacts
    };
  }
  $('setupForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var d = readSetup(), errs = [];
    document.querySelectorAll('#setupForm .fld').forEach(function (f) { f.classList.remove('bad'); });
    if (!d.name) { errs.push(t('pErrName')); $('pName').parentNode.classList.add('bad'); }
    var ph = validPhone(d.phone);
    if (!ph) { errs.push(t('pErrPhone')); $('pPhone').parentNode.classList.add('bad'); }
    var good = [];
    d.contacts.forEach(function (c) {
      if (!c.phone && !c.name) return;
      var cp = validPhone(c.phone);
      if (!cp) { errs.push(t('pErrBad', { p: c.phone || '—' })); return; }
      good.push({ name: c.name, phone: cp });
    });
    if (!good.some(function (c) { return c.name; })) errs.push(t('pErrContact'));
    if (errs.length) {
      var box = $('setupErr'); box.innerHTML = errs.map(esc).join('<br>'); box.classList.remove('hidden');
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    var first = !A.sget('profile', null);
    var old = A.sget('profile', {}) || {};
    A.sset('profile', { name: d.name, phone: ph, boat: d.boat, reg: d.reg, crew: d.crew, hi: +d.hi, t: Date.now() });
    A.sset('contacts', good);
    try { sessionStorage.removeItem('dheewaraMithura_setupDraft'); } catch (e) {}
    $('setup').classList.add('hidden');
    if (first || +d.hi !== old.hi) { var h = A.HARBOURS[+d.hi]; A.setPlace({ hi: +d.hi, lat: h[1], lon: h[2] }); }
    renderContacts(); refreshTargets();
  });
  $('setupCancel').addEventListener('click', function () { $('setup').classList.add('hidden'); });
  $('editProfileBtn').addEventListener('click', function () { openSetup(true); });

  // ===================== SOS siren + Morse light =====================
  var BC = { on: false, ctx: null, osc: null, lfo: null, gain: null, siren: true, torchWanted: true, track: null, timer: null, i: 0, wake: null };
  // Morse SOS in units (250 ms): [light on?, units]
  var MORSE = [[1, 1], [0, 1], [1, 1], [0, 1], [1, 1], [0, 3], [1, 3], [0, 1], [1, 3], [0, 1], [1, 3], [0, 3], [1, 1], [0, 1], [1, 1], [0, 1], [1, 1], [0, 7]];
  var UNIT = 250;
  function sirenStart() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      BC.ctx = BC.ctx || new AC();
      if (BC.ctx.state === 'suspended') BC.ctx.resume();
      var ctx = BC.ctx;
      BC.osc = ctx.createOscillator(); BC.osc.type = 'square'; BC.osc.frequency.value = 1050;
      BC.lfo = ctx.createOscillator(); BC.lfo.type = 'triangle'; BC.lfo.frequency.value = 1.6;   // wail up and down
      var depth = ctx.createGain(); depth.gain.value = 450;
      BC.lfo.connect(depth); depth.connect(BC.osc.frequency);
      BC.gain = ctx.createGain(); BC.gain.gain.value = 0.9;
      BC.osc.connect(BC.gain); BC.gain.connect(ctx.destination);
      BC.osc.start(); BC.lfo.start();
    } catch (e) {}
  }
  function sirenStop() {
    try { if (BC.osc) BC.osc.stop(); if (BC.lfo) BC.lfo.stop(); } catch (e) {}
    BC.osc = BC.lfo = null;
  }
  function torchSet(on) {
    if (!BC.track) return;
    try { BC.track.applyConstraints({ advanced: [{ torch: !!on }] }).catch(function () {}); } catch (e) {}
  }
  function torchStart() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('beaconMsg').textContent = t('noTorch'); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }).then(function (st) {
      var tr = st.getVideoTracks()[0], caps = (tr && tr.getCapabilities) ? tr.getCapabilities() : {};
      if (!BC.on || !caps.torch) { st.getTracks().forEach(function (x) { x.stop(); }); if (BC.on) $('beaconMsg').textContent = t('noTorch'); return; }
      BC.track = tr;
    }).catch(function () { $('beaconMsg').textContent = t('noTorch'); });
  }
  function torchStop() {
    if (BC.track) { try { torchSet(false); BC.track.stop(); } catch (e) {} }
    BC.track = null;
  }
  function beaconTick() {
    if (!BC.on) return;
    var st = MORSE[BC.i % MORSE.length]; BC.i++;
    var on = st[0] === 1, ms = st[1] * UNIT;
    $('beacon').classList.toggle('lit', on);
    if (BC.torchWanted) torchSet(on);
    if (on) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }
    BC.timer = setTimeout(beaconTick, ms);
  }
  function startBeacon() {
    if (BC.on) return;
    BC.on = true; BC.i = 0;
    $('beaconMsg').textContent = '';
    $('beacon').classList.remove('hidden');
    $('bSiren').classList.toggle('off', !BC.siren); $('bTorch').classList.toggle('off', !BC.torchWanted);
    if (BC.siren) sirenStart();
    if (BC.torchWanted) torchStart();
    try { if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then(function (w) { BC.wake = w; }).catch(function () {}); } catch (e) {}
    try { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {}); } catch (e) {}
    beaconTick();
  }
  function stopBeacon() {
    BC.on = false;
    clearTimeout(BC.timer);
    sirenStop(); torchStop();
    try { if (navigator.vibrate) navigator.vibrate(0); } catch (e) {}
    try { if (BC.wake) BC.wake.release(); } catch (e) {}
    BC.wake = null;
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {}); } catch (e) {}
    $('beacon').classList.add('hidden'); $('beacon').classList.remove('lit');
  }
  $('beaconBtn').addEventListener('click', startBeacon);
  $('bStop').addEventListener('click', stopBeacon);
  $('bSiren').addEventListener('click', function () {
    BC.siren = !BC.siren; this.classList.toggle('off', !BC.siren);
    if (BC.siren) sirenStart(); else sirenStop();
  });
  $('bTorch').addEventListener('click', function () {
    BC.torchWanted = !BC.torchWanted; this.classList.toggle('off', !BC.torchWanted);
    if (BC.torchWanted) torchStart(); else torchStop();
  });

  // ===================== start =====================
  window.DMTools = { refreshTargets: refreshTargets, setTarget: setTarget };
  renderContacts();
  renderRoutes();
  refreshTargets();
  render();
  // first run: the details page must be completed before using the app
  if (!A.sget('profile', null)) {
    openSetup(false);
    try {
      var dr = JSON.parse(sessionStorage.getItem('dheewaraMithura_setupDraft') || 'null');
      if (dr) {
        $('pName').value = dr.name || ''; $('pPhone').value = dr.phone || ''; $('pBoat').value = dr.boat || '';
        $('pReg').value = dr.reg || ''; $('pCrew').value = dr.crew || ''; if (dr.hi !== undefined) $('pHarb').value = dr.hi;
        $('pContacts').querySelectorAll('.contact-row').forEach(function (r, i) {
          var c = (dr.contacts || [])[i]; if (!c) return;
          r.querySelector('[data-c=name]').value = c.name || ''; r.querySelector('[data-c=phone]').value = c.phone || '';
        });
      }
    } catch (e) {}
  }
})();
