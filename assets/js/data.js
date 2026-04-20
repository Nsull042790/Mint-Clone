/* =========================================================
   Luminate — Seed data + localStorage state
   ========================================================= */
(function () {
  'use strict';

  const STORAGE_KEY = 'luminate.state.v1';

  const CATEGORIES = [
    { id: 'groceries',   name: 'Groceries',        color: '#3ca975', icon: '🛒', group: 'Essentials' },
    { id: 'dining',      name: 'Dining & Takeout', color: '#e8a63a', icon: '🍔', group: 'Lifestyle' },
    { id: 'transport',   name: 'Transportation',   color: '#6c7ae0', icon: '🚗', group: 'Essentials' },
    { id: 'fuel',        name: 'Fuel',             color: '#9b6fd4', icon: '⛽', group: 'Essentials' },
    { id: 'rent',        name: 'Rent / Mortgage',  color: '#0a1f44', icon: '🏠', group: 'Housing' },
    { id: 'utilities',   name: 'Utilities',        color: '#3b98c7', icon: '💡', group: 'Housing' },
    { id: 'internet',    name: 'Internet / Phone', color: '#5fa3d3', icon: '📶', group: 'Housing' },
    { id: 'subscriptions', name: 'Subscriptions',  color: '#c76fc6', icon: '🎬', group: 'Lifestyle' },
    { id: 'shopping',    name: 'Shopping',         color: '#e67a87', icon: '🛍️', group: 'Lifestyle' },
    { id: 'health',      name: 'Health & Fitness', color: '#4cb27b', icon: '💪', group: 'Wellness' },
    { id: 'entertainment', name: 'Entertainment',  color: '#ef8b3c', icon: '🎮', group: 'Lifestyle' },
    { id: 'travel',      name: 'Travel',           color: '#7bb7e0', icon: '✈️', group: 'Lifestyle' },
    { id: 'education',   name: 'Education',        color: '#5a6fb0', icon: '📚', group: 'Wellness' },
    { id: 'kids',        name: 'Kids',             color: '#ff8aa3', icon: '🧸', group: 'Family' },
    { id: 'pets',        name: 'Pets',             color: '#c49a6c', icon: '🐾', group: 'Family' },
    { id: 'gifts',       name: 'Gifts & Donations',color: '#b46ac2', icon: '🎁', group: 'Lifestyle' },
    { id: 'income',      name: 'Income',           color: '#15a56a', icon: '💰', group: 'Income' },
    { id: 'transfer',    name: 'Transfer',         color: '#8591a8', icon: '🔁', group: 'Transfer' },
    { id: 'investment',  name: 'Investments',      color: '#0a1f44', icon: '📈', group: 'Savings' },
    { id: 'fees',        name: 'Fees & Interest',  color: '#d94848', icon: '💸', group: 'Other' },
    { id: 'other',       name: 'Other',            color: '#8591a8', icon: '📦', group: 'Other' }
  ];

  const MERCHANTS = [
    { name: 'Whole Foods Market',  cat: 'groceries',     range: [45, 180] },
    { name: 'Trader Joe\'s',       cat: 'groceries',     range: [28, 90] },
    { name: 'Safeway',             cat: 'groceries',     range: [30, 140] },
    { name: 'Costco',              cat: 'groceries',     range: [90, 320] },
    { name: 'Chipotle',            cat: 'dining',        range: [11, 22] },
    { name: 'Starbucks',           cat: 'dining',        range: [4, 14] },
    { name: 'DoorDash',            cat: 'dining',        range: [18, 55] },
    { name: 'Local Bistro',        cat: 'dining',        range: [35, 120] },
    { name: 'Shell',               cat: 'fuel',          range: [32, 68] },
    { name: 'Chevron',             cat: 'fuel',          range: [28, 72] },
    { name: 'Uber',                cat: 'transport',     range: [12, 38] },
    { name: 'Lyft',                cat: 'transport',     range: [10, 42] },
    { name: 'Metro Transit',       cat: 'transport',     range: [2.75, 2.75] },
    { name: 'Netflix',             cat: 'subscriptions', range: [15.99, 15.99], recurring: 1 },
    { name: 'Spotify',             cat: 'subscriptions', range: [11.99, 11.99], recurring: 1 },
    { name: 'Disney+',             cat: 'subscriptions', range: [13.99, 13.99], recurring: 1 },
    { name: 'iCloud',              cat: 'subscriptions', range: [2.99, 2.99], recurring: 1 },
    { name: 'NYT Digital',         cat: 'subscriptions', range: [4.25, 4.25], recurring: 1 },
    { name: 'ChatGPT Plus',        cat: 'subscriptions', range: [20, 20], recurring: 1 },
    { name: 'Comcast Xfinity',     cat: 'internet',      range: [89.99, 89.99], recurring: 1 },
    { name: 'Verizon Wireless',    cat: 'internet',      range: [118, 118], recurring: 1 },
    { name: 'PG&E Electric',       cat: 'utilities',     range: [75, 180], recurring: 1 },
    { name: 'City Water & Sewer',  cat: 'utilities',     range: [38, 62], recurring: 1 },
    { name: 'Amazon',              cat: 'shopping',      range: [12, 240] },
    { name: 'Target',              cat: 'shopping',      range: [20, 180] },
    { name: 'Apple',               cat: 'shopping',      range: [9, 1299] },
    { name: 'Nike',                cat: 'shopping',      range: [45, 160] },
    { name: 'Planet Fitness',      cat: 'health',        range: [24.99, 24.99], recurring: 1 },
    { name: 'Equinox',             cat: 'health',        range: [205, 205], recurring: 1 },
    { name: 'Walgreens',           cat: 'health',        range: [8, 60] },
    { name: 'AMC Theaters',        cat: 'entertainment', range: [14, 38] },
    { name: 'Steam',               cat: 'entertainment', range: [6, 60] },
    { name: 'Delta Airlines',      cat: 'travel',        range: [189, 620] },
    { name: 'Airbnb',              cat: 'travel',        range: [140, 520] },
    { name: 'Marriott',            cat: 'travel',        range: [180, 340] },
    { name: 'Coursera',            cat: 'education',     range: [49, 49], recurring: 1 },
    { name: 'PetSmart',            cat: 'pets',          range: [18, 90] },
    { name: 'Chewy',               cat: 'pets',          range: [22, 110] },
    { name: 'Etsy',                cat: 'gifts',         range: [15, 120] },
    { name: 'Bank ATM Fee',        cat: 'fees',          range: [3, 3.50] }
  ];

  const INVESTMENTS = [
    { symbol: 'VTI',   name: 'Vanguard Total Stock', shares: 62.4,  price: 278.10, change: 0.94 },
    { symbol: 'VXUS',  name: 'Vanguard Intl Stock',  shares: 48.1,  price: 64.82,  change: -0.31 },
    { symbol: 'BND',   name: 'Vanguard Total Bond',  shares: 35.8,  price: 72.14,  change: 0.12 },
    { symbol: 'AAPL',  name: 'Apple Inc.',           shares: 14,    price: 231.90, change: 1.22 },
    { symbol: 'MSFT',  name: 'Microsoft',            shares: 8,     price: 428.15, change: 0.56 },
    { symbol: 'GOOGL', name: 'Alphabet',             shares: 10,    price: 178.45, change: -0.82 },
    { symbol: 'BTC',   name: 'Bitcoin',              shares: 0.15,  price: 69420.00, change: 2.14 }
  ];

  function rand(min, max) { return Math.random() * (max - min) + min; }
  function rint(min, max) { return Math.floor(rand(min, max + 1)); }
  function choice(arr) { return arr[rint(0, arr.length - 1)]; }
  function round2(n) { return Math.round(n * 100) / 100; }
  function uid() { return Math.random().toString(36).slice(2, 10); }

  function seedAccounts() {
    return [
      { id: 'acc_lch',  name: 'Luminate Everyday Checking', nickname: 'Checking',      type: 'checking',    institution: 'Luminate Bank',      mask: '4821', balance: 4287.53,  isLuminate: true,  apr: 0.01, color: '#0a1f44' },
      { id: 'acc_lhys', name: 'Luminate High-Yield Savings',nickname: 'Savings',       type: 'savings',     institution: 'Luminate Bank',      mask: '9107', balance: 18450.20, isLuminate: true,  apr: 4.50, color: '#5fa3d3' },
      { id: 'acc_lcc',  name: 'Luminate Sapphire Card',     nickname: 'Credit Card',   type: 'credit',      institution: 'Luminate Bank',      mask: '3344', balance: -2148.77, isLuminate: true, apr: 21.99, limit: 12000, color: '#7bb7e0' },
      { id: 'acc_lgi',  name: 'Luminate Invest Brokerage',  nickname: 'Investments',   type: 'investment',  institution: 'Luminate Invest',    mask: '2210', balance: 42830.15, isLuminate: true,  color: '#1a3a73' },
      { id: 'acc_401',  name: 'Fidelity 401(k)',            nickname: '401(k)',        type: 'retirement',  institution: 'Fidelity',           mask: '8890', balance: 87240.00, color: '#4a8fc2' },
      { id: 'acc_mort', name: 'Wells Fargo Mortgage',       nickname: 'Mortgage',      type: 'loan',        institution: 'Wells Fargo',        mask: '6621', balance: -284500.00, apr: 6.25, color: '#8591a8' },
      { id: 'acc_home', name: 'Zillow Home Value',          nickname: 'Primary Home',  type: 'property',    institution: 'Zillow',             mask: 'EST',  balance: 512000.00, color: '#3ca975' },
      { id: 'acc_car',  name: 'Kelley Blue Book',           nickname: '2022 Honda',    type: 'vehicle',     institution: 'KBB',                mask: 'EST',  balance: 19800.00, color: '#6c7ae0' },
      { id: 'acc_stu',  name: 'Sallie Mae Student Loan',    nickname: 'Student Loan',  type: 'loan',        institution: 'Sallie Mae',         mask: '4412', balance: -14800.00, apr: 5.50, color: '#e67a87' }
    ];
  }

  function seedTransactions(accounts) {
    const txns = [];
    const today = new Date();
    const checking = accounts.find(a => a.id === 'acc_lch');
    const credit = accounts.find(a => a.id === 'acc_lcc');
    const savings = accounts.find(a => a.id === 'acc_lhys');

    // 13 months of data
    for (let monthBack = 12; monthBack >= 0; monthBack--) {
      const base = new Date(today.getFullYear(), today.getMonth() - monthBack, 1);
      const daysInMo = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();

      // Paychecks: 1st and 15th
      [1, 15].forEach(day => {
        if (day > daysInMo) return;
        const d = new Date(base.getFullYear(), base.getMonth(), day);
        if (d > today) return;
        txns.push({
          id: uid(), accountId: checking.id, date: d.toISOString().slice(0, 10),
          merchant: 'Luminate Payroll Deposit', description: 'Bi-weekly salary',
          amount: 3420.00 + rand(-40, 40), category: 'income', pending: false
        });
      });

      // Rent/mortgage on 1st
      txns.push({
        id: uid(), accountId: checking.id,
        date: new Date(base.getFullYear(), base.getMonth(), 1).toISOString().slice(0, 10),
        merchant: 'Wells Fargo Mortgage', description: 'Monthly mortgage payment',
        amount: -2180.00, category: 'rent', pending: false
      });

      // Recurring bills
      const recurringDay = [3, 5, 8, 10, 12, 15, 18, 22, 26];
      MERCHANTS.filter(m => m.recurring).forEach((m, i) => {
        const day = recurringDay[i % recurringDay.length];
        if (day > daysInMo) return;
        const d = new Date(base.getFullYear(), base.getMonth(), day);
        if (d > today) return;
        txns.push({
          id: uid(), accountId: credit.id, date: d.toISOString().slice(0, 10),
          merchant: m.name, description: 'Recurring',
          amount: -m.range[0], category: m.cat, pending: false, recurring: true
        });
      });

      // Random discretionary
      const nTxns = rint(38, 58);
      for (let i = 0; i < nTxns; i++) {
        const m = choice(MERCHANTS.filter(x => !x.recurring));
        const day = rint(1, daysInMo);
        const d = new Date(base.getFullYear(), base.getMonth(), day);
        if (d > today) continue;
        const acct = Math.random() < 0.65 ? credit : checking;
        txns.push({
          id: uid(), accountId: acct.id, date: d.toISOString().slice(0, 10),
          merchant: m.name, description: '',
          amount: -round2(rand(m.range[0], m.range[1])), category: m.cat, pending: false
        });
      }

      // Monthly savings transfer
      const transferDay = 2;
      if (new Date(base.getFullYear(), base.getMonth(), transferDay) <= today) {
        txns.push({
          id: uid(), accountId: checking.id,
          date: new Date(base.getFullYear(), base.getMonth(), transferDay).toISOString().slice(0, 10),
          merchant: 'Transfer to Savings', description: 'Automatic savings',
          amount: -600, category: 'transfer', pending: false
        });
        txns.push({
          id: uid(), accountId: savings.id,
          date: new Date(base.getFullYear(), base.getMonth(), transferDay).toISOString().slice(0, 10),
          merchant: 'Transfer from Checking', description: 'Automatic savings',
          amount: 600, category: 'transfer', pending: false
        });
        // Savings interest
        txns.push({
          id: uid(), accountId: savings.id,
          date: new Date(base.getFullYear(), base.getMonth(), daysInMo).toISOString().slice(0, 10),
          merchant: 'Interest Earned', description: '4.50% APY',
          amount: round2(rand(58, 74)), category: 'income', pending: false
        });
      }
    }

    // Sort newest first
    txns.sort((a, b) => b.date.localeCompare(a.date));
    // Mark first 2 as pending
    if (txns[0]) txns[0].pending = true;
    if (txns[1]) txns[1].pending = true;
    return txns;
  }

  function seedBudgets() {
    return [
      { id: 'b1', categoryId: 'groceries',     limit: 650,  rollover: true },
      { id: 'b2', categoryId: 'dining',        limit: 320,  rollover: false },
      { id: 'b3', categoryId: 'transport',     limit: 150,  rollover: false },
      { id: 'b4', categoryId: 'fuel',          limit: 220,  rollover: false },
      { id: 'b5', categoryId: 'shopping',      limit: 280,  rollover: false },
      { id: 'b6', categoryId: 'entertainment', limit: 120,  rollover: false },
      { id: 'b7', categoryId: 'subscriptions', limit: 95,   rollover: false },
      { id: 'b8', categoryId: 'utilities',     limit: 220,  rollover: false },
      { id: 'b9', categoryId: 'health',        limit: 260,  rollover: false },
      { id: 'b10',categoryId: 'travel',        limit: 400,  rollover: true }
    ];
  }

  function seedBills() {
    const today = new Date();
    const nextOn = (day) => {
      const d = new Date(today.getFullYear(), today.getMonth(), day);
      if (d < today) d.setMonth(d.getMonth() + 1);
      return d.toISOString().slice(0, 10);
    };
    return [
      { id: 'bi1', name: 'Mortgage',            amount: 2180,   due: nextOn(1),  category: 'rent',          autopay: true,  account: 'acc_lch' },
      { id: 'bi2', name: 'PG&E Electric',       amount: 128.40, due: nextOn(8),  category: 'utilities',     autopay: true,  account: 'acc_lcc' },
      { id: 'bi3', name: 'Comcast Xfinity',     amount: 89.99,  due: nextOn(10), category: 'internet',      autopay: true,  account: 'acc_lcc' },
      { id: 'bi4', name: 'Verizon Wireless',    amount: 118.00, due: nextOn(12), category: 'internet',      autopay: true,  account: 'acc_lcc' },
      { id: 'bi5', name: 'Netflix',             amount: 15.99,  due: nextOn(14), category: 'subscriptions', autopay: true,  account: 'acc_lcc' },
      { id: 'bi6', name: 'Spotify',             amount: 11.99,  due: nextOn(18), category: 'subscriptions', autopay: true,  account: 'acc_lcc' },
      { id: 'bi7', name: 'Planet Fitness',      amount: 24.99,  due: nextOn(22), category: 'health',        autopay: true,  account: 'acc_lcc' },
      { id: 'bi8', name: 'Sallie Mae Student',  amount: 245.00, due: nextOn(25), category: 'fees',          autopay: false, account: 'acc_lch' },
      { id: 'bi9', name: 'City Water & Sewer',  amount: 52.10,  due: nextOn(26), category: 'utilities',     autopay: false, account: 'acc_lch' }
    ];
  }

  function seedGoals() {
    return [
      {
        id: 'g_emerg', type: 'emergency', name: 'Emergency Fund', emoji: '🛟',
        target: 18000, saved: 12400, monthly: 400, deadline: null,
        priority: 'critical', luminateAccount: 'acc_lhys',
        tip: 'Luminate High-Yield Savings at 4.50% APY — your emergency fund earns while it waits.'
      },
      {
        id: 'g_vaca', type: 'vacation', name: 'Italy Dream Trip', emoji: '🇮🇹',
        target: 6500, saved: 2180, monthly: 360, deadline: addMonths(12),
        priority: 'medium', luminateAccount: 'acc_lhys',
        destination: 'Rome + Amalfi Coast, 10 days',
        tip: 'Book flights 8 weeks out and lock prices with Luminate Travel Card — 3x points on airfare.'
      },
      {
        id: 'g_home', type: 'home_project', name: 'Kitchen Remodel', emoji: '🍳',
        target: 28000, saved: 8900, monthly: 650, deadline: addMonths(24),
        priority: 'medium', luminateAccount: 'acc_lhys',
        tip: 'You may qualify for Luminate HELOC at 7.25% — tap home equity without touching savings.'
      }
    ];
  }

  function seedUser() {
    return {
      firstName: 'Alex',
      lastName: 'Morgan',
      email: 'alex.morgan@example.com',
      monthlyIncome: 7200,
      dependents: 0,
      dob: '1992-06-14',
      creditScore: 782,
      creditHistory: buildCreditHistory(),
      onboarded: true,
      theme: 'light'
    };
  }

  function buildCreditHistory() {
    const out = [];
    const today = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const base = 740 + i * 3 + rint(-6, 6);
      out.push({ date: d.toISOString().slice(0, 10), score: Math.min(820, base) });
    }
    out[out.length - 1].score = 782;
    return out;
  }

  function addMonths(n) {
    const d = new Date();
    d.setMonth(d.getMonth() + n);
    return d.toISOString().slice(0, 10);
  }

  function buildFreshState() {
    const accounts = seedAccounts();
    return {
      version: 1,
      user: seedUser(),
      accounts,
      transactions: seedTransactions(accounts),
      budgets: seedBudgets(),
      bills: seedBills(),
      goals: seedGoals(),
      investments: INVESTMENTS.slice(),
      categories: CATEGORIES.slice(),
      rules: []
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { console.warn('State load failed', e); }
    return null;
  }

  function save(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { console.warn('State save failed', e); }
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY);
  }

  window.LuminateData = {
    STORAGE_KEY, CATEGORIES,
    buildFreshState, load, save, reset, uid
  };
})();
