/* Countdown badge → 2026-07-26T09:30:00+09:00
   Preview: ?enjoy=1  /  enjoy.html */
(function () {
  'use strict';

  var TARGET = new Date('2026-07-26T09:30:00+09:00').getTime();

  function wantEnjoyPreview() {
    try {
      var href = String(location.href || '');
      var search = String(location.search || '');
      var hash = String(location.hash || '');
      if (/[?&]enjoy=1(?:&|$)/.test(search)) return true;
      if (/[?&]preview=enjoy(?:&|$)/.test(search)) return true;
      if (hash === '#enjoy' || hash.indexOf('enjoy=1') !== -1) return true;
      if (href.indexOf('enjoy.html') !== -1) return true;
    } catch (e) { /* ignore */ }
    return false;
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function applyDayState(root, isDay) {
    var badge = root.closest('.badge');
    var remain = root.querySelector('.count-remain');
    var enjoy = root.querySelector('.count-enjoy');

    root.classList.toggle('is-day', isDay);
    root.classList.toggle('-remain', !isDay);
    if (badge) badge.classList.toggle('is-day', isDay);

    if (remain) {
      remain.hidden = !!isDay;
      remain.setAttribute('aria-hidden', isDay ? 'true' : 'false');
    }
    if (enjoy) {
      enjoy.hidden = !isDay;
      enjoy.setAttribute('aria-hidden', isDay ? 'false' : 'true');
    }
  }

  function tick() {
    var root = document.getElementById('countdown');
    if (!root) return;

    var force = wantEnjoyPreview();
    var diff = Math.max(0, TARGET - Date.now());
    var isDay = force || diff <= 0;
    applyDayState(root, isDay);
    if (isDay) return;

    var days = Math.floor(diff / 86400000);
    var hours = Math.floor((diff % 86400000) / 3600000);
    var min = Math.floor((diff % 3600000) / 60000);
    var sec = Math.floor((diff % 60000) / 1000);
    var d = root.querySelector('[data-unit="days"]');
    var h = root.querySelector('[data-unit="hours"]');
    var m = root.querySelector('[data-unit="min"]');
    var s = root.querySelector('[data-unit="sec"]');
    if (d) d.textContent = String(days);
    if (h) h.textContent = pad(hours);
    if (m) m.textContent = pad(min);
    if (s) s.textContent = pad(sec);
  }

  tick();
  setInterval(tick, 1000);
})();
