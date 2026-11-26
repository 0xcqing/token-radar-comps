// Launch Radar renders window.RADAR, the dataset main.ts writes beside dashboard/ from the same board.
// It draws a fitted comparable board, a per-protocol detail drawer and a model report. No network, no
// fetch: every number on the page comes from the sealed snapshot in ../data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('app');
  if (!DATA) {
    app.textContent = 'No radar data: ../data.js did not load beside this page.';
    return;
  }

  var state = { q: '', category: 'all', chain: 'all', watch: false, minTvl: 0, sort: 'implied', dir: -1, selected: null };

  // ---------------------------------------------------------------- formatting
  function compact(n, unit) {
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B' + unit;
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M' + unit;
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K' + unit;
    return '$' + n.toFixed(unit ? 1 : 0) + unit;
  }
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return compact(n, '');
  }
  function fmtInt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(d) {
    if (d === null || d === undefined) return 'unknown';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(d)) + 'd';
  }
  function fmtOdds(o) { return (o * 100).toFixed(1) + '%'; }
  function fmtPerHour(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M/h';
    if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K/h';
    return '$' + n.toFixed(1) + '/h';
  }
  function categoryOf(r) { return r.category || 'Other'; }
  function chainText(r) {
    return r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'unnamed chain';
  }
  function chainSummary(r) {
    var cs = r.chains || [];
    if (!cs.length) return 'unnamed chain';
    if (cs.length <= 3) return cs.join(', ');
    return cs.slice(0, 3).join(', ') + ' +' + (cs.length - 3) + ' more';
  }

  // ---------------------------------------------------------------- tiny DOM builder
  function add(node, child) {
    if (child === null || child === undefined) return;
    if (Array.isArray(child)) { child.forEach(function (c) { add(node, c); }); return; }
    if (typeof child === 'string' || typeof child === 'number') { node.appendChild(document.createTextNode(String(child))); return; }
    node.appendChild(child);
  }
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) add(node, arguments[i]);
    return node;
  }

  // ---------------------------------------------------------------- data views
  function categories() {
    var seen = {};
    DATA.rows.forEach(function (r) { seen[categoryOf(r)] = (seen[categoryOf(r)] || 0) + 1; });
    return Object.keys(seen).sort();
  }
  function chains() {
    var seen = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { seen[c] = (seen[c] || 0) + 1; }); });
    return Object.keys(seen).sort();
  }
  function filtered() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watch && !r.watchlist) return false;
      if (state.category !== 'all' && categoryOf(r) !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.minTvl > 0 && r.tvl_usd < state.minTvl) return false;
      if (!q) return true;
      var hay = (r.name + ' ' + r.slug + ' ' + categoryOf(r) + ' ' + (r.chains || []).join(' ')).toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  var sorters = {
    rank: function (r) { return r.rank; },
    name: function (r) { return r.name.toLowerCase(); },
    tvl: function (r) { return r.tvl_usd; },
    change: function (r) { return r.change_7d === null ? -Infinity : r.change_7d; },
    age: function (r) { return r.age_days === null ? Infinity : r.age_days; },
    implied: function (r) { return r.implied_value_usd; },
    odds: function (r) { return r.token_odds; },
    expected: function (r) { return r.expected_value_usd; },
    net: function (r) { return r.net_per_hour_usd; }
  };
  function sorted(list) {
    var get = sorters[state.sort] || sorters.implied;
    return list.slice().sort(function (a, b) {
      var av = get(a), bv = get(b);
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  // ---------------------------------------------------------------- hash routing
  function currentHash() {
    if (state.selected) return '#p=' + encodeURIComponent(state.selected);
    if (state.watch) return '#filter=watchlist';
    if (state.category !== 'all') return '#filter=' + encodeURIComponent(state.category);
    return '#board';
  }
  function sync() {
    var h = currentHash();
    if (window.location.hash === h) return;
    try { window.history.replaceState(null, '', h); } catch (e) { /* file URLs may refuse */ }
  }
  function readHash() {
    var raw = window.location.hash.replace(/^#/, '');
    var h = raw;
    try { h = decodeURIComponent(raw); } catch (e) { /* keep raw */ }
    state.selected = null;
    state.watch = false;
    state.category = 'all';
    if (h.indexOf('p=') === 0) state.selected = h.slice(2);
    else if (h.indexOf('filter=') === 0) {
      var v = h.slice(7);
      if (v === 'watchlist') state.watch = true;
      else if (v) state.category = v;
    }
  }

  // ---------------------------------------------------------------- masthead, KPI, integrity
  function masthead() {
    return el('header', { class: 'masthead' },
      el('div', null,
        el('div', { class: 'eyebrow', text: 'Token launch radar · ' + DATA.model_version }),
        el('h1', { text: 'Launch Radar' }),
        el('p', { class: 'lede', text: 'Every rankable pre-token protocol in the sealed snapshot, ranked by an implied value fitted on the protocols whose token already trades. The watchlist is the floor, never the ceiling.' })
      ),
      el('div', { class: 'masthead-meta' },
        el('div', { class: 'asof', text: 'As of ' + DATA.as_of }),
        el('div', { class: 'meta', text: 'Sealed protocol snapshot · ' + fmtInt(DATA.total_protocols) + ' protocols' }),
        el('span', { class: 'pill' }, el('span', { class: 'dot' }), 'model ' + DATA.model_version)
      )
    );
  }
  function kpi(label, value, sub, accent, small) {
    return el('div', { class: 'kpi' },
      el('div', { class: 'kpi-label', text: label }),
      el('div', { class: 'kpi-value' + (accent ? ' accent' : ''), text: value, style: small ? 'font-size:15px;font-family:var(--mono);letter-spacing:0' : null }),
      el('div', { class: 'kpi-sub', text: sub })
    );
  }
  function kpis() {
    var st = DATA.model_stats;
    var bt = st.backtest;
    var rc = st.rank_check;
    return el('section', { class: 'kpis', 'aria-label': 'Key figures' },
      kpi('Protocols', fmtInt(DATA.total_protocols), 'in the sealed snapshot'),
      kpi('Pre-token', fmtInt(DATA.pretoken_size), fmtInt(DATA.board_size) + ' ranked, ' + fmtInt(DATA.pretoken_size - DATA.board_size) + ' excluded'),
      kpi('Watchlist', DATA.watchlist_covered + '/' + DATA.watchlist_size, 'covered, the floor'),
      kpi('Live anchors', fmtInt(DATA.live_size), 'traded tokens, never ranked'),
      kpi('Median mcap / TVL', st.global_median.toFixed(2) + '×', st.global_samples + ' live anchors', true),
      kpi('Held-out error', bt.median_ape.toFixed(1) + '%', (bt.within_2x * 100).toFixed(1) + '% within 2×, worse fold', true),
      kpi('Rank check', (rc.share * 100).toFixed(1) + '%', fmtInt(rc.compared) + ' held-out pairs, same order', true),
      kpi('Model', DATA.model_version, 'two-fold backtest + rank check', false, true)
    );
  }
  function integrity() {
    var rc = DATA.model_stats.rank_check;
    var items = [
      'watchlist ' + DATA.watchlist_covered + '/' + DATA.watchlist_size,
      'ranks 1..' + DATA.board_size,
      'farm steps 3..12 on every row',
      'rank check ' + (rc.share * 100).toFixed(1) + '% of ' + rc.compared + ' pairs',
      'no network address in this page',
      'dossier rebuilt by buildDossier'
    ];
    return el('section', { 'aria-label': 'Integrity checks' },
      el('div', { class: 'integrity' }, items.map(function (t) {
        return el('span', { class: 'chip' }, el('span', { class: 'tick', 'aria-hidden': 'true', text: '✓' }), t);
      })),
      el('p', { class: 'accounting' },
        'Snapshot accounting: ',
        el('b', { text: fmtInt(DATA.total_protocols) }), ' protocols = ',
        el('b', { text: fmtInt(DATA.board_size) }), ' ranked subjects + ',
        el('b', { text: fmtInt(DATA.excluded_cex) }), ' CEX + ',
        el('b', { text: fmtInt(DATA.excluded_bridge) }), ' bridge or wrapped/staked product + ',
        el('b', { text: fmtInt(DATA.excluded_exchange) }), ' exchange-named + ',
        el('b', { text: fmtInt(DATA.excluded_versioned) }), ' versioned + ',
        el('b', { text: fmtInt(DATA.already_trading) }), ' already trading. ',
        'Every subject is ranked; the watchlist is the floor, not the ceiling.'
      )
    );
  }

  // ---------------------------------------------------------------- toolbar
  function toolbar() {
    var search = el('input', { type: 'search', placeholder: 'Name, category or chain', value: state.q, 'aria-label': 'Search protocols' });
    search.addEventListener('input', function () { state.q = search.value; refresh(); });

    var catSelect = el('select', { 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories', selected: state.category === 'all' ? 'selected' : null }),
      categories().map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () {
      state.category = catSelect.value;
      if (state.category !== 'all') state.watch = false;
      sync(); render();
    });

    var chainSelect = el('select', { 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains', selected: state.chain === 'all' ? 'selected' : null }),
      chains().map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; refresh(); });

    var minSelect = el('select', { 'aria-label': 'Minimum TVL' },
      [['0', 'Any TVL'], ['50000000', '≥ $50M'], ['100000000', '≥ $100M'], ['500000000', '≥ $500M'], ['1000000000', '≥ $1B']].map(function (o) {
        return el('option', { value: o[0], text: o[1], selected: String(state.minTvl) === o[0] ? 'selected' : null });
      })
    );
    minSelect.addEventListener('change', function () { state.minTvl = Number(minSelect.value); refresh(); });

    var cb = el('input', { type: 'checkbox', checked: state.watch ? 'checked' : null });
    var toggle = el('label', { class: 'toggle' + (state.watch ? ' on' : '') }, cb, 'Watchlist only');
    cb.addEventListener('change', function () {
      state.watch = cb.checked;
      if (state.watch) state.category = 'all';
      sync(); render();
    });

    var reset = el('button', { class: 'reset', type: 'button', text: 'Reset', onclick: function () {
      state.q = ''; state.category = 'all'; state.chain = 'all'; state.watch = false; state.minTvl = 0; state.sort = 'implied'; state.dir = -1;
      sync(); render();
    } });

    return el('div', { class: 'toolbar' },
      el('div', { class: 'field search' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('span', { class: 'flabel', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('span', { class: 'flabel', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('span', { class: 'flabel', text: 'Minimum TVL' }), minSelect),
      toggle,
      reset,
      el('span', { class: 'count', id: 'count', text: 'Showing…' })
    );
  }

  // ---------------------------------------------------------------- board
  function badge(verdict) { return el('span', { class: 'badge ' + verdict, text: verdict }); }

  function sortTh(key, label, cls) {
    var active = state.sort === key;
    return el('th', { scope: 'col', class: cls || null },
      el('button', { class: 'sortbtn' + (active ? ' sorted' : ''), type: 'button', onclick: function () {
        if (state.sort === key) state.dir = -state.dir;
        else {
          state.sort = key;
          state.dir = key === 'rank' || key === 'age' || key === 'name' ? 1 : -1;
        }
        refresh();
      } },
        label,
        active ? el('span', { class: 'arrow', 'aria-hidden': 'true', text: state.dir < 0 ? '▾' : '▴' }) : null
      )
    );
  }

  function boardCard(list) {
    if (list.length === 0) {
      return el('div', { class: 'table-card' },
        el('div', { class: 'empty' },
          el('h2', { text: 'No protocol matches that filter' }),
          el('p', { text: 'Clear the search or the filters to see the ranked board again.' }),
          el('button', { class: 'btn primary', type: 'button', text: 'Clear filters', onclick: function () {
            state.q = ''; state.category = 'all'; state.chain = 'all'; state.watch = false; state.minTvl = 0;
            sync(); render();
          } })
        )
      );
    }
    var max = list[0] ? list.reduce(function (m, r) { return Math.max(m, r.implied_value_usd); }, 1) : 1;
    var body = el('tbody');
    list.forEach(function (r) {
      var width = Math.max(3, Math.round((r.implied_value_usd / max) * 100));
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      body.appendChild(el('tr', {
        class: state.selected === r.slug ? 'selected' : null,
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'rank num', text: String(r.rank) }),
        el('td', { class: 'proto' },
          el('b', null, r.name, r.watchlist ? el('span', { class: 'watch-chip', text: 'watch' }) : null),
          el('span', { class: 'sub', text: categoryOf(r) + ' · ' + chainText(r) })
        ),
        el('td', { class: 'num r', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num r ' + growthClass, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num r', text: fmtAge(r.age_days) }),
        el('td', { class: 'r' }, el('div', { class: 'implied-cell' },
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + width + '%' }))
        )),
        el('td', { class: 'num r', text: fmtOdds(r.token_odds) }),
        el('td', { class: 'num r', text: fmtUsd(r.expected_value_usd) }),
        el('td', null, badge(r.verdict)),
        el('td', { class: 'num net r', text: fmtPerHour(r.net_per_hour_usd) })
      ));
    });
    return el('div', { class: 'table-card' },
      el('div', { class: 'table-wrap' },
        el('table', { class: 'board', 'aria-label': 'Ranked pre-token protocols' },
          el('thead', null, el('tr', null,
            sortTh('rank', 'Rank'),
            sortTh('name', 'Protocol'),
            sortTh('tvl', 'TVL', 'r'),
            sortTh('change', '7d', 'r'),
            sortTh('age', 'Age', 'r'),
            sortTh('implied', 'Implied value', 'r'),
            sortTh('odds', 'Odds', 'r'),
            sortTh('expected', 'Expected', 'r'),
            el('th', { scope: 'col' }, el('span', { class: 'sortbtn', text: 'Verdict' })),
            sortTh('net', '$ / hour', 'r')
          )),
          body
        )
      )
    );
  }

  // ---------------------------------------------------------------- model report
  function mcard(k, v, s, accent) {
    return el('div', { class: 'mcard' },
      el('div', { class: 'k', text: k }),
      el('div', { class: 'v' + (accent ? ' accent' : ''), text: v }),
      el('div', { class: 's', text: s })
    );
  }
  function miniTable(headers, rows, caption, note) {
    return el('div', { class: 'mini' },
      el('h3', { text: caption }),
      el('p', { class: 'cap', text: note }),
      el('div', { class: 'scroll' },
        el('table', null,
          el('thead', null, el('tr', null, headers.map(function (h) {
            return el('th', { class: h.r ? 'r' : null, text: h.label });
          }))),
          el('tbody', null, rows)
        )
      )
    );
  }
  function methodSection() {
    var m = DATA.model, st = DATA.model_stats, bt = st.backtest, rc = st.rank_check;
    var compRows = Object.keys(st.by_category).sort().map(function (cat) {
      var c = st.by_category[cat];
      var o = st.odds_by_category[cat] || { rate: st.odds_global, live: 0, pre: 0 };
      return el('tr', null,
        el('td', { class: 'name', text: cat }),
        el('td', { class: 'r num', text: c.ratio.toFixed(2) + '×' }),
        el('td', { class: 'r num', text: String(c.count) }),
        el('td', { class: 'r num', text: (o.rate * 100).toFixed(1) + '%' }),
        el('td', { class: 'r num', text: o.live + ' / ' + (o.live + o.pre) })
      );
    });
    var foldRows = bt.folds.map(function (f) {
      return el('tr', null,
        el('td', { class: 'name', text: f.name }),
        el('td', { class: 'r num', text: String(f.n_train) }),
        el('td', { class: 'r num', text: String(f.n_test) }),
        el('td', { class: 'r num', text: f.median_ape.toFixed(1) + '%' }),
        el('td', { class: 'r num', text: (f.within_2x * 100).toFixed(1) + '%' })
      );
    });
    var anchorRows = DATA.live.slice(0, 8).map(function (l) {
      return el('tr', null,
        el('td', { class: 'name', text: l.name }),
        el('td', { class: 'r num', text: fmtUsd(l.tvl_usd) }),
        el('td', { class: 'r num', text: fmtUsd(l.mcap_usd) }),
        el('td', { class: 'r num', text: l.ratio.toFixed(2) + '×' })
      );
    });
    return el('section', { class: 'method' },
      el('div', { class: 'method-head' },
        el('h2', { text: 'The model, fitted and tested on this snapshot' }),
        el('p', { text: 'Category comps use at least ' + m.min_category_samples + ' live peers; thinner categories fall back to the global median.' })
      ),
      el('div', { class: 'formula' },
        el('div', null, el('b', { text: 'implied' }), ' = round( TVL × category comps ratio × growth adjust )'),
        el('div', null, el('span', { class: 'dim', text: 'growth adjust = ' }), '1 + clamp(7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 × ' + m.growth_weight),
        el('div', null, el('span', { class: 'dim', text: 'odds = ' }), 'category base rate × age factor; age factor = clamp(1.6 − age/900, 0.25, 1.4), unknown age 0.8'),
        el('div', null, el('span', { class: 'dim', text: 'expected = ' }), 'implied × odds', el('span', { class: 'dim', text: '   ·   net $/hr = 1% of expected / (2.5 + hold/30)' }))
      ),
      el('div', { class: 'cards' },
        mcard('Median mcap / TVL', st.global_median.toFixed(2) + '×', 'fitted on ' + st.global_samples + ' live anchors', true),
        mcard('Held-out median error', bt.median_ape.toFixed(1) + '%', (bt.within_2x * 100).toFixed(1) + '% within 2× · worse of two folds', true),
        mcard('Rank check', (rc.share * 100).toFixed(1) + '%', 'rank check: ' + (rc.share * 100).toFixed(1) + '% of ' + rc.compared + ' held-out pairs order the same way', true),
        mcard('Verdict thresholds', '$5,000 / $1,000', 'farm needs expected ≥ $5,000 and 7d ≥ 0; thin ≥ $1,000; else skip', false)
      ),
      el('div', { class: 'grid2' },
        miniTable(
          [{ label: 'Category' }, { label: 'Ratio', r: true }, { label: 'Peers', r: true }, { label: 'Base', r: true }, { label: 'Live / total', r: true }],
          compRows,
          'Category comps and base rates',
          'Median mcap/TVL and the live share that seeds token odds.'
        ),
        miniTable(
          [{ label: 'Fold' }, { label: 'Train', r: true }, { label: 'Test', r: true }, { label: 'Median error', r: true }, { label: 'Within 2×', r: true }],
          foldRows,
          'Deterministic held-out test',
          'Split by the parity of an FNV-1a hash of each slug; the worse fold is reported above.'
        )
      ),
      miniTable(
        [{ label: 'Live anchor' }, { label: 'TVL', r: true }, { label: 'Market cap', r: true }, { label: 'Ratio', r: true }],
        anchorRows,
        'Live tokens, set aside as anchors',
        'These protocols already trade, so they are never ranked: their market cap over TVL anchors the fit. Top ' + anchorRows.length + ' of ' + DATA.live_size + '.'
      )
    );
  }

  // ---------------------------------------------------------------- detail drawer
  function parseStep(s) {
    var ci = s.indexOf(' Cost: ');
    var ti = s.indexOf(' Time: ');
    var action = s, cost = '', time = '';
    if (ci >= 0) action = s.slice(0, ci);
    if (ci >= 0 && ti > ci) {
      cost = s.slice(ci + 7, ti);
      time = s.slice(ti + 7).replace(/\.\s*$/, '');
    }
    return { action: action, cost: cost, time: time };
  }
  function drow(label, value, note, big) {
    return el('div', { class: 'drow' },
      el('span', { class: 'dlabel', text: label }),
      el('span', { class: 'dval' + (big ? ' big' : ''), text: value }),
      note ? el('span', { class: 'dnote', text: note }) : null
    );
  }
  function drawerNode(r) {
    var cat = categoryOf(r);
    var o = DATA.model_stats.odds_by_category[cat];
    var hours = 2.5 + r.hold_days / 30;
    var why = r.verdict === 'farm'
      ? 'Expected ' + fmtUsd(r.expected_value_usd) + ' ≥ $5,000 and the 7d change ' + fmtPct(r.change_7d) + ' is not negative.'
      : r.verdict === 'thin'
        ? 'Expected ' + fmtUsd(r.expected_value_usd) + ' ≥ $1,000, but it misses the $5,000 farm bar or has a negative 7d change.'
        : 'Expected ' + fmtUsd(r.expected_value_usd) + ' is below the $1,000 thin bar.';

    var peers = DATA.live.filter(function (l) { return (l.category || 'Other') === cat; }).slice(0, 5);
    var peerRows = peers.map(function (l) {
      return el('tr', null,
        el('td', { class: 'nm', text: l.name }),
        el('td', { class: 'r num', text: fmtUsd(l.tvl_usd) }),
        el('td', { class: 'r num', text: fmtUsd(l.mcap_usd) }),
        el('td', { class: 'r num', text: l.ratio.toFixed(2) + '×' })
      );
    });

    var steps = r.farm_steps.map(function (s) {
      var p = parseStep(s);
      return el('li', null,
        el('b', { text: p.action }),
        el('div', { class: 'step-meta' },
          'Cost: ' + (p.cost || 'n/a'),
          el('span', { class: 'time', text: '   ·   Time: ' + (p.time || 'n/a') })
        )
      );
    });

    var mainCol = el('div', { class: 'drawer-col' },
      el('div', { class: 'derive' },
        drow('TVL now', fmtUsd(r.tvl_usd), 'Sealed snapshot, ' + DATA.as_of),
        drow('Category comps ratio', r.category_ratio.toFixed(2) + '×',
          r.ratio_source === 'category'
            ? cat + ' median of ' + r.ratio_samples + ' live peers with a market cap'
            : 'Global median of ' + r.ratio_samples + ' live anchors; this category had under ' + DATA.model.min_category_samples + ' peers'),
        drow('Seven-day growth', fmtPct(r.change_7d), 'clamped to [' + DATA.model.growth_floor + ', ' + DATA.model.growth_cap + '], times ' + DATA.model.growth_weight + ' → multiplier ' + r.growth_adjust.toFixed(2) + '×'),
        drow('Implied value', fmtUsd(r.implied_value_usd), fmtUsd(r.tvl_usd) + ' × ' + r.category_ratio.toFixed(2) + ' × ' + r.growth_adjust.toFixed(2) + ' = ' + fmtUsd(r.implied_value_usd), true),
        drow('Category base rate', (r.base_rate * 100).toFixed(1) + '%',
          r.odds_source === 'category' && o ? o.live + ' live / ' + (o.live + o.pre) + ' live+pre-token in ' + cat : 'Global live share of live+pre-token protocols'),
        drow('Age factor', r.age_factor.toFixed(2) + '×', r.age_days === null ? 'No listing date, so the 0.8 default applies' : fmtAge(r.age_days) + ' with no token → clamp(1.6 − age/900, 0.25, 1.4)'),
        drow('Token odds', fmtOdds(r.token_odds), (r.base_rate * 100).toFixed(1) + '% × ' + r.age_factor.toFixed(2) + ' = ' + fmtOdds(r.token_odds) + ', clamped to 2–92%', true),
        drow('Expected value', fmtUsd(r.expected_value_usd), fmtUsd(r.implied_value_usd) + ' × ' + fmtOdds(r.token_odds) + ' = ' + fmtUsd(r.expected_value_usd), true)
      ),
      el('div', { class: 'verdict-box' }, badge(r.verdict), el('div', null, el('b', { text: 'Verdict: ' + r.verdict + '. ' }), why)),
      drow('Net $/hour', fmtPerHour(r.net_per_hour_usd), '1% of ' + fmtUsd(r.expected_value_usd) + ' = ' + fmtUsd(r.expected_value_usd * 0.01) + ' over ' + hours.toFixed(1) + ' work hours (' + r.hold_days + '-day hold, $' + r.capital_usd + ' position)', true),
      el('div', { class: 'section-h' }, el('h3', { text: 'Comparable live peers' }), el('span', { text: peers.length + ' shown · ' + cat })),
      peers.length ? el('table', { class: 'peers' },
        el('thead', null, el('tr', null,
          el('th', { text: 'Protocol' }),
          el('th', { class: 'r', text: 'TVL' }),
          el('th', { class: 'r', text: 'Market cap' }),
          el('th', { class: 'r', text: 'mcap/TVL' })
        )),
        el('tbody', null, peerRows)
      ) : el('p', { class: 'hint', text: 'No live peer in this category, so the global median ratio applies.' })
    );
    var farmCol = el('div', { class: 'drawer-col' },
      el('div', { class: 'section-h' }, el('h3', { text: 'Farm plan' }), el('span', { text: r.hold_days + '-day hold · $' + r.capital_usd + ' position' })),
      el('ol', { class: 'steps' }, steps),
      el('p', { class: 'hint', text: 'Derived only from this protocol’s category, chains, TVL, age and growth. Estimated, not a promise; never pay to claim.' })
    );
    return el('aside', { class: 'drawer', role: 'dialog', 'aria-labelledby': 'detail-title' },
      el('div', { class: 'drawer-head' },
        el('div', null,
          el('div', { class: 'eyebrow', text: 'Rank ' + r.rank + ' of ' + DATA.board_size + (r.watchlist ? ' · watchlist' : '') }),
          el('h2', { id: 'detail-title', text: r.name }),
          el('p', { class: 'sub', text: cat + ' · ' + chainSummary(r) })
        ),
        el('button', { class: 'close', type: 'button', text: 'Close', onclick: closeDetail })
      ),
      el('div', { class: 'drawer-body' }, mainCol, farmCol),
      el('p', { class: 'drawer-foot', text: 'Model ' + DATA.model_version + '. Value = TVL × category comps ratio × growth adjust; odds = category base rate × age factor; expected = value × odds.' })
    );
  }
  function openDetail(slug) {
    state.selected = slug;
    sync();
    refresh();
  }
  function closeDetail() {
    state.selected = null;
    sync();
    refresh();
  }

  // ---------------------------------------------------------------- render
  function refresh() {
    var list = sorted(filtered());
    var host = document.getElementById('board-host');
    if (host) {
      host.textContent = '';
      host.appendChild(boardCard(list));
    }
    var count = document.getElementById('count');
    if (count) {
      count.textContent = '';
      count.appendChild(document.createTextNode('Showing '));
      count.appendChild(el('b', { text: String(list.length) }));
      count.appendChild(document.createTextNode(' of ' + DATA.board_size));
    }
    var overlay = document.getElementById('overlay-host');
    if (overlay) {
      overlay.textContent = '';
      if (state.selected) {
        var r = DATA.rows.filter(function (x) { return x.slug === state.selected; })[0];
        if (r) {
          overlay.appendChild(el('div', { class: 'backdrop', 'aria-hidden': 'true', onclick: closeDetail }));
          overlay.appendChild(drawerNode(r));
        }
      }
    }
  }
  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(masthead());
    shell.appendChild(kpis());
    shell.appendChild(integrity());
    var board = el('section', { class: 'board-section' });
    board.appendChild(toolbar());
    board.appendChild(el('div', { id: 'board-host' }));
    shell.appendChild(board);
    shell.appendChild(methodSection());
    shell.appendChild(el('footer', { class: 'footer' },
      el('p', { class: 'formula-line', text: 'Value = TVL × category comps ratio × growth adjustment; odds = category base rate × age factor; expected = value × odds.' }),
      el('p', { class: 'fine', text: 'Net $/hour prices a 1% community allocation of the expected value over 2.5 + hold/30 hours of work. Farm verdicts need expected value ≥ $5,000 and a non-negative seven-day change; thin starts at $1,000. Model ' + DATA.model_version + ', snapshot ' + DATA.as_of + '. No network and no fetch: every number is read from the sealed snapshot beside the page.' })
    ));
    app.appendChild(shell);
    app.appendChild(el('div', { id: 'overlay-host' }));
    refresh();
  }

  window.addEventListener('hashchange', function () { readHash(); render(); });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.selected) { e.preventDefault(); closeDetail(); }
  });

  readHash();
  render();
})();
