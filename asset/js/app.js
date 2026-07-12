/* =========================================================
   和みの大人夏合宿 LP — app.js
   LP animations + shared storage + NagomiBudget UI
   ========================================================= */

(function () {
  'use strict';

  var B = window.NagomiBudget;
  if (!B) {
    console.error('[nagomi] window.NagomiBudget is missing. Load nagomi-budget.js first.');
    return;
  }

  /* ---------- Members ---------- */
  var ALL11 = B.payerNames.slice();
  var ADMIN_NAME = B.ADMIN_NAME;

  var MEMBERS = {};
  B.PARTICIPANTS.forEach(function (p) {
    MEMBERS[p.name] = { ini: p.ini, color: p.color, id: p.id, pin: null };
  });
  MEMBERS['ゲスト'] = { ini: 'ゲ', color: '#6f7a74', id: 'guest', pin: null };
  MEMBERS['はなちゃん'] = { ini: 'は', color: '#8b6b4a', id: 'hana', pin: null };

  function makeShopDefaults(seedList, storeName) {
    return (seedList || []).map(function (item, i) {
      return {
        id: storeName + '-' + (i + 1),
        text: item.text,
        done: false,
        by: '',
        store: storeName,
        qty: 1,
        assignee: '',
        actualAmount: null,
        expenseId: null,
        memo: ''
      };
    });
  }

  function emptyPack() {
    var o = {};
    ALL11.forEach(function (n) { o[n] = []; });
    return o;
  }

  var DEFAULTS = {
    events: {
      sup: [],
      sauna: [],
      fishing: [],
      bbq: [],
      fireworks: [],
      cards: []
    },
    shared: [],
    konan: makeShopDefaults(B.DEFAULT_KONAN, 'konan'),
    ropia: makeShopDefaults(B.DEFAULT_ROPIA, 'ropia'),
    pack: emptyPack(),
    board: [],
    budget: null
  };

  var state = {
    events: null,
    budget: null,
    shared: null,
    konan: null,
    ropia: null,
    pack: null,
    board: null
  };

  var me = null;
  var pendingAction = null;
  var toastTimer = null;
  var showDeletedExpenses = false;
  var editingExpenseId = null;
  var shopExpenseLink = null; // { storeKey, itemId } when registering from shop

  /* ---------- Storage (window.storage with local fallback) ---------- */
  var memoryStore = {};

  var store = {
    async get(k, d) {
      try {
        if (window.storage && typeof window.storage.get === 'function') {
          var r = await window.storage.get(k, true);
          if (r && r.value != null) return JSON.parse(r.value);
        } else {
          var raw = localStorage.getItem('nagomi_share_' + k);
          if (raw) return JSON.parse(raw);
          if (memoryStore[k] != null) return JSON.parse(memoryStore[k]);
        }
      } catch (e) {
        console.error(e);
      }
      return d;
    },
    async set(k, v, silent) {
      try {
        var s = JSON.stringify(v);
        if (window.storage && typeof window.storage.set === 'function') {
          await window.storage.set(k, s, true);
        } else {
          try {
            localStorage.setItem('nagomi_share_' + k, s);
          } catch (e2) {
            memoryStore[k] = s;
          }
        }
        if (!silent) toast();
      } catch (e) {
        console.error(e);
      }
    }
  };

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function nowISO() {
    try {
      return new Date().toISOString();
    } catch (e) {
      return '';
    }
  }

  function toast() {
    var el = document.getElementById('toast');
    if (!el) return;
    el.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('is-show');
    }, 1600);
  }

  function escapeHTML(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function avatarHTML(name) {
    var m = MEMBERS[name] || { ini: String(name).slice(0, 1), color: '#6f7a74' };
    return '<span class="av" style="background:' + m.color + '" title="' + escapeHTML(name) + '">' + escapeHTML(m.ini) + '</span>';
  }

  function isAdmin() {
    return getMe() === ADMIN_NAME;
  }

  function participantName(id) {
    var p = B.ID_TO_PARTICIPANT[id];
    return p ? p.name : id;
  }

  function migrateGirlfriendName(name) {
    if (name === 'ゆうじろう彼女') return 'ゆうじろうくん彼女';
    return name;
  }

  /* ---------- Name modal ---------- */
  function getMe() {
    try {
      var n = localStorage.getItem('nagomi_me') || null;
      if (n === 'ゆうじろう彼女') {
        n = 'ゆうじろうくん彼女';
        try { localStorage.setItem('nagomi_me', n); } catch (e2) { /* ignore */ }
      }
      return n;
    } catch (e) {
      return me;
    }
  }

  function setMe(name) {
    name = migrateGirlfriendName(name);
    me = name;
    try {
      localStorage.setItem('nagomi_me', name);
    } catch (e) { /* ignore */ }
    closeNameModal();
    if (pendingAction) {
      var fn = pendingAction;
      pendingAction = null;
      fn();
    }
  }

  function openNameModal(thenFn) {
    pendingAction = thenFn || null;
    var modal = document.getElementById('name_modal');
    if (!modal) return;
    modal.classList.add('is-show');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeNameModal() {
    var modal = document.getElementById('name_modal');
    if (!modal) return;
    modal.classList.remove('is-show');
    modal.setAttribute('aria-hidden', 'true');
  }

  function requireMe(thenFn) {
    var name = getMe();
    if (name) {
      me = name;
      thenFn();
    } else {
      openNameModal(thenFn);
    }
  }

  /* ---------- Events (join) ---------- */
  function emptyEvents() {
    return {
      sup: [],
      sauna: [],
      fishing: [],
      bbq: [],
      fireworks: [],
      cards: []
    };
  }

  function renderEvents() {
    Object.keys(state.events || emptyEvents()).forEach(function (key) {
      var list = state.events[key] || [];
      var box = document.querySelector('.js_join_avatars[data-key="' + key + '"]');
      var btn = document.querySelector('.js_join_btn[data-key="' + key + '"]');
      if (box) {
        if (!list.length) {
          box.innerHTML = '';
          box.hidden = true;
          box.setAttribute('aria-hidden', 'true');
        } else {
          box.hidden = false;
          box.setAttribute('aria-hidden', 'false');
          box.innerHTML = list.map(avatarHTML).join('') +
            '<span class="count">' + list.length + '名</span>';
        }
      }
      if (btn) {
        var joined = me && list.indexOf(me) !== -1;
        btn.classList.toggle('is-joined', !!joined);
        btn.textContent = joined ? '参加中' : '参加はクリック！';
      }
    });
  }

  async function toggleJoin(key) {
    requireMe(async function () {
      var name = getMe();
      var list = state.events[key] ? state.events[key].slice() : [];
      var i = list.indexOf(name);
      if (i === -1) list.push(name);
      else list.splice(i, 1);
      state.events[key] = list;
      await store.set('events', state.events);
      renderEvents();
    });
  }

  /* ---------- Budget helpers ---------- */
  function ensureBudgetReady() {
    if (!state.budget) state.budget = B.createDefaultBudget();
    return state.budget;
  }

  async function saveBudget() {
    ensureBudgetReady();
    await store.set('budget', state.budget);
    renderBudget();
  }

  function walletCardHTML(label, value, extraClass) {
    return (
      '<div class="nagomi-wallet-card' + (extraClass ? ' ' + extraClass : '') + '">' +
        '<p class="label">' + escapeHTML(label) + '</p>' +
        '<p class="value">' + escapeHTML(value) + '</p>' +
      '</div>'
    );
  }

  function renderBudget() {
    var el = document.getElementById('budget_people');
    var hint = document.getElementById('budget_hint');
    var walletEl = document.getElementById('budget_wallet_remain');
    var expenseEl = document.getElementById('budget_expenses');
    if (!el) return;
    var budget = ensureBudgetReady();
    var sum = B.computeWalletSummary(budget);
    var admin = isAdmin();
    var active = document.activeElement;
    var focusId = active && active.classList.contains('js_deposit_input')
      ? active.getAttribute('data-id')
      : null;
    var focusValue = focusId ? active.value : null;
    var focusSelStart = focusId && typeof active.selectionStart === 'number' ? active.selectionStart : null;
    var focusSelEnd = focusId && typeof active.selectionEnd === 'number' ? active.selectionEnd : null;

    var cash = sum.cashBalance;
    var cashClass = cash > 0 ? 'is-plus' : (cash < 0 ? 'is-minus' : 'is-zero');
    var cashLabel = cash > 0
      ? '残金（余り）'
      : (cash < 0 ? '残金（不足）' : '残金');

    if (walletEl) {
      walletEl.className = 'nagomi-wallet-remain ' + cashClass;
      walletEl.innerHTML =
        '<p class="nagomi-wallet-remain-label">' + cashLabel + '</p>' +
        '<p class="nagomi-wallet-remain-value">' + B.formatYen(cash) + '</p>' +
        '<p class="nagomi-wallet-remain-sub">入金合計 ' + B.formatYen(sum.paidDepositTotal) +
          ' − 支出合計 ' + B.formatYen(sum.expenseTotal) + '</p>';
    }

    if (hint) {
      hint.textContent =
        '入金あり ' + sum.paidCount + ' / 11人 ／ みんなの入金合計 ' + B.formatYen(sum.paidDepositTotal);
    }

    if (expenseEl) {
      var expenses = B.activeExpenses(budget).filter(function (ex) {
        return !ex.isInitialExpense;
      }).slice().sort(function (a, b) {
        var ta = a.createdAt || '';
        var tb = b.createdAt || '';
        if (ta !== tb) return ta < tb ? 1 : -1;
        return (b.amount || 0) - (a.amount || 0);
      });
      if (!expenses.length) {
        expenseEl.innerHTML = '<p class="nagomi-expense-empty">「支出を追加」で登録した支出がここに表示されます</p>';
      } else {
        expenseEl.innerHTML = expenses.map(function (ex) {
          var cat = B.CATEGORY_LABELS[ex.category] || ex.category || 'その他';
          var alloc = B.ALLOCATION_LABELS[ex.allocationType] || ex.allocationType || '';
          var purchaser = ex.purchaserId && B.ID_TO_PARTICIPANT[ex.purchaserId]
            ? B.ID_TO_PARTICIPANT[ex.purchaserId].name
            : '';
          var source = ex.paymentSource === 'personal-advance' ? '個人立替' : '共同財布';
          var actions = admin
            ? (
              '<div class="nagomi-card-actions">' +
                '<button type="button" class="nagomi-btn-ghost js_expense_edit" data-id="' + escapeHTML(ex.id) + '">編集</button>' +
                '<button type="button" class="nagomi-btn-ghost js_expense_delete" data-id="' + escapeHTML(ex.id) + '">削除</button>' +
              '</div>'
            )
            : '';
          return (
            '<article class="nagomi-expense-card" data-id="' + escapeHTML(ex.id) + '">' +
              '<header>' +
                '<h4>' + escapeHTML(ex.title || '（無題）') + '</h4>' +
                '<span class="num">' + B.formatYen(ex.amount || 0) + '</span>' +
              '</header>' +
              '<ul class="nagomi-meta-list">' +
                '<li>費目：' + escapeHTML(cat) + '</li>' +
                '<li>わりかん：' + escapeHTML(alloc) + '</li>' +
                '<li>支払い：' + escapeHTML(source) +
                  (purchaser ? ' ／ 購入者 ' + escapeHTML(purchaser) : '') + '</li>' +
              '</ul>' +
              actions +
            '</article>'
          );
        }).join('');
      }
    }

    el.innerHTML = B.PARTICIPANTS.map(function (p) {
      var row = sum.people[p.id];
      var b = row.buckets || { cottage: 0, food: 0, rental: 0, car: 0, other: 0 };
      var paid = row.paidDeposit;
      var remain = row.settlementBalance;
      var remainClass = remain > 0 ? 'is-plus' : (remain < 0 ? 'is-minus' : 'is-zero');
      var remainLabel = remain > 0
        ? '残金（戻り） ' + B.formatYen(remain)
        : (remain < 0
          ? '残金（不足） ' + B.formatYen(remain)
          : '残金 0円');

      var depositLine = admin
        ? (
          '<p class="nagomi-deposit-line">' +
            '<span>入金</span>' +
            '<label class="nagomi-deposit-input-wrap">' +
              '<input type="number" class="js_deposit_input" inputmode="numeric" min="0" step="1000" ' +
                'data-id="' + p.id + '" value="' + paid + '" aria-label="' + escapeHTML(p.name) + 'の入金額">' +
              '<em>円</em>' +
            '</label>' +
          '</p>'
        )
        : (
          '<p class="nagomi-deposit-line"><span>入金</span><strong>' + B.formatYen(paid) + '</strong></p>'
        );

      return (
        '<article class="nagomi-simple-card" data-id="' + p.id + '">' +
          '<header>' + avatarHTML(p.name) + '<h3>' + escapeHTML(p.name) + '</h3></header>' +
          depositLine +
          '<ul class="nagomi-cost-lines">' +
            '<li><span>コテージ費</span><em>' + B.formatYen(b.cottage) + '</em></li>' +
            '<li><span>食材費</span><em>' + B.formatYen(b.food) + '</em></li>' +
            '<li><span>レンタル費</span><em>' + B.formatYen(b.rental) + '</em></li>' +
            '<li><span>車代</span><em>' + B.formatYen(b.car) + '</em></li>' +
            (b.other ? '<li><span>その他</span><em>' + B.formatYen(b.other) + '</em></li>' : '') +
          '</ul>' +
          '<p class="nagomi-remain ' + remainClass + '">' + remainLabel + '</p>' +
        '</article>'
      );
    }).join('');

    if (focusId) {
      var restore = el.querySelector('.js_deposit_input[data-id="' + focusId + '"]');
      if (restore) {
        restore.focus();
        if (focusValue != null) restore.value = focusValue;
        if (focusSelStart != null && focusSelEnd != null) {
          try { restore.setSelectionRange(focusSelStart, focusSelEnd); } catch (err) {}
        }
      }
    }
  }

  async function saveDeposit(participantId, paidAmount) {
    if (!isAdmin()) {
      alert('入金額の変更は管理者（' + ADMIN_NAME + '）のみ可能です。');
      return;
    }
    requireMe(async function () {
      var budget = ensureBudgetReady();
      var paid = Math.max(0, Math.floor(Number(paidAmount) || 0));
      var dep = budget.deposits[participantId];
      if (!dep) return;
      dep.paidDeposit = paid;
      dep.depositStatus = B.depositStatusFromPaid(paid, B.INITIAL_DEPOSIT);
      dep.updatedBy = getMe();
      dep.updatedAt = nowISO();
      if (paid > 0 && !dep.paidAt) dep.paidAt = nowISO();
      if (paid <= 0) dep.paidAt = '';
      await saveBudget();
    });
  }

  function paymentSourceLabel(src) {
    return src === 'personal-advance' ? '個人立替' : '共同財布から支払い';
  }

  /* ---------- Expense modal ---------- */
  function fillExpenseFormSelects() {
    var purchaser = document.getElementById('expense_purchaser');
    var checks = document.getElementById('expense_people_checks');
    if (purchaser) {
      purchaser.innerHTML = '<option value="">（未指定）</option>' +
        B.PARTICIPANTS.map(function (p) {
          return '<option value="' + p.id + '">' + escapeHTML(p.name) + '</option>';
        }).join('');
    }
    if (checks) {
      checks.innerHTML = B.PARTICIPANTS.map(function (p) {
        return (
          '<label class="nagomi-check-inline">' +
            '<input type="checkbox" class="js_expense_person" value="' + p.id + '"> ' +
            escapeHTML(p.name) +
          '</label>'
        );
      }).join('');
    }
  }

  function getCustomPersonIds() {
    return Array.prototype.slice.call(
      document.querySelectorAll('#expense_people_checks .js_expense_person:checked')
    ).map(function (el) { return el.value; });
  }

  function updateExpensePreview() {
    var preview = document.getElementById('expense_preview');
    var errEl = document.getElementById('expense_error');
    var form = document.getElementById('expense_form');
    var customBox = document.getElementById('expense_custom_people');
    if (!preview || !form) return;

    var fd = new FormData(form);
    var amount = Math.floor(Number(fd.get('amount')) || 0);
    var allocationType = String(fd.get('allocationType') || 'all11');
    var expenseId = String(fd.get('expenseId') || editingExpenseId || 'preview');

    if (customBox) customBox.hidden = allocationType !== 'custom';

    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = '';
    }

    if (!amount || amount < 0) {
      preview.innerHTML = '<p>金額を入力すると配分プレビューが表示されます。</p>';
      return;
    }

    try {
      var customIds = allocationType === 'custom' ? getCustomPersonIds() : [];
      var result = B.previewAllocation(amount, allocationType, customIds, expenseId);
      var countParts = Object.keys(result.counts).sort(function (a, b) {
        return Number(b) - Number(a);
      }).map(function (amt) {
        return '<li>' + result.counts[amt] + '人 × ' + B.formatYen(Number(amt)) + '</li>';
      }).join('');

      preview.innerHTML =
        '<p>支出額 <strong>' + B.formatYen(amount) + '</strong></p>' +
        '<p>対象人数 <strong>' + result.participantIds.length + '人</strong></p>' +
        '<ul>' + countParts + '</ul>' +
        '<p>合計 <strong>' + B.formatYen(result.total) + '</strong></p>';
    } catch (err) {
      preview.innerHTML = '';
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = err.message || String(err);
      }
    }
  }

  function openExpenseModal(expense, shopLink) {
    requireMe(function () {
      var modal = document.getElementById('expense_modal');
      var form = document.getElementById('expense_form');
      var ttl = document.getElementById('expense_modal_ttl');
      var errEl = document.getElementById('expense_error');
      if (!modal || !form) return;

      fillExpenseFormSelects();
      shopExpenseLink = shopLink || null;
      editingExpenseId = expense && expense.id ? expense.id : null;

      if (errEl) {
        errEl.hidden = true;
        errEl.textContent = '';
      }

      form.reset();
      form.expenseId.value = editingExpenseId || '';

      if (expense) {
        if (ttl) ttl.textContent = '支出を編集';
        form.title.value = expense.title || '';
        form.amount.value = expense.amount != null ? expense.amount : '';
        form.category.value = expense.category || 'other';
        form.purchaserId.value = expense.purchaserId || '';
        form.paymentSource.value = expense.paymentSource || 'common-wallet';
        form.allocationType.value = expense.allocationType || 'all11';
        form.receiptUrl.value = expense.receiptUrl || '';
        form.memo.value = expense.memo || '';
        if (expense.allocationType === 'custom' && expense.participantIds) {
          expense.participantIds.forEach(function (id) {
            var cb = document.querySelector('#expense_people_checks .js_expense_person[value="' + id + '"]');
            if (cb) cb.checked = true;
          });
        }
      } else {
        if (ttl) ttl.textContent = '支出を登録';
        var myId = B.NAME_TO_ID[getMe()] || '';
        if (myId) form.purchaserId.value = myId;
        form.allocationType.value = 'all11';
        form.paymentSource.value = 'common-wallet';
        form.category.value = 'food';
      }

      updateExpensePreview();
      modal.classList.add('is-show');
      modal.setAttribute('aria-hidden', 'false');
    });
  }

  function closeExpenseModal() {
    var modal = document.getElementById('expense_modal');
    if (!modal) return;
    modal.classList.remove('is-show');
    modal.setAttribute('aria-hidden', 'true');
    editingExpenseId = null;
    shopExpenseLink = null;
  }

  async function submitExpense(e) {
    if (e && e.preventDefault) e.preventDefault();
    var form = document.getElementById('expense_form');
    var errEl = document.getElementById('expense_error');
    if (!form) return;

    requireMe(async function () {
      var fd = new FormData(form);
      var title = String(fd.get('title') || '').trim();
      var amount = Math.floor(Number(fd.get('amount')));
      var category = String(fd.get('category') || 'other');
      var purchaserId = String(fd.get('purchaserId') || '');
      var paymentSource = String(fd.get('paymentSource') || 'common-wallet');
      var allocationType = String(fd.get('allocationType') || 'all11');
      var receiptUrl = String(fd.get('receiptUrl') || '').trim();
      var memo = String(fd.get('memo') || '').trim();
      var expenseId = String(fd.get('expenseId') || editingExpenseId || '');
      var customIds = allocationType === 'custom' ? getCustomPersonIds() : [];

      function showErr(msg) {
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = msg;
        } else {
          alert(msg);
        }
      }

      if (!title) return showErr('購入内容を入力してください。');
      if (!Number.isInteger(amount) || amount < 0) return showErr('金額は0以上の整数で入力してください。');

      var participantIds;
      try {
        participantIds = B.resolveParticipantIds(allocationType, customIds);
        var check = B.allocateAmount(amount, participantIds, B.seedHash(expenseId || title + amount));
        var sum = check.reduce(function (a, b) { return a + b.amount; }, 0);
        if (sum !== amount) return showErr('配分合計が支出額と一致しません。');
      } catch (err) {
        return showErr(err.message || String(err));
      }

      var budget = ensureBudgetReady();
      var actor = getMe();
      var existing = expenseId
        ? (budget.expenses || []).find(function (x) { return x.id === expenseId; })
        : null;

      if (existing) {
        var admin = isAdmin();
        if (existing.isInitialExpense && !admin) {
          return showErr('初期支出の編集は管理者のみ可能です。');
        }
        if (!admin && existing.createdBy !== actor) {
          return showErr('他人が登録した支出は編集できません。');
        }
        if (!admin && existing.allocationType !== allocationType) {
          return showErr('負担グループの変更は管理者のみ可能です。');
        }
        existing.title = title;
        existing.amount = amount;
        existing.category = category;
        existing.purchaserId = purchaserId;
        existing.paymentSource = paymentSource;
        existing.allocationType = allocationType;
        existing.participantIds = participantIds;
        existing.receiptUrl = receiptUrl;
        existing.memo = memo;
        existing.updatedAt = nowISO();
        existing.updatedBy = actor;
        if (paymentSource === 'personal-advance' && !existing.advanceSettlementStatus) {
          existing.advanceSettlementStatus = 'unsettled';
        }
      } else {
        var newId = uid();
        var row = {
          id: newId,
          title: title,
          amount: amount,
          category: category,
          purchaserId: purchaserId,
          paymentSource: paymentSource,
          allocationType: allocationType,
          participantIds: participantIds,
          receiptUrl: receiptUrl,
          memo: memo,
          paymentStatus: 'paid',
          isInitialExpense: false,
          createdAt: nowISO(),
          createdBy: actor,
          updatedAt: '',
          updatedBy: '',
          deletedAt: null,
          deletedBy: null,
          advanceSettlementStatus: paymentSource === 'personal-advance' ? 'unsettled' : null
        };
        budget.expenses = (budget.expenses || []).concat([row]);

        if (shopExpenseLink) {
          var list = state[shopExpenseLink.storeKey] || [];
          list.forEach(function (it) {
            if (it.id === shopExpenseLink.itemId) {
              it.expenseId = newId;
              it.actualAmount = amount;
              it.done = true;
            }
          });
          await store.set(shopExpenseLink.storeKey, list);
          renderList(shopExpenseLink.storeKey);
        }
      }

      await saveBudget();
      closeExpenseModal();
    });
  }

  async function softDeleteExpense(id) {
    if (!isAdmin()) {
      alert('支出の削除は管理者（' + ADMIN_NAME + '）のみ可能です。');
      return;
    }
    requireMe(async function () {
      var budget = ensureBudgetReady();
      var row = (budget.expenses || []).find(function (x) { return x.id === id; });
      if (!row) return;
      if (!window.confirm('「' + row.title + '」を削除しますか？（論理削除）')) return;
      row.deletedAt = nowISO();
      row.deletedBy = getMe();
      row.updatedAt = nowISO();
      row.updatedBy = getMe();
      await saveBudget();
    });
  }

  async function restoreExpense(id) {
    if (!isAdmin()) {
      alert('削除データの復元は管理者（' + ADMIN_NAME + '）のみ可能です。');
      return;
    }
    requireMe(async function () {
      var budget = ensureBudgetReady();
      var row = (budget.expenses || []).find(function (x) { return x.id === id; });
      if (!row) return;
      row.deletedAt = null;
      row.deletedBy = null;
      row.updatedAt = nowISO();
      row.updatedBy = getMe();
      await saveBudget();
    });
  }

  function registerShopExpense(storeKey, itemId) {
    requireMe(function () {
      var list = state[storeKey] || [];
      var item = list.find(function (it) { return it.id === itemId; });
      if (!item) return;
      if (item.expenseId) {
        alert('この商品はすでに共同財布へ支出登録済みです。');
        return;
      }
      var amount = Math.floor(Number(item.actualAmount) || 0);
      if (!amount) {
        alert('先に実際の購入金額を入力してください。');
        return;
      }
      openExpenseModal({
        title: (storeKey === 'konan' ? 'コーナン ' : storeKey === 'ropia' ? 'ロピア ' : '') + item.text,
        amount: amount,
        category: storeKey === 'ropia' ? 'food' : 'supplies',
        purchaserId: B.NAME_TO_ID[getMe()] || '',
        paymentSource: 'common-wallet',
        allocationType: 'all11',
        receiptUrl: '',
        memo: item.memo || ''
      }, { storeKey: storeKey, itemId: itemId });
    });
  }

  /* ---------- Lists ---------- */
  function normalizeShopItem(item, storeName) {
    return {
      id: item.id || uid(),
      text: item.text || '',
      done: !!item.done,
      by: item.by || '',
      store: item.store || storeName,
      qty: item.qty != null ? item.qty : 1,
      assignee: item.assignee || '',
      actualAmount: item.actualAmount != null && item.actualAmount !== ''
        ? Math.floor(Number(item.actualAmount))
        : null,
      expenseId: item.expenseId || null,
      memo: item.memo || ''
    };
  }

  function normalizeShopList(list, storeName) {
    return (list || []).map(function (it) { return normalizeShopItem(it, storeName); });
  }

  function listRowHTML(item, storeKey) {
    var by = item.by ? '<em class="by">' + escapeHTML(item.by) + '</em>' : '';
    var isShop = storeKey === 'konan' || storeKey === 'ropia';
    var extra = '';

    if (isShop) {
      var amtVal = item.actualAmount != null ? item.actualAmount : '';
      extra +=
        '<label class="nagomi-shop-amt">金額' +
          '<input type="number" class="js_shop_amount" data-store="' + storeKey + '" data-id="' + item.id +
            '" min="0" step="1" inputmode="numeric" value="' + amtVal + '" placeholder="円">' +
        '</label>';
      if (item.expenseId) {
        extra += '<span class="nagomi-shop-linked">共同財布登録済</span>';
      } else if (item.actualAmount != null && item.actualAmount > 0) {
        extra +=
          '<button type="button" class="nagomi-btn-primary js_shop_expense" data-store="' +
            storeKey + '" data-id="' + item.id + '">共同財布へ支出登録</button>';
      }
    }

    return (
      '<div class="list-row" data-id="' + item.id + '">' +
        '<input type="checkbox" class="js_list_check" data-store="' + storeKey + '" data-id="' + item.id + '"' +
          (item.done ? ' checked' : '') + '>' +
        '<span class="txt">' + escapeHTML(item.text) + '</span>' +
        by +
        extra +
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

  function renderList(storeKey) {
    if (storeKey === 'pack') {
      ALL11.forEach(function (name) {
        var box = document.querySelector('.js_list[data-store="pack"][data-name="' + name + '"]');
        if (!box) return;
        var items = (state.pack && state.pack[name]) || [];
        box.innerHTML = items.map(function (it) {
          return listRowHTML(it, 'pack');
        }).join('');
      });
      return;
    }
    if (storeKey === 'board') {
      var boxBoard = document.querySelector('.js_list[data-store="board"]');
      if (!boxBoard) return;
      boxBoard.innerHTML = (state.board || []).map(boardRowHTML).join('');
      return;
    }
    var box = document.querySelector('.js_list[data-store="' + storeKey + '"]');
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
      var inputSel = storeKey === 'pack'
        ? '.js_list_input[data-store="pack"][data-name="' + name + '"]'
        : '.js_list_input[data-store="' + storeKey + '"]';
      var input = document.querySelector(inputSel);
      var text = input ? input.value.trim() : '';
      if (!text) return;
      var item;
      if (storeKey === 'konan' || storeKey === 'ropia') {
        item = normalizeShopItem({
          id: uid(),
          text: text,
          done: false,
          by: getMe(),
          store: storeKey
        }, storeKey);
      } else {
        item = { id: uid(), text: text, done: false, by: getMe() };
      }
      if (storeKey === 'pack') {
        if (!state.pack[name]) state.pack[name] = [];
        state.pack[name].push(item);
        await store.set('pack', state.pack);
      } else {
        if (!state[storeKey]) state[storeKey] = [];
        state[storeKey].push(item);
        await store.set(storeKey, state[storeKey]);
      }
      if (input) input.value = '';
      renderList(storeKey);
    });
  }

  async function toggleListDone(storeKey, id, name) {
    if (storeKey === 'pack') {
      var n = name || findPackNameById(id);
      var items = state.pack[n] || [];
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
    for (var i = 0; i < ALL11.length; i++) {
      var n = ALL11[i];
      var items = (state.pack && state.pack[n]) || [];
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
      var n = findPackNameById(id);
      state.pack[n] = (state.pack[n] || []).filter(function (it) { return it.id !== id; });
      await store.set('pack', state.pack);
      renderList('pack');
      return;
    }
    state[storeKey] = (state[storeKey] || []).filter(function (it) { return it.id !== id; });
    await store.set(storeKey, state[storeKey]);
    renderList(storeKey);
  }

  async function updateShopAmount(storeKey, id, value) {
    var list = state[storeKey] || [];
    list.forEach(function (it) {
      if (it.id === id) {
        if (value === '' || value == null) it.actualAmount = null;
        else it.actualAmount = Math.max(0, Math.floor(Number(value) || 0));
      }
    });
    await store.set(storeKey, list);
    renderList(storeKey);
  }

  async function postBoard() {
    requireMe(async function () {
      var ta = document.querySelector('.js_board_input');
      var text = ta ? ta.value.trim() : '';
      if (!text) return;
      var item = { id: uid(), by: getMe(), text: text };
      state.board = [item].concat(state.board || []);
      await store.set('board', state.board);
      if (ta) ta.value = '';
      renderList('board');
    });
  }

  /* ---------- Migrations ---------- */
  function migrateNameInList(list) {
    return (list || []).map(function (n) { return migrateGirlfriendName(n); });
  }

  function migrateEvents(events) {
    var base = emptyEvents();
    var out = events && typeof events === 'object' ? events : {};
    Object.keys(base).forEach(function (k) {
      base[k] = migrateNameInList(out[k] || []);
    });
    return base;
  }

  function migratePack(pack) {
    var out = pack && typeof pack === 'object' ? pack : {};
    if (out['ゆうじろう彼女'] && !out['ゆうじろうくん彼女']) {
      out['ゆうじろうくん彼女'] = out['ゆうじろう彼女'];
      delete out['ゆうじろう彼女'];
    } else if (out['ゆうじろう彼女'] && out['ゆうじろうくん彼女']) {
      out['ゆうじろうくん彼女'] = (out['ゆうじろうくん彼女'] || []).concat(out['ゆうじろう彼女'] || []);
      delete out['ゆうじろう彼女'];
    }
    ALL11.forEach(function (n) {
      if (!out[n]) out[n] = [];
    });
    return out;
  }

  function ensureKonanDefaults(list) {
    var out = normalizeShopList(list || [], 'konan');
    var charcoal = out.find(function (it) {
      return it.text === '木炭' || it.text === '炭追加3kg' || it.text === '炭';
    });
    if (charcoal) {
      charcoal.text = '木炭';
    } else {
      out.unshift(normalizeShopItem({ text: '木炭', done: false, by: '' }, 'konan'));
    }
    return out;
  }

  /* ---------- Load & bind ---------- */
  async function loadAll() {
    // 旧デフォルト参加者シードを一度クリア（最初はアイコンなし）
    var eventsSeedVersion = 0;
    try {
      eventsSeedVersion = Number(localStorage.getItem('nagomi_events_seed_v') || 0);
    } catch (e) { /* ignore */ }
    if (eventsSeedVersion < 2) {
      state.events = emptyEvents();
      try { localStorage.setItem('nagomi_events_seed_v', '2'); } catch (e) { /* ignore */ }
    } else {
      state.events = migrateEvents(await store.get('events', DEFAULTS.events));
    }

    state.shared = await store.get('shared', DEFAULTS.shared);
    state.konan = ensureKonanDefaults(await store.get('konan', DEFAULTS.konan));
    state.ropia = normalizeShopList(await store.get('ropia', DEFAULTS.ropia), 'ropia');
    state.pack = migratePack(await store.get('pack', DEFAULTS.pack));
    state.board = await store.get('board', DEFAULTS.board);

    var rawBudget = await store.get('budget', null);
    var shaped = B.ensureBudgetShape(rawBudget);
    if (shaped) {
      state.budget = shaped;
    } else {
      var oldPay = await store.get('pay', null);
      if (oldPay) {
        state.budget = B.migrateLegacyPay(oldPay);
      } else {
        state.budget = B.createDefaultBudget();
      }
      await store.set('budget', state.budget, true);
      // 旧10人/旧買い出しシードを新初期値へ
      state.konan = ensureKonanDefaults(DEFAULTS.konan.slice());
      state.ropia = DEFAULTS.ropia.slice();
    }

    // persist migrated names once (silent)
    await store.set('events', state.events, true);
    await store.set('pack', state.pack, true);
    await store.set('konan', state.konan, true);
    await store.set('ropia', state.ropia, true);

    me = getMe();

    try {
      var t = B.runSelfTests();
      if (!t.ok) console.warn('[nagomi] self-tests failed', t.failed);
      else console.log('[nagomi] self-tests ok', t.results.length);
    } catch (err) {
      console.error('[nagomi] self-tests error', err);
    }

    renderEvents();
    renderBudget();
    renderAllLists();

    if (!me) openNameModal(null);
  }

  function bindBudgetUI() {
    document.querySelectorAll('.js_expense_open').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        openExpenseModal(null, null);
      });
    });

    document.querySelectorAll('.js_expense_close').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        closeExpenseModal();
      });
    });

    var form = document.getElementById('expense_form');
    if (form) {
      form.addEventListener('submit', submitExpense);
      form.addEventListener('input', updateExpensePreview);
      form.addEventListener('change', updateExpensePreview);
    }

    var expenseModal = document.getElementById('expense_modal');
    if (expenseModal) {
      expenseModal.addEventListener('click', function (e) {
        if (e.target === expenseModal) closeExpenseModal();
      });
    }

    document.addEventListener('click', function (e) {
      var shopExp = e.target.closest('.js_shop_expense') || e.target.closest('.js_shop_to_expense');
      if (shopExp) {
        registerShopExpense(shopExp.getAttribute('data-store'), shopExp.getAttribute('data-id'));
        return;
      }
      var editExp = e.target.closest('.js_expense_edit');
      if (editExp) {
        var editId = editExp.getAttribute('data-id');
        var editRow = (ensureBudgetReady().expenses || []).find(function (x) { return x.id === editId; });
        if (editRow) openExpenseModal(editRow);
        return;
      }
      var delExp = e.target.closest('.js_expense_delete');
      if (delExp) {
        softDeleteExpense(delExp.getAttribute('data-id'));
      }
    });

    document.addEventListener('change', function (e) {
      if (e.target.classList.contains('js_deposit_input')) {
        saveDeposit(e.target.getAttribute('data-id'), e.target.value);
        return;
      }
      if (e.target.classList.contains('js_shop_amount')) {
        updateShopAmount(
          e.target.getAttribute('data-store'),
          e.target.getAttribute('data-id'),
          e.target.value
        );
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      if (!e.target.classList.contains('js_deposit_input')) return;
      e.preventDefault();
      e.target.blur();
    });
  }

  function bindUI() {
    document.querySelectorAll('.js_name_btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setMe(btn.getAttribute('data-name'));
        renderEvents();
        renderBudget();
      });
    });

    document.querySelectorAll('.js_join_btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        toggleJoin(btn.getAttribute('data-key'));
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
      var del = e.target.closest('.js_del');
      if (del) {
        var list = del.closest('.js_list');
        var row = del.closest('[data-id]');
        var storeKey = del.getAttribute('data-store') || (list && list.getAttribute('data-store'));
        var id = del.getAttribute('data-id') || (row && row.getAttribute('data-id'));
        if (storeKey && id) deleteListItem(storeKey, id);
        return;
      }
      if (e.target.classList.contains('js_list_check')) {
        var sk = e.target.getAttribute('data-store') ||
          (e.target.closest('.js_list') && e.target.closest('.js_list').getAttribute('data-store'));
        var itemId = e.target.getAttribute('data-id') ||
          (e.target.closest('[data-id]') && e.target.closest('[data-id]').getAttribute('data-id'));
        var packCard = e.target.closest('.pack-card');
        var name = packCard ? packCard.getAttribute('data-name') : null;
        if (sk && itemId) toggleListDone(sk, itemId, name);
      }
    });

    var boardBtn = document.querySelector('.js_board_post');
    if (boardBtn) boardBtn.addEventListener('click', postBoard);

    bindBudgetUI();
  }

  /* ---------- Original LP animations (safe without type swipers) ---------- */
  function initAnimations() {
    var swiperTypeElm = document.querySelectorAll('.js_swiper_type');
    swiperTypeElm.forEach(function (e) {
      var o = e.nextElementSibling;
      var t = e.parentNode;
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
        var href = o.getAttribute('href');
        if (!href || href === '#') return;
        var target = document.getElementById(href.replace('#', ''));
        if (!target) return;
        e.preventDefault();
        var top = target.getBoundingClientRect().top + window.pageYOffset;
        window.scrollTo({ top: top, behavior: 'smooth' });
      });
    });

    var loadElm = document.querySelectorAll('.js_anim_load');
    var fvElm = document.querySelector('.js_fv_high');

    function revealLoad() {
      loadElm.forEach(function (e) { e.classList.add('is-anim'); });
      if (fvElm) fvElm.style.height = window.innerHeight + 'px';
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
      setTimeout(revealLoad, 400);
    }

    window.addEventListener('resize', function () {
      if (fvElm) fvElm.style.height = window.innerHeight + 'px';
    });

    var scrollElm = document.querySelectorAll('.js_anim_scroll');
    window.addEventListener('scroll', function () {
      var o = window.scrollY;
      var t = 0.8 * window.innerHeight;
      for (var i = 0; i < scrollElm.length; i++) {
        var e = scrollElm[i];
        if (e.getBoundingClientRect().top + o - t < o) e.classList.add('is-anim');
      }
    }, { passive: true });
    window.dispatchEvent(new Event('scroll'));
  }

  /* ---------- FV video slideshow: 5s each, fade loop ---------- */
  function initFvVideos() {
    var wrap = document.querySelector('.js_fv_videos');
    if (!wrap) return;
    var videos = Array.prototype.slice.call(wrap.querySelectorAll('video'));
    if (!videos.length) return;

    var index = 0;
    var timer = null;
    var DURATION = 5000;

    function show(i) {
      videos.forEach(function (v, n) {
        if (n === i) {
          v.classList.add('is-active');
          try {
            v.currentTime = 0;
            var p = v.play();
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

  /* ---------- section hero videos: keep muted loop playing ---------- */
  function initSecVideos() {
    var wraps = document.querySelectorAll('.js_sec_video, .js_life_videos');
    wraps.forEach(function (wrap) {
      var videos = Array.prototype.slice.call(wrap.querySelectorAll('video'));
      videos.forEach(function (v) {
        v.muted = true;
        v.playsInline = true;
        v.setAttribute('playsinline', '');
        v.loop = true;
        try {
          var p = v.play();
          if (p && typeof p.catch === 'function') p.catch(function () {});
        } catch (e) {}
      });
    });
  }

  /* ---------- #life video slideshow: 9 → 7 → 8, 5s each, fade loop ---------- */
  function initLifeVideos() {
    var wrap = document.querySelector('.js_life_videos');
    if (!wrap) return;
    var videos = Array.prototype.slice.call(wrap.querySelectorAll('video'));
    if (!videos.length) return;

    var index = 0;
    var timer = null;
    var DURATION = 5000;

    function playAll() {
      videos.forEach(function (v) {
        v.muted = true;
        v.playsInline = true;
        v.setAttribute('playsinline', '');
        v.loop = true;
        try {
          var p = v.play();
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

    videos.forEach(function (v) {
      v.addEventListener('loadeddata', function () { playAll(); });
      v.addEventListener('canplay', function () { playAll(); });
    });

    if (typeof IntersectionObserver !== 'undefined') {
      var io = new IntersectionObserver(function (entries) {
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

    function unlock() {
      playAll();
      initSecVideos();
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
    try { initSecVideos(); } catch (e) { console.error(e); }
    try { bindUI(); } catch (e) { console.error(e); }
    try { loadAll(); } catch (e) { console.error(e); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
