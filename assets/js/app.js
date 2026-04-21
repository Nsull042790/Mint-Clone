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
  function showNamePrompt() {
    const input = el('input', {
      type: 'text',
      value: state.user.firstName || '',
      placeholder: 'First name',
      style: { width: '100%', padding: '12px 14px', borderRadius: '10px',
               border: '1px solid var(--border)', background: 'var(--surface-2)' }
    });
    const submit = () => {
      const name = input.value.trim();
      if (name) state.user.firstName = name;
      state.user.firstNameConfirmed = true;
      save();
      refreshUserChrome();
      closeModal();
      toast('Welcome to Luminate Horizon, ' + (state.user.firstName || 'friend') + '.');
      render();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    const modal = el('div', {},
      el('h2', {}, 'Welcome to Luminate Horizon'),
      el('p', { class: 'muted', style: { marginBottom: '16px' } },
        'What should we call you? Everything stays on your device.'),
      el('div', { class: 'form-row' }, input),
      el('div', { class: 'modal-actions' },
        el('button', { class: 'btn primary', onclick: submit }, 'Continue'))
    );
    openModal(modal);
    setTimeout(() => input.focus(), 30);
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
  }

  /* ---------- AI Coach ---------- */
  const COACH_INTRO = [
    "Hey {name} 👋 I'm Lumi, your AI financial coach. Ask me anything — budget tweaks, goal timelines, debt strategy, tax moves, or what Luminate product fits your situation.",
    "A few things I can do right now: summarize your month, find leaking subscriptions, build a debt payoff plan, or simulate what happens if you save $200 more/month."
  ];
  function coachReply(q) {
    const query = q.toLowerCase();
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
    computeChurnRisk, loyaltyTier, rewardsPoints,
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
