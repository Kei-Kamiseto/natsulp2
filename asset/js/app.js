/* =========================================================
   和みの大人夏合宿 LP — app.js
   Keep original LP animations + shared storage interactions
   ========================================================= */

(function () {
  'use strict';

  /* ---------- Members ---------- */
  const MEMBERS = {
    '和みママ': { ini: 'マ', color: '#c96f4a' },
    'けんさん': { ini: 'けん', color: '#5a7d54' },
    'みきさん': { ini: 'み', color: '#c9536f' },
    'キムニー': { ini: 'キ', color: '#1b6e8c' },
    'ザッキィー': { ini: 'ザ', color: '#7d9b4e' },
    'アサちゃん': { ini: 'ア', color: '#b0568f' },
    'すみちゃん': { ini: 'す', color: '#d9a441' },
    'けいちゃん': { ini: 'け', color: '#7a5bb0' },
    'けいくん': { ini: 'K', color: '#2277a8' },
    'ゆうじろうくん': { ini: 'ゆ', color: '#c9536f' },
    'ゆうじろう彼女': { ini: '彼', color: '#b0568f' },
    'ゲスト': { ini: 'ゲ', color: '#6f7a74' }
  };

  const ALL11 = [
    '和みママ', 'けんさん', 'みきさん', 'キムニー', 'ザッキィー',
    'アサちゃん', 'すみちゃん', 'けいちゃん', 'けいくん', 'ゆうじろうくん'
  ];

  const DRIVERS = ['けんさん', 'ザッキィー', 'ゆうじろうくん'];

  const DEFAULTS = {
    events: {
      sup: ['和みママ', 'すみちゃん', 'けいちゃん'],
      sauna: ['アサちゃん'],
      fishing: ['けいくん'],
      bbq: ALL11.slice(),
      fireworks: ALL11.slice(),
      cards: ALL11.slice()
    },
    pay: Object.fromEntries(ALL11.map(function (n) {
      return [n, { cash: false, car: false }];
    })),
    shared: [],
    konan: [
      { id: 'konan-1', text: '炭 3kg', done: false, by: '' },
      { id: 'konan-2', text: '紙皿', done: false, by: '' },
      { id: 'konan-3', text: 'わりばし', done: false, by: '' },
      { id: 'konan-4', text: '紙コップ', done: false, by: '' },
      { id: 'konan-5', text: 'ゴミ袋', done: false, by: '' },
      { id: 'konan-6', text: 'キッチンペーパー', done: false, by: '' },
      { id: 'konan-7', text: 'トランプ', done: false, by: '' },
      { id: 'konan-8', text: '線香花火（1人5本）', done: false, by: '' }
    ],
    ropia: [
      { id: 'ropia-1', text: 'BBQ肉', done: false, by: '' },
      { id: 'ropia-2', text: '牛タン', done: false, by: '' },
      { id: 'ropia-3', text: '赤身肉', done: false, by: '' },
      { id: 'ropia-4', text: 'ウインナー', done: false, by: '' },
      { id: 'ropia-5', text: '鶏肉', done: false, by: '' },
      { id: 'ropia-6', text: 'キャベツ', done: false, by: '' },
      { id: 'ropia-7', text: 'しいたけ', done: false, by: '' },
      { id: 'ropia-8', text: 'コーン', done: false, by: '' },
      { id: 'ropia-9', text: 'ピーマン', done: false, by: '' },
      { id: 'ropia-10', text: '焼きそば麺', done: false, by: '' },
      { id: 'ropia-11', text: 'エビ・シーフード', done: false, by: '' },
      { id: 'ropia-12', text: 'マッシュポテト', done: false, by: '' },
      { id: 'ropia-13', text: 'イカの塩辛', done: false, by: '' },
      { id: 'ropia-14', text: 'コーヒー', done: false, by: '' },
      { id: 'ropia-15', text: 'シチューの材料', done: false, by: '' }
    ],
    pack: Object.fromEntries(ALL11.map(function (n) { return [n, []]; })),
    board: []
  };

  let state = {
    events: null,
    pay: null,
    shared: null,
    konan: null,
    ropia: null,
    pack: null,
    board: null
  };

  let me = null;
  let pendingAction = null;
  let toastTimer = null;

  /* ---------- Storage (window.storage with local fallback) ---------- */
  const memoryStore = {};

  const store = {
    async get(k, d) {
      try {
        if (window.storage && typeof window.storage.get === 'function') {
          const r = await window.storage.get(k, true);
          if (r && r.value != null) return JSON.parse(r.value);
        } else {
          const raw = localStorage.getItem('nagomi_share_' + k);
          if (raw) return JSON.parse(raw);
          if (memoryStore[k] != null) return JSON.parse(memoryStore[k]);
        }
      } catch (e) {
        console.error(e);
      }
      return d;
    },
    async set(k, v) {
      try {
        const s = JSON.stringify(v);
        if (window.storage && typeof window.storage.set === 'function') {
          await window.storage.set(k, s, true);
        } else {
          try {
            localStorage.setItem('nagomi_share_' + k, s);
          } catch (e2) {
            memoryStore[k] = s;
          }
        }
        toast();
      } catch (e) {
        console.error(e);
      }
    }
  };

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function toast() {
    const el = document.getElementById('toast');
    if (!el) return;
    el.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('is-show');
    }, 1600);
  }

  function avatarHTML(name) {
    const m = MEMBERS[name] || { ini: name.slice(0, 1), color: '#6f7a74' };
    return '<span class="av" style="background:' + m.color + '" title="' + name + '">' + m.ini + '</span>';
  }

  /* ---------- Name modal ---------- */
  function getMe() {
    try {
      return localStorage.getItem('nagomi_me') || null;
    } catch (e) {
      return me;
    }
  }

  function setMe(name) {
    me = name;
    try {
      localStorage.setItem('nagomi_me', name);
    } catch (e) { /* ignore */ }
    closeNameModal();
    if (pendingAction) {
      const fn = pendingAction;
      pendingAction = null;
      fn();
    }
  }

  function openNameModal(thenFn) {
    pendingAction = thenFn || null;
    const modal = document.getElementById('name_modal');
    if (!modal) return;
    modal.classList.add('is-show');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeNameModal() {
    const modal = document.getElementById('name_modal');
    if (!modal) return;
    modal.classList.remove('is-show');
    modal.setAttribute('aria-hidden', 'true');
  }

  function requireMe(thenFn) {
    const name = getMe();
    if (name) {
      me = name;
      thenFn();
    } else {
      openNameModal(thenFn);
    }
  }

  /* ---------- Events (join) ---------- */
  function renderEvents() {
    Object.keys(state.events).forEach(function (key) {
      const list = state.events[key] || [];
      const box = document.querySelector('.js_join_avatars[data-key="' + key + '"]');
      const btn = document.querySelector('.js_join_btn[data-key="' + key + '"]');
      if (box) {
        box.innerHTML = list.map(avatarHTML).join('') +
          '<span class="count">' + list.length + '名</span>';
      }
      if (btn) {
        const joined = me && list.indexOf(me) !== -1;
        btn.classList.toggle('is-joined', !!joined);
        btn.textContent = joined ? '参加中' : '参加する';
      }
    });
  }

  async function toggleJoin(key) {
    requireMe(async function () {
      const name = getMe();
      const list = state.events[key] ? state.events[key].slice() : [];
      const i = list.indexOf(name);
      if (i === -1) list.push(name);
      else list.splice(i, 1);
      state.events[key] = list;
      await store.set('events', state.events);
      renderEvents();
    });
  }

  /* ---------- Budget / pay ---------- */
  function renderPay() {
    let cashCount = 0;
    ALL11.forEach(function (name) {
      const row = state.pay[name] || { cash: false, car: false };
      if (row.cash) cashCount++;
      const cash = document.querySelector('.js_pay_cash[data-name="' + name + '"]');
      const car = document.querySelector('.js_pay_car[data-name="' + name + '"]');
      if (cash) cash.checked = !!row.cash;
      if (car) car.checked = !!row.car;
    });
    const countEl = document.getElementById('cash_count');
    const bar = document.getElementById('cash_bar');
    if (countEl) countEl.textContent = String(cashCount);
    if (bar) bar.style.width = (cashCount / 10 * 100) + '%';
  }

  async function togglePay(name, field, checked) {
    if (!state.pay[name]) state.pay[name] = { cash: false, car: false };
    if (field === 'car' && DRIVERS.indexOf(name) !== -1) return;
    state.pay[name][field] = checked;
    await store.set('pay', state.pay);
    renderPay();
  }

  /* ---------- Lists ---------- */
  function listRowHTML(item, storeKey) {
    const by = item.by ? '<em class="by">' + item.by + '</em>' : '';
    return (
      '<div class="list-row" data-id="' + item.id + '">' +
        '<input type="checkbox" class="js_list_check" data-store="' + storeKey + '" data-id="' + item.id + '"' +
          (item.done ? ' checked' : '') + '>' +
        '<span class="txt">' + escapeHTML(item.text) + '</span>' +
        by +
        '<button type="button" class="js_del" data-store="' + storeKey + '" data-id="' + item.id + '">削除</button>' +
      '</div>'
    );
  }

  function boardRowHTML(item) {
    return (
      '<div class="board-post" data-id="' + item.id + '">' +
        '<div class="meta"><strong>' + escapeHTML(item.by || 'ゲスト') + '</strong></div>' +
        '<p class="body">' + escapeHTML(item.text) + '</p>' +
        '<button type="button" class="js_del" data-store="board" data-id="' + item.id + '">削除</button>' +
      '</div>'
    );
  }

  function escapeHTML(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderList(storeKey) {
    if (storeKey === 'pack') {
      ALL11.forEach(function (name) {
        const box = document.querySelector('.js_list[data-store="pack"][data-name="' + name + '"]');
        if (!box) return;
        const items = (state.pack[name] || []);
        box.innerHTML = items.map(function (it) {
          return listRowHTML(it, 'pack');
        }).join('');
      });
      return;
    }
    if (storeKey === 'board') {
      const box = document.querySelector('.js_list[data-store="board"]');
      if (!box) return;
      box.innerHTML = (state.board || []).map(boardRowHTML).join('');
      return;
    }
    const box = document.querySelector('.js_list[data-store="' + storeKey + '"]');
    if (!box) return;
    box.innerHTML = (state[storeKey] || []).map(function (it) {
      return listRowHTML(it, storeKey);
    }).join('');
  }

  function renderAllLists() {
    ['shared', 'konan', 'ropia', 'pack', 'board'].forEach(renderList);
  }

  async function addListItem(storeKey, name) {
    requireMe(async function () {
      const inputSel = storeKey === 'pack'
        ? '.js_list_input[data-store="pack"][data-name="' + name + '"]'
        : '.js_list_input[data-store="' + storeKey + '"]';
      const input = document.querySelector(inputSel);
      const text = input ? input.value.trim() : '';
      if (!text) return;
      const item = { id: uid(), text: text, done: false, by: getMe() };
      if (storeKey === 'pack') {
        if (!state.pack[name]) state.pack[name] = [];
        state.pack[name].push(item);
        await store.set('pack', state.pack);
      } else {
        state[storeKey].push(item);
        await store.set(storeKey, state[storeKey]);
      }
      if (input) input.value = '';
      renderList(storeKey);
    });
  }

  async function toggleListDone(storeKey, id, name) {
    if (storeKey === 'pack') {
      const n = name || findPackNameById(id);
      const items = state.pack[n] || [];
      items.forEach(function (it) {
        if (it.id === id) it.done = !it.done;
      });
      await store.set('pack', state.pack);
    } else {
      (state[storeKey] || []).forEach(function (it) {
        if (it.id === id) it.done = !it.done;
      });
      await store.set(storeKey, state[storeKey]);
    }
    renderList(storeKey);
  }

  function findPackNameById(id) {
    for (let i = 0; i < ALL11.length; i++) {
      const n = ALL11[i];
      const items = state.pack[n] || [];
      if (items.some(function (it) { return it.id === id; })) return n;
    }
    return ALL11[0];
  }

  async function deleteListItem(storeKey, id) {
    if (storeKey === 'board') {
      state.board = (state.board || []).filter(function (it) { return it.id !== id; });
      await store.set('board', state.board);
      renderList('board');
      return;
    }
    if (storeKey === 'pack') {
      const n = findPackNameById(id);
      state.pack[n] = (state.pack[n] || []).filter(function (it) { return it.id !== id; });
      await store.set('pack', state.pack);
      renderList('pack');
      return;
    }
    state[storeKey] = (state[storeKey] || []).filter(function (it) { return it.id !== id; });
    await store.set(storeKey, state[storeKey]);
    renderList(storeKey);
  }

  async function postBoard() {
    requireMe(async function () {
      const ta = document.querySelector('.js_board_input');
      const text = ta ? ta.value.trim() : '';
      if (!text) return;
      const item = { id: uid(), by: getMe(), text: text };
      state.board = [item].concat(state.board || []);
      await store.set('board', state.board);
      if (ta) ta.value = '';
      renderList('board');
    });
  }

  /* ---------- Load & bind ---------- */
  async function loadAll() {
    state.events = await store.get('events', DEFAULTS.events);
    state.pay = await store.get('pay', DEFAULTS.pay);
    state.shared = await store.get('shared', DEFAULTS.shared);
    state.konan = await store.get('konan', DEFAULTS.konan);
    state.ropia = await store.get('ropia', DEFAULTS.ropia);
    state.pack = await store.get('pack', DEFAULTS.pack);
    state.board = await store.get('board', DEFAULTS.board);

    // ensure keys
    ALL11.forEach(function (n) {
      if (!state.pay[n]) state.pay[n] = { cash: false, car: false };
      if (!state.pack[n]) state.pack[n] = [];
    });

    me = getMe();
    renderEvents();
    renderPay();
    renderAllLists();

    if (!me) openNameModal(null);
  }

  function bindUI() {
    document.querySelectorAll('.js_name_btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setMe(btn.getAttribute('data-name'));
        renderEvents();
      });
    });

    document.querySelectorAll('.js_join_btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        toggleJoin(btn.getAttribute('data-key'));
      });
    });

    document.querySelectorAll('.js_pay_cash').forEach(function (el) {
      el.addEventListener('change', function () {
        togglePay(el.getAttribute('data-name'), 'cash', el.checked);
      });
    });
    document.querySelectorAll('.js_pay_car').forEach(function (el) {
      el.addEventListener('change', function () {
        togglePay(el.getAttribute('data-name'), 'car', el.checked);
      });
    });

    document.querySelectorAll('.js_list_add').forEach(function (btn) {
      btn.addEventListener('click', function () {
        addListItem(btn.getAttribute('data-store'), btn.getAttribute('data-name'));
      });
    });

    document.querySelectorAll('.js_list_input').forEach(function (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          addListItem(input.getAttribute('data-store'), input.getAttribute('data-name'));
        }
      });
    });

    document.addEventListener('click', function (e) {
      const del = e.target.closest('.js_del');
      if (del) {
        const list = del.closest('.js_list');
        const row = del.closest('[data-id]');
        const storeKey = del.getAttribute('data-store') || (list && list.getAttribute('data-store'));
        const id = del.getAttribute('data-id') || (row && row.getAttribute('data-id'));
        if (storeKey && id) deleteListItem(storeKey, id);
        return;
      }
      if (e.target.classList.contains('js_list_check')) {
        const storeKey = e.target.getAttribute('data-store') ||
          (e.target.closest('.js_list') && e.target.closest('.js_list').getAttribute('data-store'));
        const id = e.target.getAttribute('data-id') ||
          (e.target.closest('[data-id]') && e.target.closest('[data-id]').getAttribute('data-id'));
        const packCard = e.target.closest('.pack-card');
        const name = packCard ? packCard.getAttribute('data-name') : null;
        if (storeKey && id) toggleListDone(storeKey, id, name);
      }
    });

    const boardBtn = document.querySelector('.js_board_post');
    if (boardBtn) boardBtn.addEventListener('click', postBoard);
  }

  /* ---------- Original LP animations (safe without type swipers) ---------- */
  function initAnimations() {
    const swiperTypeElm = document.querySelectorAll('.js_swiper_type');
    swiperTypeElm.forEach(function (e) {
      var o = e.nextElementSibling;
      let t = e.parentNode;
      if (typeof Swiper === 'undefined') return;
      new Swiper(e, {
        loop: true,
        speed: 800,
        slidesPerView: 1,
        effect: 'fade',
        autoplay: { delay: 3000, disableOnInteraction: false },
        pagination: { el: o, clickable: true },
        on: {
          slideChangeTransitionStart: function () {
            t.style.transitionTimingFunction = 'linear';
          }
        }
      });
    });

    document.querySelectorAll('a[href^="#"]').forEach(function (o) {
      o.addEventListener('click', function (e) {
        const href = o.getAttribute('href');
        if (!href || href === '#') return;
        const target = document.getElementById(href.replace('#', ''));
        if (!target) return;
        e.preventDefault();
        const top = target.getBoundingClientRect().top + window.pageYOffset;
        window.scrollTo({ top: top, behavior: 'smooth' });
      });
    });

    const loadElm = document.querySelectorAll('.js_anim_load');
    const fvElm = document.querySelector('.js_fv_high');

    function revealLoad() {
      loadElm.forEach(function (e) { e.classList.add('is-anim'); });
      if (fvElm) fvElm.style.height = window.innerHeight + 'px';
      // also reveal above-the-fold scroll anims immediately
      document.querySelectorAll('.js_anim_scroll').forEach(function (e) {
        if (e.getBoundingClientRect().top < window.innerHeight * 1.1) {
          e.classList.add('is-anim');
        }
      });
    }

    if (document.readyState === 'complete') {
      revealLoad();
    } else {
      window.addEventListener('load', revealLoad);
      // fail-safe: never leave page invisible
      setTimeout(revealLoad, 400);
    }

    window.addEventListener('resize', function () {
      if (fvElm) fvElm.style.height = window.innerHeight + 'px';
    });

    const scrollElm = document.querySelectorAll('.js_anim_scroll');
    window.addEventListener('scroll', function () {
      const o = window.scrollY;
      const t = 0.8 * window.innerHeight;
      for (const e of scrollElm) {
        if (e.getBoundingClientRect().top + o - t < o) e.classList.add('is-anim');
      }
    }, { passive: true });
    window.dispatchEvent(new Event('scroll'));
  }

  /* ---------- FV video slideshow: 5s each, fade loop ---------- */
  function initFvVideos() {
    const wrap = document.querySelector('.js_fv_videos');
    if (!wrap) return;
    const videos = Array.prototype.slice.call(wrap.querySelectorAll('video'));
    if (!videos.length) return;

    let index = 0;
    let timer = null;
    const DURATION = 5000;

    function show(i) {
      videos.forEach(function (v, n) {
        if (n === i) {
          v.classList.add('is-active');
          try {
            v.currentTime = 0;
            const p = v.play();
            if (p && typeof p.catch === 'function') p.catch(function () {});
          } catch (e) {}
        } else {
          v.classList.remove('is-active');
          try { v.pause(); } catch (e2) {}
        }
      });
    }

    function next() {
      index = (index + 1) % videos.length;
      show(index);
    }

    show(0);
    timer = setInterval(next, DURATION);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        clearInterval(timer);
        timer = null;
        videos.forEach(function (v) { try { v.pause(); } catch (e) {} });
      } else {
        show(index);
        if (!timer) timer = setInterval(next, DURATION);
      }
    });
  }

  /* ---------- #life video slideshow: 9 → 7 → 8, 5s each, fade loop ---------- */
  function initLifeVideos() {
    const wrap = document.querySelector('.js_life_videos');
    if (!wrap) return;
    const videos = Array.prototype.slice.call(wrap.querySelectorAll('video'));
    if (!videos.length) return;

    let index = 0;
    let timer = null;
    const DURATION = 5000;

    function playAll() {
      videos.forEach(function (v) {
        v.muted = true;
        v.playsInline = true;
        v.setAttribute('playsinline', '');
        v.loop = true;
        try {
          const p = v.play();
          if (p && typeof p.catch === 'function') p.catch(function () {});
        } catch (e) {}
      });
    }

    function show(i) {
      videos.forEach(function (v, n) {
        if (n === i) v.classList.add('is-active');
        else v.classList.remove('is-active');
      });
    }

    function next() {
      index = (index + 1) % videos.length;
      show(index);
    }

    function start() {
      playAll();
      show(index);
      if (timer) clearInterval(timer);
      timer = setInterval(next, DURATION);
    }

    start();

    // kick play again once media can play (fixes first-frame freeze)
    videos.forEach(function (v) {
      v.addEventListener('loadeddata', function () { playAll(); });
      v.addEventListener('canplay', function () { playAll(); });
    });

    if (typeof IntersectionObserver !== 'undefined') {
      const io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) playAll();
        });
      }, { threshold: 0.1 });
      io.observe(wrap);
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        clearInterval(timer);
        timer = null;
        videos.forEach(function (v) { try { v.pause(); } catch (e) {} });
      } else {
        start();
      }
    });

    // user gesture fallback: any click/touch resumes
    function unlock() {
      playAll();
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
    }
    document.addEventListener('click', unlock);
    document.addEventListener('touchstart', unlock);
  }

  /* ---------- boot ---------- */
  function boot() {
    try { initAnimations(); } catch (e) { console.error(e); }
    try { initFvVideos(); } catch (e) { console.error(e); }
    try { initLifeVideos(); } catch (e) { console.error(e); }
    try { bindUI(); } catch (e) { console.error(e); }
    try { loadAll(); } catch (e) { console.error(e); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
