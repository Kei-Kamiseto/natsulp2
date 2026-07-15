/* =========================================================
   和み予算・精算コア（将来のSupabase接続を想定した純粋ロジック）
   ========================================================= */
(function (global) {
  'use strict';

  var DATA_VERSION = 6;
  var INITIAL_DEPOSIT = 20000;
  var ADMIN_NAME = 'けいくん';

  // ゆうじろうくん・彼女キャンセル → 費用負担は9人
  var PARTICIPANTS = [
    { id: 'nagomi-mama', name: '和みママ', ini: 'マ', color: '#c96f4a' },
    { id: 'ken', name: 'けんさん', ini: 'けん', color: '#5a7d54' },
    { id: 'miki', name: 'みきさん', ini: 'み', color: '#c9536f' },
    { id: 'kimny', name: 'キムニー', ini: 'キ', color: '#1b6e8c' },
    { id: 'zacky', name: 'ザッキィー', ini: 'ザ', color: '#7d9b4e' },
    { id: 'asa', name: 'アサちゃん', ini: 'ア', color: '#b0568f' },
    { id: 'sumi', name: 'すみちゃん', ini: 'す', color: '#d9a441' },
    { id: 'keichan', name: 'けいちゃん', ini: 'け', color: '#7a5bb0' },
    { id: 'keikun', name: 'けいくん', ini: 'K', color: '#2277a8' }
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

  var all9 = PARTICIPANTS.map(function (p) { return p.id; });
  // 運転手: けんさん / ザッキィー / けいくん
  var carDrivers = ['ken', 'zacky', 'keikun'];
  var car6 = PARTICIPANTS.filter(function (p) {
    return carDrivers.indexOf(p.id) === -1;
  }).map(function (p) { return p.id; });
  var kimnyOnly = ['kimny'];

  // 旧キー互換（保存済み支出の allocationType 用）
  var all11 = all9;
  var cottage9 = all9;
  var car8 = car6;
  var yujiroOnly = [];

  var ALLOCATION_LABELS = {
    all9: '全員9人',
    all11: '全員9人',
    cottage9: 'コテージ共同組9人',
    car6: '車代負担者6人',
    car8: '車代負担者6人',
    kimnyOnly: 'キムニーのみ',
    yujiroOnly: '（取消・不使用）',
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
    if (allocationType === 'all9' || allocationType === 'all11' || allocationType === 'cottage9') {
      return all9.slice();
    }
    if (allocationType === 'car6' || allocationType === 'car8') return car6.slice();
    if (allocationType === 'kimnyOnly') return kimnyOnly.slice();
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
        allocationType: 'all9',
        participantIds: all9.slice(),
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
        title: '4人用コテージ（ペット可）',
        amount: 29920,
        category: 'accommodation',
        allocationType: 'all9',
        participantIds: all9.slice(),
        paymentSource: 'common-wallet',
        isInitialExpense: true,
        purchaserId: '',
        receiptUrl: '',
        memo: 'はなちゃん宿泊のコテージ',
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
        allocationType: 'kimnyOnly',
        participantIds: kimnyOnly.slice(),
        paymentSource: 'common-wallet',
        isInitialExpense: true,
        purchaserId: 'kimny',
        receiptUrl: '',
        memo: 'キムニーが全額負担',
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
        amount: 34000,
        category: 'transportation',
        allocationType: 'car6',
        participantIds: car6.slice(),
        paymentSource: 'common-wallet',
        isInitialExpense: true,
        purchaserId: '',
        receiptUrl: '',
        memo: 'けんさん号12,000 / ザッキィー号10,000 / けいくん号12,000',
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
          { label: 'けいくん号', amount: 12000 }
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

  function paidExpenses(budget) {
    return activeExpenses(budget).filter(function (e) {
      return e.paymentStatus === 'paid';
    });
  }

  function personalAdvanceExpenses(budget) {
    return activeExpenses(budget).filter(function (e) {
      return e.paymentSource === 'personal-advance' && e.paymentStatus === 'paid';
    });
  }

  function expenseAllocations(expense) {
    var ids = expense.participantIds && expense.participantIds.length
      ? expense.participantIds.filter(function (id) { return !!ID_TO_PARTICIPANT[id]; })
      : resolveParticipantIds(expense.allocationType, expense.participantIds);
    if (!ids.length) {
      ids = resolveParticipantIds(expense.allocationType, expense.participantIds);
    }
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
        advancePaid: 0,
        depositStatus: dep ? dep.depositStatus : 'unpaid',
        actualBurden: 0,
        settlementBalance: 0,
        refundAmount: 0,
        additionalAmount: 0,
        settlementStatus: (budget.settlements[p.id] && budget.settlements[p.id].settlementStatus) || 'unsettled',
        breakdown: [],
        advances: [],
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
      if (expense.paymentSource === 'personal-advance' && expense.purchaserId && map[expense.purchaserId]) {
        map[expense.purchaserId].advancePaid += expense.amount;
        map[expense.purchaserId].advances.push({
          expenseId: expense.id,
          title: expense.title,
          amount: expense.amount,
          category: expense.category,
          participantCount: expense.participantIds.length,
          createdAt: expense.createdAt || ''
        });
      }
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
          isInitialExpense: !!expense.isInitialExpense,
          paymentSource: expense.paymentSource || 'common-wallet',
          allocationType: expense.allocationType,
          allocationLabel: ALLOCATION_LABELS[expense.allocationType] || expense.allocationType,
          participantCount: expense.participantIds.length,
          personalAmount: a.amount
        });
      });
    });

    Object.keys(map).forEach(function (id) {
      var row = map[id];
      row.settlementBalance = row.paidDeposit + row.advancePaid - row.actualBurden;
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

    var walletExpenseTotal = paidWalletExpenses(budget).reduce(function (s, e) {
      return s + e.amount;
    }, 0);
    var personalAdvanceTotal = personalAdvanceExpenses(budget).reduce(function (s, e) {
      return s + e.amount;
    }, 0);
    var expenseTotal = paidExpenses(budget).reduce(function (s, e) {
      return s + e.amount;
    }, 0);

    var unpaidTotal = EXPECTED_TOTAL_DEPOSIT - paidDepositTotal;
    var cashBalance = paidDepositTotal - walletExpenseTotal;
    var settlementDifference = cashBalance + additionalCollectionTotal - refundTotal;

    return {
      expectedDepositTotal: EXPECTED_TOTAL_DEPOSIT,
      paidDepositTotal: paidDepositTotal,
      unpaidTotal: unpaidTotal,
      paidCount: paidCount,
      totalParticipants: TOTAL_PARTICIPANTS,
      expenseTotal: expenseTotal,
      walletExpenseTotal: walletExpenseTotal,
      personalAdvanceTotal: personalAdvanceTotal,
      cashBalance: cashBalance,
      refundTotal: refundTotal,
      additionalCollectionTotal: additionalCollectionTotal,
      settlementDifference: settlementDifference,
      people: people
    };
  }

  function formatYen(n) {
    var num = Math.round(Number(n) || 0);
    return num.toLocaleString('ja-JP') + '円';
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

    ok('participants=9', PARTICIPANTS.length === 9);
    ok('expected=180000', EXPECTED_TOTAL_DEPOSIT === 180000);
    ok('all9=9', all9.length === 9);
    ok('car6=6', car6.length === 6);
    ok('kimnyOnly=1', kimnyOnly.length === 1);

    var a1 = allocateAmount(50160, all9, seedHash('expense-cottage-6'));
    ok('cottage6 sum', a1.reduce(function (s, x) { return s + x.amount; }, 0) === 50160);

    var aPet = allocateAmount(1980, kimnyOnly, 0);
    ok('pet kimny', aPet.length === 1 && aPet[0].participantId === 'kimny' && aPet[0].amount === 1980);

    var a3 = allocateAmount(34000, car6, seedHash('expense-car'));
    ok('car sum', a3.reduce(function (s, x) { return s + x.amount; }, 0) === 34000);
    ok('car no drivers', a3.every(function (x) {
      return carDrivers.indexOf(x.participantId) === -1;
    }));

    var budget = createDefaultBudget();
    PARTICIPANTS.forEach(function (p) {
      budget.deposits[p.id].paidDeposit = 20000;
      budget.deposits[p.id].depositStatus = 'paid';
    });
    var sum = computeWalletSummary(budget);
    ok('paid total 180000', sum.paidDepositTotal === 180000);
    // 50160 + 29920 + 1980 + 34000 = 116060
    ok('expense 116060', sum.expenseTotal === 116060);
    ok('cash 63940', sum.cashBalance === 63940);

    var burdenSum = 0;
    Object.keys(sum.people).forEach(function (id) {
      burdenSum += sum.people[id].actualBurden;
    });
    ok('burden=expense', burdenSum === sum.expenseTotal, burdenSum + ' vs ' + sum.expenseTotal);
    ok('settlementDiff=0', sum.settlementDifference === 0, String(sum.settlementDifference));

    budget.expenses.push({
      id: 'expense-test-charcoal',
      title: 'ジャパン（炭）',
      amount: 1097,
      category: 'other',
      allocationType: 'all9',
      participantIds: all9.slice(),
      paymentSource: 'personal-advance',
      isInitialExpense: false,
      purchaserId: 'nagomi-mama',
      receiptUrl: '',
      memo: '',
      paymentStatus: 'paid',
      createdAt: '2026-07-15T00:00:00+09:00',
      createdBy: ADMIN_NAME,
      updatedAt: '',
      updatedBy: '',
      deletedAt: null,
      deletedBy: null,
      advanceSettlementStatus: 'unsettled'
    });
    var sumWithAdvance = computeWalletSummary(budget);
    ok('expense includes personal advance', sumWithAdvance.expenseTotal === 117157, sumWithAdvance.expenseTotal);
    ok('wallet expense excludes personal advance', sumWithAdvance.walletExpenseTotal === 116060, sumWithAdvance.walletExpenseTotal);
    ok('personal advance total', sumWithAdvance.personalAdvanceTotal === 1097, sumWithAdvance.personalAdvanceTotal);
    ok('mama advance paid', sumWithAdvance.people['nagomi-mama'].advancePaid === 1097, sumWithAdvance.people['nagomi-mama'].advancePaid);
    ok(
      'mama balance includes advance',
      sumWithAdvance.people['nagomi-mama'].settlementBalance ===
        sumWithAdvance.people['nagomi-mama'].paidDeposit +
        sumWithAdvance.people['nagomi-mama'].advancePaid -
        sumWithAdvance.people['nagomi-mama'].actualBurden,
      sumWithAdvance.people['nagomi-mama'].settlementBalance
    );
    ok(
      'breakdown keeps expense title',
      sumWithAdvance.people['nagomi-mama'].breakdown.some(function (x) {
        return x.title === 'ジャパン（炭）' && !x.isInitialExpense && x.personalAmount > 0;
      })
    );
    ok('advance settlementDiff=0', sumWithAdvance.settlementDifference === 0, String(sumWithAdvance.settlementDifference));

    var kimny = sum.people.kimny;
    ok('kimny has pet', kimny.buckets.cottage >= 1980);
    ok('ken car=0', sum.people.ken.buckets.car === 0);
    ok('zacky car=0', sum.people.zacky.buckets.car === 0);
    ok('keikun car=0', sum.people.keikun.buckets.car === 0);

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
    all9: all9,
    all11: all11,
    cottage9: cottage9,
    car6: car6,
    car8: car8,
    carDrivers: carDrivers,
    kimnyOnly: kimnyOnly,
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
