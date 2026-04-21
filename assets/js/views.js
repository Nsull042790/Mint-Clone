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
    bills: function (content) {
      const s = getState();
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const in14 = new Date(today); in14.setDate(in14.getDate() + 14);
      const bills = s.bills.slice().sort((a, b) => a.due.localeCompare(b.due));
      const upcoming = bills.filter(b => {
        const d = new Date(b.due + 'T00:00:00');
        return d >= today && d <= in14;
      });
      const monthlyTotal = bills.reduce((x, b) => x + b.amount, 0);
      const subs = detectSubscriptions();

      const openAddBill = () => {
        const name = el('input', { type: 'text', placeholder: 'e.g. Hulu' });
        const amt  = el('input', { type: 'number', step: '0.01', placeholder: '14.99' });
        const due  = el('input', { type: 'date' });
        const catSel = el('select', {}, ...s.categories.map(c => el('option', { value: c.id }, c.name)));
        const acctSel = el('select', {}, ...s.accounts.filter(a => a.type !== 'property' && a.type !== 'vehicle').map(a =>
          el('option', { value: a.id }, a.nickname + ' ····' + a.mask)));
        const autopay = el('input', { type: 'checkbox' });
        const modal = el('div', {},
          el('h2', {}, 'Add a bill'),
          el('div', { class: 'form-row' }, el('label', {}, 'Name'), name),
          el('div', { class: 'grid grid-2' },
            el('div', { class: 'form-row' }, el('label', {}, 'Amount'), amt),
            el('div', { class: 'form-row' }, el('label', {}, 'Next due'), due)),
          el('div', { class: 'grid grid-2' },
            el('div', { class: 'form-row' }, el('label', {}, 'Category'), catSel),
            el('div', { class: 'form-row' }, el('label', {}, 'Pay from'), acctSel)),
          el('div', { class: 'form-row' },
            el('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', textTransform: 'none', letterSpacing: 0 } },
              autopay, el('span', {}, 'Enroll in autopay'))),
          el('div', { class: 'modal-actions' },
            el('button', { class: 'btn', onclick: closeModal }, 'Cancel'),
            el('button', { class: 'btn primary', onclick: () => {
              if (!name.value.trim() || !amt.value || !due.value) { toast('Fill all fields'); return; }
              setState(st => st.bills.push({
                id: 'bi_' + Math.random().toString(36).slice(2, 8),
                name: name.value.trim(), amount: parseFloat(amt.value),
                due: due.value, category: catSel.value, autopay: autopay.checked,
                account: acctSel.value
              }));
              closeModal(); toast('Bill added ✓'); render();
            }}, 'Save bill'))
        );
        openModal(modal);
      };

      content.appendChild(viewHeader('Bills & Subscriptions', fmtMoney(monthlyTotal) + ' scheduled this month across ' + bills.length + ' bills.',
        [el('button', { class: 'btn primary', onclick: openAddBill }, '+ Add bill')]));

      // Upcoming 14-day timeline
      const timeline = upcoming.length
        ? el('div', {}, ...upcoming.map(b => {
            const d = new Date(b.due + 'T00:00:00');
            return el('div', { class: 'bill' },
              el('div', { class: 'bill-date' },
                el('span', { class: 'day' }, String(d.getDate())),
                el('span', { class: 'mo' }, d.toLocaleString('en-US', { month: 'short' }))),
              el('div', {},
                el('strong', {}, b.name),
                el('div', { class: 'subtle' }, fmtRelative(b.due) + ' · ' + getCategory(b.category).name)),
              el('span', { class: cls('chip', b.autopay ? 'success' : 'warn') }, b.autopay ? '⚡ Autopay' : 'Manual'),
              el('span', { class: 'num' }, fmtMoney(b.amount)));
          }))
        : el('p', { class: 'muted' }, 'Nothing due in the next 14 days.');
      content.appendChild(card('Due in the next 14 days', timeline));

      // Monthly recurring table with autopay toggle
      content.appendChild(card('All recurring bills',
        el('table', { class: 'table' },
          el('thead', {}, el('tr', {},
            el('th', {}, 'Bill'),
            el('th', {}, 'Category'),
            el('th', {}, 'Next due'),
            el('th', {}, 'Autopay'),
            el('th', { style: { textAlign: 'right' } }, 'Amount'))),
          el('tbody', {}, ...bills.map(b => {
            const cat = getCategory(b.category);
            const toggle = el('button', {
              class: cls('chip', b.autopay ? 'success' : ''),
              style: { cursor: 'pointer' },
              onclick: () => {
                setState(st => { const m = st.bills.find(x => x.id === b.id); if (m) m.autopay = !m.autopay; });
                toast(b.autopay ? 'Autopay disabled' : 'Autopay enabled');
                render();
              }
            }, b.autopay ? '⚡ On' : 'Off');
            return el('tr', {},
              el('td', {}, el('strong', {}, b.name)),
              el('td', {}, el('span', { class: 'chip navy' }, cat.icon + ' ' + cat.name)),
              el('td', {}, fmtDate(b.due)),
              el('td', {}, toggle),
              el('td', { class: 'num', style: { textAlign: 'right', fontWeight: 600 } }, fmtMoney(b.amount)));
          })))
      ));

      // Detected subscriptions
      const subsBody = subs.length
        ? el('div', {}, ...subs.slice(0, 8).map(sub => el('div', { class: 'bill' },
            el('div', { class: 'txn-icon' }, (sub.merchant || '?').slice(0, 1).toUpperCase()),
            el('div', {},
              el('strong', {}, sub.merchant),
              el('div', { class: 'subtle' }, getCategory(sub.category).name + ' · last seen ' + fmtRelative(sub.lastSeen))),
            el('span', { class: 'chip warn' }, fmtMoney(sub.yearly, { cents: false }) + '/yr'),
            el('span', { class: 'num' }, fmtMoney(sub.amount) + '/mo'))))
        : el('p', { class: 'muted' }, 'No recurring charges detected yet — come back after a couple of months of activity.');
      content.appendChild(card('Detected subscriptions · ' + subs.length + ' found',
        subsBody,
        [el('button', { class: 'btn', onclick: () => toast('Canceled (demo)') }, 'Cancel selected (demo)')]));
    },
    networth: function (content) {
      const s = getState();
      const nw = netWorth();
      const a = assets();
      const l = liabilities();
      const surplus = averageMonthlyIncome(3) - averageMonthlyExpense(3);

      // Approximate 12-mo history: walk backward by average monthly surplus + small noise
      const months = lastNMonthKeys(12);
      const nwSeries = [];
      let v = nw;
      for (let i = months.length - 1; i >= 0; i--) {
        nwSeries[i] = v;
        const drift = surplus * 0.9 + (Math.sin(i * 1.7) * Math.max(200, Math.abs(surplus) * 0.15));
        v = v - drift;
      }
      const nwPrev = nwSeries[nwSeries.length - 2] || nw;
      const delta = nw - nwPrev;
      const deltaPct = nwPrev !== 0 ? (delta / Math.abs(nwPrev)) * 100 : 0;

      content.appendChild(viewHeader('Net Worth', 'Everything you own, minus everything you owe.'));

      // Headline
      content.appendChild(el('div', { class: 'grid grid-4', style: { marginBottom: '16px' } },
        kpi('Net worth', fmtMoneyShort(nw),
          { text: (delta >= 0 ? '▲ +' : '▼ ') + fmtMoneyShort(Math.abs(delta)) + '  (' + deltaPct.toFixed(1) + '%) mo/mo',
            positive: delta >= 0, negative: delta < 0 }, 'navy'),
        kpi('Assets',       fmtMoneyShort(a), null, 'success'),
        kpi('Liabilities',  fmtMoneyShort(l), null, 'warn'),
        kpi('Monthly change', fmtMoneyShort(surplus),
          { text: surplus >= 0 ? 'Growing' : 'Declining', positive: surplus >= 0, negative: surplus < 0 })
      ));

      // Line + stacked bar row
      const lineCanvas = el('canvas');
      ensureChart(() => new Chart(lineCanvas, {
        type: 'line',
        data: {
          labels: months.map(k => { const [y, m] = k.split('-'); return new Date(+y, +m - 1, 1).toLocaleString('en-US', { month: 'short' }); }),
          datasets: [{ label: 'Net worth', data: nwSeries, tension: 0.35,
            borderColor: '#0a1f44', backgroundColor: 'rgba(123,183,224,0.22)',
            fill: true, borderWidth: 2, pointRadius: 2, pointBackgroundColor: '#7bb7e0' }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtMoney(ctx.raw) } } },
          scales: { y: { ticks: { callback: v => fmtMoneyShort(v) } } }
        }
      }));
      const lineCard = card('12-month trend', el('div', { class: 'chart-wrap lg' }, lineCanvas));

      // Assets by type vs liabilities by type stacked bar
      const typeGroups = {
        'Cash':        ['checking', 'savings'],
        'Investments': ['investment', 'retirement'],
        'Property':    ['property', 'vehicle'],
        'Credit':      ['credit'],
        'Loans':       ['loan']
      };
      const typeTotals = {};
      Object.entries(typeGroups).forEach(([label, types]) => {
        typeTotals[label] = s.accounts.filter(x => types.includes(x.type)).reduce((sum, x) => sum + x.balance, 0);
      });
      const barCanvas = el('canvas');
      ensureChart(() => new Chart(barCanvas, {
        type: 'bar',
        data: {
          labels: Object.keys(typeTotals),
          datasets: [{
            data: Object.values(typeTotals),
            backgroundColor: Object.values(typeTotals).map(v => v >= 0 ? '#3ca975' : '#d94848'),
            borderRadius: 6
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, indexAxis: 'y',
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtMoney(ctx.raw) } } },
          scales: { x: { ticks: { callback: v => fmtMoneyShort(v) } } }
        }
      }));
      const barCard = card('Assets vs liabilities', el('div', { class: 'chart-wrap' }, barCanvas));

      content.appendChild(el('div', { class: 'grid grid-dash', style: { marginBottom: '16px' } }, lineCard, barCard));

      // Per-account contribution table
      const accounts = s.accounts.slice().sort((x, y) => y.balance - x.balance);
      const total = accounts.reduce((sum, x) => sum + x.balance, 0);
      content.appendChild(card('Per-account contribution',
        el('table', { class: 'table' },
          el('thead', {}, el('tr', {},
            el('th', {}, 'Account'),
            el('th', {}, 'Type'),
            el('th', {}, 'Share'),
            el('th', { style: { textAlign: 'right' } }, 'Balance'))),
          el('tbody', {}, ...accounts.map(acc => {
            const share = total !== 0 ? Math.round((acc.balance / total) * 100) : 0;
            return el('tr', {},
              el('td', {},
                el('div', { class: 'txn-merchant' },
                  el('div', { class: 'txn-icon', style: { background: acc.color || 'var(--navy)', color: '#fff' } },
                    (acc.institution || '?').slice(0, 1)),
                  el('div', {},
                    el('strong', {}, acc.nickname || acc.name),
                    el('small', {}, acc.institution + ' ····' + acc.mask)))),
              el('td', {}, el('span', { class: 'chip navy' }, acc.type)),
              el('td', {}, el('div', { style: { width: '120px' } }, progressBar(Math.abs(share), acc.balance >= 0 ? 'success' : 'danger'))),
              el('td', { class: cls('num', acc.balance >= 0 ? 'pos' : 'neg'),
                style: { textAlign: 'right', fontWeight: 600 } }, fmtMoney(acc.balance)));
          }),
          el('tr', {},
            el('td', { colspan: '3', style: { fontWeight: 700 } }, 'Net worth'),
            el('td', { class: 'num', style: { textAlign: 'right', fontWeight: 700 } }, fmtMoney(nw))))
        )
      ));
    },
    investments: function (content) {
      const s = getState();
      const holdings = s.investments || [];
      const valueOf = (h) => h.shares * h.price;
      const totalValue = holdings.reduce((x, h) => x + valueOf(h), 0);
      const dayChangePct = holdings.length
        ? holdings.reduce((x, h) => x + (h.change || 0) * valueOf(h), 0) / Math.max(1, totalValue)
        : 0;
      const dayChange = totalValue * (dayChangePct / 100);

      const bucketOf = (sym) => sym === 'BND' ? 'Bonds' : sym === 'BTC' ? 'Crypto' : 'Stocks';
      const allocation = { Stocks: 0, Bonds: 0, Crypto: 0 };
      holdings.forEach(h => { allocation[bucketOf(h.symbol)] += valueOf(h); });

      content.appendChild(viewHeader('Investments', 'Your Luminate Invest brokerage and linked retirement accounts.'));

      // KPI strip
      content.appendChild(el('div', { class: 'grid grid-4', style: { marginBottom: '16px' } },
        kpi('Portfolio value', fmtMoney(totalValue, { cents: false }),
          { text: (dayChange >= 0 ? '▲ +' : '▼ ') + fmtMoney(Math.abs(dayChange), { cents: false }) + '  (' + dayChangePct.toFixed(2) + '%) today',
            positive: dayChange >= 0, negative: dayChange < 0 }, 'navy'),
        kpi('Stocks',  fmtMoneyShort(allocation.Stocks), null, 'success'),
        kpi('Bonds',   fmtMoneyShort(allocation.Bonds),  null),
        kpi('Crypto',  fmtMoneyShort(allocation.Crypto), null, 'warn')
      ));

      // Allocation donut + 30-day performance sparkline
      const donut = el('canvas');
      ensureChart(() => new Chart(donut, {
        type: 'doughnut',
        data: {
          labels: ['Stocks', 'Bonds', 'Crypto'],
          datasets: [{
            data: [allocation.Stocks, allocation.Bonds, allocation.Crypto],
            backgroundColor: ['#0a1f44', '#7bb7e0', '#e8a63a'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '66%',
          plugins: {
            legend: { position: 'bottom' },
            tooltip: { callbacks: { label: ctx => ctx.label + ': ' + fmtMoney(ctx.raw, { cents: false }) } }
          }
        }
      }));
      const donutCard = card('Asset allocation', el('div', { class: 'chart-wrap' }, donut));

      // 30-day perf (random walk seeded from total + net gain trend)
      const perfLabels = [];
      const perfData = [];
      const today = new Date();
      let val = totalValue * 0.965;
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
        perfLabels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        const drift = (totalValue - val) / (i + 1);
        val += drift + (Math.sin(i * 2.1) + Math.cos(i * 0.9)) * (totalValue * 0.0025);
        perfData.push(val);
      }
      perfData[perfData.length - 1] = totalValue;
      const perfCanvas = el('canvas');
      ensureChart(() => new Chart(perfCanvas, {
        type: 'line',
        data: {
          labels: perfLabels,
          datasets: [{
            label: 'Portfolio value', data: perfData, tension: 0.35,
            borderColor: '#15a56a', backgroundColor: 'rgba(21,165,106,0.18)',
            fill: true, borderWidth: 2, pointRadius: 0
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtMoney(ctx.raw, { cents: false }) } } },
          scales: { y: { ticks: { callback: v => fmtMoneyShort(v) } } }
        }
      }));
      const perfCard = card('30-day performance', el('div', { class: 'chart-wrap' }, perfCanvas));

      content.appendChild(el('div', { class: 'grid grid-2', style: { marginBottom: '16px' } }, donutCard, perfCard));

      // Holdings table
      content.appendChild(card('Holdings',
        el('table', { class: 'table' },
          el('thead', {}, el('tr', {},
            el('th', {}, 'Symbol'),
            el('th', {}, 'Name'),
            el('th', { style: { textAlign: 'right' } }, 'Shares'),
            el('th', { style: { textAlign: 'right' } }, 'Price'),
            el('th', { style: { textAlign: 'right' } }, 'Day'),
            el('th', { style: { textAlign: 'right' } }, 'Value'))),
          el('tbody', {}, ...holdings.slice().sort((x, y) => valueOf(y) - valueOf(x)).map(h => {
            const v = valueOf(h);
            const up = (h.change || 0) >= 0;
            return el('tr', {},
              el('td', {}, el('div', { class: 'txn-merchant' },
                el('div', { class: 'txn-icon' }, h.symbol.slice(0, 2)),
                el('div', {}, el('strong', {}, h.symbol), el('small', {}, bucketOf(h.symbol))))),
              el('td', {}, h.name),
              el('td', { class: 'num', style: { textAlign: 'right' } }, h.shares.toLocaleString('en-US', { maximumFractionDigits: 4 })),
              el('td', { class: 'num', style: { textAlign: 'right' } }, fmtMoney(h.price)),
              el('td', { class: cls('num', up ? 'pos' : 'neg'), style: { textAlign: 'right' } },
                (up ? '▲ +' : '▼ ') + Math.abs(h.change || 0).toFixed(2) + '%'),
              el('td', { class: 'num', style: { textAlign: 'right', fontWeight: 600 } }, fmtMoney(v, { cents: false })));
          })))
      ));
    },
    credit: function (content) {
      const s = getState();
      const score = s.user.creditScore || 700;
      const history = s.user.creditHistory || [];
      const prev = history.length > 1 ? history[history.length - 2].score : score;
      const delta = score - prev;
      const band = score >= 800 ? { label: 'Exceptional', color: 'var(--success)' }
                 : score >= 740 ? { label: 'Very good',  color: 'var(--success)' }
                 : score >= 670 ? { label: 'Good',        color: 'var(--lumi-600)' }
                 : score >= 580 ? { label: 'Fair',        color: 'var(--warning)' }
                 :                { label: 'Needs work',  color: 'var(--danger)' };
      const cc = getAccount('acc_lcc');
      const balance = cc ? Math.abs(cc.balance) : 0;
      const limit = cc && cc.limit ? cc.limit : 1;
      const util = Math.round((balance / limit) * 100);
      const utilVariant = util < 10 ? 'success' : util < 30 ? '' : util < 50 ? 'warn' : 'danger';

      content.appendChild(viewHeader('Credit', 'Monitor your score, utilization, and on-time history.'));

      // Hero
      const hero = el('div', { class: 'card credit-hero', style: { marginBottom: '16px' } },
        el('div', {},
          el('div', { class: 'credit-score', style: { color: band.color } }, String(score)),
          el('div', { class: 'muted', style: { marginTop: '4px', fontWeight: '600' } }, band.label),
          el('div', { class: 'subtle' }, 'FICO® Score 8 · updated ' + fmtDateShort(new Date().toISOString().slice(0,10)))
        ),
        el('div', { class: 'credit-meta' },
          el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' } },
            el('span', { class: cls('chip', delta >= 0 ? 'success' : 'danger') },
              (delta >= 0 ? '▲ +' : '▼ ') + Math.abs(delta) + ' vs last month'),
            el('span', { class: 'chip navy' }, 'Utilization ' + util + '%')),
          el('p', { class: 'muted' }, delta >= 0
            ? 'Nice — your score climbed this month. Keep utilization under 10% to push into the 800+ club.'
            : 'A small dip this month. Often caused by utilization spikes or a new inquiry.'))
      );
      content.appendChild(hero);

      // History chart + utilization card
      const historyCanvas = el('canvas');
      const historyCard = card('12-month history', el('div', { class: 'chart-wrap' }, historyCanvas));
      ensureChart(() => new Chart(historyCanvas, {
        type: 'line',
        data: {
          labels: history.map(p => fmtDateShort(p.date)),
          datasets: [{
            label: 'FICO Score',
            data: history.map(p => p.score),
            tension: 0.35, borderColor: '#0a1f44', backgroundColor: 'rgba(123,183,224,0.25)',
            pointBackgroundColor: '#7bb7e0', fill: true, borderWidth: 2, pointRadius: 3
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { suggestedMin: 600, suggestedMax: 850 } }
        }
      }));

      const utilCard = card('Credit utilization', [
        el('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '8px' } },
          el('strong', {}, fmtMoney(balance) + ' / ' + fmtMoney(limit)),
          el('span', { class: cls('chip', utilVariant === 'success' ? 'success' : utilVariant === 'warn' ? 'warn' : utilVariant === 'danger' ? 'danger' : 'navy') }, util + '%')),
        progressBar(util, utilVariant),
        el('p', { class: 'muted', style: { marginTop: '12px' } },
          util < 10 ? 'Excellent — utilization under 10% is the sweet spot for score optimization.'
          : util < 30 ? 'Healthy. Keep below 10% for the biggest score lift.'
          : util < 50 ? 'Elevated. A mid-cycle payment could move this below 30%.'
          :             'High utilization is dragging your score. A payment of '
                        + fmtMoney(Math.max(0, balance - limit * 0.09))
                        + ' would drop you to under 10%.')
      ]);

      content.appendChild(el('div', { class: 'grid grid-dash', style: { marginBottom: '16px' } }, historyCard, utilCard));

      // Recommendations
      const recs = [];
      if (util >= 10) recs.push({ emoji: '💳', title: 'Knock down card utilization',
        body: 'Pay ~' + fmtMoney(Math.max(0, balance - limit * 0.09)) + ' to push utilization under 10% — worth 12–22 points by next statement.' });
      if (score < 800) recs.push({ emoji: '📈', title: 'Chase the 800 club',
        body: 'Average age of accounts and on-time payment history are your biggest levers now. Avoid new inquiries for 90 days.' });
      recs.push({ emoji: '📅', title: 'Set up autopay on every card',
        body: 'Autopay-for-minimum is the cheapest insurance against a single missed payment tanking your score ~80 points.' });
      recs.push({ emoji: '🪪', title: 'Pull your free annual report',
        body: 'Check annualcreditreport.com once a year to catch errors that hurt your score — Luminate flags anything suspicious for you.' });

      content.appendChild(card('Recommendations',
        el('div', { class: 'grid grid-2' },
          ...recs.map(r => el('div', { class: 'insight' },
            el('div', { class: 'insight-icon', style: { fontSize: '20px' } }, r.emoji),
            el('div', { class: 'insight-body' }, el('strong', {}, r.title), el('p', {}, r.body))
          )))
      ));
    },
    insights: function (content) {
      const u = getState().user;
      content.appendChild(viewHeader('AI Insights', 'Chat with Lumi, your Luminate financial coach.'));

      // Shared bubble styles
      const bubbleStyle = (who) => ({
        maxWidth: '75%', padding: '12px 14px', borderRadius: '14px', marginBottom: '10px',
        lineHeight: '1.45',
        background: who === 'user' ? 'var(--navy)' : 'var(--surface-2)',
        color: who === 'user' ? '#fff' : 'var(--text)',
        alignSelf: who === 'user' ? 'flex-end' : 'flex-start'
      });

      // Left: chat column
      const stream = el('div', { style: {
        display: 'flex', flexDirection: 'column',
        height: '460px', overflowY: 'auto',
        padding: '14px', background: 'var(--bg)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius)'
      }});
      const addBubble = (who, text) => {
        const b = el('div', { style: bubbleStyle(who) }, text);
        stream.appendChild(b);
        stream.scrollTop = stream.scrollHeight;
      };

      // Seed intro
      COACH_INTRO.forEach(line => addBubble('lumi', line.replace('{name}', u.firstName || 'there')));

      // Input row
      const input = el('input', { type: 'text', placeholder: 'Ask Lumi anything about your money…',
        style: { flex: '1', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface)' } });
      const sendMessage = () => {
        const q = input.value.trim();
        if (!q) return;
        addBubble('user', q);
        input.value = '';
        setTimeout(() => {
          coachReply(q).forEach(line => addBubble('lumi', line));
        }, 220);
      };
      input.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });
      const sendBtn = el('button', { class: 'btn primary', onclick: sendMessage }, 'Send');

      const chatCol = el('div', { class: 'card' },
        stream,
        el('div', { style: { display: 'flex', gap: '8px', marginTop: '12px' } }, input, sendBtn)
      );

      // Right: suggestion chips
      const suggest = (label) => el('button', {
        class: 'chip navy',
        style: { cursor: 'pointer', padding: '8px 14px', fontSize: '13px' },
        onclick: () => { input.value = label; sendMessage(); }
      }, label);
      const sideCol = card('Try asking Lumi',
        el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' } },
          suggest("How's my savings rate?"),
          suggest("Help me pay off credit card debt"),
          suggest("Review my budget"),
          suggest("Flag my subscriptions"),
          suggest("Am I on track for the Italy trip?"),
          suggest("How do I get to 800 credit?"),
          suggest("Can I buy a house?"),
          suggest("Will I be able to retire?"))
      );

      content.appendChild(el('div', { class: 'grid grid-dash' }, chatCol, sideCol));
    },
    rewards: function (content) {
      const s = getState();
      const pts = rewardsPoints();
      const tier = loyaltyTier();
      const tierLadder = [
        { name: 'Horizon',  min: 0,      mult: 1.0 },
        { name: 'Azure',    min: 20000,  mult: 1.5 },
        { name: 'Sapphire', min: 75000,  mult: 2.0 },
        { name: 'Obsidian', min: 200000, mult: 3.0 }
      ];
      const lumBalance = s.accounts.filter(a => a.isLuminate).reduce((x, a) => x + Math.abs(a.balance), 0);
      const nextTier = tierLadder.find(t => t.min > lumBalance) || tierLadder[tierLadder.length - 1];
      const prevTier = [...tierLadder].reverse().find(t => t.min <= lumBalance) || tierLadder[0];
      const tierPct = nextTier === prevTier ? 100
                    : Math.round(((lumBalance - prevTier.min) / (nextTier.min - prevTier.min)) * 100);

      content.appendChild(viewHeader('Luminate Rewards', 'Earn on every swipe, redeem on what matters.',
        [el('button', { class: 'btn lumi', onclick: () => toast('✨ +250 bonus points added (demo)') }, '🎁 Claim daily bonus')]));

      // Hero: points + tier progress
      const hero = el('div', {
        class: 'card',
        style: {
          background: 'linear-gradient(135deg, #0a1f44 0%, #1a3a73 55%, #5fa3d3 100%)',
          color: '#fff', border: 'none', marginBottom: '16px'
        }
      },
        el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' } },
          el('div', {},
            el('div', { style: { fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.7)' } }, 'Available balance'),
            el('div', { style: { fontSize: '52px', fontWeight: '800', letterSpacing: '-0.03em', lineHeight: '1' } }, pts.toLocaleString()),
            el('div', { style: { color: 'rgba(255,255,255,0.8)', marginTop: '4px' } }, 'Luminate Points  ·  worth ≈ ' + fmtMoney(pts * 0.012))
          ),
          el('div', { style: { textAlign: 'right' } },
            el('div', { style: { fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.7)' } }, 'Current tier'),
            el('div', { style: { fontSize: '26px', fontWeight: '700', marginTop: '4px' } }, '💎 ' + tier.tier),
            el('div', { style: { color: 'rgba(255,255,255,0.8)', marginTop: '2px' } }, prevTier.mult + 'x on every dollar')
          )
        ),
        el('div', { style: { marginTop: '22px' } },
          el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'rgba(255,255,255,0.8)', marginBottom: '6px' } },
            el('span', {}, prevTier.name),
            el('span', {}, nextTier === prevTier ? 'Max tier reached 🏆' : tierPct + '% to ' + nextTier.name)),
          el('div', { class: 'bar', style: { background: 'rgba(255,255,255,0.18)' } },
            el('span', { style: { width: tierPct + '%', background: 'linear-gradient(90deg, #a9d0ea, #fff)' } }))
        )
      );
      content.appendChild(hero);

      // Redemption tiles (creative mix)
      const tile = (emoji, title, subtitle, cost, onclick) => el('div', {
        class: 'card', style: { cursor: 'pointer', transition: 'transform 0.12s' }, onclick
      },
        el('div', { style: { fontSize: '32px', marginBottom: '8px' } }, emoji),
        el('strong', { style: { display: 'block', fontSize: '14px' } }, title),
        el('div', { class: 'subtle', style: { marginBottom: '10px' } }, subtitle),
        el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
          el('span', { class: cls('chip', pts >= cost ? 'navy' : '') }, cost.toLocaleString() + ' pts'),
          pts >= cost ? el('span', { class: 'chip success' }, 'Available') : el('span', { class: 'subtle' }, 'Keep earning'))
      );
      const demoRedeem = (label, cost) => () => {
        if (pts < cost) { toast('Not quite enough points yet.'); return; }
        toast('🎉 Redeemed: ' + label + ' (demo)');
      };
      content.appendChild(el('div', { class: 'grid grid-4', style: { marginBottom: '16px' } },
        tile('💸', 'Statement credit',      '$25 off your Sapphire card',     2500,  demoRedeem('$25 statement credit', 2500)),
        tile('✈️', 'Travel portal',         '1.25¢/pt via Luminate Travel',   5000,  demoRedeem('Luminate Travel credit', 5000)),
        tile('☕', 'Starbucks gift card',   '$10 delivered instantly',        1800,  demoRedeem('$10 Starbucks card', 1800)),
        tile('🎁', 'Amazon gift card',      '$50 delivered instantly',        7500,  demoRedeem('$50 Amazon card', 7500)),
        tile('🪙', 'Invest to grow',        'Auto-buy VTI with your points',  3000,  demoRedeem('Points-to-VTI conversion', 3000)),
        tile('💝', 'Donate to charity',     'Luminate matches 10%',           1000,  demoRedeem('Charitable donation', 1000)),
        tile('₿',  'Crypto reward',         '0.0001 BTC delivered to custody',12000, demoRedeem('Bitcoin reward', 12000)),
        tile('🎰', 'Mystery box',           'Random gift 1k–10k value',       4000,  demoRedeem('Mystery box', 4000))
      ));

      // Featured + partners
      const featured = el('div', {
        class: 'card',
        style: { background: 'linear-gradient(120deg, rgba(123,183,224,0.22), rgba(10,31,68,0.04))' }
      },
        el('div', { style: { display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' } },
          el('div', { style: { fontSize: '42px' } }, '🏝️'),
          el('div', { style: { flex: '1', minWidth: '200px' } },
            el('strong', { style: { fontSize: '16px', display: 'block' } }, 'Double points weekend: all travel bookings'),
            el('span', { class: 'muted' }, 'Through Sunday, earn 6x on airfare and 4x on hotels booked through Luminate Travel.')),
          el('button', { class: 'btn primary', onclick: () => toast('Offer activated ✓') }, 'Activate offer'))
      );
      const partners = card('Partner perks',
        el('div', { class: 'grid grid-2' },
          el('div', { class: 'insight' }, el('div', { class: 'insight-icon' }, '🚗'),
            el('div', { class: 'insight-body' }, el('strong', {}, 'Hertz Gold Plus'), el('p', {}, '10% off + free upgrade with any rental paid by Sapphire.'))),
          el('div', { class: 'insight' }, el('div', { class: 'insight-icon' }, '🍷'),
            el('div', { class: 'insight-body' }, el('strong', {}, 'OpenTable dining'), el('p', {}, 'Earn 5x points at 30,000+ restaurants when you book through Luminate.'))),
          el('div', { class: 'insight' }, el('div', { class: 'insight-icon' }, '🏋️'),
            el('div', { class: 'insight-body' }, el('strong', {}, 'Equinox membership'), el('p', {}, '$40/mo credit toward Equinox, billed monthly to your card.'))),
          el('div', { class: 'insight' }, el('div', { class: 'insight-icon' }, '🛒'),
            el('div', { class: 'insight-body' }, el('strong', {}, 'Whole Foods'), el('p', {}, '5% back + free delivery with Luminate Prime checkout.')))));
      content.appendChild(el('div', { class: 'grid grid-2', style: { marginBottom: '16px' } }, featured, partners));

      // Earn-more tips + recent redemptions
      const tips = card('Ways to earn more',
        el('ul', { style: { paddingLeft: '20px', margin: 0, color: 'var(--text-muted)' } },
          el('li', {}, 'Set up direct deposit to Luminate Checking — +500 points/month.'),
          el('li', {}, 'Add a Luminate Invest account and earn 2x on all trades.'),
          el('li', {}, 'Refer a friend who opens a checking account — 7,500 bonus points each.'),
          el('li', {}, 'Pay rent with Luminate Rent Reward — earn 1x on housing, no fees.')));
      const recent = (s.rewardsRedemptions && s.rewardsRedemptions.length)
        ? el('ul', { style: { paddingLeft: '0', listStyle: 'none', margin: 0 } },
            ...s.rewardsRedemptions.slice(0, 5).map(r => el('li', { class: 'nw-row' },
              el('span', {}, r.item || r.label || 'Redemption'),
              el('span', { class: 'num' }, '−' + (r.points || 0).toLocaleString() + ' pts'))))
        : el('div', { style: { textAlign: 'center', padding: '18px', color: 'var(--text-subtle)' } },
            el('div', { style: { fontSize: '32px', marginBottom: '8px' } }, '🎁'),
            el('div', {}, 'Your first redemption will appear here.'));
      content.appendChild(el('div', { class: 'grid grid-2' }, tips, card('Recent redemptions', recent)));
    },
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
