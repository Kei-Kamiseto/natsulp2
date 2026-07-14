/* =========================================================
   和み共有ストア（Supabase Realtime / localStorage フォールバック）
   ========================================================= */
(function (global) {
  'use strict';

  var cfg = global.NAGOMI_SUPABASE || {};
  var client = null;
  var mode = 'local'; // 'supabase' | 'local'
  var lastWriteAt = {};
  var listeners = [];
  var channel = null;

  function localKey(k) {
    return 'nagomi_share_' + k;
  }

  function localGet(k, d) {
    try {
      var raw = localStorage.getItem(localKey(k));
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.error('[nagomi-store] local get', e);
    }
    return d;
  }

  function localSet(k, v) {
    try {
      localStorage.setItem(localKey(k), JSON.stringify(v));
      return true;
    } catch (e) {
      console.error('[nagomi-store] local set', e);
      return false;
    }
  }

  function isConfigured() {
    return !!(
      cfg &&
      cfg.url &&
      cfg.anonKey &&
      String(cfg.url).indexOf('http') === 0 &&
      global.supabase &&
      typeof global.supabase.createClient === 'function'
    );
  }

  async function init() {
    if (!isConfigured()) {
      mode = 'local';
      return { ok: false, mode: mode, reason: 'not-configured' };
    }
    try {
      client = global.supabase.createClient(String(cfg.url), String(cfg.anonKey), {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      // 疎通確認
      var ping = await client.from('nagomi_kv').select('key').limit(1);
      if (ping.error) {
        console.error('[nagomi-store] supabase ping', ping.error);
        mode = 'local';
        client = null;
        return { ok: false, mode: mode, reason: ping.error.message || 'ping-failed' };
      }
      mode = 'supabase';
      return { ok: true, mode: mode };
    } catch (e) {
      console.error('[nagomi-store] init', e);
      mode = 'local';
      client = null;
      return { ok: false, mode: mode, reason: String(e && e.message || e) };
    }
  }

  async function get(k, d) {
    if (mode === 'supabase' && client) {
      try {
        var res = await client.from('nagomi_kv').select('value').eq('key', k).maybeSingle();
        if (res.error) throw res.error;
        if (res.data && res.data.value != null) return res.data.value;
        return d;
      } catch (e) {
        console.error('[nagomi-store] get', k, e);
        return localGet(k, d);
      }
    }
    if (global.storage && typeof global.storage.get === 'function') {
      try {
        var r = await global.storage.get(k, true);
        if (r && r.value != null) return JSON.parse(r.value);
      } catch (e2) {
        console.error(e2);
      }
    }
    return localGet(k, d);
  }

  async function set(k, v, silent) {
    lastWriteAt[k] = Date.now();
    if (mode === 'supabase' && client) {
      try {
        var who = '';
        try { who = localStorage.getItem('nagomi_me') || ''; } catch (e) {}
        var res = await client.from('nagomi_kv').upsert({
          key: k,
          value: v,
          updated_at: new Date().toISOString(),
          updated_by: who
        }, { onConflict: 'key' });
        if (res.error) throw res.error;
        localSet(k, v); // オフライン用ミラー
        return true;
      } catch (e) {
        console.error('[nagomi-store] set', k, e);
        return localSet(k, v);
      }
    }
    if (global.storage && typeof global.storage.set === 'function') {
      try {
        await global.storage.set(k, JSON.stringify(v), true);
        return true;
      } catch (e3) {
        console.error(e3);
      }
    }
    return localSet(k, v);
  }

  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  function emit(key, value, meta) {
    listeners.forEach(function (fn) {
      try { fn(key, value, meta || {}); } catch (e) { console.error(e); }
    });
  }

  function subscribe() {
    if (mode !== 'supabase' || !client || channel) return;
    channel = client
      .channel('nagomi-kv-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'nagomi_kv' },
        function (payload) {
          var row = payload.new || payload.old;
          if (!row || !row.key) return;
          var wrote = lastWriteAt[row.key] || 0;
          if (Date.now() - wrote < 1500) return; // 自分の書き込みエコーは無視
          if (payload.eventType === 'DELETE') return;
          if (row.value == null) return;
          localSet(row.key, row.value);
          emit(row.key, row.value, {
            remote: true,
            by: row.updated_by || '',
            at: row.updated_at || ''
          });
        }
      )
      .subscribe(function (status) {
        emit('__status__', { status: status, mode: mode }, { status: true });
      });
  }

  function getMode() {
    return mode;
  }

  function getStatusLabel() {
    if (mode === 'supabase') return 'みんなと同期中';
    return 'この端末のみ（共有未接続）';
  }

  global.NagomiStore = {
    init: init,
    get: get,
    set: set,
    onChange: onChange,
    subscribe: subscribe,
    getMode: getMode,
    getStatusLabel: getStatusLabel,
    isConfigured: isConfigured
  };
})(typeof window !== 'undefined' ? window : global);
