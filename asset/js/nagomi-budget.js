/* =========================================================
   和み予算・精算コア（将来のSupabase接続を想定した純粋ロジック）
   ========================================================= */
(function (global) {
  'use strict';

  var DATA_VERSION = 3;
  var INITIAL_DEPOSIT = 20000;
  var ADMIN_NAME = 'けいくん';

  var PARTICIPANTS = [
    { id: 'nagomi-mama', name: '和みママ', ini: 'マ', color: '#c96f4a' },
    { id: 'ken', name: 'けんさん', ini: 'けん', color: '#5a7d54' },
    { id: 'miki', name: 'みきさん', ini: 'み', color: '#c9536f' },
    { id: 'kimny', name: 'キムニー', ini: 'キ', color: '#1b6e8c' },
    { id: 'zacky', name: 'ザッキィー', ini: 'ザ', color: '#7d9b4e' },
    { id: 'asa', name: 'アサちゃん', ini: 'ア', color: '#b0568f' },
    { id: 'sumi', name: 'すみちゃん', ini: 'す', color: '#d9a441' },
    { id: 'keichan', name: 'けいちゃん', ini: 'け', color: '#7a5bb0' },
    { id: 'keikun', name: 'けいくん', ini: 'K', color: '#2277a8' },
    { id: 'yujiro', name: 'ゆうじろうくん', ini: 'ゆ', color: '#c9536f' },
    { id: 'yujiro-girlfriend', name: 'ゆうじろうくん彼女', ini: '彼', color: '#b0568f' }
  ];

  var SPECIAL_MEMBERS = [
    { id: 'hana', name: 'はなちゃん', note: '🐕スペシャルメンバー（費用負担なし）' }
  ];

  var TOTAL_PARTICIPANTS = PARTICIPANTS.length;
  var EXPECTED_TOTAL_DEPOSIT = INITIAL_DEPOSIT * TOTAL_PARTICIPANTS;

  var NAME_TO_ID = {};
  var ID_TO_PARTICIPANT = {};
  PARTICIPANTS.forEach(function (p) {
    NAME_TO_ID[p.name] = p.id;
    ID_TO_PARTICIPANT[p.id] = p;
  });
  // legacy name → id
  NAME_TO_ID['ゆうじろう彼女'] = 'yujiro-girlfriend';

  var all11 = PARTICIPANTS.map(function (p) { return p.id; });
  var cottage9 = PARTICIPANTS.filter(function (p) {
    return p.id !== 'yujiro' && p.id !== 'yujiro-girlfriend';
  }).map(function (p) { return p.id; });
  var car8 = PARTICIPANTS.filter(function (p) {
    return p.id !== 'ken' && p.id !== 'zacky' && p.id !== 'yujiro';
  }).map(function (p) { return p.id; });
  var yujiroOnly = ['yujiro'];

  var ALLOCATION_LABELS = {
    all11: '全員11人',
    cottage9: 'コテージ共同組9人',
    car8: '車代負担者8人',
    yujiroOnly: 'ゆうじろうくんのみ',
    custom: '個別選択'
  };

  var CATEGORY_LABELS = {
    accommodation: '宿泊',
    pet: 'ペット',
    transportation: '交通',
    food: '食材',
    drink: '飲み物',
    supplies: '用品',
    rental: 'レンタル',
    other: 'その他'
  };

  /** 画面表示用のざっくり費目 */
  var BUCKET_LABELS = {
    cottage: 'コテージ費',
    food: '食材費',
    rental: 'レンタル費',
    car: '車代',
    other: 'その他'
  };

  function expenseBucket(category) {
    if (category === 'accommodation' || category === 'pet') return 'cottage';
    if (category === 'food' || category === 'drink' || category === 'supplies') return 'food';
    if (category === 'rental') return 'rental';
    if (category === 'transportation') return 'car';
    return 'other';
  }

  var DEPOSIT_STATUS_LABELS = {
    unpaid: '未払い',
    partial: '一部支払い',
    paid: '支払済み'
  };

  var SETTLEMENT_STATUS_LABELS = {
    unsettled: '未精算',
    refunded: '返金済み',
    collected: '追加徴収済み',
    completed: '精算完了'
  };

  function seedHash(str) {
    var h = 0;
    var s = String(str || '');
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) - h) + s.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }

  function allocateAmount(amount, participantIds, rotationSeed) {
    if (!Number.isInteger(amount) || amount < 0) {
      throw new Error('amount must be a non-negative integer');
    }
    if (!Array.isArray(participantIds) || participantIds.length === 0) {
      throw new Error('participantIds must not be empty');
    }
    var count = participantIds.length;
    var baseAmount = Math.floor(amount / count);
    var remainder = amount % count;
    var seed = rotationSeed == null ? 0 : rotationSeed;
    var offset = ((seed % count) + count) % count;
    var rotatedIds = participantIds.slice(offset).concat(participantIds.slice(0, offset));
    var result = rotatedIds.map(function (participantId, index) {
      return {
        participantId: participantId,
        amount: baseAmount + (index < remainder ? 1 : 0)
      };
    });
    var sum = result.reduce(function (a, b) { return a + b.amount; }, 0);
    if (sum !== amount) {
      throw new Error('allocation sum mismatch: ' + sum + ' !== ' + amount);
    }
    return result;
  }

  function resolveParticipantIds(allocationType, customIds) {
    if (allocationType === 'all11') return all11.slice();
    if (allocationType === 'cottage9') return cottage9.slice();
    if (allocationType === 'car8') return car8.slice();
    if (allocationType === 'yujiroOnly') return yujiroOnly.slice();
    if (allocationType === 'custom') {
      if (!Array.isArray(customIds) || !customIds.length) {
        throw new Error('custom allocation requires at least one participant');
      }
      return customIds.slice();
    }
    throw new Error('unknown allocationType: ' + allocationType);
  }

  function depositStatusFromPaid(paidDeposit, expectedDeposit) {
    var expected = expectedDeposit == null ? INITIAL_DEPOSIT : expectedDeposit;
    var paid = paidDeposit || 0;
    if (paid <= 0) return 'unpaid';
    if (paid >= expected) return 'paid';
    return 'partial';
  }

  function createInitialExpenses() {
    return [
      {
        id: 'expense-cottage-6',
        title: '6人用コテージ',
        amount: 50160,
        category: 'accommodation',
        allocationType: 'cottage9',
        participantIds: cottage9.slice(),
        paymentSource: 'common-wallet',
        isInitialExpense: true,
        purchaserId: '',
        receiptUrl: '',
        memo: '',
        paymentStatus: 'paid',
        createdAt: '2026-07-01T00:00:00+09:00',
        createdBy: ADMIN_NAME,
        updatedAt: '',
        updatedBy: '',
        deletedAt: null,
        deletedBy: null,
        advanceSettlementStatus: null
      },
      {
        id: 'expense-cottage-4-shared',
        title: '4人用コテージ・共同組',
        amount: 29920,
        category: 'accommodation',
        allocationType: 'cottage9',
        participantIds: cottage9.slice(),
        paymentSource: 'common-wallet',
        isInitialExpense: true,
        purchaserId: '',
        receiptUrl: '',
        memo: '',
        paymentStatus: 'paid',
        createdAt: '2026-07-01T00:00:00+09:00',
        createdBy: ADMIN_NAME,
        updatedAt: '',
        updatedBy: '',
        deletedAt: null,
        deletedBy: null,
        advanceSettlementStatus: null
      },
      {
        id: 'expense-pet',
        title: 'はなちゃんペット代',
        amount: 1980,
        category: 'pet',
        allocationType: 'cottage9',
        participantIds: cottage9.slice(),
        paymentSource: 'common-wallet',
        isInitialExpense: true,
        purchaserId: '',
        receiptUrl: '',
        memo: '',
        paymentStatus: 'paid',
        createdAt: '2026-07-01T00:00:00+09:00',
        createdBy: ADMIN_NAME,
        updatedAt: '',
        updatedBy: '',
        deletedAt: null,
        deletedBy: null,
        advanceSettlementStatus: null
      },
      {
        id: 'expense-cottage-yujiro',
        title: 'ゆうじろうくん用4人コテージ',
        amount: 29920,
        category: 'accommodation',
        allocationType: 'yujiroOnly',
        participantIds: yujiroOnly.slice(),
        paymentSource: 'common-wallet',
        isInitialExpense: true,
        purchaserId: '',
        receiptUrl: '',
        memo: '',
        paymentStatus: 'paid',
        createdAt: '2026-07-01T00:00:00+09:00',
        createdBy: ADMIN_NAME,
        updatedAt: '',
        updatedBy: '',
        deletedAt: null,
        deletedBy: null,
        advanceSettlementStatus: null
      },
      {
        id: 'expense-car',
        title: '車代',
        amount: 32500,
        category: 'transportation',
        allocationType: 'car8',
        participantIds: car8.slice(),
        paymentSource: 'common-wallet',
        isInitialExpense: true,
        purchaserId: '',
        receiptUrl: '',
        memo: 'けんさん号12,000 / ザッキィー号10,000 / ゆうじろうくん号10,500',
        paymentStatus: 'paid',
        createdAt: '2026-07-01T00:00:00+09:00',
        createdBy: ADMIN_NAME,
        updatedAt: '',
        updatedBy: '',
        deletedAt: null,
        deletedBy: null,
        advanceSettlementStatus: null,
        breakdown: [
          { label: 'けんさん号', amount: 12000 },
          { label: 'ザッキィー号', amount: 10000 },
          { label: 'ゆうじろうくん号', amount: 10500 }
        ]
      }
    ];
  }

  function createDefaultBudget() {
    var deposits = {};
    var settlements = {};
    PARTICIPANTS.forEach(function (p) {
      deposits[p.id] = {
        participantId: p.id,
        expectedDeposit: INITIAL_DEPOSIT,
        paidDeposit: 0,
        depositStatus: 'unpaid',
        paidAt: '',
        updatedBy: '',
        updatedAt: ''
      };
      settlements[p.id] = {
        settlementStatus: 'unsettled',
        settledAt: '',
        settledBy: ''
      };
    });
    return {
      version: DATA_VERSION,
      deposits: deposits,
      expenses: createInitialExpenses(),
      settlements: settlements
    };
  }

  function migrateLegacyPay(oldPay) {
    var budget = createDefaultBudget();
    if (!oldPay || typeof oldPay !== 'object') return budget;
    Object.keys(oldPay).forEach(function (name) {
      var id = NAME_TO_ID[name];
      if (!id || !budget.deposits[id]) return;
      var row = oldPay[name] || {};
      if (row.cash) {
        budget.deposits[id].paidDeposit = INITIAL_DEPOSIT;
        budget.deposits[id].depositStatus = 'paid';
      }
    });
    return budget;
  }

  function ensureBudgetShape(raw) {
    if (!raw || typeof raw !== 'object' || raw.version !== DATA_VERSION) {
      return null;
    }
    var base = createDefaultBudget();
    PARTICIPANTS.forEach(function (p) {
      if (raw.deposits && raw.deposits[p.id]) {
        var d = raw.deposits[p.id];
        base.deposits[p.id] = {
          participantId: p.id,
          expectedDeposit: INITIAL_DEPOSIT,
          paidDeposit: Math.max(0, Math.floor(Number(d.paidDeposit) || 0)),
          depositStatus: depositStatusFromPaid(d.paidDeposit, INITIAL_DEPOSIT),
          paidAt: d.paidAt || '',
          updatedBy: d.updatedBy || '',
          updatedAt: d.updatedAt || ''
        };
      }
      if (raw.settlements && raw.settlements[p.id]) {
        base.settlements[p.id] = {
          settlementStatus: raw.settlements[p.id].settlementStatus || 'unsettled',
          settledAt: raw.settlements[p.id].settledAt || '',
          settledBy: raw.settlements[p.id].settledBy || ''
        };
      }
    });
    if (Array.isArray(raw.expenses) && raw.expenses.length) {
      base.expenses = raw.expenses;
    }
    return base;
  }

  function activeExpenses(budget) {
    return (budget.expenses || []).filter(function (e) {
      return !e.deletedAt && e.paymentStatus !== 'cancelled';
    });
  }

  function paidWalletExpenses(budget) {
    return activeExpenses(budget).filter(function (e) {
      return e.paymentSource === 'common-wallet' && e.paymentStatus === 'paid';
    });
  }

  function expenseAllocations(expense) {
    var ids = expense.participantIds && expense.participantIds.length
      ? expense.participantIds
      : resolveParticipantIds(expense.allocationType, expense.participantIds);
    return allocateAmount(expense.amount, ids, seedHash(expense.id));
  }

  function computePersonSummaries(budget) {
    var map = {};
    PARTICIPANTS.forEach(function (p) {
      var dep = budget.deposits[p.id];
      map[p.id] = {
        participantId: p.id,
        name: p.name,
        expectedDeposit: INITIAL_DEPOSIT,
        paidDeposit: dep ? dep.paidDeposit : 0,
        depositStatus: dep ? dep.depositStatus : 'unpaid',
        actualBurden: 0,
        settlementBalance: 0,
        refundAmount: 0,
        additionalAmount: 0,
        settlementStatus: (budget.settlements[p.id] && budget.settlements[p.id].settlementStatus) || 'unsettled',
        breakdown: [],
        buckets: {
          cottage: 0,
          food: 0,
          rental: 0,
          car: 0,
          other: 0
        }
      };
    });

    activeExpenses(budget).forEach(function (expense) {
      if (expense.paymentStatus !== 'paid') return;
      var bucket = expenseBucket(expense.category);
      var allocs = expenseAllocations(expense);
      allocs.forEach(function (a) {
        var row = map[a.participantId];
        if (!row) return;
        row.actualBurden += a.amount;
        row.buckets[bucket] = (row.buckets[bucket] || 0) + a.amount;
        row.breakdown.push({
          expenseId: expense.id,
          title: expense.title,
          amount: expense.amount,
          category: expense.category,
          bucket: bucket,
          allocationType: expense.allocationType,
          allocationLabel: ALLOCATION_LABELS[expense.allocationType] || expense.allocationType,
          participantCount: expense.participantIds.length,
          personalAmount: a.amount
        });
      });
    });

    Object.keys(map).forEach(function (id) {
      var row = map[id];
      row.settlementBalance = row.paidDeposit - row.actualBurden;
      if (row.settlementBalance > 0) {
        row.refundAmount = row.settlementBalance;
        row.additionalAmount = 0;
      } else if (row.settlementBalance < 0) {
        row.refundAmount = 0;
        row.additionalAmount = -row.settlementBalance;
      } else {
        row.refundAmount = 0;
        row.additionalAmount = 0;
      }
    });

    return map;
  }

  function computeWalletSummary(budget) {
    var people = computePersonSummaries(budget);
    var paidDepositTotal = 0;
    var refundTotal = 0;
    var additionalCollectionTotal = 0;
    var paidCount = 0;

    PARTICIPANTS.forEach(function (p) {
      var row = people[p.id];
      paidDepositTotal += row.paidDeposit;
      refundTotal += row.refundAmount;
      additionalCollectionTotal += row.additionalAmount;
      if (row.paidDeposit > 0) paidCount++;
    });

    var expenseTotal = paidWalletExpenses(budget).reduce(function (s, e) {
      return s + e.amount;
    }, 0);

    var unpaidTotal = EXPECTED_TOTAL_DEPOSIT - paidDepositTotal;
    var cashBalance = paidDepositTotal - expenseTotal;
    var settlementDifference = cashBalance + additionalCollectionTotal - refundTotal;

    return {
      expectedDepositTotal: EXPECTED_TOTAL_DEPOSIT,
      paidDepositTotal: paidDepositTotal,
      unpaidTotal: unpaidTotal,
      paidCount: paidCount,
      totalParticipants: TOTAL_PARTICIPANTS,
      expenseTotal: expenseTotal,
      cashBalance: cashBalance,
      refundTotal: refundTotal,
      additionalCollectionTotal: additionalCollectionTotal,
      settlementDifference: settlementDifference,
      people: people
    };
  }

  function formatYen(n) {
    var v = Math.floor(Number(n) || 0);
    return v.toLocaleString('ja-JP') + '円';
  }

  function previewAllocation(amount, allocationType, customIds, expenseId) {
    var ids = resolveParticipantIds(allocationType, customIds);
    var allocs = allocateAmount(amount, ids, seedHash(expenseId || allocationType + amount));
    var counts = {};
    allocs.forEach(function (a) {
      counts[a.amount] = (counts[a.amount] || 0) + 1;
    });
    return {
      participantIds: ids,
      allocations: allocs,
      counts: counts,
      total: allocs.reduce(function (s, a) { return s + a.amount; }, 0)
    };
  }

  function runSelfTests() {
    var results = [];
    function ok(name, cond, detail) {
      results.push({ name: name, pass: !!cond, detail: detail || '' });
    }

    ok('participants=11', PARTICIPANTS.length === 11);
    ok('expected=220000', EXPECTED_TOTAL_DEPOSIT === 220000);
    ok('cottage9=9', cottage9.length === 9);
    ok('car8=8', car8.length === 8);
    ok('yujiroOnly=1', yujiroOnly.length === 1);

    var a1 = allocateAmount(50160, cottage9, seedHash('expense-cottage-6'));
    ok('cottage6 sum', a1.reduce(function (s, x) { return s + x.amount; }, 0) === 50160);
    ok('cottage6 no yujiro', a1.every(function (x) {
      return x.participantId !== 'yujiro' && x.participantId !== 'yujiro-girlfriend';
    }));

    var a2 = allocateAmount(29920, yujiroOnly, 0);
    ok('yujiro cottage', a2.length === 1 && a2[0].amount === 29920);

    var a3 = allocateAmount(32500, car8, seedHash('expense-car'));
    ok('car sum', a3.reduce(function (s, x) { return s + x.amount; }, 0) === 32500);
    ok('car no drivers', a3.every(function (x) {
      return x.participantId !== 'ken' && x.participantId !== 'zacky' && x.participantId !== 'yujiro';
    }));

    var budget = createDefaultBudget();
    PARTICIPANTS.forEach(function (p) {
      budget.deposits[p.id].paidDeposit = 20000;
      budget.deposits[p.id].depositStatus = 'paid';
    });
    var sum = computeWalletSummary(budget);
    ok('paid total 220000', sum.paidDepositTotal === 220000);
    ok('expense 144480', sum.expenseTotal === 144480);
    ok('cash 75520', sum.cashBalance === 75520);

    var burdenSum = 0;
    Object.keys(sum.people).forEach(function (id) {
      burdenSum += sum.people[id].actualBurden;
    });
    ok('burden=expense', burdenSum === sum.expenseTotal, burdenSum + ' vs ' + sum.expenseTotal);
    ok('settlementDiff=0', sum.settlementDifference === 0, String(sum.settlementDifference));

    var failed = results.filter(function (r) { return !r.pass; });
    return { results: results, ok: failed.length === 0, failed: failed };
  }

  var DEFAULT_KONAN = [
    { text: '木炭' },
    { text: '紙皿' },
    { text: 'はし' },
    { text: 'コップ' }
  ];

  var DEFAULT_ROPIA = [
    { text: 'BBQ肉' },
    { text: '牛タン' },
    { text: '赤身肉' },
    { text: 'ウィンナー' },
    { text: '鶏肉' },
    { text: 'キャベツ' },
    { text: '椎茸' },
    { text: 'コーン' },
    { text: 'ピーマン' },
    { text: '焼きそば麺' },
    { text: 'コーヒー' },
    { text: 'エビ・シーフード' },
    { text: 'マッシュポテト' },
    { text: 'イカの塩辛' }
  ];

  global.NagomiBudget = {
    DATA_VERSION: DATA_VERSION,
    INITIAL_DEPOSIT: INITIAL_DEPOSIT,
    ADMIN_NAME: ADMIN_NAME,
    PARTICIPANTS: PARTICIPANTS,
    SPECIAL_MEMBERS: SPECIAL_MEMBERS,
    TOTAL_PARTICIPANTS: TOTAL_PARTICIPANTS,
    EXPECTED_TOTAL_DEPOSIT: EXPECTED_TOTAL_DEPOSIT,
    all11: all11,
    cottage9: cottage9,
    car8: car8,
    yujiroOnly: yujiroOnly,
    ALLOCATION_LABELS: ALLOCATION_LABELS,
    CATEGORY_LABELS: CATEGORY_LABELS,
    BUCKET_LABELS: BUCKET_LABELS,
    DEPOSIT_STATUS_LABELS: DEPOSIT_STATUS_LABELS,
    SETTLEMENT_STATUS_LABELS: SETTLEMENT_STATUS_LABELS,
    NAME_TO_ID: NAME_TO_ID,
    ID_TO_PARTICIPANT: ID_TO_PARTICIPANT,
    allocateAmount: allocateAmount,
    resolveParticipantIds: resolveParticipantIds,
    depositStatusFromPaid: depositStatusFromPaid,
    createDefaultBudget: createDefaultBudget,
    migrateLegacyPay: migrateLegacyPay,
    ensureBudgetShape: ensureBudgetShape,
    activeExpenses: activeExpenses,
    expenseAllocations: expenseAllocations,
    computePersonSummaries: computePersonSummaries,
    computeWalletSummary: computeWalletSummary,
    formatYen: formatYen,
    previewAllocation: previewAllocation,
    seedHash: seedHash,
    runSelfTests: runSelfTests,
    DEFAULT_KONAN: DEFAULT_KONAN,
    DEFAULT_ROPIA: DEFAULT_ROPIA,
    payerNames: PARTICIPANTS.map(function (p) { return p.name; })
  };
})(typeof window !== 'undefined' ? window : global);
