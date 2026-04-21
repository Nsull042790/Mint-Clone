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
    advisor: function (content) {
      const s = getState();
      const u = s.user;
      const risk = computeChurnRisk();
      const tier = loyaltyTier();
      const lumPos = s.accounts.filter(a => a.isLuminate && a.balance > 0).reduce((x, a) => x + a.balance, 0);
      const extPos = s.accounts.filter(a => !a.isLuminate && a.balance > 0).reduce((x, a) => x + a.balance, 0);
      const share = lumPos / Math.max(1, lumPos + extPos);

      content.appendChild(viewHeader('Advisor View', 'Internal-only 360° for banker meetings with ' + (u.firstName || 'this member') + '.'));

      // KPI strip
      content.appendChild(el('div', { class: 'grid grid-4', style: { marginBottom: '16px' } },
        kpi('Net worth', fmtMoneyShort(netWorth()), null, 'navy'),
        kpi('Loyalty tier', tier.tier, null, 'success'),
        kpi('Churn risk', risk + '%', null, risk > 50 ? 'warn' : ''),
        kpi('Share of wallet', Math.round(share * 100) + '%', null)
      ));

      // Churn dial + share-of-wallet donut row
      const riskLabel = risk < 25 ? 'Low' : risk < 55 ? 'Moderate' : 'Elevated';
      const dial = el('div', {},
        el('div', { class: 'bar ' + (risk < 25 ? 'success' : risk < 55 ? 'warn' : 'danger') }, el('span', { style: { width: risk + '%' } })),
        el('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: '10px' } },
          el('strong', {}, riskLabel + ' risk'),
          el('span', { class: 'muted num' }, risk + ' / 100')),
        el('p', { class: 'muted', style: { marginTop: '10px' } },
          risk < 25 ? 'Core banking relationship is deep. Focus on investment & retirement cross-sell.' :
          risk < 55 ? 'External deposits and loans suggest competitor relationships. Recommend consolidation incentive.' :
                      'Member is actively using competitors for deposits or lending. Flag for retention outreach.')
      );
      const sowCanvas = el('canvas');
      const sowCard = card('Share of wallet', el('div', { class: 'chart-wrap sm' }, sowCanvas));
      ensureChart(() => new Chart(sowCanvas, {
        type: 'doughnut',
        data: {
          labels: ['Luminate deposits', 'Held elsewhere'],
          datasets: [{ data: [lumPos, extPos], backgroundColor: ['#0a1f44', '#e3e9f1'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '66%', plugins: { legend: { position: 'bottom' } } }
      }));

      content.appendChild(el('div', { class: 'grid grid-2', style: { marginBottom: '16px' } },
        card('Churn risk', dial),
        sowCard
      ));

      // Loyalty perks
      content.appendChild(card(tier.tier + ' tier perks',
        el('ul', { style: { paddingLeft: '20px', margin: 0, color: 'var(--text-muted)' } },
          ...tier.perks.map(p => el('li', {}, p)))
      ));

      // Cross-sell cards
      const offers = [];
      if (extPos > 5000) offers.push({ emoji: '🏦', title: 'Consolidate external deposits',
        body: fmtMoney(extPos) + ' sitting outside Luminate. A tier bump and 4.50% APY could recapture it.' });
      if (s.accounts.some(a => a.type === 'loan' && !a.isLuminate))
        offers.push({ emoji: '💳', title: 'Refinance external loan',
          body: 'Member carries external loan balances. Run a Luminate refinance quote — 0.25% rate discount for autopay from checking.' });
      if (s.user.creditScore >= 740) offers.push({ emoji: '✈️', title: 'Luminate Sapphire Travel',
        body: 'Credit profile qualifies for Sapphire Travel: 3x on airfare, 60k sign-on bonus.' });
      offers.push({ emoji: '🎓', title: 'Retirement consultation',
        body: 'Offer a complimentary 30-min retirement review with a Luminate Invest advisor.' });

      content.appendChild(card('Recommended next conversations',
        el('div', { class: 'grid grid-2' },
          ...offers.map(o => el('div', { class: 'insight' },
            el('div', { class: 'insight-icon', style: { fontSize: '20px' } }, o.emoji),
            el('div', { class: 'insight-body' }, el('strong', {}, o.title), el('p', {}, o.body))
          ))
        )
      ));
    },
    settings: function (content) {
      const s = getState();
      const u = s.user;
      content.appendChild(viewHeader('Settings', 'Profile, preferences, and demo controls.'));

      // Profile form
      const mkRow = (label, input) => el('div', { class: 'form-row' }, el('label', {}, label), input);
      const fn = el('input', { type: 'text',   value: u.firstName || '' });
      const ln = el('input', { type: 'text',   value: u.lastName || '' });
      const em = el('input', { type: 'email',  value: u.email || '' });
      const mi = el('input', { type: 'number', value: u.monthlyIncome || '', step: '50' });
      const dep= el('input', { type: 'number', value: u.dependents || 0, min: 0 });
      const cur= el('select', {},
        ...['USD','EUR','GBP','CAD','AUD'].map(code =>
          el('option', { value: code, selected: (u.currency || 'USD') === code ? 'selected' : null }, code)));
      const nt = el('select', {},
        el('option', { value: 'on',  selected: u.notificationsEnabled !== false ? 'selected' : null }, 'On'),
        el('option', { value: 'off', selected: u.notificationsEnabled === false ? 'selected' : null }, 'Off'));
      const saveBtn = el('button', { class: 'btn primary', onclick: () => {
        setState(st => {
          st.user.firstName = fn.value.trim();
          st.user.lastName  = ln.value.trim();
          st.user.email     = em.value.trim();
          st.user.monthlyIncome = parseFloat(mi.value) || 0;
          st.user.dependents    = parseInt(dep.value, 10) || 0;
          st.user.currency      = cur.value;
          st.user.notificationsEnabled = nt.value === 'on';
        });
        toast('Saved ✓');
        render();
      }}, 'Save changes');

      const profileCard = card('Profile', [
        el('div', { class: 'grid grid-2' },
          mkRow('First name', fn),
          mkRow('Last name', ln)),
        mkRow('Email', em),
        el('div', { class: 'grid grid-2' },
          mkRow('Monthly income', mi),
          mkRow('Dependents', dep)),
        el('div', { class: 'grid grid-2' },
          mkRow('Currency', cur),
          mkRow('Notifications', nt)),
        el('div', { class: 'modal-actions' }, saveBtn)
      ]);

      // Preferences card: theme
      const themeBtn = el('button', { class: 'btn', onclick: () => {
        setState(st => { st.user.theme = (st.user.theme === 'dark') ? 'light' : 'dark'; });
        document.documentElement.setAttribute('data-theme', getState().user.theme || 'light');
        render();
      }}, (u.theme === 'dark' ? '☀️ Switch to light' : '🌙 Switch to dark'));
      const prefsCard = card('Appearance', [
        el('p', { class: 'muted' }, 'Current theme: ' + (u.theme === 'dark' ? 'Dark' : 'Light')),
        el('div', { class: 'modal-actions', style: { justifyContent: 'flex-start' } }, themeBtn)
      ]);

      // Data card: export + reset
      const exportBtn = el('button', { class: 'btn', onclick: () => {
        const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = el('a', { href: url, download: 'luminate-data-' + new Date().toISOString().slice(0,10) + '.json' });
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        toast('Exported ✓');
      }}, '⬇ Export JSON');
      const resetBtn = el('button', { class: 'btn', style: { color: 'var(--danger)' }, onclick: () => {
        if (!confirm('Reset all demo data? This wipes your local state and reloads the app with fresh seed data.')) return;
        window.LuminateData.reset();
        location.reload();
      }}, '🗑 Reset demo data');
      const dataCard = card('Your data', [
        el('p', { class: 'muted' }, 'Everything lives in your browser — nothing is sent to a server.'),
        el('div', { class: 'modal-actions', style: { justifyContent: 'flex-start' } }, exportBtn, resetBtn)
      ]);

      content.appendChild(el('div', { class: 'grid grid-2' }, profileCard, el('div', { class: 'grid' }, prefsCard, dataCard)));
    },
    business: function (content) {
      content.appendChild(viewHeader('Business Suite', 'Small-business banking and bookkeeping, inside Luminate.'));
      content.appendChild(el('div', { class: 'card' },
        el('h3', {}, '🏢 Coming soon'),
        el('p', { class: 'muted' }, 'Luminate Business Suite turns your Luminate login into the operating system for your small business — no second dashboard, no re-keying transactions.'),
        el('ul', { style: { paddingLeft: '20px', marginTop: '12px', color: 'var(--text-muted)' } },
          el('li', {}, 'Business checking, corporate card, and payroll funding under one roof.'),
          el('li', {}, 'Cash-flow forecasting with scheduled invoices and recurring vendor bills.'),
          el('li', {}, 'Receipt capture + auto-categorization with audit-ready CSV export for your CPA.'),
          el('li', {}, 'Luminate Capital lines of credit and SBA-prep reports driven by real cash history.')
        )
      ));
    },
    selfemployed: function (content) {
      content.appendChild(viewHeader('Freelancer Hub', 'The money side of working for yourself, finally simple.'));
      content.appendChild(el('div', { class: 'card' },
        el('h3', {}, '💼 Coming soon'),
        el('p', { class: 'muted' }, 'Luminate Freelancer Hub handles the messy parts of self-employment — income smoothing, quarterly taxes, and retirement on your terms.'),
        el('ul', { style: { paddingLeft: '20px', marginTop: '12px', color: 'var(--text-muted)' } },
          el('li', {}, 'Variable-income smoothing: a personal paycheck from lumpy client payments.'),
          el('li', {}, 'Automatic 1099 and quarterly-estimated-tax set-asides in Luminate High-Yield.'),
          el('li', {}, 'Business-vs-personal transaction sorting with a single toggle.'),
          el('li', {}, 'Solo 401(k) and SEP-IRA calculators built for freelancer cash flow.')
        )
      ));
    },
    homebuyer: function (content) {
      content.appendChild(viewHeader('Homebuyer Journey', 'From saving your down payment to closing day.'));
      content.appendChild(el('div', { class: 'card' },
        el('h3', {}, '🔑 Coming soon'),
        el('p', { class: 'muted' }, 'Luminate Homebuyer guides you through the biggest purchase of your life with real numbers, not guesswork.'),
        el('ul', { style: { paddingLeft: '20px', marginTop: '12px', color: 'var(--text-muted)' } },
          el('li', {}, 'Affordability calculator that pulls in your real income, debts, and savings.'),
          el('li', {}, 'Down-payment goal engine with Luminate High-Yield + first-time-buyer programs.'),
          el('li', {}, 'Pre-approval readiness check against current Luminate Mortgage rates.'),
          el('li', {}, 'Closing-cost forecasts and moving-fund planning, based on your target ZIP code.')
        )
      ));
    },
    student: function (content) {
      content.appendChild(viewHeader('Student Center', 'Financial tools built for your student years.'));
      content.appendChild(el('div', { class: 'card' },
        el('h3', {}, '🎓 Coming soon'),
        el('p', { class: 'muted' }, 'Luminate Student Center helps you stretch the semester and graduate with momentum — not just a diploma.'),
        el('ul', { style: { paddingLeft: '20px', marginTop: '12px', color: 'var(--text-muted)' } },
          el('li', {}, 'Semester budgeting with tuition, housing, meal-plan, and textbook categories.'),
          el('li', {}, 'Student-loan payoff simulator with refinance scenarios and forgiveness eligibility.'),
          el('li', {}, 'Side-hustle & scholarship income tracking, separated from Mom & Dad transfers.'),
          el('li', {}, 'Credit-building roadmap designed for your first credit card and first apartment.')
        )
      ));
    }
  };
})();
