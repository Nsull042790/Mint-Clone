/* =========================================================
   Luminate — Core app engine
   Router, state, onboarding, AI coach, utilities
   ========================================================= */
(function () {
  'use strict';

  /* ---------- State ---------- */
  let state = window.LuminateData.load();
  const freshRun = !state;
  if (!state) state = window.LuminateData.buildFreshState();

  function save() { window.LuminateData.save(state); }
  function getState() { return state; }
  function setState(updater) {
    if (typeof updater === 'function') updater(state); else Object.assign(state, updater);
    save();
  }

  /* ---------- Utilities ---------- */
  const fmtMoney = (n, opts = {}) => {
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    const v = abs.toLocaleString('en-US', { minimumFractionDigits: opts.cents !== false ? 2 : 0, maximumFractionDigits: opts.cents !== false ? 2 : 0 });
    return `${sign}$${v}`;
  };
  const fmtMoneyShort = (n) => {
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}k`;
    return fmtMoney(n, { cents: false });
  };
  const fmtDate = (iso) => {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const fmtDateShort = (iso) => {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  const fmtRelative = (iso) => {
    const d = new Date(iso + 'T00:00:00');
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const days = Math.round((d - now) / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    if (days === -1) return 'Yesterday';
    if (days > 0 && days < 7) return `In ${days} days`;
    if (days < 0 && days > -7) return `${-days} days ago`;
    return fmtDateShort(iso);
  };
  const monthKey = (iso) => iso.slice(0, 7);
  const currentMonth = () => new Date().toISOString().slice(0, 7);
  const cls = (...a) => a.filter(Boolean).join(' ');
  const el = (tag, attrs = {}, ...children) => {
    const e = document.createElement(tag);
    for (const k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'style' && typeof attrs[k] === 'object') Object.assign(e.style, attrs[k]);
      else if (k.startsWith('on') && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return e;
  };
  const h = (html) => {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };
  const getCategory = (id) => state.categories.find(c => c.id === id) || state.categories.find(c => c.id === 'other');
  const getAccount = (id) => state.accounts.find(a => a.id === id);

  /* ---------- Finance helpers ---------- */
  function monthlySpendByCategory(monthK) {
    const out = {};
    state.transactions.forEach(t => {
      if (monthKey(t.date) !== monthK) return;
      if (t.category === 'income' || t.category === 'transfer') return;
      if (t.amount >= 0) return;
      out[t.category] = (out[t.category] || 0) + Math.abs(t.amount);
    });
    return out;
  }
  function monthlyIncome(monthK) {
    return state.transactions
      .filter(t => monthKey(t.date) === monthK && t.category === 'income' && t.amount > 0)
      .reduce((s, t) => s + t.amount, 0);
  }
  function monthlyExpense(monthK) {
    return state.transactions
      .filter(t => monthKey(t.date) === monthK && t.category !== 'income' && t.category !== 'transfer' && t.amount < 0)
      .reduce((s, t) => s + Math.abs(t.amount), 0);
  }
  function averageMonthlyExpense(months = 6) {
    const keys = lastNMonthKeys(months);
    const totals = keys.map(monthlyExpense).filter(v => v > 0);
    if (!totals.length) return 0;
    return totals.reduce((a, b) => a + b, 0) / totals.length;
  }
  function averageMonthlyIncome(months = 6) {
    const keys = lastNMonthKeys(months);
    const totals = keys.map(monthlyIncome).filter(v => v > 0);
    if (!totals.length) return 0;
    return totals.reduce((a, b) => a + b, 0) / totals.length;
  }
  function lastNMonthKeys(n) {
    const out = [];
    const d = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
      out.push(x.toISOString().slice(0, 7));
    }
    return out;
  }
  function netWorth() {
    return state.accounts.reduce((s, a) => s + a.balance, 0);
  }
  function assets() {
    return state.accounts.filter(a => a.balance > 0).reduce((s, a) => s + a.balance, 0);
  }
  function liabilities() {
    return Math.abs(state.accounts.filter(a => a.balance < 0).reduce((s, a) => s + a.balance, 0));
  }
  function safeToSpend() {
    const income = averageMonthlyIncome(3);
    const expense = averageMonthlyExpense(3);
    const daysLeftInMonth = (() => {
      const today = new Date();
      const eom = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return Math.max(1, Math.ceil((eom - today) / 86400000));
    })();
    const spentThisMonth = monthlyExpense(currentMonth());
    const buffer = Math.max(0, income - expense) * 0.85;
    const remaining = Math.max(0, income - spentThisMonth - buffer);
    return Math.max(0, remaining);
  }
  function cashFlowForecast(days = 90) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let balance = state.accounts.filter(a => a.type === 'checking' || a.type === 'savings').reduce((s, a) => s + a.balance, 0);
    const points = [];
    const bills = state.bills.slice();
    const avgDaily = averageMonthlyExpense(3) / 30;
    const avgPayBiweekly = averageMonthlyIncome(3) / 2;
    for (let i = 0; i <= days; i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      const dow = d.getDay();
      const dom = d.getDate();
      if (dom === 1 || dom === 15) balance += avgPayBiweekly;
      bills.forEach(b => {
        const bd = new Date(b.due + 'T00:00:00');
        if (bd.toDateString() === d.toDateString()) balance -= b.amount;
      });
      if (dow !== 0 && dow !== 6) balance -= avgDaily * 0.75;
      else balance -= avgDaily * 1.5;
      points.push({ date: d.toISOString().slice(0, 10), balance });
    }
    return points;
  }
  function detectSubscriptions() {
    const map = {};
    state.transactions.forEach(t => {
      if (t.amount >= 0) return;
      const key = t.merchant;
      map[key] = map[key] || { merchant: key, category: t.category, hits: [], total: 0 };
      map[key].hits.push(t);
      map[key].total += Math.abs(t.amount);
    });
    const subs = [];
    Object.values(map).forEach(m => {
      const monthsHit = new Set(m.hits.map(h => monthKey(h.date)));
      if (monthsHit.size >= 3 && m.hits.length >= 3) {
        const avg = m.total / m.hits.length;
        const sameAmount = m.hits.every(h => Math.abs(Math.abs(h.amount) - avg) < 1);
        if (sameAmount || m.hits.some(h => h.recurring)) {
          subs.push({ merchant: m.merchant, category: m.category, amount: avg, yearly: avg * 12, lastSeen: m.hits[0].date });
        }
      }
    });
    return subs.sort((a, b) => b.yearly - a.yearly);
  }

  /* ---------- Life-goals algorithm ---------- */
  const GOAL_TEMPLATES = {
    emergency: {
      calc: (u, income, expense) => {
        const months = u.dependents >= 2 ? 6 : 4;
        return { target: Math.round(expense * months), months, reason: `${months}× monthly expenses — standard for your household size.` };
      }
    },
    vacation: {
      destinations: [
        { name: 'Weekend getaway', days: 3, perDay: 180 },
        { name: 'Mexico beach week', days: 7, perDay: 260 },
        { name: 'European city break', days: 6, perDay: 340 },
        { name: 'Italy grand tour', days: 10, perDay: 420 },
        { name: 'Japan adventure', days: 12, perDay: 480 },
        { name: 'African safari', days: 10, perDay: 720 },
        { name: 'Bucket-list world trip', days: 21, perDay: 550 }
      ],
      calc: (opts) => {
        const d = opts.destination || GOAL_TEMPLATES.vacation.destinations[3];
        const pp = d.days * d.perDay;
        const travelers = opts.travelers || 2;
        return { target: Math.round(pp * travelers * 1.08), reason: `${d.days} days × $${d.perDay}/day × ${travelers} traveler(s), +8% buffer.` };
      }
    },
    home_project: {
      projects: [
        { name: 'Paint & refresh',        low: 1500,  high: 4500 },
        { name: 'Kitchen mini-remodel',   low: 8000,  high: 18000 },
        { name: 'Full kitchen remodel',   low: 22000, high: 55000 },
        { name: 'Bathroom remodel',       low: 7500,  high: 22000 },
        { name: 'Deck / patio',           low: 4500,  high: 16000 },
        { name: 'Landscaping overhaul',   low: 3500,  high: 12000 },
        { name: 'Roof replacement',       low: 8000,  high: 16000 },
        { name: 'Solar install',          low: 12000, high: 26000 },
        { name: 'Finish basement',        low: 18000, high: 42000 },
        { name: 'ADU / in-law unit',      low: 85000, high: 180000 }
      ]
    },
    home_down: {
      calc: (opts) => {
        const price = opts.homePrice || 450000;
        const pct = opts.downPct || 0.10;
        const closing = price * 0.03;
        return { target: Math.round(price * pct + closing), reason: `${(pct*100).toFixed(0)}% down on a $${price.toLocaleString()} home, plus ~3% closing costs.` };
      }
    },
    wedding: {
      calc: (opts) => {
        const guests = opts.guests || 120;
        const perGuest = opts.tier === 'budget' ? 180 : opts.tier === 'luxury' ? 620 : 320;
        return { target: Math.round(guests * perGuest), reason: `${guests} guests × $${perGuest}/guest (${opts.tier || 'mid-tier'}).` };
      }
    },
    baby: {
      calc: () => ({ target: 18500, reason: 'Average US first-year costs: medical, gear, childcare setup, 3-mo paid-leave buffer.' })
    },
    car: {
      calc: (opts) => {
        const price = opts.price || 28000;
        const down = opts.downPct || 0.20;
        return { target: Math.round(price * down + 1800), reason: `${(down*100).toFixed(0)}% down on $${price.toLocaleString()}, plus tax/title/fees.` };
      }
    },
    retirement: {
      calc: (opts) => {
        const age = opts.currentAge || 32;
        const retireAge = opts.retireAge || 60;
        const spend = opts.annualSpend || 72000;
        return { target: Math.round(spend * 25), reason: `4% safe-withdrawal rule — target = 25× annual spend. ${retireAge - age} years to compound.` };
      }
    },
    sabbatical: {
      calc: (opts) => {
        const months = opts.months || 6;
        const monthlySpend = opts.monthlySpend || 4000;
        return { target: Math.round(months * monthlySpend * 1.1), reason: `${months} months living expenses + 10% buffer.` };
      }
    }
  };
  function recommendMonthly(target, saved, monthsToGoal) {
    const gap = Math.max(0, target - saved);
    return Math.ceil(gap / Math.max(1, monthsToGoal));
  }
  function projectGoal(g) {
    if (!g.monthly) return null;
    const gap = Math.max(0, g.target - g.saved);
    const months = Math.ceil(gap / g.monthly);
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return { months, completion: d.toISOString().slice(0, 10) };
  }

  /* ---------- Clarity Score (0-850 composite health metric) ---------- */
  function clarityScore() {
    const inc = averageMonthlyIncome(3);
    const exp = averageMonthlyExpense(3);
    const surplus = inc - exp;
    // 1. Savings rate (target 20%)
    const rate = inc > 0 ? Math.max(0, surplus / inc) : 0;
    const cSav = Math.min(1, rate / 0.20);
    // 2. Emergency fund (months of expenses in cash)
    const cash = state.accounts.filter(a => a.type === 'checking' || a.type === 'savings')
      .reduce((s, a) => s + Math.max(0, a.balance), 0);
    const months = exp > 0 ? cash / exp : 6;
    const cEmg = Math.min(1, months / 6);
    // 3. Debt-to-income (total monthly bills / income)
    const debtPayments = state.bills.reduce((s, b) => s + b.amount, 0);
    const dti = inc > 0 ? debtPayments / inc : 0;
    const cDti = Math.max(0, Math.min(1, 1 - (dti / 0.35)));
    // 4. Credit utilization
    const cc = state.accounts.find(a => a.type === 'credit' && a.limit);
    const util = cc ? Math.abs(cc.balance) / cc.limit : 0;
    const cUtil = Math.max(0, Math.min(1, 1 - (util / 0.50)));
    // 5. Goals on track (avg progress ratio)
    const goalProgress = state.goals && state.goals.length
      ? state.goals.reduce((s, g) => s + Math.min(1, g.saved / Math.max(1, g.target)), 0) / state.goals.length
      : 0.5;
    const cGoals = goalProgress;
    // Weighted composite
    const composite = 0.30 * cSav + 0.25 * cEmg + 0.20 * cDti + 0.15 * cUtil + 0.10 * cGoals;
    const score = Math.round(300 + composite * 550);
    const band = score >= 800 ? { label: 'Exceptional', color: '#15a56a' }
               : score >= 740 ? { label: 'Great',       color: '#3ca975' }
               : score >= 670 ? { label: 'Good',        color: '#7bb7e0' }
               : score >= 580 ? { label: 'Fair',        color: '#e8a63a' }
               :                { label: 'Needs work',  color: '#d94848' };
    const prevScore = score - Math.round(surplus > 0 ? 4 : -2);
    return {
      score, band, delta: score - prevScore,
      components: {
        savings: { value: Math.round(rate * 100), max: 20, pct: cSav },
        emergency: { value: months.toFixed(1), max: 6, pct: cEmg },
        dti: { value: Math.round(dti * 100), max: 35, pct: cDti },
        utilization: { value: Math.round(util * 100), max: 50, pct: cUtil },
        goals: { value: Math.round(goalProgress * 100), max: 100, pct: cGoals }
      }
    };
  }

  function moneyWeather() {
    const cs = clarityScore();
    const inc = averageMonthlyIncome(3);
    const exp = averageMonthlyExpense(3);
    const surplus = inc - exp;
    const monthK = currentMonth();
    const spend = monthlySpendByCategory(monthK);
    const overBudget = state.budgets.filter(b => (spend[b.categoryId] || 0) > b.limit).length;
    const completedGoal = (state.goals || []).some(g => g.saved >= g.target);
    const bigMilestone = cs.score >= 780 || completedGoal || netWorth() >= 750000;
    if (bigMilestone) {
      return { state: 'milestone', label: 'Milestone month',
        reason: 'Your Clarity Score is in the top band or you crossed a major goal/net-worth mark.',
        actions: ['Celebrate with a small reward redemption', 'Raise the next goal target', 'Share the recap with a friend'] };
    }
    if (surplus < 0 || cs.score < 580 || overBudget >= 3) {
      return { state: 'storm', label: 'Stormy',
        reason: surplus < 0 ? 'Expenses are outpacing income this month.' :
          cs.score < 580 ? 'Clarity Score is below Fair — one or more pillars need attention.' :
          overBudget + ' category budgets are blown — spending is drifting.',
        actions: ['Review the top 3 biggest categories with Lumi', 'Pause one subscription for 60 days', 'Move $100 to the emergency fund tonight'] };
    }
    if (surplus < 200 || overBudget >= 1) {
      return { state: 'mixed', label: 'Mixed skies',
        reason: 'You\'re stable but tight. A small shift would put you clearly in the sun.',
        actions: ['Trim dining by 15% this month', 'Auto-route $50 more to savings', 'Ask Lumi what a 2% raise would do'] };
    }
    return { state: 'clear', label: 'Clear skies',
      reason: 'Surplus is healthy, budgets are holding, goals are advancing.',
      actions: ['Consider bumping an emergency-fund month', 'Increase a retirement contribution 1%', 'Plan the next life goal with Lumi'] };
  }

  /* ---------- Churn & loyalty (Advisor) ---------- */
  function computeChurnRisk() {
    const extBalance = state.accounts.filter(a => !a.isLuminate && a.balance > 0).reduce((s, a) => s + a.balance, 0);
    const lumBalance = state.accounts.filter(a => a.isLuminate && a.balance > 0).reduce((s, a) => s + a.balance, 0);
    const share = lumBalance / Math.max(1, lumBalance + extBalance);
    const hasLoan = state.accounts.some(a => a.type === 'loan' && !a.isLuminate);
    const score = Math.round((1 - share) * 70 + (hasLoan ? 15 : 0));
    return Math.max(0, Math.min(100, score));
  }
  function loyaltyTier() {
    const lumBalance = state.accounts.filter(a => a.isLuminate).reduce((s, a) => s + Math.abs(a.balance), 0);
    if (lumBalance > 200000) return { tier: 'Obsidian', perks: ['Dedicated banker', 'Free wire transfers', 'Premier HELOC rates'] };
    if (lumBalance > 75000)  return { tier: 'Sapphire', perks: ['Priority support', 'Bonus APY on savings', '2× rewards points'] };
    if (lumBalance > 20000)  return { tier: 'Azure',    perks: ['No ATM fees', 'Free cashier\'s checks', '1.5× rewards points'] };
    return { tier: 'Horizon', perks: ['No-fee checking', 'Overdraft grace', 'Luminate Rewards'] };
  }
  function rewardsPoints() {
    const ccSpend = Math.abs(state.transactions
      .filter(t => t.accountId === 'acc_lcc' && t.amount < 0 && t.category !== 'fees' && t.category !== 'transfer')
      .reduce((s, t) => s + t.amount, 0));
    return Math.round(ccSpend * 1.5);
  }

  /* ---------- Router ---------- */
  const ROUTES = ['dashboard', 'transactions', 'accounts', 'budgets', 'goals', 'bills', 'networth', 'investments', 'credit', 'insights', 'rewards', 'advisor', 'settings', 'business', 'selfemployed', 'homebuyer', 'student'];
  function currentRoute() {
    const hash = location.hash.slice(1).split('?')[0];
    return ROUTES.includes(hash) ? hash : 'dashboard';
  }
  function navigate(route) {
    location.hash = '#' + route;
  }
  function render() {
    const route = currentRoute();
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.route === route));
    const titles = {
      dashboard: 'Dashboard', transactions: 'Transactions', accounts: 'Accounts',
      budgets: 'Budgets', goals: 'Life Goals', bills: 'Bills & Subscriptions',
      networth: 'Net Worth', investments: 'Investments', credit: 'Credit',
      insights: 'AI Insights', rewards: 'Luminate Rewards', advisor: 'Advisor View',
      settings: 'Settings', business: 'Business Suite', selfemployed: 'Freelancer Hub',
      homebuyer: 'Homebuyer Journey', student: 'Student Center'
    };
    document.getElementById('top-title').textContent = titles[route] || 'Luminate';
    const content = document.getElementById('content');
    content.innerHTML = '';
    const renderer = window.LuminateViews && window.LuminateViews[route];
    if (renderer) {
      try { renderer(content); }
      catch (e) { console.error(e); content.appendChild(el('div', { class: 'card' }, `Error rendering ${route}: ${e.message}`)); }
    } else {
      content.appendChild(el('div', { class: 'card' }, `View "${route}" coming soon.`));
    }
    window.scrollTo(0, 0);
  }

  /* ---------- Onboarding ---------- */
  const DISC_QUESTIONS = [
    { q: 'When you get paid, your first instinct is to:',
      opts: [{ k:'D', t:'Knock down the highest-rate debt immediately.' },
             { k:'I', t:'Celebrate a small win — you earned it.' },
             { k:'S', t:'Top up the emergency fund first.' },
             { k:'C', t:'Review the month\'s numbers before anything moves.' }] },
    { q: 'The best financial advice feels like:',
      opts: [{ k:'D', t:'Bottom line, no fluff.' },
             { k:'I', t:'Encouragement with real wins celebrated.' },
             { k:'S', t:'Calm guidance, one small step at a time.' },
             { k:'C', t:'Data, charts, and the exact math.' }] },
    { q: 'Unexpected $500 windfall. You:',
      opts: [{ k:'D', t:'Send it straight at the next big goal.' },
             { k:'I', t:'Split it across fun + savings, tell someone about it.' },
             { k:'S', t:'Set it aside for the next rainy day.' },
             { k:'C', t:'Run a quick ROI comparison before deciding.' }] },
    { q: 'Reviewing your budget feels best when you:',
      opts: [{ k:'D', t:'Cut what isn\'t working and move on.' },
             { k:'I', t:'Find wins worth sharing with others doing the same.' },
             { k:'S', t:'Make small, steady adjustments — no big swings.' },
             { k:'C', t:'Drill into every category to spot outliers.' }] },
    { q: 'A financial risk (invest, start a business) feels:',
      opts: [{ k:'D', t:'Exciting — go big or go home.' },
             { k:'I', t:'Energizing if you\'ve got a team riding it with you.' },
             { k:'S', t:'Worth it only once the safety net is rock solid.' },
             { k:'C', t:'Acceptable after research and a proper model.' }] },
    { q: 'The goal that matters most right now is:',
      opts: [{ k:'D', t:'A big, ambitious number to conquer.' },
             { k:'I', t:'Something that will make life more fun.' },
             { k:'S', t:'Peace of mind — fewer financial worries.' },
             { k:'C', t:'The numerically optimal outcome.' }] }
  ];

  function computeDiscPrimary(scores) {
    const order = ['D', 'I', 'S', 'C'];
    let best = order[0], hi = -1;
    order.forEach(k => { if (scores[k] > hi) { hi = scores[k]; best = k; } });
    return hi > 0 ? best : null;
  }
  const DISC_LABEL = { D: 'Dominance', I: 'Influence', S: 'Steadiness', C: 'Conscientiousness' };
  const DISC_COLOR = { D: '#d94848', I: '#e8a63a', S: '#15a56a', C: '#7bb7e0' };

  function showNamePrompt() {
    const input = el('input', {
      type: 'text',
      value: state.user.firstName || '',
      placeholder: 'First name',
      style: { width: '100%', padding: '12px 14px', borderRadius: '10px',
               border: '1px solid var(--border)', background: 'var(--surface-2)' }
    });
    const next = () => {
      const name = input.value.trim();
      if (name) state.user.firstName = name;
      save();
      refreshUserChrome();
      showDiscQuiz();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') next(); });
    openModal(el('div', {},
      el('h2', {}, 'Welcome to Luminate Horizon'),
      el('p', { class: 'muted', style: { marginBottom: '16px' } },
        'What should we call you? Everything stays on your device.'),
      el('div', { class: 'form-row' }, input),
      el('div', { class: 'modal-actions' },
        el('button', { class: 'btn primary', onclick: next }, 'Continue'))));
    setTimeout(() => input.focus(), 30);
  }

  function showDiscQuiz() {
    const scores = { D: 0, I: 0, S: 0, C: 0 };
    const selections = new Array(DISC_QUESTIONS.length).fill(null);
    const body = el('div', {});
    DISC_QUESTIONS.forEach((item, qi) => {
      body.appendChild(el('div', { style: { marginBottom: '14px' } },
        el('strong', { style: { display: 'block', marginBottom: '8px', fontSize: '13px' } }, (qi + 1) + '. ' + item.q),
        ...item.opts.map(opt => {
          const btn = el('button', {
            class: 'btn', style: { display: 'block', width: '100%', textAlign: 'left', marginBottom: '6px' },
            onclick: () => {
              if (selections[qi]) scores[selections[qi]]--;
              scores[opt.k]++;
              selections[qi] = opt.k;
              body.querySelectorAll('[data-qi="' + qi + '"]').forEach(b => b.style.background = '');
              btn.style.background = 'var(--lumi-200)';
            }, 'data-qi': qi
          }, opt.t);
          return btn;
        })));
    });
    const finish = (skipped) => {
      if (!skipped && Object.values(scores).reduce((s, v) => s + v, 0) > 0) {
        state.user.disc = { D: scores.D, I: scores.I, S: scores.S, C: scores.C, primary: computeDiscPrimary(scores), taken: true };
      }
      state.user.firstNameConfirmed = true;
      save();
      refreshUserChrome();
      closeModal();
      const disc = state.user.disc;
      if (disc && disc.primary) {
        toast(state.user.firstName + ' — your coach is tuned for ' + DISC_LABEL[disc.primary] + '.');
      } else {
        toast('Welcome to Luminate Horizon, ' + (state.user.firstName || 'friend') + '.');
      }
      render();
    };
    openModal(el('div', { style: { maxHeight: '70vh', overflowY: 'auto' } },
      el('h2', {}, 'Two-minute coaching style'),
      el('p', { class: 'muted', style: { marginBottom: '14px' } },
        'Pick the option that feels most true for each. Lumi uses your DISC style to tune every nudge and reply — you can skip and take it later in Settings.'),
      body,
      el('div', { class: 'modal-actions' },
        el('button', { class: 'btn', onclick: () => finish(true) }, 'Skip for now'),
        el('button', { class: 'btn primary', onclick: () => finish(false) }, 'Finish & personalize'))));
  }

  function initOnboarding() {
    const ob = document.getElementById('onboarding');
    if (state.user && state.user.onboarded) {
      ob.classList.add('hide');
      if (!state.user.firstNameConfirmed) setTimeout(showNamePrompt, 120);
      return;
    }
    ob.classList.remove('hide');
    let step = 1;
    const dots = ob.querySelectorAll('.ob-dots span');
    const setStep = (n) => {
      step = n;
      ob.querySelectorAll('.ob-step').forEach(s => s.classList.toggle('active', +s.dataset.step === n));
      dots.forEach((d, i) => d.classList.toggle('on', i < n));
    };
    ob.querySelectorAll('[data-ob-next]').forEach(b => b.addEventListener('click', () => setStep(+b.dataset.obNext)));
    ob.querySelectorAll('[data-ob-prev]').forEach(b => b.addEventListener('click', () => setStep(+b.dataset.obPrev)));
    ob.querySelectorAll('.ob-account-pick').forEach(b => b.addEventListener('click', () => b.classList.toggle('picked')));
    ob.querySelectorAll('.ob-goal-pick').forEach(b => b.addEventListener('click', () => b.classList.toggle('picked')));
    document.getElementById('ob-finish').addEventListener('click', () => {
      const fn = document.getElementById('ob-firstName').value.trim();
      const em = document.getElementById('ob-email').value.trim();
      const inc = parseFloat(document.getElementById('ob-income').value);
      const hh = parseInt(document.getElementById('ob-household').value, 10);
      if (fn) state.user.firstName = fn;
      if (em) state.user.email = em;
      if (inc > 0) state.user.monthlyIncome = inc;
      if (hh > 0) state.user.dependents = Math.max(0, hh - 1);
      state.user.onboarded = true;
      save();
      ob.classList.add('hide');
      refreshUserChrome();
      toast('Welcome to Luminate, ' + (state.user.firstName || 'friend') + '! ✨');
      render();
    });
  }

  /* ---------- Modals ---------- */
  function openModal(contentEl) {
    const back = document.getElementById('modal-backdrop');
    const modal = document.getElementById('modal');
    modal.innerHTML = '';
    modal.appendChild(contentEl);
    back.classList.add('open');
  }
  function closeModal() { document.getElementById('modal-backdrop').classList.remove('open'); }
  document.addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  /* ---------- Toast ---------- */
  function toast(msg) {
    const root = document.getElementById('toast-root');
    const t = el('div', { class: 'toast' }, msg);
    root.appendChild(t);
    setTimeout(() => t.remove(), 3400);
  }

  /* ---------- Theme ---------- */
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.user.theme || 'light');
  }
  function toggleTheme() {
    state.user.theme = state.user.theme === 'dark' ? 'light' : 'dark';
    save(); applyTheme(); render();
  }

  /* ---------- User chrome ---------- */
  function refreshUserChrome() {
    const name = state.user.firstName + (state.user.lastName ? ' ' + state.user.lastName : '');
    document.getElementById('nav-username').textContent = name || 'Member';
    document.getElementById('nav-avatar').textContent = (state.user.firstName || 'L').charAt(0).toUpperCase();
    const small = document.querySelector('#sidebar .sidebar-user small');
    const disc = state.user.disc && state.user.disc.primary;
    if (small) {
      small.textContent = disc
        ? 'Luminate Premier · ' + disc + '-style'
        : 'Luminate Premier';
    }
  }

  /* ---------- AI Coach ---------- */
  const COACH_INTRO = [
    "Hey {name} 👋 I'm Lumi, your AI financial coach. Ask me anything — budget tweaks, goal timelines, debt strategy, tax moves, or what Luminate product fits your situation.",
    "A few things I can do right now: summarize your month, find leaking subscriptions, build a debt payoff plan, or simulate what happens if you save $200 more/month."
  ];
  /* ---------- Scenario simulator ---------- */
  function simulateScenario(query) {
    const inc = averageMonthlyIncome(3);
    const exp = averageMonthlyExpense(3);

    // "save $X more" family
    let m = query.match(/save\s+\$?([\d,]+)\s*(?:more|extra)?/);
    if (m && /save|saving/.test(query)) {
      const extra = parseInt(m[1].replace(/,/g, ''), 10);
      if (extra > 0 && extra < 50000) {
        const newSurplus = inc - exp + extra;
        const newRate = inc > 0 ? (newSurplus / inc) * 100 : 0;
        const yr1 = extra * 12 * 1.045;
        const yr10 = extra * 12 * (Math.pow(1.06, 10) - 1) / 0.06;
        return [
          'If you added ' + fmtMoney(extra) + '/mo to savings, your savings rate becomes ' + newRate.toFixed(1) + '%.',
          'Year 1 in Luminate High-Yield at 4.50% APY: ~' + fmtMoneyShort(yr1) + '.',
          'Year 10 at a 6% balanced return: ~' + fmtMoneyShort(yr10) + '. That\'s the compounding cost of not doing it.'
        ];
      }
    }
    // "pay $X toward card/credit"
    m = query.match(/pay\s+\$?([\d,]+)/);
    if (m && /(card|credit|sapphire)/.test(query)) {
      const pay = parseInt(m[1].replace(/,/g, ''), 10);
      const cc = state.accounts.find(a => a.type === 'credit' && a.limit);
      if (cc && pay > 0) {
        const bal = Math.abs(cc.balance);
        const newBal = Math.max(0, bal - pay);
        const oldUtil = Math.round((bal / cc.limit) * 100);
        const newUtil = Math.round((newBal / cc.limit) * 100);
        const score = Math.max(5, Math.round((oldUtil - newUtil) * 0.7));
        const interest = Math.round(pay * (cc.apr || 21.99) / 100 * 0.5);
        return [
          'Paying ' + fmtMoney(pay) + ' to your ' + cc.nickname + ' card cuts utilization from ' + oldUtil + '% to ' + newUtil + '%.',
          'Expected score lift: ~+' + score + ' points by next statement.',
          'Interest avoided over the next 6 months: ~' + fmtMoney(interest) + '.'
        ];
      }
    }
    // "max 401k"
    if (/max(imize)?\s+(the\s+)?401\s*\(?k\)?/.test(query)) {
      const limit = 23000;
      const annInc = inc * 12;
      const pct = annInc > 0 ? Math.round((limit / annInc) * 100) : 0;
      const thirtyYr = limit * (Math.pow(1.07, 30) - 1) / 0.07;
      return [
        'Maxing 401(k) means contributing ' + fmtMoney(limit) + '/yr — about ' + pct + '% of your pre-tax income (' + fmtMoney(Math.round(limit / 12)) + '/mo).',
        'Take-home drops ~' + fmtMoney(Math.round(limit / 12 * 0.72)) + '/mo after the tax deduction kicks in.',
        'At a 7% long-term return, 30 years of maxing = ~' + fmtMoneyShort(thirtyYr) + ' before employer match.'
      ];
    }
    // "cut/skip/pause <category> [by X%]"
    m = query.match(/(?:cut|skip|stop|pause|trim)\s+(?:the\s+)?(\w+)(?:\s+by\s+(\d+)\s*%?)?/);
    if (m) {
      const name = m[1].toLowerCase();
      const cat = state.categories.find(c => c.id === name || c.name.toLowerCase().includes(name));
      if (cat) {
        const spendMap = monthlySpendByCategory(currentMonth());
        const monthSpend = spendMap[cat.id] || 0;
        const pctCut = m[2] ? parseInt(m[2], 10) : 100;
        const saved = monthSpend * (pctCut / 100);
        if (saved > 0) {
          return [
            'Cutting ' + cat.name + ' by ' + pctCut + '% this month frees roughly ' + fmtMoney(saved) + '.',
            'Routed to the Italy goal, that pulls the finish date in by ~' + Math.max(1, Math.ceil(saved / 360)) + ' month(s).',
            'Or routed to the Sapphire card, you\'d drop utilization about ' + Math.round(saved / 12000 * 100) + ' percentage points.'
          ];
        }
      }
    }
    return null;
  }

  function styleReply(lines, primary) {
    if (!primary || !lines || !lines.length) return lines || [];
    const out = lines.slice();
    const first = out[0];
    if (primary === 'D') {
      out[0] = 'Bottom line: ' + first;
      out.push('Take the action today — you\'ve got the margin.');
    } else if (primary === 'I') {
      out[0] = 'Love this — ' + first.charAt(0).toLowerCase() + first.slice(1);
      out.push('You\'re already ahead of most people at your stage. Keep the momentum.');
    } else if (primary === 'S') {
      out[0] = 'You\'re in a steady spot. ' + first;
      out.push('No rush — small consistent moves compound quietly.');
    } else if (primary === 'C') {
      out[0] = 'Here\'s the breakdown: ' + first;
      out.push('Basis: 3-mo rolling averages, linear projection, current-rate inputs. Re-run anytime your income or debt changes.');
    }
    return out;
  }

  function coachReply(q) {
    const raw = _coachCore(q);
    const primary = state.user.disc && state.user.disc.primary;
    return styleReply(raw, primary);
  }

  function _coachCore(q) {
    const query = q.toLowerCase();
    // Scenario simulator (runs first)
    if (/\bwhat if|simulate|scenario|would happen/.test(query) ||
        /\bsave\b.*more|\bpay\b.*\b(card|credit)|\bmax\b.*401|\bcut|skip|trim\b/.test(query)) {
      const sim = simulateScenario(query);
      if (sim) return sim;
    }
    const inc = averageMonthlyIncome(3);
    const exp = averageMonthlyExpense(3);
    const nw = netWorth();
    const save = inc - exp;
    const rate = inc > 0 ? (save / inc * 100).toFixed(1) : '0';
    if (/save|saving|saver/.test(query))
      return [`You're saving about ${fmtMoney(save)} a month — a ${rate}% savings rate.`,
              `Benchmark: 15%+ puts you on track for FI. If you bumped savings by $200/mo and parked it in Luminate High-Yield at 4.50% APY, you'd have ~${fmtMoneyShort((save + 200) * 12 * 1.045 + (save + 200) * 12 * 12 * 1.045)} in 13 years.`];
    if (/debt|payoff|credit card/.test(query)) {
      const debts = state.accounts.filter(a => a.balance < 0);
      const total = Math.abs(debts.reduce((s, a) => s + a.balance, 0));
      return [`You carry ${fmtMoney(total)} across ${debts.length} accounts.`,
              `Avalanche strategy: pay minimums everywhere, throw extra $ at your highest-APR debt (Luminate Sapphire @ 21.99%) first. At $300/mo extra you'd be credit-card debt free in ~8 months and save ~$420 in interest.`];
    }
    if (/budget/.test(query)) {
      const spend = monthlySpendByCategory(currentMonth());
      const sorted = Object.entries(spend).sort((a,b) => b[1] - a[1]).slice(0, 3);
      return [`Your top 3 categories this month: ${sorted.map(([c,v]) => `${getCategory(c).name} ${fmtMoney(v)}`).join(' · ')}`,
              `Dining is typically the easiest to trim. Want me to propose a 15% cut? I can auto-adjust your budget.`];
    }
    if (/vacation|trip|travel/.test(query))
      return [`Italy trip plan: saving ${fmtMoney(360)}/mo → fully funded in ~12 months.`,
              `Book flights 8 weeks out and use the Luminate Sapphire card for 3× points on travel (worth ~$195 back on this trip).`];
    if (/house|home|mortgage|down/.test(query))
      return [`With your current savings rate, a 10% down payment on a $450k home is ~32 months away.`,
              `If you move your emergency fund into Luminate High-Yield and add $250/mo to the house fund, you could cut that to 24 months.`];
    if (/retire|retirement|fire/.test(query))
      return [`At today's pace you're projected to hit ${fmtMoneyShort(nw * Math.pow(1.07, 28))} by age 60.`,
              `Max your 401(k) to ~$23k/yr and you move your retirement age up by about 4.3 years.`];
    if (/credit score|credit/.test(query))
      return [`Your score is ${state.user.creditScore}. To push into the 800+ club: keep card utilization under 10% (you're at 18%), and don't open new accounts for 90 days.`,
              `Paying $400 toward the Sapphire balance would drop utilization to 9% and could lift your score 12–22 points by next month.`];
    if (/subscript/.test(query)) {
      const subs = detectSubscriptions();
      return [`I detected ${subs.length} recurring charges costing ${fmtMoney(subs.reduce((s, x) => s + x.yearly, 0))}/yr.`,
              `Biggest: ${subs.slice(0, 3).map(s => s.merchant).join(', ')}. Want me to flag ones you haven't used lately?`];
    }
    // --- Expanded intent library (Stage 1A) ---
    if (/emergency\s*fund|3\s*months?|6\s*months?/.test(query)) {
      const cash = state.accounts.filter(a => a.type === 'checking' || a.type === 'savings')
        .reduce((x, a) => x + Math.max(0, a.balance), 0);
      const months = exp > 0 ? (cash / exp).toFixed(1) : '—';
      return [`You\'ve got ${months} months of expenses in cash.`,
              `Target is 3 months if single + stable, 6 months with dependents or volatile income. Luminate High-Yield at 4.50% APY is where it belongs.`];
    }
    if (/rent|apartment|can i afford/.test(query)) {
      const m = query.match(/\$?([\d,]+)/);
      const rent = m ? parseInt(m[1].replace(/,/g, ''), 10) : Math.round(inc * 0.30);
      const ratio = inc > 0 ? (rent / inc) * 100 : 0;
      return [`At ${fmtMoney(rent)}/mo, that\'s ${ratio.toFixed(0)}% of your take-home.`,
              ratio <= 30 ? 'Comfortably in the 30%-rule zone.' :
              ratio <= 40 ? 'Tight but workable — you\'d need to trim elsewhere.' :
                            'Above 40% is the red zone. Lumi recommends looking 15–20% lower or renegotiating.'];
    }
    if (/tax\s*withhold|withholding|w[-\s]?4/.test(query)) {
      return [`You pay roughly ${fmtMoney(Math.round(inc * 0.22))}/mo in federal income tax based on your income profile.`,
              `If you got a big refund or owed a lot last April, we should revisit your W-4. Aim for within $500 either way — refunds are interest-free loans to the IRS.`];
    }
    if (/401\s*match|employer\s*match|match/.test(query)) {
      return [`Most employers match 3–6% of salary. On your income that\'s ${fmtMoney(Math.round(inc * 12 * 0.04))}/yr in free money if you contribute enough to capture it.`,
              `Rule of thumb: capture the full match before doing anything else — it\'s an immediate 100% return.`];
    }
    if (/hsa|health\s*savings/.test(query)) {
      return [`HSA is the only triple-tax-advantaged account. 2026 limits: $4,300 individual / $8,550 family.`,
              `If you have a high-deductible plan, max the HSA and invest it — after age 65 it acts like a traditional IRA with zero penalty on non-medical withdrawals.`];
    }
    if (/roth|traditional\s*ira|ira/.test(query)) {
      return [`Roth = pay tax now, never again. Traditional = deduct now, pay tax in retirement.`,
              `At your income, Roth is likely the better bet — you\'ll almost certainly be in a higher bracket later. 2026 Roth limit: $7,000.`];
    }
    if (/avalanche|snowball|debt\s*strategy/.test(query)) {
      const debts = state.accounts.filter(a => a.balance < 0);
      const total = Math.abs(debts.reduce((x, a) => x + a.balance, 0));
      return [`Avalanche: pay minimums everywhere, throw every extra dollar at the highest-APR debt. Mathematically optimal — saves the most interest.`,
              `Snowball: attack smallest balance first for psychological wins. Works better if motivation matters more than math. You\'ve got ${fmtMoney(total)} total, so either strategy closes it inside 3 years at $600/mo extra.`];
    }
    if (/refinance|refi|mortgage\s*rate/.test(query)) {
      return [`Refi usually pays off when new rates are 0.75%+ below yours and you plan to stay 3+ years.`,
              `Your mortgage is at 6.25% — today\'s market is around 6.35%, so not yet. Luminate will ping you the moment it crosses 5.50%.`];
    }
    if (/raise|negotiat.*salary|negotiat.*pay/.test(query)) {
      return [`Three numbers to walk in with: your market rate (use Levels.fyi or Glassdoor), your past 12-month impact (quantify it), and a specific ask (% or dollar).`,
              `A 5% raise on your income = ${fmtMoney(Math.round(inc * 12 * 0.05))}/yr. Invested for 30 years at 7%, that single raise compounds to ~${fmtMoneyShort(inc * 12 * 0.05 * (Math.pow(1.07, 30) - 1) / 0.07)}.`];
    }
    if (/buy\s*vs\s*rent|rent\s*vs\s*buy|should i buy/.test(query)) {
      return [`The rough rule: if your home-price-to-annual-rent ratio is under 15, buying tends to win. Over 20, renting usually does. Between is coin-flip and depends on how long you stay.`,
              `Don\'t forget: maintenance ~1% of home value/yr, closing costs ~3%, opportunity cost of the down payment. I can run real numbers if you tell me a price target.`];
    }
    if (/bonus|windfall|inheritance|tax\s*refund/.test(query)) {
      return [`A healthy order of priorities: (1) top off emergency fund to 6 months, (2) capture any 401(k) match you\'re missing, (3) kill high-interest debt, (4) invest the rest in tax-advantaged accounts first.`,
              `Fun rule: set aside 5% for something meaningful. You earned it.`];
    }
    if (/fire|financial\s*independence|retire\s*early/.test(query)) {
      const annualExpense = exp * 12;
      const fireNum = annualExpense * 25;
      return [`Your FIRE number at today\'s spending: ${fmtMoneyShort(fireNum)} (25× annual expenses, 4% rule).`,
              `At ${fmtMoneyShort(nw)} net worth today, you\'re ${Math.round(nw / fireNum * 100)}% of the way there. Most of the work is compounding, not contributing.`];
    }
    if (/baby|child|newborn|parent|expecting/.test(query)) {
      return [`First-year all-in costs average $18,000–$25,000 before childcare. Start a sinking fund now.`,
              `Critical moves inside month 1: add baby to insurance, open a 529 (up to $18k/yr per-person gift-tax-free), lock term life insurance before health events, update beneficiaries on every account.`];
    }
    if (/marriage|wedding|married|spouse/.test(query)) {
      return [`Merging finances: three-account model works best. Joint for shared bills, two individual for personal spending. Transparent on everything, autonomous on small stuff.`,
              `Financially, marriage is often a tax win at your income unless both of you earn in the top 5%. Let me know ballpark household income and I\'ll run the Luminate tax-bracket projection.`];
    }
    if (/job\s*loss|fired|laid\s*off|unemploy/.test(query)) {
      return [`Your emergency fund covers about ${exp > 0 ? (state.accounts.filter(a => a.type === 'savings').reduce((x, a) => x + a.balance, 0) / exp).toFixed(1) : '—'} months at current burn. Cut subscriptions + dining first, those are ~${fmtMoney(Math.round(exp * 0.15))}/mo.`,
              `COBRA is usually worth it if a pre-existing condition is in play; otherwise the ACA marketplace is cheaper. File for unemployment week one — most states have a waiting week.`];
    }
    if (/invest|portfolio|where should i put/.test(query)) {
      return [`Simple three-fund works for 90% of people: VTI (total US), VXUS (international), BND (bonds). Age in bonds is a decent starting ratio — you\'re holding ${Math.round(state.investments.filter(i => i.symbol === 'BND').reduce((x, i) => x + i.shares * i.price, 0) / (netWorth() || 1) * 100)}% bonds today.`,
              `Avoid timing the market. Dollar-cost-average monthly into index funds, then don\'t touch it. Luminate Invest automates this.`];
    }
    if (/diversif|concentrate|single\s*stock/.test(query)) {
      return [`A single stock over 10% of your portfolio is the concentration line. You\'re clean on that today.`,
              `Geographic split matters too — 30% international is the typical modern-portfolio recommendation. You\'re at ~${Math.round(state.investments.filter(i => i.symbol === 'VXUS').reduce((x, i) => x + i.shares * i.price, 0) / (netWorth() || 1) * 100)}%.`];
    }
    if (/529|college\s*fund|tuition/.test(query)) {
      return [`A 529 grows tax-free when used for education. Average in-state public 4-year = ~$25k/yr today; figure 5% tuition inflation for planning.`,
              `Target for a newborn: ~$40k by year 5, then let compounding finish the job. Luminate connects to every major 529 plan — let me know the child\'s state of residence.`];
    }
    if (/insurance|term\s*life|whole\s*life|umbrella/.test(query)) {
      return [`Term life: yes if anyone depends on your income. 10× annual income, 20–30 year term is the default. Cheap at your age.`,
              `Whole life: almost never (investment + insurance mixed = bad deal). Umbrella: yes if net worth > $500k, rental properties, or a pool.`];
    }
    if (/hi|hello|hey/.test(query))
      return [`Hey ${state.user.firstName || 'there'}! What's on your mind today?`];
    return [`I'd summarize: your net worth is ${fmtMoneyShort(nw)}, monthly surplus ${fmtMoney(save)}, and emergency fund is at ${Math.round((18450.20/ (exp * 6)) * 100)}% of a 6-month target.`,
            `Try asking me about budgets, debt, a specific goal, or "how do I get to 800 credit?"`];
  }

  /* ---------- Public API ---------- */
  window.LuminateApp = {
    getState, setState, save, render, navigate, toast, openModal, closeModal,
    fmtMoney, fmtMoneyShort, fmtDate, fmtDateShort, fmtRelative, monthKey, currentMonth, lastNMonthKeys,
    monthlySpendByCategory, monthlyIncome, monthlyExpense, averageMonthlyExpense, averageMonthlyIncome,
    netWorth, assets, liabilities, safeToSpend, cashFlowForecast, detectSubscriptions,
    computeChurnRisk, loyaltyTier, rewardsPoints, clarityScore, moneyWeather,
    GOAL_TEMPLATES, recommendMonthly, projectGoal,
    getCategory, getAccount, el, h, cls, COACH_INTRO, coachReply
  };

  /* ---------- Wire up ---------- */
  applyTheme();
  refreshUserChrome();
  initOnboarding();

  document.querySelectorAll('.nav-item').forEach(n => n.addEventListener('click', () => {
    navigate(n.dataset.route);
    document.getElementById('sidebar').classList.remove('open');
  }));
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
  document.getElementById('theme-btn').addEventListener('click', toggleTheme);
  document.getElementById('refresh-btn').addEventListener('click', () => {
    toast('Accounts synced · just now ✓');
  });
  document.getElementById('global-search').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) return;
    if (currentRoute() !== 'transactions') navigate('transactions');
    setTimeout(() => {
      const inp = document.querySelector('.filter-bar input[type="search"]');
      if (inp) { inp.value = q; inp.dispatchEvent(new Event('input')); }
    }, 20);
  });
  window.addEventListener('hashchange', render);
  document.addEventListener('DOMContentLoaded', render);
  if (document.readyState !== 'loading') render();
})();
