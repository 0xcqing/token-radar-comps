// The token radar's model: one sealed snapshot in, one ranked board out.
//
// A protocol records no token when its record carries no market cap, no CoinGecko id and no symbol.
// It is a subject only when it also carries no bridge, staking, wrapped, exchange or version marker:
// the house rule keeps products of a token that already trades off the board. The watchlist is a
// floor, so its 40 slugs stay even where the rule would exclude one. The board ranks every subject
// (not only the watchlist) by an implied value that is fitted on the snapshot's own live protocols:
//
//   ratio(category) = median(mcap_usd / tvl_usd) of that category's live peers (>= 3 peers), else the
//                     global median ratio
//   growth_adjust   = 1 + clamp(change_7d, -60, 120) / 100 x 0.35
//   implied         = round(tvl_usd x ratio(category) x growth_adjust)
//
// The fit is checked out of sample: the live protocols are split in two by the parity of an FNV-1a hash
// of the slug, each fold predicts the other's market caps from TVL, and the worse fold's median absolute
// percentage error is what the page reports. A second check measures the ranking itself: up to 600
// deterministically hashed pairs of live protocols, counting how often the higher TVL also has the higher
// market cap. Nothing is random and no protocol name is special-cased.
//
// Token odds are the peers' own record: the category's live share of live+pre-token subjects, times an
// age factor. Expected value is implied x odds, and each row's farm plan, net $/hour and verdict follow
// from the protocol's category, chains, TVL, age and growth.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  min_category_samples: number;
  age_factor_base: number;
  age_factor_days: number;
  age_factor_min: number;
  age_factor_max: number;
  unknown_age_factor: number;
  odds_min: number;
  odds_max: number;
  farm_ev_usd: number;
  thin_ev_usd: number;
  allocation: number;
  base_hours: number;
  implied_cap_usd: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.35,
  growth_floor: -60,
  growth_cap: 120,
  min_category_samples: 3,
  age_factor_base: 1.6,
  age_factor_days: 900,
  age_factor_min: 0.25,
  age_factor_max: 1.4,
  unknown_age_factor: 0.8,
  odds_min: 0.02,
  odds_max: 0.92,
  farm_ev_usd: 5000,
  thin_ev_usd: 1000,
  allocation: 0.01,
  base_hours: 2.5,
  implied_cap_usd: 100_000_000_000_000,
};

/** The model's version label: the dashboard names it and the page footer quotes it. */
export const MODEL_VERSION = 'radar-2-comps';

/** The category's fitted comps ratio and the live peers it was fitted on. */
export interface CategoryComp {
  ratio: number;
  count: number;
}

/** One walk-forward fold of the deterministic backtest. */
export interface BacktestFold {
  name: string;
  n_train: number;
  n_test: number;
  median_ape: number;
  within_2x: number;
}

/** The out-of-sample check, reporting the worse of the two folds. */
export interface Backtest {
  n_test: number;
  median_ape: number;
  within_2x: number;
  folds: BacktestFold[];
}

/** The category's live share, the base of its token odds. */
export interface CategoryOdds {
  rate: number;
  live: number;
  pre: number;
}

/** The pairwise ranking test on the live anchors: how often higher TVL means higher market cap. */
export interface RankCheck {
  compared: number;
  concordant: number;
  share: number;
}

/** Everything the page needs to show the model was fitted on the snapshot and tested held-out. */
export interface ModelStats {
  global_median: number;
  global_samples: number;
  by_category: Record<string, CategoryComp>;
  backtest: Backtest;
  rank_check: RankCheck;
  odds_global: number;
  odds_by_category: Record<string, CategoryOdds>;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  token_odds: number;
  expected_value_usd: number;
  verdict: 'farm' | 'thin' | 'skip';
  net_per_hour_usd: number;
  hold_days: number;
  capital_usd: number;
  model: {
    category_ratio: number;
    ratio_samples: number;
    ratio_source: 'category' | 'global';
    growth_pct: number;
    growth_adjust: number;
    base_rate: number;
    odds_source: 'category' | 'global';
    age_factor: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  implied_value_usd: number;
  token_odds: number;
  expected_value_usd: number;
  verdict: 'farm' | 'thin' | 'skip';
  net_per_hour_usd: number;
  hold_days: number;
  capital_usd: number;
  category_ratio: number;
  ratio_samples: number;
  ratio_source: 'category' | 'global';
  growth_pct: number;
  growth_adjust: number;
  base_rate: number;
  odds_source: 'category' | 'global';
  age_factor: number;
  watchlist: boolean;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so it anchors the model and is never ranked. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  ratio: number;
}

/** Everything the dashboard needs: the board, the anchors, the fitted model and its test. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  watchlist_covered: number;
  total_protocols: number;
  pretoken_size: number;
  pretoken_cex: number;
  pretoken_versioned: number;
  token_bearing: number;
  excluded_cex: number;
  excluded_bridge: number;
  excluded_exchange: number;
  excluded_versioned: number;
  already_trading: number;
  board_size: number;
  early_size: number;
  live_size: number;
  model_stats: ModelStats;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round3 = (n: number): number => Math.round(n * 1e3) / 1e3;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round0 = (n: number): number => Math.round(n);

/** A median, or null for no samples. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const a = values.slice().sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 === 1 ? a[mid]! : (a[mid - 1]! + a[mid]!) / 2;
}

/** A whole day count from `as_of` back to `listed_at`, clamped at zero; null when either is absent. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(?:V\d+(?:\.\d+)?|v\d+(?:\.\d+)?|\d+\.\d+)$/;

/** A category that names a bridge, a staking receipt or a wrapped stablecoin: a product, not a subject. */
const BRIDGE_OR_STAKED_CATEGORY = new Set([
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'Stablecoin Wrapper',
]);

/** A whole word wrapped, staked or staking, in any case: a receipt of a token that already trades. */
const WRAPPED_OR_STAKED = /\b(?:wrapped|staked|staking)\b/i;

/** A name that begins with an exchange's own brand: the exchange's product, never a new protocol. */
const EXCHANGE_PREFIX = /^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Why the house rule keeps a pre-token protocol off the board, or null when it is a subject. */
export type ExclusionReason = 'cex' | 'bridge' | 'exchange' | 'versioned';

export function exclusionReason(p: SnapshotProtocol): ExclusionReason | null {
  if (!isPreToken(p)) return null;
  if (p.category === 'CEX') return 'cex';
  if ((p.category !== null && BRIDGE_OR_STAKED_CATEGORY.has(p.category)) || WRAPPED_OR_STAKED.test(p.name)) return 'bridge';
  if (EXCHANGE_PREFIX.test(p.name)) return 'exchange';
  if (VERSIONED.test(p.name)) return 'versioned';
  return null;
}

/** Whether a protocol is a subject the board may rank: pre-token, not a product of a token that trades. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && exclusionReason(p) === null;
}

/** A live-token anchor: a market cap against a positive TVL is the comparable the model learns from. */
function isLiveAnchor(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0;
}

/** A ratio sample. */
interface RatioSample {
  p: SnapshotProtocol;
  ratio: number;
}

/** Per-category medians with a global fallback, and the global sample size. */
interface Fit {
  global: number;
  globalCount: number;
  byCategory: Map<string, CategoryComp>;
}

function fitRatios(samples: RatioSample[], minSamples: number): Fit {
  const all = samples.map((s) => s.ratio);
  const global = median(all) ?? 1;
  const groups = new Map<string, number[]>();
  for (const s of samples) {
    const key = s.p.category ?? '';
    const list = groups.get(key);
    if (list === undefined) groups.set(key, [s.ratio]);
    else list.push(s.ratio);
  }
  const byCategory = new Map<string, CategoryComp>();
  for (const [key, ratios] of groups) {
    if (ratios.length < minSamples) continue;
    const med = median(ratios);
    if (med !== null) byCategory.set(key, { ratio: med, count: ratios.length });
  }
  return { global, globalCount: all.length, byCategory };
}

function ratioFor(p: SnapshotProtocol, fit: Fit, minSamples: number): { ratio: number; samples: number; source: 'category' | 'global' } {
  const comp = fit.byCategory.get(p.category ?? '');
  if (comp !== undefined && comp.count >= minSamples) return { ratio: comp.ratio, samples: comp.count, source: 'category' };
  return { ratio: fit.global, samples: fit.globalCount, source: 'global' };
}

/** FNV-1a over the slug: the deterministic fold split, no Math.random and no clock. */
function fnv1a(slug: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** One fold: fit on `train`, predict each `test` protocol's market cap from its TVL. */
function backtestFold(train: RatioSample[], test: RatioSample[], model: ModelConstants): BacktestFold {
  const fit = fitRatios(train, model.min_category_samples);
  const apes: number[] = [];
  let within = 0;
  for (const t of test) {
    const { ratio } = ratioFor(t.p, fit, model.min_category_samples);
    const predicted = t.p.tvl_usd * ratio;
    const actual = t.p.mcap_usd as number;
    if (actual <= 0) continue;
    apes.push((Math.abs(predicted - actual) / actual) * 100);
    if (predicted >= actual / 2 && predicted <= actual * 2) within++;
  }
  const med = median(apes) ?? 0;
  return {
    name: '',
    n_train: train.length,
    n_test: apes.length,
    median_ape: round1(med),
    within_2x: round3(apes.length === 0 ? 0 : within / apes.length),
  };
}

/**
 * The ranking check: every unordered pair of live anchors, keyed by FNV-1a of the two slugs, keeps the
 * even-hash pairs and takes the first 600 in hash order. Among those with unequal TVL, it counts the
 * pairs whose higher-TVL protocol also has the higher market cap. Deterministic: no clock, no random.
 */
function rankCheck(anchors: RatioSample[], limit = 600): RankCheck {
  const sorted = anchors.slice().sort((a, b) => (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const candidates: { hash: number; a: RatioSample; b: RatioSample }[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]!;
      const b = sorted[j]!;
      const hash = fnv1a(a.p.slug + b.p.slug);
      if ((hash & 1) === 0) candidates.push({ hash, a, b });
    }
  }
  candidates.sort(
    (x, y) =>
      x.hash - y.hash ||
      (x.a.p.slug < y.a.p.slug ? -1 : x.a.p.slug > y.a.p.slug ? 1 : 0) ||
      (x.b.p.slug < y.b.p.slug ? -1 : x.b.p.slug > y.b.p.slug ? 1 : 0),
  );
  let compared = 0;
  let concordant = 0;
  for (const { a, b } of candidates.slice(0, limit)) {
    if (a.p.tvl_usd === b.p.tvl_usd) continue;
    compared++;
    const highTvl = a.p.tvl_usd > b.p.tvl_usd ? a : b;
    const lowTvl = highTvl === a ? b : a;
    if ((highTvl.p.mcap_usd as number) > (lowTvl.p.mcap_usd as number)) concordant++;
  }
  return { compared, concordant, share: compared === 0 ? 0 : round3(concordant / compared) };
}

/** The model fitted on every live anchor, with its deterministic held-out tests. */
function fitModel(protocols: SnapshotProtocol[], model: ModelConstants, watchlist: Set<string>): { fit: Fit; stats: ModelStats } {
  const anchors: RatioSample[] = protocols
    .filter(isLiveAnchor)
    .map((p) => ({ p, ratio: (p.mcap_usd as number) / p.tvl_usd }));
  const fit = fitRatios(anchors, model.min_category_samples);

  // Parity of the FNV-1a low bit: fold A even, fold B odd.
  const foldA = anchors.filter((s) => (fnv1a(s.p.slug) & 1) === 0);
  const foldB = anchors.filter((s) => (fnv1a(s.p.slug) & 1) === 1);
  const aToB = backtestFold(foldA, foldB, model);
  aToB.name = 'fold A -> fold B';
  const bToA = backtestFold(foldB, foldA, model);
  bToA.name = 'fold B -> fold A';

  const by_category: Record<string, CategoryComp> = {};
  const keys = [...fit.byCategory.keys()].sort();
  for (const key of keys) {
    const c = fit.byCategory.get(key)!;
    by_category[key] = { ratio: round4(c.ratio), count: c.count };
  }

  // Token odds: the peers' record. Live share per category, with a global fallback under 3 samples.
  const liveByCat = new Map<string, number>();
  const preByCat = new Map<string, number>();
  let liveTotal = 0;
  let preTotal = 0;
  for (const p of protocols) {
    const key = p.category ?? '';
    if (isLiveAnchor(p)) {
      liveByCat.set(key, (liveByCat.get(key) ?? 0) + 1);
      liveTotal++;
    } else if (isPreToken(p) && (watchlist.has(p.slug) || isRankable(p))) {
      preByCat.set(key, (preByCat.get(key) ?? 0) + 1);
      preTotal++;
    }
  }
  const odds_global = round4(liveTotal + preTotal === 0 ? 0.25 : liveTotal / (liveTotal + preTotal));
  const odds_by_category: Record<string, CategoryOdds> = {};
  const catKeys = new Set<string>([...liveByCat.keys(), ...preByCat.keys()]);
  for (const key of [...catKeys].sort()) {
    const live = liveByCat.get(key) ?? 0;
    const pre = preByCat.get(key) ?? 0;
    const n = live + pre;
    const rate = n >= model.min_category_samples ? live / n : odds_global;
    odds_by_category[key] = { rate: round4(rate), live, pre };
  }

  const stats: ModelStats = {
    global_median: round4(fit.global),
    global_samples: fit.globalCount,
    by_category,
    backtest: {
      n_test: anchors.length,
      median_ape: Math.max(aToB.median_ape, bToA.median_ape),
      within_2x: Math.min(aToB.within_2x, bToA.within_2x),
      folds: [aToB, bToA],
    },
    rank_check: rankCheck(anchors),
    odds_global,
    odds_by_category,
  };
  return { fit, stats };
}

/** The growth adjustment from the seven-day change. */
function growthAdjust(change: number | null, model: ModelConstants): { pct: number; adjust: number } {
  if (change === null) return { pct: 0, adjust: 1 };
  const pct = Math.min(model.growth_cap, Math.max(model.growth_floor, change));
  return { pct, adjust: 1 + (pct / 100) * model.growth_weight };
}

/** The age factor on the token odds: young protocols are likelier to launch within a year. */
function ageFactor(age: number | null, model: ModelConstants): number {
  if (age === null) return model.unknown_age_factor;
  const raw = model.age_factor_base - age / model.age_factor_days;
  return Math.min(model.age_factor_max, Math.max(model.age_factor_min, raw));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the LP receipt.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The kind of weekly action, from the category, for the farm plan's qualifying step. */
function weeklyKind(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'supply or borrow';
  if (c.includes('dex') || c.includes('yield')) return 'liquidity or swap';
  if (c.includes('bridge')) return 'bridge or transfer';
  if (c.includes('staking') || c.includes('restak')) return 'stake or restake';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) return 'trade or hedge';
  if (c.includes('curator') || c.includes('allocator')) return 'vault deposit';
  if (c.includes('stable')) return 'mint or repay';
  return 'deposit or vote';
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time, derived only from the
 * protocol's own record (category, chains, TVL, age, growth), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, change: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = capital >= 150 ? 12 : 8;
  const trend = change === null ? 'with no seven-day reading' : change >= 0 ? 'while the seven-day trend is positive' : 'and cut it if the seven-day trend stays negative';
  return [
    {
      text: `Open a fresh wallet on ${chain} for ${p.name} with about $${capital + gas} in it: $${capital} for the position and $${gas} for gas.`,
      cost: `$${capital + gas} in total, most of it recoverable`,
      time: '10 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital plus about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying ${weeklyKind(p)} action on ${p.name} each week and keep every transaction hash.`,
      cost: 'about $2 to $4 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the $${capital} position for at least ${hold} days ${trend}, so the activity spans several snapshots.`,
      cost: `the $${capital} stays at work`,
      time: `${hold} days`,
    },
    {
      text: `Before withdrawing, open ${p.name}'s own rewards or points page and claim only from the link it publishes; never pay a fee to claim.`,
      cost: 'no fee to check or claim',
      time: '10 minutes',
    },
    {
      text: `Log the wallet, the dates, the position size and every transaction for ${p.name} so the position can be repeated or unwound.`,
      cost: 'nothing but the journal',
      time: '5 minutes',
    },
  ];
}

/** A protocol's whole scored row, before ranking. */
interface Scored {
  p: SnapshotProtocol;
  implied: number;
  odds: number;
  expected: number;
  verdict: 'farm' | 'thin' | 'skip';
  net: number;
  hold: number;
  capital: number;
  age: number | null;
  growthPct: number;
  growthAdjust: number;
  ratio: number;
  ratioSamples: number;
  ratioSource: 'category' | 'global';
  baseRate: number;
  oddsSource: 'category' | 'global';
  oddsAgeFactor: number;
}

/** Score one protocol with the fitted model. */
function scoreProtocol(p: SnapshotProtocol, asOf: string, fit: Fit, stats: ModelStats, model: ModelConstants): Scored {
  const age = ageDays(asOf, p.listed_at);
  const { ratio, samples, source } = ratioFor(p, fit, model.min_category_samples);
  const { pct, adjust } = growthAdjust(p.change_7d, model);
  const implied = Math.min(model.implied_cap_usd, Math.max(1, round0(p.tvl_usd * ratio * adjust)));

  const catOdds = stats.odds_by_category[p.category ?? ''];
  const catTotal = catOdds === undefined ? 0 : catOdds.live + catOdds.pre;
  const baseRate = catOdds !== undefined && catTotal >= model.min_category_samples ? catOdds.rate : stats.odds_global;
  const oddsSource: 'category' | 'global' = catOdds !== undefined && catTotal >= model.min_category_samples ? 'category' : 'global';
  const af = ageFactor(age, model);
  const odds = round3(Math.min(model.odds_max, Math.max(model.odds_min, baseRate * af)));
  const expected = round0(implied * odds);
  const change = p.change_7d ?? 0;
  const verdict: 'farm' | 'thin' | 'skip' = expected >= model.farm_ev_usd && change >= 0 ? 'farm' : expected >= model.thin_ev_usd ? 'thin' : 'skip';
  const hold = holdDaysFor(age);
  const hours = model.base_hours + hold / 30;
  const net = round1((expected * model.allocation) / hours);

  return {
    p,
    implied,
    odds,
    expected,
    verdict,
    net,
    hold,
    capital: capitalFor(p),
    age,
    growthPct: pct,
    growthAdjust: adjust,
    ratio,
    ratioSamples: samples,
    ratioSource: source,
    baseRate,
    oddsSource,
    oddsAgeFactor: af,
  };
}

/** The protocols the board ranks: every pre-token subject plus every watchlist slug, strongest first. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const watchlist = new Set(snapshot.watchlist);
  const { fit, stats } = fitModel(snapshot.protocols, model, watchlist);
  const scored = snapshot.protocols
    .filter((p) => isPreToken(p) && (watchlist.has(p.slug) || isRankable(p)))
    .map((p) => scoreProtocol(p, snapshot.as_of, fit, stats, model));
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const p = s.p;
    const name = p.name.trim().length > 0 ? p.name : p.slug;
    return {
      rank: i + 1,
      slug: p.slug,
      name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
      listed_at: p.listed_at,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.implied,
      token_odds: s.odds,
      expected_value_usd: s.expected,
      verdict: s.verdict,
      net_per_hour_usd: s.net,
      hold_days: s.hold,
      capital_usd: s.capital,
      model: {
        category_ratio: round4(s.ratio),
        ratio_samples: s.ratioSamples,
        ratio_source: s.ratioSource,
        growth_pct: round4(s.growthPct),
        growth_adjust: round4(s.growthAdjust),
        base_rate: round4(s.baseRate),
        odds_source: s.oddsSource,
        age_factor: round4(s.oddsAgeFactor),
        age_days: s.age,
      },
      farm_steps: farmSteps(p, s.age, p.change_7d).map(stepText),
    };
  });
}

/** The live-token anchors, by market cap, for the page's comparable tables. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter(isLiveAnchor)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      change_7d: p.change_7d,
      ratio: round4((p.mcap_usd as number) / p.tvl_usd),
    }));
}

/** A board row's compact form for data.js, farm plan included so the page and board agree. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    token_odds: row.token_odds,
    expected_value_usd: row.expected_value_usd,
    verdict: row.verdict,
    net_per_hour_usd: row.net_per_hour_usd,
    hold_days: row.hold_days,
    capital_usd: row.capital_usd,
    category_ratio: row.model.category_ratio,
    ratio_samples: row.model.ratio_samples,
    ratio_source: row.model.ratio_source,
    growth_pct: row.model.growth_pct,
    growth_adjust: row.model.growth_adjust,
    base_rate: row.model.base_rate,
    odds_source: row.model.odds_source,
    age_factor: row.model.age_factor,
    watchlist: watchlist.has(row.slug),
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const covered = board.filter((r) => watchlist.has(r.slug)).length;
  const early = board.filter((r) => !watchlist.has(r.slug)).length;
  const { stats } = fitModel(snapshot.protocols, model, watchlist);
  const pretoken = snapshot.protocols.filter(isPreToken);

  // Partition the whole snapshot: every protocol lands in exactly one bucket, so the counts add up.
  const counts = { ranked: 0, cex: 0, bridge: 0, exchange: 0, versioned: 0, trading: 0 };
  for (const p of snapshot.protocols) {
    if (!isPreToken(p)) {
      counts.trading++;
      continue;
    }
    if (watchlist.has(p.slug)) {
      counts.ranked++;
      continue;
    }
    const reason = exclusionReason(p);
    if (reason === null) counts.ranked++;
    else if (reason === 'cex') counts.cex++;
    else if (reason === 'bridge') counts.bridge++;
    else if (reason === 'exchange') counts.exchange++;
    else counts.versioned++;
  }
  if (counts.ranked !== board.length) {
    throw new SnapshotError(`accounting: ${counts.ranked} subjects but ${board.length} rows`);
  }

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    watchlist_covered: covered,
    total_protocols: snapshot.protocols.length,
    pretoken_size: pretoken.length,
    pretoken_cex: counts.cex,
    pretoken_versioned: counts.versioned,
    token_bearing: counts.trading,
    excluded_cex: counts.cex,
    excluded_bridge: counts.bridge,
    excluded_exchange: counts.exchange,
    excluded_versioned: counts.versioned,
    already_trading: counts.trading,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    model_stats: stats,
    rows: board.map((r) => radarRow(r, watchlist)),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, implied value and steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board has ${board.length} rows, outside the gate's 100..4000`;
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  const watch = new Set(snapshot.watchlist);
  for (const r of board) {
    if (!watch.has(r.slug) && !isRankable(r)) return `${r.slug} (${r.category ?? 'no category'}) is a product of a token that already trades and cannot be ranked`;
  }
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (r.name.trim().length === 0) return `${r.slug} has an empty name`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (!Number.isInteger(r.rank) || r.rank <= 0) return `${r.slug} has rank ${r.rank}`;
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
