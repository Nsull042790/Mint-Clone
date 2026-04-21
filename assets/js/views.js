/* =========================================================
   Luminate — View renderers
   Each renderer receives an empty <section> and populates it.
   ========================================================= */
(function () {
  'use strict';

  const A = window.LuminateApp;
  const { el, h, cls, fmtMoney, fmtMoneyShort, fmtDate, fmtDateShort, fmtRelative,
          monthKey, currentMonth, lastNMonthKeys,
          monthlySpendByCategory, monthlyIncome, monthlyExpense,
          averageMonthlyExpense, averageMonthlyIncome,
          netWorth, assets, liabilities, safeToSpend, cashFlowForecast, detectSubscriptions,
          computeChurnRisk, loyaltyTier, rewardsPoints,
          GOAL_TEMPLATES, recommendMonthly, projectGoal,
          getCategory, getAccount,
          getState, setState, render, navigate, toast, openModal, closeModal,
          coachReply, COACH_INTRO } = A;

  /* ---------- Shared render helpers ---------- */
  function viewHeader(title, subtitle, actions) {
    const left = el('div', { class: 'view-header-left' },
      el('h2', { class: 'view-title' }, title),
      subtitle ? el('div', { class: 'subtle' }, subtitle) : null
    );
    const right = el('div', { class: 'view-header-actions' }, ...(actions || []));
    return el('div', { class: 'view-header' }, left, right);
  }

  function card(title, bodyChildren, headActions) {
    const head = title ? el('div', { class: 'card-head' },
      el('strong', {}, title),
      headActions ? el('div', {}, ...headActions) : null
    ) : null;
    const body = Array.isArray(bodyChildren) ? bodyChildren : [bodyChildren];
    return el('div', { class: 'card' }, head, ...body.filter(Boolean));
  }

  function kpi(label, value, delta, variant) {
    return el('div', { class: cls('kpi', variant) },
      el('div', { class: 'kpi-label' }, label),
      el('div', { class: 'kpi-value' }, value),
      delta ? el('div', { class: cls('kpi-delta', delta.positive ? 'pos' : delta.negative ? 'neg' : '') }, delta.text) : null
    );
  }

  function progressBar(pct, variant) {
    const clamped = Math.max(0, Math.min(100, pct));
    const fill = el('span', { style: { width: clamped + '%' } });
    return el('div', { class: cls('bar', variant) }, fill);
  }

  // Chart.js loads with defer, so ensure it's ready before calling the callback.
  function ensureChart(cb) {
    if (window.Chart) { try { cb(); } catch (e) { console.error(e); } return; }
    let tries = 0;
    const iv = setInterval(() => {
      if (window.Chart) { clearInterval(iv); try { cb(); } catch (e) { console.error(e); } }
      else if (++tries > 80) { clearInterval(iv); console.warn('Chart.js failed to load'); }
    }, 30);
  }

  /* ---------- Placeholder factory ---------- */
  function todo(name) {
    return function (content) {
      content.appendChild(viewHeader(name, 'Coming in the next chunk.'));
      content.appendChild(card(null, el('div', { class: 'subtle' }, 'TODO: ' + name)));
    };
  }

  /* ---------- Public registry ---------- */
  window.LuminateViews = {
    dashboard:    todo('Dashboard'),
    transactions: todo('Transactions'),
    accounts:     todo('Accounts'),
    budgets:      todo('Budgets'),
    goals:        todo('Life Goals'),
    bills:        todo('Bills & Subscriptions'),
    networth:     todo('Net Worth'),
    investments:  todo('Investments'),
    credit:       todo('Credit'),
    insights:     todo('AI Insights'),
    rewards:      todo('Luminate Rewards'),
    advisor:      todo('Advisor View'),
    settings:     todo('Settings'),
    business:     todo('Business Suite'),
    selfemployed: todo('Freelancer Hub'),
    homebuyer:    todo('Homebuyer Journey'),
    student:      todo('Student Center')
  };
})();
