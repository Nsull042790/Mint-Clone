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
          computeChurnRisk, loyaltyTier, rewardsPoints, clarityScore, moneyWeather,
          GOAL_TEMPLATES, recommendMonthly, projectGoal,
          getCategory, getAccount,
          getState, setState, save, render, navigate, toast, openModal, closeModal,
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

  // Merchant logo via Simple Icons CDN. Falls back to null when the merchant
  // isn't a known brand, letting callers render a letter badge instead.
  const MERCHANT_ICON_SLUGS = {
    'Whole Foods Market': 'wholefoodsmarket', 'Safeway': 'safeway', 'Costco': 'costco',
    'Chipotle': 'chipotle', 'Starbucks': 'starbucks', 'DoorDash': 'doordash',
    'Shell': 'shell', 'Chevron': 'chevron', 'Uber': 'uber', 'Lyft': 'lyft',
    'Netflix': 'netflix', 'Spotify': 'spotify', 'Disney+': 'disneyplus',
    'iCloud': 'icloud', 'NYT Digital': 'newyorktimes', 'ChatGPT Plus': 'openai',
    'Comcast Xfinity': 'xfinity', 'Verizon Wireless': 'verizon',
    'Amazon': 'amazon', 'Target': 'target', 'Apple': 'apple', 'Nike': 'nike',
    'Walgreens': 'walgreens', 'AMC Theaters': 'amctheatres', 'Steam': 'steam',
    'Delta Airlines': 'delta', 'Airbnb': 'airbnb', 'Marriott': 'marriott',
    'Coursera': 'coursera', 'PetSmart': 'petsmart', 'Chewy': 'chewy',
    'Etsy': 'etsy'
  };
  function merchantIconUrl(merchant) {
    const slug = MERCHANT_ICON_SLUGS[merchant];
    return slug ? 'https://cdn.simpleicons.org/' + slug + '/ffffff' : null;
  }
  function renderMerchantIcon(merchant, categoryColor) {
    const url = merchantIconUrl(merchant);
    if (url) {
      return el('div', { class: 'txn-icon', style: { background: categoryColor, padding: '7px' } },
        el('img', { src: url, alt: merchant, width: '22', height: '22',
          style: { display: 'block', width: '22px', height: '22px' },
          onerror: 'this.style.display="none";this.parentElement.textContent=this.alt.charAt(0).toUpperCase();this.parentElement.style.color="#fff";this.parentElement.style.padding="0";' }));
    }
    return el('div', { class: 'txn-icon', style: { background: categoryColor, color: '#fff' } },
      (merchant || '?').charAt(0).toUpperCase());
  }

  // Confetti blast for milestone moments. No-op if canvas-confetti
  // hasn't finished loading yet.
  function fireConfetti() {
    if (!window.confetti) return;
    window.confetti({
      particleCount: 140,
      spread: 75,
      startVelocity: 42,
      origin: { y: 0.6 },
      colors: ['#0c173d', '#1d3170', '#7bb7e0', '#15a56a', '#e8a63a', '#ffffff']
    });
  }

  // Animated KPI count-ups. Called once per render from app.js.
  function _animateKpis() {
    document.querySelectorAll('.kpi-value').forEach(node => {
      if (node.hasAttribute('data-animated')) return;
      node.setAttribute('data-animated', '1');
      const final = node.textContent;
      const m = final.match(/^(-?)(\$)?(\d[\d,]*)(\.\d+)?(.*)$/);
      if (!m) return;
      const sign = m[1] || '', prefix = m[2] || '', intStr = m[3], suffix = (m[4] || '') + (m[5] || '');
      const target = parseInt(intStr.replace(/,/g, ''), 10);
      if (!Number.isFinite(target) || target < 50) return;
      const start = performance.now();
      const duration = 700;
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        const cur = Math.round(target * eased);
        node.textContent = sign + prefix + cur.toLocaleString() + suffix;
        if (t < 1) requestAnimationFrame(tick);
        else node.textContent = final;
      };
      requestAnimationFrame(tick);
    });
  }

  // Clarity Pulse — weekly digest of what changed. Used on the dashboard.
  function generateClarityPulse() {
    const s = getState();
    const mk = currentMonth();
    const currentSurplus = monthlyIncome(mk) - monthlyExpense(mk);
    const avgSurplus = averageMonthlyIncome(3) - averageMonthlyExpense(3);
    const thisMonth = monthlySpendByCategory(mk);
    const priorKeys = lastNMonthKeys(4).slice(0, 3);
    const priorAvg = {};
    priorKeys.forEach(k => {
      const m = monthlySpendByCategory(k);
      Object.keys(m).forEach(cat => { priorAvg[cat] = (priorAvg[cat] || 0) + m[cat] / priorKeys.length; });
    });
    let bestDrop = null, worstSpike = null;
    Object.keys(priorAvg).forEach(cat => {
      const diff = priorAvg[cat] - (thisMonth[cat] || 0);
      if (priorAvg[cat] < 40) return;
      if (diff > 30 && (!bestDrop || diff > bestDrop.diff)) bestDrop = { cat, diff };
      if (-diff > 30 && (!worstSpike || -diff > worstSpike.diff)) worstSpike = { cat, diff: -diff };
    });
    const bullets = [];
    if (bestDrop)  bullets.push(getCategory(bestDrop.cat).name  + ' is down '  + fmtMoney(Math.round(bestDrop.diff))  + ' vs your 3-month average — nice.');
    if (worstSpike) bullets.push(getCategory(worstSpike.cat).name + ' is up '   + fmtMoney(Math.round(worstSpike.diff)) + ' — worth a look.');
    const goals = s.goals || [];
    const onTrack = goals.filter(g => {
      const proj = projectGoal(g);
      if (!proj || !g.deadline) return false;
      return new Date(proj.completion) <= new Date(g.deadline);
    }).length;
    if (goals.length) bullets.push(onTrack + ' of ' + goals.length + ' goals on track or ahead of schedule.');
    if (currentSurplus > avgSurplus && avgSurplus > 0) {
      bullets.push('This month\'s surplus is ' + fmtMoney(currentSurplus - avgSurplus) + ' above your 3-month average.');
    }
    const headline = currentSurplus > avgSurplus
      ? 'You\'re ahead of your usual pace this week.'
      : currentSurplus > 0
        ? 'Steady week — nothing alarming, surplus intact.'
        : 'A tight week. Worth a quick check of the heavy categories.';
    return { headline, bullets: bullets.slice(0, 3) };
  }

  // Monthly Recap — 6-stat modal + share-graphic download
  function showMonthlyRecap() {
    const s = getState();
    const mk = currentMonth();
    const [yy, mm] = mk.split('-');
    const monthName = new Date(+yy, +mm - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const income = monthlyIncome(mk);
    const spent = monthlyExpense(mk);
    const net = income - spent;
    const rate = income > 0 ? (net / income * 100).toFixed(1) + '%' : '0%';
    const spend = monthlySpendByCategory(mk);
    const topEntry = Object.entries(spend).sort((a, b) => b[1] - a[1])[0];
    const topCat = topEntry ? getCategory(topEntry[0]).name : '—';
    const txns = s.transactions.filter(t => monthKey(t.date) === mk);
    const merchants = new Set(txns.map(t => t.merchant)).size;

    const stats = [
      { label: 'Income',         value: fmtMoney(income, { cents: false }), accent: 'success' },
      { label: 'Spent',          value: fmtMoney(spent,  { cents: false }), accent: 'warn' },
      { label: 'Net this month', value: (net >= 0 ? '+' : '') + fmtMoney(net, { cents: false }), accent: net >= 0 ? 'success' : 'navy' },
      { label: 'Savings rate',   value: rate, accent: 'navy' },
      { label: 'Top category',   value: topCat + ' · ' + (topEntry ? fmtMoney(topEntry[1], { cents: false }) : ''), accent: '' },
      { label: 'Activity',       value: txns.length + ' txns · ' + merchants + ' merchants', accent: '' }
    ];

    const shareStat = (stat) => {
      const cnv = document.createElement('canvas');
      cnv.width = 1080; cnv.height = 1920;
      const ctx = cnv.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, 0, 1920);
      grad.addColorStop(0, '#0c173d'); grad.addColorStop(1, '#1d3170');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, 1080, 1920);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#7bb7e0';
      ctx.font = 'bold 48px "Poppins", "Josefin Sans", sans-serif';
      ctx.fillText('LUMINATE HORIZON', 540, 220);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '34px "Josefin Sans", sans-serif';
      ctx.fillText(monthName.toUpperCase(), 540, 290);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '38px "Josefin Sans", sans-serif';
      ctx.fillText(stat.label.toUpperCase(), 540, 880);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 170px "Poppins", "Josefin Sans", sans-serif';
      ctx.fillText(stat.value, 540, 1080);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = 'italic 30px "Josefin Sans", sans-serif';
      ctx.fillText('A financial partner for the rest of your life.', 540, 1800);
      const link = document.createElement('a');
      link.download = 'luminate-horizon-' + mk + '-' + stat.label.toLowerCase().replace(/\s+/g, '-') + '.png';
      link.href = cnv.toDataURL('image/png');
      link.click();
      toast('Share graphic downloaded');
    };

    openModal(el('div', { style: { maxWidth: '560px' } },
      el('h2', {}, 'Your ' + monthName),
      el('p', { class: 'muted', style: { marginBottom: '16px' } },
        'Six stats that defined your month. Tap any tile to download a share graphic.'),
      el('div', { class: 'grid grid-2', style: { gap: '10px' } },
        ...stats.map(st => el('div', {
          class: cls('kpi', st.accent),
          style: { cursor: 'pointer' },
          onclick: () => shareStat(st)
        },
          el('div', { class: 'kpi-label' }, st.label),
          el('div', { class: 'kpi-value', style: { fontSize: '20px' } }, st.value)))),
      el('div', { class: 'modal-actions' },
        el('button', { class: 'btn', onclick: closeModal }, 'Close'))
    ));
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
    dashboard: function (content) {
      const s = getState();
      const u = s.user;
      const inc = averageMonthlyIncome(3);
      const exp = averageMonthlyExpense(3);
      const surplus = inc - exp;
      const savingsRate = inc > 0 ? (surplus / inc) * 100 : 0;
      const nw = netWorth();
      const sts = safeToSpend();
      const cs = clarityScore();
      const wx = moneyWeather();

      // --- SVG helpers for the hero ---
      const NS = 'http://www.w3.org/2000/svg';
      const svgEl = (name, attrs, ...kids) => {
        const e = document.createElementNS(NS, name);
        for (const k in attrs) e.setAttribute(k, attrs[k]);
        kids.flat().forEach(k => k && e.appendChild(k));
        return e;
      };
      const scoreDial = () => {
        // Gauge arc 300..850, 180° semicircle
        const minS = 300, maxS = 850;
        const pct = Math.max(0, Math.min(1, (cs.score - minS) / (maxS - minS)));
        const w = 260, h = 160, cx = w / 2, cy = 130, r = 100;
        const polar = (t) => [cx + r * Math.cos(Math.PI * (1 - t)), cy - r * Math.sin(Math.PI * (1 - t))];
        const arcPath = (t0, t1) => {
          const [x0, y0] = polar(t0), [x1, y1] = polar(t1);
          const large = (t1 - t0) > 0.5 ? 1 : 0;
          return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
        };
        const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, width: '100%', style: 'max-width:320px;display:block;margin:0 auto' });
        svg.appendChild(svgEl('path', { d: arcPath(0, 1), stroke: 'var(--surface-2)', 'stroke-width': 14, fill: 'none', 'stroke-linecap': 'round' }));
        svg.appendChild(svgEl('path', { d: arcPath(0, Math.max(0.001, pct)), stroke: cs.band.color, 'stroke-width': 14, fill: 'none', 'stroke-linecap': 'round' }));
        // Center value
        const val = svgEl('text', { x: cx, y: cy - 14, 'text-anchor': 'middle', 'font-size': 44, 'font-weight': 700, fill: 'var(--text)', 'font-family': 'Poppins, sans-serif' });
        val.textContent = String(cs.score);
        const lbl = svgEl('text', { x: cx, y: cy + 10, 'text-anchor': 'middle', 'font-size': 13, fill: cs.band.color, 'font-weight': 600, 'font-family': 'Poppins, sans-serif' });
        lbl.textContent = cs.band.label;
        svg.appendChild(val); svg.appendChild(lbl);
        return svg;
      };
      const weatherMark = () => {
        const accent = wx.state === 'clear' ? '#15a56a' : wx.state === 'mixed' ? '#e8a63a'
                    : wx.state === 'storm' ? '#d94848' : '#7bb7e0';
        const svg = svgEl('svg', { viewBox: '0 0 64 64', width: 80, height: 80, style: 'display:block' });
        const glow = svgEl('circle', { cx: 32, cy: 32, r: 28, fill: accent, opacity: 0.15 });
        svg.appendChild(glow);
        if (wx.state === 'clear') {
          svg.appendChild(svgEl('circle', { cx: 32, cy: 32, r: 10, fill: 'none', stroke: 'var(--navy)', 'stroke-width': 2.5 }));
          [0,1,2,3,4,5,6,7].forEach(i => {
            const a = (Math.PI * 2 * i) / 8;
            const x1 = 32 + Math.cos(a) * 16, y1 = 32 + Math.sin(a) * 16;
            const x2 = 32 + Math.cos(a) * 22, y2 = 32 + Math.sin(a) * 22;
            svg.appendChild(svgEl('line', { x1, y1, x2, y2, stroke: accent, 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
          });
        } else if (wx.state === 'mixed') {
          svg.appendChild(svgEl('path', { d: 'M 18 38 Q 12 38 12 32 Q 12 26 18 26 Q 20 18 28 18 Q 36 18 38 26 Q 46 26 46 32 Q 46 38 40 38 Z', fill: 'none', stroke: 'var(--navy)', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
        } else if (wx.state === 'storm') {
          svg.appendChild(svgEl('path', { d: 'M 18 32 Q 12 32 12 26 Q 12 20 18 20 Q 20 12 28 12 Q 36 12 38 20 Q 46 20 46 26 Q 46 32 40 32 Z', fill: 'none', stroke: 'var(--navy)', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
          [22, 30, 38].forEach((x, i) => svg.appendChild(svgEl('line', { x1: x, y1: 38 + i % 2 * 2, x2: x - 4, y2: 52 + i % 2 * 2, stroke: accent, 'stroke-width': 2.5, 'stroke-linecap': 'round' })));
        } else {
          // Milestone: 4-point spark
          svg.appendChild(svgEl('path', { d: 'M 32 12 L 36 28 L 52 32 L 36 36 L 32 52 L 28 36 L 12 32 L 28 28 Z', fill: accent, stroke: 'var(--navy)', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }));
        }
        return svg;
      };

      const openWeatherModal = () => {
        openModal(el('div', {},
          el('h2', {}, 'Money Weather · ' + wx.label),
          el('p', { class: 'muted', style: { marginBottom: '14px' } }, wx.reason),
          el('ul', { style: { paddingLeft: '20px', marginBottom: '14px', color: 'var(--text-muted)' } },
            ...wx.actions.map(a => el('li', {}, a))),
          el('div', { class: 'modal-actions' },
            el('button', { class: 'btn', onclick: closeModal }, 'Close'),
            el('button', { class: 'btn primary', onclick: () => { closeModal(); navigate('insights'); } }, 'Ask Lumi'))
        ));
      };
      const openScoreModal = () => {
        const row = (label, data) => el('div', { class: 'nw-row' },
          el('span', {}, label),
          el('span', { class: 'num' }, data.value + (data.max === 100 ? '%' : '') +
            (label.includes('Emergency') ? ' mo' : label.includes('Savings') || label.includes('Utilization') || label.includes('Debt') ? '%' : '')));
        const c = cs.components;
        openModal(el('div', {},
          el('h2', {}, 'Clarity Score · ' + cs.score),
          el('p', { class: 'muted', style: { marginBottom: '14px' } },
            'A 0–850 composite of the five pillars of your financial health. Updated as your data moves.'),
          row('Savings rate',        c.savings),
          row('Emergency fund',      c.emergency),
          row('Debt-to-income',      c.dti),
          row('Credit utilization',  c.utilization),
          row('Goals on track',      c.goals),
          el('div', { class: 'modal-actions', style: { marginTop: '16px' } },
            el('button', { class: 'btn primary', onclick: closeModal }, 'Got it'))
        ));
      };

      // Net-worth 12-mo approximation (same method as networth view)
      const months = lastNMonthKeys(12);
      const nwSeries = [];
      let v = nw;
      for (let i = months.length - 1; i >= 0; i--) {
        nwSeries[i] = v;
        v = v - (surplus * 0.9 + (Math.sin(i * 1.7) * Math.max(200, Math.abs(surplus) * 0.15)));
      }

      // Header
      const greet = (h => h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening')(new Date().getHours());
      content.appendChild(viewHeader(greet + ', ' + (u.firstName || 'friend'),
        'Here\'s your financial picture across every account, today ' + fmtDateShort(new Date().toISOString().slice(0, 10)) + '.',
        [el('button', { class: 'btn', onclick: showMonthlyRecap }, 'Monthly recap →')]));

      // Clarity Pulse — weekly digest right under the header
      const pulse = generateClarityPulse();
      content.appendChild(el('div', {
        class: 'card',
        style: {
          marginBottom: '20px',
          background: 'linear-gradient(120deg, rgba(123,183,224,0.14), rgba(12,23,61,0.04))'
        }
      },
        el('div', { class: 'card-head' },
          el('strong', {}, 'Clarity Pulse · week of ' + fmtDateShort(new Date().toISOString().slice(0, 10))),
          el('div', {},
            el('button', { class: 'btn ghost', onclick: showMonthlyRecap }, 'Monthly recap →'))),
        el('p', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '10px' } }, pulse.headline),
        pulse.bullets.length
          ? el('ul', { style: { paddingLeft: '20px', margin: 0, color: 'var(--text-muted)' } },
              ...pulse.bullets.map(b => el('li', { style: { marginBottom: '4px' } }, b)))
          : el('p', { class: 'muted' }, 'Nothing notable this week — you\'re on cruise control.')));

      // --- Hero: Clarity Score + Money Weather ---
      const scoreCard = el('div', { class: 'card', style: { cursor: 'pointer' }, onclick: openScoreModal },
        el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } },
          el('div', {},
            el('div', { class: 'eyebrow', style: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--lumi-600)', fontWeight: 600 } }, 'Clarity Score'),
            el('strong', { style: { fontFamily: 'Poppins, sans-serif', fontSize: '16px' } }, 'Your financial health')),
          el('span', { class: cls('chip', cs.delta >= 0 ? 'success' : 'danger') },
            (cs.delta >= 0 ? '▲ +' : '▼ ') + Math.abs(cs.delta))),
        scoreDial(),
        el('p', { class: 'muted', style: { textAlign: 'center', marginTop: '8px', fontSize: '12px' } },
          'Tap for the five pillars →'));

      const weatherCard = el('div', {
        class: 'card', style: { cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' },
        onclick: openWeatherModal
      },
        el('div', {},
          el('div', { class: 'eyebrow', style: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--lumi-600)', fontWeight: 600 } }, 'Money Weather'),
          el('strong', { style: { fontFamily: 'Poppins, sans-serif', fontSize: '22px', display: 'block', marginTop: '4px' } }, wx.label)),
        el('div', { style: { display: 'flex', gap: '16px', alignItems: 'center', margin: '14px 0' } },
          weatherMark(),
          el('p', { class: 'muted', style: { flex: 1, fontSize: '13px', lineHeight: 1.45 } }, wx.reason)),
        el('div', { class: 'subtle' }, 'Tap for 3 suggested actions →'));

      content.appendChild(el('div', { class: 'grid grid-2', style: { marginBottom: '20px' } }, scoreCard, weatherCard));

      // KPI strip
      content.appendChild(el('div', { class: 'grid grid-4', style: { marginBottom: '20px' } },
        kpi('Net worth', fmtMoneyShort(nw),
          { text: (surplus >= 0 ? '▲ +' : '▼ ') + fmtMoneyShort(Math.abs(surplus)) + ' mo/mo', positive: surplus >= 0, negative: surplus < 0 },
          'navy'),
        kpi('Safe to spend', fmtMoney(sts, { cents: false }),
          { text: 'through end of month' }, 'success'),
        kpi('Monthly surplus', fmtMoney(surplus, { cents: false }),
          { text: surplus >= 0 ? 'Growing your buffer' : 'Expenses outpacing income',
            positive: surplus >= 0, negative: surplus < 0 }),
        kpi('Savings rate', savingsRate.toFixed(1) + '%',
          { text: savingsRate >= 15 ? 'On FI track' : 'Aim for 15%+',
            positive: savingsRate >= 15 }, savingsRate >= 15 ? 'success' : 'warn')
      ));

      // Net-worth line + spending donut row
      const nwCanvas = el('canvas');
      ensureChart(() => new Chart(nwCanvas, {
        type: 'line',
        data: {
          labels: months.map(k => { const [yy, mm] = k.split('-'); return new Date(+yy, +mm - 1, 1).toLocaleString('en-US', { month: 'short' }); }),
          datasets: [{ label: 'Net worth', data: nwSeries, tension: 0.35,
            borderColor: '#0a1f44', backgroundColor: 'rgba(123,183,224,0.22)',
            fill: true, borderWidth: 2, pointRadius: 0 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtMoney(ctx.raw) } } },
          scales: { y: { ticks: { callback: v => fmtMoneyShort(v) } } }
        }
      }));
      const nwCard = card('Net worth · 12 months', el('div', { class: 'chart-wrap' }, nwCanvas),
        [el('button', { class: 'btn ghost', onclick: () => navigate('networth') }, 'Details →')]);

      const spend = monthlySpendByCategory(currentMonth());
      const spendEntries = Object.entries(spend).sort((a, b) => b[1] - a[1]).slice(0, 6);
      const donutCanvas = el('canvas');
      ensureChart(() => new Chart(donutCanvas, {
        type: 'doughnut',
        data: {
          labels: spendEntries.map(([id]) => getCategory(id).name),
          datasets: [{
            data: spendEntries.map(([, v]) => v),
            backgroundColor: spendEntries.map(([id]) => getCategory(id).color),
            borderWidth: 0
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '66%',
          plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => ctx.label + ': ' + fmtMoney(ctx.raw) } } }
        }
      }));
      const donutCard = card('Spending this month', el('div', { class: 'chart-wrap' }, donutCanvas),
        [el('button', { class: 'btn ghost', onclick: () => navigate('budgets') }, 'Budgets →')]);

      content.appendChild(el('div', { class: 'grid grid-dash', style: { marginBottom: '20px' } }, nwCard, donutCard));

      // 90-day cash flow sparkline + bills-this-week
      const flow = cashFlowForecast(90);
      const flowCanvas = el('canvas');
      ensureChart(() => new Chart(flowCanvas, {
        type: 'line',
        data: {
          labels: flow.map(p => fmtDateShort(p.date)),
          datasets: [{
            label: 'Balance', data: flow.map(p => p.balance), tension: 0.3,
            borderColor: '#15a56a', backgroundColor: 'rgba(21,165,106,0.16)',
            fill: true, borderWidth: 2, pointRadius: 0
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtMoney(ctx.raw) } } },
          scales: { x: { ticks: { maxTicksLimit: 6 } }, y: { ticks: { callback: v => fmtMoneyShort(v) } } }
        }
      }));
      const lowestPoint = flow.reduce((m, p) => p.balance < m.balance ? p : m, flow[0]);
      const flowCard = card('Cash flow · 90 days', [
        el('div', { class: 'chart-wrap sm' }, flowCanvas),
        el('p', { class: 'muted', style: { marginTop: '10px', fontSize: '12px' } },
          'Projected low point: ' + fmtMoney(lowestPoint.balance) + ' on ' + fmtDateShort(lowestPoint.date) + '.')
      ]);

      const today = new Date(); today.setHours(0, 0, 0, 0);
      const in7 = new Date(today); in7.setDate(in7.getDate() + 7);
      const weekBills = s.bills
        .filter(b => { const d = new Date(b.due + 'T00:00:00'); return d >= today && d <= in7; })
        .sort((a, b) => a.due.localeCompare(b.due));
      const billsCard = card('Due this week',
        weekBills.length
          ? el('div', {}, ...weekBills.map(b => {
              const d = new Date(b.due + 'T00:00:00');
              return el('div', { class: 'bill' },
                el('div', { class: 'bill-date' },
                  el('span', { class: 'day' }, String(d.getDate())),
                  el('span', { class: 'mo' }, d.toLocaleString('en-US', { month: 'short' }))),
                el('div', {}, el('strong', {}, b.name), el('div', { class: 'subtle' }, fmtRelative(b.due))),
                el('span', { class: cls('chip', b.autopay ? 'success' : 'warn') }, b.autopay ? '⚡ Autopay' : 'Manual'),
                el('span', { class: 'num' }, fmtMoney(b.amount)));
            }))
          : el('p', { class: 'muted' }, 'Nothing due in the next 7 days — enjoy.'),
        [el('button', { class: 'btn ghost', onclick: () => navigate('bills') }, 'All bills →')]);

      content.appendChild(el('div', { class: 'grid grid-dash', style: { marginBottom: '20px' } }, flowCard, billsCard));

      // Goals on track carousel
      if ((s.goals || []).length) {
        content.appendChild(card('Life goals on track',
          el('div', { class: 'grid grid-3' },
            ...s.goals.slice(0, 3).map(g => {
              const pct = g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0;
              const proj = projectGoal(g);
              return el('div', { class: 'goal', onclick: () => navigate('goals'), style: { cursor: 'pointer' } },
                el('div', { class: 'goal-emoji' }, g.emoji),
                el('div', { class: 'goal-name' }, g.name),
                el('div', { class: 'goal-amt' },
                  el('span', {}, fmtMoney(g.saved, { cents: false }) + ' / ' + fmtMoney(g.target, { cents: false })),
                  el('span', { class: 'num' }, Math.round(pct) + '%')),
                progressBar(pct, pct >= 100 ? 'success' : pct >= 50 ? '' : 'warn'),
                el('div', { class: 'subtle' }, proj ? 'ETA · ' + fmtDateShort(proj.completion) : 'Set a monthly amount'));
            })),
          [el('button', { class: 'btn ghost', onclick: () => navigate('goals') }, 'All goals →')]));
      }
    },
    transactions: function (content) {
      const s = getState();
      if (!s._uiTxn) s._uiTxn = { q: '', cat: '', acct: '', from: '', to: '', pending: false, sort: 'date', dir: 'desc', page: 1 };
      const ui = s._uiTxn;
      const PAGE = 50;
      const updateUI = (patch) => { Object.assign(ui, patch); save(); render(); };

      // Filter bar
      const qIn = el('input', { type: 'search', placeholder: 'Search merchants…', value: ui.q,
        style: { minWidth: '220px' } });
      qIn.addEventListener('input', () => updateUI({ q: qIn.value, page: 1 }));

      const catSel = el('select', {},
        el('option', { value: '' }, 'All categories'),
        ...s.categories.map(c => el('option', { value: c.id, selected: ui.cat === c.id ? 'selected' : null },
          c.icon + '  ' + c.name)));
      catSel.addEventListener('change', () => updateUI({ cat: catSel.value, page: 1 }));

      const acctSel = el('select', {},
        el('option', { value: '' }, 'All accounts'),
        ...s.accounts.map(a => el('option', { value: a.id, selected: ui.acct === a.id ? 'selected' : null },
          a.nickname + ' ····' + a.mask)));
      acctSel.addEventListener('change', () => updateUI({ acct: acctSel.value, page: 1 }));

      const fromIn = el('input', { type: 'date', value: ui.from });
      fromIn.addEventListener('change', () => updateUI({ from: fromIn.value, page: 1 }));
      const toIn = el('input', { type: 'date', value: ui.to });
      toIn.addEventListener('change', () => updateUI({ to: toIn.value, page: 1 }));

      const pendBtn = el('button', {
        class: cls('chip', ui.pending ? 'warn' : ''),
        style: { cursor: 'pointer' },
        onclick: () => updateUI({ pending: !ui.pending, page: 1 })
      }, (ui.pending ? '⏱ Pending only' : '⏱ Pending'));

      const clearBtn = el('button', { class: 'btn ghost', onclick: () => {
        s._uiTxn = { q: '', cat: '', acct: '', from: '', to: '', pending: false, sort: 'date', dir: 'desc', page: 1 };
        save(); render();
      }}, 'Reset');

      const openAddTxn = () => {
        const merchant = el('input', { type: 'text', placeholder: 'e.g. Trader Joe\'s' });
        const desc     = el('input', { type: 'text', placeholder: 'Optional note' });
        const amt      = el('input', { type: 'number', step: '0.01', placeholder: '24.95' });
        const typeSel  = el('select', {},
          el('option', { value: 'expense' }, 'Expense'),
          el('option', { value: 'income' },  'Income'));
        const dateIn   = el('input', { type: 'date', value: new Date().toISOString().slice(0, 10) });
        const catSel2  = el('select', {}, ...s.categories.map(c =>
          el('option', { value: c.id }, c.icon + '  ' + c.name)));
        const acctSel2 = el('select', {}, ...s.accounts.map(a =>
          el('option', { value: a.id }, a.nickname + ' ····' + a.mask)));
        const modal = el('div', {},
          el('h2', {}, '+ Add transaction'),
          el('div', { class: 'form-row' }, el('label', {}, 'Merchant'), merchant),
          el('div', { class: 'form-row' }, el('label', {}, 'Description'), desc),
          el('div', { class: 'grid grid-2' },
            el('div', { class: 'form-row' }, el('label', {}, 'Amount'), amt),
            el('div', { class: 'form-row' }, el('label', {}, 'Type'),   typeSel)),
          el('div', { class: 'grid grid-2' },
            el('div', { class: 'form-row' }, el('label', {}, 'Date'),     dateIn),
            el('div', { class: 'form-row' }, el('label', {}, 'Category'), catSel2)),
          el('div', { class: 'form-row' }, el('label', {}, 'Account'), acctSel2),
          el('div', { class: 'modal-actions' },
            el('button', { class: 'btn', onclick: closeModal }, 'Cancel'),
            el('button', { class: 'btn primary', onclick: () => {
              if (!merchant.value.trim() || !amt.value) { toast('Fill in merchant and amount'); return; }
              const raw = Math.abs(parseFloat(amt.value));
              const signed = typeSel.value === 'income' ? raw : -raw;
              setState(st => st.transactions.unshift({
                id: 'tx_' + Math.random().toString(36).slice(2, 8),
                accountId: acctSel2.value,
                date: dateIn.value,
                merchant: merchant.value.trim(),
                description: desc.value.trim(),
                amount: signed,
                category: typeSel.value === 'income' ? 'income' : catSel2.value,
                pending: false
              }));
              closeModal(); toast('Transaction added ✓'); render();
            }}, 'Save'))
        );
        openModal(modal);
      };

      const openEditTxn = (t) => {
        const catSel3 = el('select', {}, ...s.categories.map(c =>
          el('option', { value: c.id, selected: c.id === t.category ? 'selected' : null },
            c.icon + '  ' + c.name)));
        const cat = getCategory(t.category);
        const modal = el('div', {},
          el('h2', {}, 'Edit transaction'),
          el('div', {
            style: { display: 'flex', gap: '12px', alignItems: 'center',
                     padding: '12px', background: 'var(--surface-2)', borderRadius: '10px', marginBottom: '16px' }
          },
            el('div', { class: 'txn-icon', style: { background: cat.color, color: '#fff' } }, cat.icon),
            el('div', { style: { flex: '1' } },
              el('strong', {}, t.merchant),
              el('div', { class: 'subtle' }, fmtDate(t.date) + (t.pending ? ' · Pending' : ''))),
            el('span', { class: cls('num', t.amount >= 0 ? 'pos' : 'neg'), style: { fontWeight: 700 } },
              (t.amount >= 0 ? '+' : '') + fmtMoney(t.amount))),
          el('div', { class: 'form-row' }, el('label', {}, 'Category'), catSel3),
          el('div', { class: 'modal-actions' },
            el('button', { class: 'btn', style: { color: 'var(--danger)', marginRight: 'auto' }, onclick: () => {
              if (!confirm('Delete this transaction?')) return;
              setState(st => { st.transactions = st.transactions.filter(x => x.id !== t.id); });
              closeModal(); toast('Deleted'); render();
            }}, 'Delete'),
            el('button', { class: 'btn', onclick: closeModal }, 'Cancel'),
            el('button', { class: 'btn primary', onclick: () => {
              setState(st => { const m = st.transactions.find(x => x.id === t.id); if (m) m.category = catSel3.value; });
              closeModal(); toast('Category updated ✓'); render();
            }}, 'Save'))
        );
        openModal(modal);
      };

      content.appendChild(viewHeader('Transactions', s.transactions.length + ' total transactions across your accounts.',
        [el('button', { class: 'btn primary', onclick: openAddTxn }, '+ Add')]));

      content.appendChild(el('div', { class: 'filter-bar' },
        qIn, catSel, acctSel,
        el('span', { class: 'subtle' }, 'From'), fromIn,
        el('span', { class: 'subtle' }, 'To'),   toIn,
        pendBtn, clearBtn));

      // Apply filters
      let rows = s.transactions.slice();
      if (ui.q) {
        const q = ui.q.toLowerCase();
        rows = rows.filter(t => (t.merchant || '').toLowerCase().includes(q)
                             || (t.description || '').toLowerCase().includes(q));
      }
      if (ui.cat)  rows = rows.filter(t => t.category === ui.cat);
      if (ui.acct) rows = rows.filter(t => t.accountId === ui.acct);
      if (ui.from) rows = rows.filter(t => t.date >= ui.from);
      if (ui.to)   rows = rows.filter(t => t.date <= ui.to);
      if (ui.pending) rows = rows.filter(t => t.pending);

      // Sort
      const sign = ui.dir === 'asc' ? 1 : -1;
      const sortKeys = {
        date:     (t) => t.date,
        merchant: (t) => (t.merchant || '').toLowerCase(),
        category: (t) => t.category,
        account:  (t) => (getAccount(t.accountId) || {}).nickname || '',
        amount:   (t) => t.amount
      };
      const kf = sortKeys[ui.sort] || sortKeys.date;
      rows.sort((a, b) => {
        const ka = kf(a), kb = kf(b);
        if (ka < kb) return -1 * sign;
        if (ka > kb) return  1 * sign;
        return 0;
      });

      // Summary
      const sum = rows.reduce((x, t) => {
        if (t.category === 'transfer') return x;
        if (t.amount > 0) x.income += t.amount;
        else x.spent += Math.abs(t.amount);
        return x;
      }, { income: 0, spent: 0 });
      content.appendChild(el('div', { class: 'grid grid-3', style: { marginBottom: '16px' } },
        kpi('Matches',  rows.length.toLocaleString(), null, 'navy'),
        kpi('Income',   fmtMoney(sum.income), null, 'success'),
        kpi('Spent',    fmtMoney(sum.spent),  null, 'warn')
      ));

      // Pagination
      const pages = Math.max(1, Math.ceil(rows.length / PAGE));
      const page  = Math.min(pages, Math.max(1, ui.page || 1));
      const slice = rows.slice((page - 1) * PAGE, page * PAGE);

      // Sortable header
      const thBtn = (label, key) => el('th', { style: { cursor: 'pointer', userSelect: 'none' },
        onclick: () => updateUI({ sort: key, dir: (ui.sort === key && ui.dir === 'desc') ? 'asc' : 'desc', page: 1 }) },
        label + (ui.sort === key ? (ui.dir === 'desc' ? ' ▼' : ' ▲') : ''));

      const tbody = el('tbody', {}, ...slice.map(t => {
        const cat = getCategory(t.category);
        const acc = getAccount(t.accountId);
        return el('tr', { style: { cursor: 'pointer' }, onclick: () => openEditTxn(t) },
          el('td', {}, fmtDateShort(t.date) + (t.pending ? ' ⏱' : '')),
          el('td', {}, el('div', { class: 'txn-merchant' },
            renderMerchantIcon(t.merchant, cat.color),
            el('div', {},
              el('strong', {}, t.merchant),
              el('small', {}, t.description || ''))
          )),
          el('td', {}, el('span', { class: 'chip navy' }, cat.name)),
          el('td', {}, acc ? (acc.nickname + ' ····' + acc.mask) : '—'),
          el('td', { class: cls('num', t.amount >= 0 ? 'pos' : 'neg'),
            style: { textAlign: 'right', fontWeight: 600 } },
            (t.amount >= 0 ? '+' : '') + fmtMoney(t.amount)));
      }));

      content.appendChild(card(null, [
        el('table', { class: 'table' },
          el('thead', {}, el('tr', {},
            thBtn('Date', 'date'),
            thBtn('Merchant', 'merchant'),
            thBtn('Category', 'category'),
            thBtn('Account', 'account'),
            el('th', { style: { cursor: 'pointer', userSelect: 'none', textAlign: 'right' },
              onclick: () => updateUI({ sort: 'amount', dir: (ui.sort === 'amount' && ui.dir === 'desc') ? 'asc' : 'desc', page: 1 }) },
              'Amount' + (ui.sort === 'amount' ? (ui.dir === 'desc' ? ' ▼' : ' ▲') : '')))),
          tbody),
        // Pagination
        el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                             borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '12px' } },
          el('span', { class: 'subtle' },
            rows.length
              ? 'Showing ' + ((page - 1) * PAGE + 1) + '–' + Math.min(page * PAGE, rows.length) + ' of ' + rows.length
              : 'No transactions match your filters'),
          el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
            el('button', { class: 'btn', onclick: () => updateUI({ page: Math.max(1, page - 1) }) }, '← Prev'),
            el('span', { class: 'muted' }, 'Page ' + page + ' / ' + pages),
            el('button', { class: 'btn', onclick: () => updateUI({ page: Math.min(pages, page + 1) }) }, 'Next →')))
      ]));
    },
    accounts: function (content) {
      const s = getState();

      const openLinkAccount = () => {
        const institutions = ['Chase', 'Bank of America', 'Wells Fargo', 'Citi', 'Capital One', 'Ally', 'Fidelity', 'Vanguard', 'Schwab', 'Coinbase', 'American Express', 'Discover'];
        const instSel = el('select', {}, ...institutions.map(n => el('option', { value: n }, n)));
        const typeSel = el('select', {},
          el('option', { value: 'checking' },   'Checking'),
          el('option', { value: 'savings' },    'Savings'),
          el('option', { value: 'credit' },     'Credit card'),
          el('option', { value: 'investment' }, 'Brokerage'),
          el('option', { value: 'retirement' }, 'Retirement / 401(k)'),
          el('option', { value: 'loan' },       'Loan / mortgage'));
        const nick = el('input', { type: 'text',   placeholder: 'Everyday Checking' });
        const mask = el('input', { type: 'text',   placeholder: '4821',    maxlength: 4 });
        const bal  = el('input', { type: 'number', placeholder: '1000.00', step: '0.01' });
        const modal = el('div', {},
          el('h2', {}, '🔗 Link a new account'),
          el('p', { class: 'muted' }, 'Demo only — in production, Luminate connects to 12,000+ US institutions via secure OAuth.'),
          el('div', { class: 'grid grid-2' },
            el('div', { class: 'form-row' }, el('label', {}, 'Institution'), instSel),
            el('div', { class: 'form-row' }, el('label', {}, 'Account type'), typeSel)),
          el('div', { class: 'form-row' }, el('label', {}, 'Nickname'), nick),
          el('div', { class: 'grid grid-2' },
            el('div', { class: 'form-row' }, el('label', {}, 'Last 4'), mask),
            el('div', { class: 'form-row' }, el('label', {}, 'Current balance'), bal)),
          el('div', { class: 'modal-actions' },
            el('button', { class: 'btn', onclick: closeModal }, 'Cancel'),
            el('button', { class: 'btn primary', onclick: () => {
              if (!nick.value.trim() || !bal.value) { toast('Fill in nickname and balance'); return; }
              const balance = parseFloat(bal.value);
              const neg = typeSel.value === 'credit' || typeSel.value === 'loan';
              setState(st => st.accounts.push({
                id: 'acc_' + Math.random().toString(36).slice(2, 7),
                name: instSel.value + ' ' + typeSel.value,
                nickname: nick.value.trim(),
                type: typeSel.value,
                institution: instSel.value,
                mask: (mask.value || '0000').slice(-4),
                balance: neg ? -Math.abs(balance) : Math.abs(balance),
                isLuminate: false,
                color: '#8591a8'
              }));
              closeModal(); toast('Account linked ✓'); render();
            }}, 'Link account'))
        );
        openModal(modal);
      };

      content.appendChild(viewHeader('Accounts',
        s.accounts.length + ' accounts · ' + fmtMoney(netWorth(), { cents: false }) + ' net worth',
        [el('button', { class: 'btn primary', onclick: openLinkAccount }, '+ Link account')]));

      const GROUPS = [
        { label: 'Cash',              types: ['checking', 'savings'],         icon: '💵' },
        { label: 'Credit cards',      types: ['credit'],                      icon: '💳' },
        { label: 'Investments',       types: ['investment'],                  icon: '📈' },
        { label: 'Retirement',        types: ['retirement'],                  icon: '🏖️' },
        { label: 'Property & vehicles', types: ['property', 'vehicle'],       icon: '🏠' },
        { label: 'Loans',             types: ['loan'],                        icon: '🧾' }
      ];

      content.appendChild(el('div', { class: 'grid grid-2' },
        ...GROUPS.map(g => {
          const accounts = s.accounts.filter(a => g.types.includes(a.type));
          if (!accounts.length) return null;
          const subtotal = accounts.reduce((x, a) => x + a.balance, 0);
          const rows = accounts.map(a => {
            const children = [
              el('div', { class: 'acct-logo', style: { background: a.color || 'var(--navy)' } },
                (a.institution || '?').slice(0, 1)),
              el('div', { class: 'acct-info' },
                el('strong', {}, a.nickname || a.name),
                el('small', {},
                  (a.isLuminate ? '⚡ ' : '') + (a.institution || '') + ' ····' + (a.mask || '') +
                  (a.apr ? '  ·  ' + a.apr + '% APR' : '') +
                  (a.limit ? '  ·  limit ' + fmtMoney(a.limit, { cents: false }) : ''))),
              el('div', { class: cls('acct-bal', a.balance < 0 ? 'neg' : '') }, fmtMoney(a.balance))
            ];
            if (a.type === 'credit' && a.limit) {
              const util = Math.min(100, Math.round((Math.abs(a.balance) / a.limit) * 100));
              const variant = util < 30 ? 'success' : util < 50 ? 'warn' : 'danger';
              children.push(el('div', {
                style: { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }
              },
                el('div', { style: { flex: '1' } }, progressBar(util, variant)),
                el('span', { class: 'subtle', style: { minWidth: '60px', textAlign: 'right' } },
                  util + '% used')));
            }
            return el('div', {
              class: 'acct',
              style: { cursor: 'default', display: 'grid',
                       gridTemplateColumns: 'auto 1fr auto', gap: '12px', alignItems: 'center' }
            }, ...children);
          });

          return card(g.icon + '  ' + g.label + ' · ' + accounts.length, [
            el('div', {}, ...rows),
            el('div', {
              style: { display: 'flex', justifyContent: 'space-between',
                       borderTop: '1px solid var(--border)', paddingTop: '10px', marginTop: '8px', fontWeight: 700 }
            },
              el('span', { class: 'muted' }, 'Subtotal'),
              el('span', { class: cls('num', subtotal < 0 ? 'neg' : '') }, fmtMoney(subtotal)))
          ]);
        }).filter(Boolean)
      ));
    },
    budgets: function (content) {
      const s = getState();
      // Month state is local to the view
      const monthKeys = lastNMonthKeys(12);
      let selectedMonth = (s._uiBudgetMonth && monthKeys.includes(s._uiBudgetMonth))
        ? s._uiBudgetMonth : currentMonth();

      const labelFor = (k) => {
        const [y, m] = k.split('-'); return new Date(+y, +m - 1, 1)
          .toLocaleString('en-US', { month: 'long', year: 'numeric' });
      };

      const monthSel = el('select', {},
        ...monthKeys.slice().reverse().map(k =>
          el('option', { value: k, selected: k === selectedMonth ? 'selected' : null }, labelFor(k))));
      monthSel.addEventListener('change', () => {
        setState(st => { st._uiBudgetMonth = monthSel.value; });
        render();
      });

      const openAddBudget = () => {
        const used = new Set(s.budgets.map(b => b.categoryId));
        const candidates = s.categories.filter(c =>
          !used.has(c.id) && c.id !== 'income' && c.id !== 'transfer');
        const catSel = el('select', {}, ...candidates.map(c =>
          el('option', { value: c.id }, c.icon + '  ' + c.name)));
        const limit = el('input', { type: 'number', placeholder: '200', step: '10' });
        const rollover = el('input', { type: 'checkbox' });
        const modal = el('div', {},
          el('h2', {}, 'Add budget'),
          candidates.length === 0
            ? el('p', { class: 'muted' }, 'Every category already has a budget — edit an existing one instead.')
            : el('div', {},
                el('div', { class: 'form-row' }, el('label', {}, 'Category'), catSel),
                el('div', { class: 'form-row' }, el('label', {}, 'Monthly limit'), limit),
                el('div', { class: 'form-row' },
                  el('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', textTransform: 'none', letterSpacing: 0 } },
                    rollover, el('span', {}, 'Roll unused over to next month')))),
          el('div', { class: 'modal-actions' },
            el('button', { class: 'btn', onclick: closeModal }, 'Cancel'),
            candidates.length > 0 ? el('button', { class: 'btn primary', onclick: () => {
              const lim = parseFloat(limit.value);
              if (!lim || lim <= 0) { toast('Enter a limit'); return; }
              setState(st => st.budgets.push({
                id: 'b_' + Math.random().toString(36).slice(2, 7),
                categoryId: catSel.value, limit: lim, rollover: rollover.checked
              }));
              closeModal(); toast('Budget added ✓'); render();
            }}, 'Save budget') : null)
        );
        openModal(modal);
      };

      const openEditBudget = (b) => {
        const cat = getCategory(b.categoryId);
        const limit = el('input', { type: 'number', value: b.limit, step: '10' });
        const rollover = el('input', { type: 'checkbox', checked: b.rollover ? 'checked' : null });
        const modal = el('div', {},
          el('h2', {}, cat.icon + ' ' + cat.name + ' budget'),
          el('div', { class: 'form-row' }, el('label', {}, 'Monthly limit'), limit),
          el('div', { class: 'form-row' },
            el('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', textTransform: 'none', letterSpacing: 0 } },
              rollover, el('span', {}, 'Roll unused over to next month'))),
          el('div', { class: 'modal-actions' },
            el('button', { class: 'btn', style: { color: 'var(--danger)', marginRight: 'auto' }, onclick: () => {
              setState(st => { st.budgets = st.budgets.filter(x => x.id !== b.id); });
              closeModal(); toast('Budget removed'); render();
            }}, 'Delete'),
            el('button', { class: 'btn', onclick: closeModal }, 'Cancel'),
            el('button', { class: 'btn primary', onclick: () => {
              setState(st => {
                const m = st.budgets.find(x => x.id === b.id);
                if (!m) return;
                m.limit = parseFloat(limit.value) || m.limit;
                m.rollover = rollover.checked;
              });
              closeModal(); toast('Budget updated ✓'); render();
            }}, 'Save'))
        );
        openModal(modal);
      };

      const spendByCat = monthlySpendByCategory(selectedMonth);
      const totalBudget = s.budgets.reduce((x, b) => x + b.limit, 0);
      const totalSpent  = s.budgets.reduce((x, b) => x + (spendByCat[b.categoryId] || 0), 0);
      const overCount = s.budgets.filter(b => (spendByCat[b.categoryId] || 0) > b.limit).length;

      content.appendChild(viewHeader('Budgets', 'Set a ceiling for every category, then watch the bars.',
        [monthSel, el('button', { class: 'btn primary', onclick: openAddBudget }, '+ Add budget')]));

      // Summary strip
      content.appendChild(el('div', { class: 'grid grid-4', style: { marginBottom: '16px' } },
        kpi('Budgeted',   fmtMoney(totalBudget, { cents: false }), null, 'navy'),
        kpi('Spent',      fmtMoney(totalSpent,  { cents: false }),
          { text: Math.round((totalSpent / Math.max(1, totalBudget)) * 100) + '% of plan',
            positive: totalSpent <= totalBudget, negative: totalSpent > totalBudget }),
        kpi('Remaining',  fmtMoney(Math.max(0, totalBudget - totalSpent), { cents: false }), null, 'success'),
        kpi('Over budget',overCount + ' / ' + s.budgets.length, null, overCount ? 'warn' : 'success')
      ));

      // Budget rows
      const rows = s.budgets.slice().sort((a, b) => (spendByCat[b.categoryId] || 0) / Math.max(1, b.limit)
                                                  - (spendByCat[a.categoryId] || 0) / Math.max(1, a.limit));
      const rowsBody = el('div', {}, ...rows.map(b => {
        const cat = getCategory(b.categoryId);
        const spent = spendByCat[b.categoryId] || 0;
        const pct = Math.round((spent / b.limit) * 100);
        const variant = pct < 75 ? 'success' : pct < 100 ? 'warn' : 'danger';
        const remaining = b.limit - spent;
        return el('div', { class: 'budget-row', style: { cursor: 'pointer' }, onclick: () => openEditBudget(b) },
          el('div', { class: 'meta' },
            el('div', { class: 'cat-dot', style: { background: cat.color } }, cat.icon),
            el('div', {},
              el('strong', {}, cat.name),
              el('div', { class: 'subtle' },
                fmtMoney(spent, { cents: false }) + ' of ' + fmtMoney(b.limit, { cents: false }) +
                (b.rollover ? ' · rolls over' : '') +
                (spent > b.limit ? ' · ⚠ over by ' + fmtMoney(spent - b.limit, { cents: false }) : '')))),
          el('div', {}, progressBar(pct, variant)),
          el('div', { class: cls('num', remaining < 0 ? 'neg' : ''), style: { textAlign: 'right', fontWeight: 600 } },
            fmtMoney(remaining, { cents: false })));
      }));
      content.appendChild(card('Category budgets · ' + labelFor(selectedMonth), rowsBody));
    },
    goals: function (content) {
      const s = getState();
      const goals = s.goals || [];

      const ring = (pct) => {
        const r = 32, c = 2 * Math.PI * r;
        const dash = (Math.max(0, Math.min(100, pct)) / 100) * c;
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 80 80'); svg.setAttribute('width', '80'); svg.setAttribute('height', '80');
        const bg = document.createElementNS(ns, 'circle');
        bg.setAttribute('cx', 40); bg.setAttribute('cy', 40); bg.setAttribute('r', r);
        bg.setAttribute('fill', 'none'); bg.setAttribute('stroke', 'var(--border)'); bg.setAttribute('stroke-width', 8);
        const fg = document.createElementNS(ns, 'circle');
        fg.setAttribute('cx', 40); fg.setAttribute('cy', 40); fg.setAttribute('r', r);
        fg.setAttribute('fill', 'none'); fg.setAttribute('stroke', '#7bb7e0'); fg.setAttribute('stroke-width', 8);
        fg.setAttribute('stroke-linecap', 'round');
        fg.setAttribute('stroke-dasharray', dash + ' ' + c);
        fg.setAttribute('transform', 'rotate(-90 40 40)');
        const label = document.createElementNS(ns, 'text');
        label.setAttribute('x', 40); label.setAttribute('y', 45);
        label.setAttribute('text-anchor', 'middle'); label.setAttribute('font-weight', '700');
        label.setAttribute('fill', 'var(--navy)'); label.setAttribute('font-size', '16');
        label.textContent = Math.round(pct) + '%';
        svg.appendChild(bg); svg.appendChild(fg); svg.appendChild(label);
        return svg;
      };

      const openEditGoal = (g) => {
        const name = el('input',   { type: 'text',   value: g.name });
        const target = el('input', { type: 'number', value: g.target, step: '100' });
        const saved  = el('input', { type: 'number', value: g.saved,  step: '50' });
        const monthly= el('input', { type: 'number', value: g.monthly,step: '25' });
        const modal = el('div', {},
          el('h2', {}, 'Edit goal · ' + g.emoji),
          el('div', { class: 'form-row' }, el('label', {}, 'Name'), name),
          el('div', { class: 'form-row' }, el('label', {}, 'Target amount'), target),
          el('div', { class: 'grid grid-2' },
            el('div', { class: 'form-row' }, el('label', {}, 'Already saved'), saved),
            el('div', { class: 'form-row' }, el('label', {}, 'Monthly'), monthly)),
          g.tip ? el('p', { class: 'muted', style: { marginTop: '-4px' } }, '💡 ' + g.tip) : null,
          el('div', { class: 'modal-actions' },
            el('button', { class: 'btn', style: { color: 'var(--danger)', marginRight: 'auto' }, onclick: () => {
              if (!confirm('Delete "' + g.name + '"?')) return;
              setState(st => { st.goals = st.goals.filter(x => x.id !== g.id); });
              closeModal(); toast('Goal deleted'); render();
            }}, 'Delete'),
            el('button', { class: 'btn', onclick: closeModal }, 'Cancel'),
            el('button', { class: 'btn primary', onclick: () => {
              const wasComplete = !!g.completedAt || g.saved >= g.target;
              setState(st => {
                const m = st.goals.find(x => x.id === g.id);
                if (!m) return;
                m.name = name.value.trim() || m.name;
                m.target = parseFloat(target.value) || m.target;
                m.saved = parseFloat(saved.value) || 0;
                m.monthly = parseFloat(monthly.value) || 0;
                if (!wasComplete && m.saved >= m.target && m.target > 0) {
                  m.completedAt = new Date().toISOString().slice(0, 10);
                }
              });
              const refreshed = getState().goals.find(x => x.id === g.id);
              const justCompleted = !wasComplete && refreshed && refreshed.completedAt;
              closeModal();
              if (justCompleted) { fireConfetti(); toast('🎉 Goal complete — ' + refreshed.name + '!'); }
              else { toast('Goal updated ✓'); }
              render();
            }}, 'Save'))
        );
        openModal(modal);
      };

      const templateEmoji = { emergency: '🛟', vacation: '✈️', home_project: '🏡', home_down: '🔑', wedding: '💍', baby: '👶', car: '🚗', retirement: '🏖️', sabbatical: '🌴' };
      const templateName  = { emergency: 'Emergency fund', vacation: 'Dream vacation', home_project: 'Home project', home_down: 'Home down payment', wedding: 'Wedding', baby: 'Growing family', car: 'New vehicle', retirement: 'Retirement', sabbatical: 'Sabbatical / break' };

      const openNewGoal = () => {
        const typeSel = el('select', {}, ...Object.keys(templateName).map(k =>
          el('option', { value: k }, templateEmoji[k] + '  ' + templateName[k])));
        const name = el('input', { type: 'text', placeholder: 'e.g. Italy 2026' });
        const target = el('input', { type: 'number', placeholder: '6500', step: '100' });
        const monthly = el('input', { type: 'number', placeholder: '360', step: '25' });
        const reason = el('p', { class: 'muted', style: { fontSize: '12px' } }, '');

        const refreshSuggestion = () => {
          const key = typeSel.value;
          const tmpl = GOAL_TEMPLATES[key];
          if (!tmpl || !tmpl.calc) { reason.textContent = ''; return; }
          const inc = averageMonthlyIncome(3);
          const exp = averageMonthlyExpense(3);
          try {
            const out = tmpl.calc({ dependents: s.user.dependents, currentAge: 32 }, inc, exp);
            target.value = out.target;
            monthly.value = recommendMonthly(out.target, 0, 24);
            reason.textContent = '💡 ' + (out.reason || 'Suggested based on your profile.');
          } catch (e) { reason.textContent = ''; }
          if (!name.value) name.value = templateName[key];
        };
        typeSel.addEventListener('change', refreshSuggestion);
        setTimeout(refreshSuggestion, 0);

        const modal = el('div', {},
          el('h2', {}, 'New life goal'),
          el('div', { class: 'form-row' }, el('label', {}, 'Goal type'), typeSel),
          el('div', { class: 'form-row' }, el('label', {}, 'Name'), name),
          el('div', { class: 'grid grid-2' },
            el('div', { class: 'form-row' }, el('label', {}, 'Target amount'), target),
            el('div', { class: 'form-row' }, el('label', {}, 'Monthly'), monthly)),
          reason,
          el('div', { class: 'modal-actions' },
            el('button', { class: 'btn', onclick: closeModal }, 'Cancel'),
            el('button', { class: 'btn primary', onclick: () => {
              const t = parseFloat(target.value);
              if (!name.value.trim() || !t) { toast('Fill in name and target'); return; }
              setState(st => st.goals.push({
                id: 'g_' + Math.random().toString(36).slice(2, 7),
                type: typeSel.value, emoji: templateEmoji[typeSel.value] || '🎯',
                name: name.value.trim(), target: t,
                saved: 0, monthly: parseFloat(monthly.value) || 0,
                priority: 'medium', luminateAccount: 'acc_lhys',
                tip: 'Park savings in Luminate High-Yield at 4.50% APY — earns while it waits.'
              }));
              closeModal(); toast('Goal created ✓'); render();
            }}, 'Create goal'))
        );
        openModal(modal);
      };

      content.appendChild(viewHeader('Life Goals', 'Big plans, tracked with real math.',
        [el('button', { class: 'btn primary', onclick: openNewGoal }, '+ New goal')]));

      if (!goals.length) {
        content.appendChild(card(null, el('div', { style: { textAlign: 'center', padding: '32px' } },
          el('div', { style: { fontSize: '42px' } }, '🎯'),
          el('h3', {}, 'No goals yet'),
          el('p', { class: 'muted' }, 'Create your first goal to see personalized contribution plans.'),
          el('button', { class: 'btn primary', style: { marginTop: '12px' }, onclick: openNewGoal }, '+ New goal'))));
        return;
      }

      const activeGoals    = goals.filter(g => !g.completedAt && g.saved < g.target);
      const completedGoals = goals.filter(g =>  g.completedAt || g.saved >= g.target);

      if (activeGoals.length) {
        content.appendChild(el('div', { class: 'grid grid-3', style: { marginBottom: '20px' } },
          ...activeGoals.map(g => {
            const pct = g.target > 0 ? (g.saved / g.target) * 100 : 0;
            const proj = projectGoal(g);
            return el('div', { class: 'goal', style: { cursor: 'pointer' }, onclick: () => openEditGoal(g) },
              el('div', { style: { display: 'flex', gap: '14px', alignItems: 'center' } },
                ring(pct),
                el('div', { style: { flex: '1', minWidth: 0 } },
                  el('div', { class: 'goal-emoji' }, g.emoji),
                  el('div', { class: 'goal-name' }, g.name))),
              el('div', { class: 'goal-amt' },
                el('span', {}, fmtMoney(g.saved, { cents: false }) + ' / ' + fmtMoney(g.target, { cents: false })),
                el('span', { class: 'num pos' }, '+' + fmtMoney(g.monthly, { cents: false }) + '/mo')),
              progressBar(pct, pct >= 100 ? 'success' : pct >= 50 ? '' : 'warn'),
              el('div', { class: 'subtle' },
                proj ? 'Projected completion · ' + fmtDate(proj.completion) + '  (~' + proj.months + ' months)'
                     : 'Set a monthly contribution to forecast completion'),
              g.tip ? el('p', { class: 'muted', style: { fontSize: '12px', marginTop: '6px' } }, '💡 ' + g.tip) : null
            );
          })));
      }

      if (completedGoals.length) {
        content.appendChild(card('Trophy shelf · ' + completedGoals.length + ' completed',
          el('div', { class: 'grid grid-4', style: { gap: '12px' } },
            ...completedGoals.map(g => el('div', {
              class: 'goal',
              style: {
                background: 'linear-gradient(135deg, rgba(21,165,106,0.14), rgba(12,23,61,0.03))',
                border: '1px solid rgba(21,165,106,0.35)'
              }
            },
              el('div', { class: 'goal-emoji' }, g.emoji),
              el('div', { class: 'goal-name' }, g.name),
              el('div', { class: 'goal-amt' },
                el('span', {}, fmtMoney(g.target, { cents: false }) + ' reached'),
                el('span', { class: 'chip success' }, '✓ Complete')),
              el('div', { class: 'subtle' },
                g.completedAt ? 'Completed ' + fmtDate(g.completedAt) : 'Recently completed')))),
          [el('button', { class: 'btn ghost', onclick: () => fireConfetti() }, 'Celebrate 🎉')]));
      }

      if (!activeGoals.length && !completedGoals.length) {
        // no-op: the earlier early-return already rendered an empty state
      }
    },
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
      const s = getState();
      const u = s.user;
      content.appendChild(viewHeader('AI Insights', 'Chat with Lumi, your Luminate financial coach.'));

      // Multi-turn memory — history survives reload and re-render
      if (!s._uiInsights) s._uiInsights = { history: [], lastTopic: null };
      if (!s._uiInsights.history.length) {
        COACH_INTRO.forEach(line => s._uiInsights.history.push({
          who: 'lumi', text: line.replace('{name}', u.firstName || 'there')
        }));
        save();
      }

      const detectTopic = (q) => {
        const x = q.toLowerCase();
        if (/budget|dining|grocer|spend|category/.test(x)) return 'budget';
        if (/debt|credit\s*card|loan|owe|avalanche|snowball/.test(x)) return 'debt';
        if (/credit\s*score|fico|utili/.test(x)) return 'credit';
        if (/retire|401k|ira|roth|pension|fire/.test(x)) return 'retirement';
        if (/save|saving|emergency/.test(x)) return 'savings';
        if (/goal|italy|vacation|wedding|baby|home\s*down/.test(x)) return 'goals';
        if (/invest|portfolio|stock|bond|etf/.test(x)) return 'invest';
        if (/house|mortgage|rent|buy/.test(x)) return 'housing';
        if (/tax|withhold|w-?4/.test(x)) return 'tax';
        if (/subscript|recurring/.test(x)) return 'subscriptions';
        if (/insurance|life|umbrella|hsa/.test(x)) return 'insurance';
        return null;
      };
      const isFollowUp = (q) => /^(and|what about|how about|tell me more|more on that|why|what else)\b[\s,?!.]*/i.test(q.trim());

      // Proactive-insight detectors
      const generateProactiveInsights = () => {
        const out = [];
        const thisMonth = monthlySpendByCategory(currentMonth());
        const priorKeys = lastNMonthKeys(4).slice(0, 3);
        const priorAvg = {};
        priorKeys.forEach(k => {
          const m = monthlySpendByCategory(k);
          Object.keys(m).forEach(cat => { priorAvg[cat] = (priorAvg[cat] || 0) + m[cat] / priorKeys.length; });
        });
        Object.keys(thisMonth).forEach(cat => {
          const avg = priorAvg[cat] || 0;
          if (avg >= 40 && thisMonth[cat] > avg * 1.4) {
            const c = getCategory(cat);
            const extra = Math.round(thisMonth[cat] - avg);
            out.push({
              text: c.name + ' spending is about ' + fmtMoney(extra) + ' above your 3-month average this month. Want to check?',
              actions: [
                { label: 'Open Budgets', kind: 'open-view', route: 'budgets' },
                { label: 'Tell me more', kind: 'suggest-followup', query: 'review my ' + c.name.toLowerCase() + ' spending' }
              ]
            });
          }
        });
        const cc = s.accounts.find(a => a.type === 'credit' && a.limit);
        if (cc) {
          const util = Math.round(Math.abs(cc.balance) / cc.limit * 100);
          if (util >= 30) {
            const pay = Math.max(50, Math.round(Math.abs(cc.balance) - cc.limit * 0.09));
            out.push({
              text: 'Your ' + cc.nickname + ' utilization is ' + util + '%. A ' + fmtMoney(pay) + ' payment would drop it under 10% and likely lift your score 10–20 points.',
              actions: [
                { label: 'Log ' + fmtMoney(pay) + ' payment', kind: 'pay-card', accountId: cc.id, amount: pay },
                { label: 'Skip', kind: 'dismiss' }
              ]
            });
          }
        }
        s.goals.forEach(g => {
          if (!g.deadline || !g.monthly) return;
          const proj = projectGoal(g);
          if (!proj) return;
          const deadDate = new Date(g.deadline);
          const compDate = new Date(proj.completion);
          if (compDate > deadDate) {
            const monthsAvail = Math.max(1, Math.ceil((deadDate - new Date()) / (30 * 86400000)));
            const bump = recommendMonthly(g.target, g.saved, monthsAvail);
            out.push({
              text: g.name + ' is projected to finish after your target date. ' + fmtMoney(bump) + '/mo keeps it on schedule.',
              actions: [
                { label: 'Bump to ' + fmtMoney(bump) + '/mo', kind: 'boost-goal', goalId: g.id, newMonthly: bump },
                { label: 'Open Goals', kind: 'open-view', route: 'goals' }
              ]
            });
          }
        });
        return out.slice(0, 3);
      };

      const applyAction = (a) => {
        if (a.kind === 'open-view') { navigate(a.route); return; }
        if (a.kind === 'suggest-followup') { input.value = a.query; sendMessage(); return; }
        if (a.kind === 'dismiss') { toast('Dismissed'); return; }
        if (a.kind === 'cut-category') {
          setState(st => { const b = st.budgets.find(x => x.categoryId === a.catId); if (b) b.limit = Math.round(b.limit * (1 - a.pct / 100)); });
          toast('Budget trimmed ' + a.pct + '%'); render(); return;
        }
        if (a.kind === 'boost-goal') {
          setState(st => { const g = st.goals.find(x => x.id === a.goalId); if (g) g.monthly = a.newMonthly; });
          toast('Goal contribution updated to ' + fmtMoney(a.newMonthly) + '/mo'); render(); return;
        }
        if (a.kind === 'pay-card') {
          setState(st => {
            st.transactions.unshift({
              id: 'tx_' + Math.random().toString(36).slice(2, 8),
              accountId: a.accountId, date: new Date().toISOString().slice(0, 10),
              merchant: 'Card payment', description: 'Scheduled via Lumi',
              amount: -a.amount, category: 'transfer', pending: true
            });
            const acc = st.accounts.find(x => x.id === a.accountId);
            if (acc) acc.balance += a.amount;
          });
          toast('Payment of ' + fmtMoney(a.amount) + ' logged'); render(); return;
        }
      };

      const bubbleStyle = (who) => ({
        maxWidth: '75%', padding: '12px 14px', borderRadius: '14px', marginBottom: '10px',
        lineHeight: '1.45',
        background: who === 'user' ? 'var(--navy)' : 'var(--surface-2)',
        color: who === 'user' ? '#fff' : 'var(--text)',
        alignSelf: who === 'user' ? 'flex-end' : 'flex-start'
      });

      const stream = el('div', { style: {
        display: 'flex', flexDirection: 'column',
        height: '460px', overflowY: 'auto',
        padding: '14px', background: 'var(--bg)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius)'
      }});
      const renderBubble = (who, text, actions) => {
        const b = el('div', { style: bubbleStyle(who) }, text);
        if (actions && actions.length) {
          b.appendChild(el('div', {
            style: { marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }
          }, ...actions.map(a => el('button', {
            class: 'chip navy',
            style: { cursor: 'pointer', padding: '4px 10px', fontSize: '12px' },
            onclick: () => applyAction(a)
          }, a.label))));
        }
        stream.appendChild(b);
        stream.scrollTop = stream.scrollHeight;
        return b;
      };

      // Seed proactive insights right after the intro if this is a fresh thread
      if (!s._uiInsights.proactiveSeeded) {
        const insights = generateProactiveInsights();
        if (insights.length) {
          insights.forEach(ins => s._uiInsights.history.push({
            who: 'lumi', text: ins.text, actions: ins.actions
          }));
        }
        s._uiInsights.proactiveSeeded = true;
        save();
      }

      // Replay all prior history
      s._uiInsights.history.forEach(m => renderBubble(m.who, m.text, m.actions));

      // Typing indicator with animated dots
      const showTyping = () => {
        const dots = el('span', {}, '.');
        const bubble = el('div', {
          style: Object.assign({}, bubbleStyle('lumi'), { opacity: '0.7', fontStyle: 'italic' })
        }, 'Lumi is thinking', dots);
        stream.appendChild(bubble);
        stream.scrollTop = stream.scrollHeight;
        let n = 1;
        const iv = setInterval(() => { n = (n % 3) + 1; dots.textContent = '.'.repeat(n); }, 240);
        return () => { clearInterval(iv); bubble.remove(); };
      };

      const input = el('input', { type: 'text', placeholder: 'Ask Lumi anything about your money…',
        style: { flex: '1', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface)' } });
      const sendMessage = () => {
        const raw = input.value.trim();
        if (!raw) return;
        let effective = raw;
        if (isFollowUp(raw) && s._uiInsights.lastTopic) {
          effective = s._uiInsights.lastTopic + ' ' + raw;
        }
        input.value = '';
        renderBubble('user', raw);
        s._uiInsights.history.push({ who: 'user', text: raw });
        const topic = detectTopic(effective);
        if (topic) s._uiInsights.lastTopic = topic;
        save();
        const clearTyping = showTyping();
        const delay = 650 + Math.random() * 350;
        setTimeout(() => {
          clearTyping();
          const replies = coachReply(effective);
          replies.forEach(line => {
            renderBubble('lumi', line);
            s._uiInsights.history.push({ who: 'lumi', text: line });
          });
          save();
        }, delay);
      };
      input.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });
      const sendBtn = el('button', { class: 'btn primary', onclick: sendMessage }, 'Send');
      const clearBtn = el('button', { class: 'btn ghost', onclick: () => {
        if (!confirm('Clear your chat history with Lumi?')) return;
        s._uiInsights = { history: [], lastTopic: null, proactiveSeeded: false };
        save(); render();
      }}, 'Clear');

      const chatCol = el('div', { class: 'card' },
        stream,
        el('div', { style: { display: 'flex', gap: '8px', marginTop: '12px' } }, input, sendBtn, clearBtn)
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
    _animateKpis: _animateKpis,
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
