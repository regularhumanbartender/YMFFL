import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  type Scenario,
  type Snapshot,
  addTrade,
  budgets,
  emptyScenario,
  isKept,
  readScenario,
  snapshotSchema,
} from "./model";
import "./style.css";

const dollars = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
const date = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
async function loadSnapshot(): Promise<Snapshot> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/snapshot.json`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("The league snapshot could not be loaded. Please try again shortly.");
  }
  return snapshotSchema.parse(await response.json());
}
export default function App() {
  const result = useQuery({
    queryKey: ["league-snapshot"],
    queryFn: loadSnapshot,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });
  if (result.isPending) {
    return (
      <div className="state-page">
        <div className="brand-mark">Y</div>
        <h1>Opening the playbook…</h1>
        <p>Loading the published league snapshot.</p>
      </div>
    );
  }
  if (result.isError) {
    return (
      <div className="state-page">
        <h1>Snapshot unavailable</h1>
        <p>
          The last publication may still be processing, or its data failed validation. No scenario
          has been changed.
        </p>
        <button onClick={() => void result.refetch()}>Try again</button>
      </div>
    );
  }
  return <LeagueApp key={result.data.snapshotId} snapshot={result.data} />;
}
function LeagueApp({ snapshot: s }: { snapshot: Snapshot }) {
  const [scenario, setScenario] = useState<Scenario>(() => readScenario(s));
  const [simulation, setSimulation] = useState(false);
  const [tab, setTab] = useState("Roster");
  const [teamId, setTeamId] = useState(s.teams[0].teamId);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("All");
  const [onlyKeepers, setOnlyKeepers] = useState(false);
  const [sort, setSort] = useState("name");
  const [from, setFrom] = useState(s.teams[0].teamId);
  const [to, setTo] = useState(s.teams[1].teamId);
  const [amount, setAmount] = useState("");
  const [tradeError, setTradeError] = useState("");
  const [notice, setNotice] = useState("");
  const active = simulation ? scenario : emptyScenario();
  const totals = useMemo(() => budgets(s, active), [s, active]);
  const official = useMemo(() => budgets(s, emptyScenario()), [s]);
  const team = totals.find((t) => t.teamId === teamId)!;
  const baseline = official.find((t) => t.teamId === teamId)!;
  const changed = Object.keys(scenario.keepers).length + scenario.trades.length;
  const save = (next: Scenario) => {
    setScenario(next);
    try {
      localStorage.setItem(`ymffl:scenario:${s.snapshotId}`, JSON.stringify(next));
      setNotice("");
    } catch {
      setNotice("Browser storage is unavailable. Your scenario will last only for this visit.");
    }
  };
  const reset = () => {
    if (
      changed > 0 &&
      window.confirm(
        "Reset all hypothetical keeper decisions and trades to this published snapshot?",
      )
    ) {
      save(emptyScenario());
    }
  };
  const players = s.players
    .filter(
      (p) =>
        p.teamId === teamId &&
        (position === "All" || p.position === position) &&
        p.playerName.toLowerCase().includes(search.toLowerCase()) &&
        (!onlyKeepers || isKept(p, active)),
    )
    .sort((a, b) =>
      sort === "cost"
        ? b.keeperCost - a.keeperCost
        : sort === "points"
          ? (b.fantasyPoints ?? 0) - (a.fantasyPoints ?? 0)
          : a.playerName.localeCompare(b.playerName),
    );
  const teamName = (id: string) => s.teams.find((t) => t.teamId === id)?.teamName ?? id;
  const positions = ["All", ...new Set(s.players.map((p) => p.position))];
  const stale = Date.now() - new Date(s.capturedAt).getTime() > 30 * 60 * 60 * 1000;
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <div className="brand">
            <div className="brand-mark">Y</div>
            <div>
              <strong>YMFFL</strong>
              <span>THE KEEPER LAB</span>
            </div>
          </div>
          <div className="season-tag">
            <span className="live-dot" />
            {s.league.season} PRESEASON
          </div>
          <span className="read-only-label">Public playbook · no sign-in</span>
        </div>
      </header>
      <main>
        <section className="hero">
          <div>
            <div className="eyebrow">YOUR NEXT SEASON STARTS HERE</div>
            <h1>Build your edge.</h1>
            <p>Know your budget. Find your keepers. Make the numbers work.</p>
          </div>
          <div className="snapshot-meta">
            <span className="eyebrow">
              {s.source === "demo" ? "DEMO SNAPSHOT" : "PUBLISHED SNAPSHOT"}
            </span>
            <strong>{date(s.capturedAt)}</strong>
            <span>Daily publication · never live</span>
            <button
              className="text-button"
              onClick={() => {
                if (
                  !simulation ||
                  changed === 0 ||
                  window.confirm(
                    "Load the newest snapshot? Your saved scenario stays with its current baseline and is not migrated.",
                  )
                ) {
                  window.location.reload();
                }
              }}
            >
              Check for a newer snapshot ↗
            </button>
          </div>
        </section>
        {s.source === "demo" && (
          <div className="callout demo">
            <strong>Preview data.</strong> These are illustrative teams and players, not an export
            of your league. Connect the daily publisher to load Foundry data.
          </div>
        )}
        {stale && s.source !== "demo" && (
          <div className="callout warning">
            This snapshot is over 30 hours old. The last successful publication remains available.
          </div>
        )}
        <section className="mode-bar" aria-label="Data mode">
          <div className="segmented">
            <button
              className={!simulation ? "selected" : ""}
              aria-pressed={!simulation}
              onClick={() => setSimulation(false)}
            >
              Published baseline
            </button>
            <button
              className={simulation ? "selected" : ""}
              aria-pressed={simulation}
              onClick={() => setSimulation(true)}
            >
              What-if simulator {changed > 0 && <span className="count">{changed}</span>}
            </button>
          </div>
          <p>
            {simulation
              ? "Your sandbox. Nothing is submitted to Foundry."
              : "Official snapshot. Switch to the simulator to experiment."}
          </p>
          {changed > 0 && (
            <button className="text-button reset" onClick={reset}>
              Reset scenario
            </button>
          )}
        </section>
        {simulation && (
          <div className="scenario-banner">
            <span className="scenario-dot" />
            <strong>HYPOTHETICAL</strong>
            <span>Saved on this device · pinned to this snapshot · no writeback</span>
          </div>
        )}
        {notice && (
          <p role="status" className="callout warning">
            {notice}
          </p>
        )}
        <nav className="tabs" aria-label="Main navigation">
          {["Roster", "League budgets", "Trade lab", "Rules"].map((name, i) => (
            <button
              key={name}
              className={tab === name ? "active" : ""}
              aria-current={tab === name ? "page" : undefined}
              onClick={() => setTab(name)}
            >
              <span className="tab-icon" aria-hidden="true">
                {["▦", "◫", "⇄", "☷"][i]}
              </span>
              {name}
            </button>
          ))}
        </nav>
        {tab === "Roster" && (
          <>
            <div className="section-heading">
              <div>
                <div className="eyebrow">THE ROSTER ROOM</div>
                <h2>{team.teamName}</h2>
              </div>
              <label className="team-picker">
                <span className="sr-only">Select team</span>
                <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                  {s.teams.map((t) => (
                    <option key={t.teamId} value={t.teamId}>
                      {t.teamName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <section className="metrics" aria-label="Selected team budget">
              <Metric
                label="AUCTION BUDGET LEFT"
                value={dollars(team.remaining)}
                detail={
                  simulation
                    ? `${team.remaining - baseline.remaining >= 0 ? "+" : ""}${dollars(team.remaining - baseline.remaining)} vs. published`
                    : `${dollars(team.preBudget)} before keepers`
                }
                featured
              />
              <Metric
                label="KEEPER INVESTMENT"
                value={dollars(team.spend)}
                detail={`${team.count} players committed`}
              />
              <Metric
                label="OPEN ROSTER SPOTS"
                value={String(team.open)}
                detail={`of ${s.league.rosterSize} total spots`}
              />
              <Metric
                label="MAXIMUM NEXT BID"
                value={dollars(team.maxBid)}
                detail={`${dollars(s.league.minimumBid)} reserved per other open spot`}
              />
            </section>
            <div className={`budget-health ${team.status !== "Ready" ? "bad" : ""}`}>
              <span className="live-dot" />
              <strong>{team.status}</strong>
              <span>
                {team.status === "Ready"
                  ? `${dollars(team.average)} average per open spot`
                  : "Review your keeper selections or budget before the auction."}
              </span>
            </div>
            <section className="panel roster-panel">
              <div className="panel-heading">
                <div>
                  <h3>Roster & keeper decisions</h3>
                  <p>
                    {simulation
                      ? "Toggle an eligible player to model keeping them."
                      : "Published decisions are read-only."}
                  </p>
                </div>
                <span className="subtle">{players.length} players</span>
              </div>
              <div className="filters">
                <label className="search-field">
                  <span aria-hidden="true">⌕</span>
                  <input
                    aria-label="Search players"
                    placeholder="Find a player…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <label>
                  <span className="sr-only">Position</span>
                  <select value={position} onChange={(e) => setPosition(e.target.value)}>
                    {positions.map((p) => (
                      <option key={p} value={p}>
                        {p === "All" ? "All positions" : p}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="sr-only">Sort players</span>
                  <select value={sort} onChange={(e) => setSort(e.target.value)}>
                    <option value="name">Name A–Z</option>
                    <option value="cost">Keeper cost ↓</option>
                    <option value="points">Fantasy points ↓</option>
                  </select>
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={onlyKeepers}
                    onChange={(e) => setOnlyKeepers(e.target.checked)}
                  />
                  Keepers only
                </label>
              </div>
              <div className="roster-columns" aria-hidden="true">
                <span>PLAYER / CONTRACT</span>
                <span>PRIOR PRICE</span>
                <span>KEEPER COST</span>
                <span>KEEP</span>
              </div>
              <div className="player-list">
                {players.length === 0 && (
                  <div className="empty-state">No players match these filters.</div>
                )}
                {players.map((p) => {
                  const kept = isKept(p, active);
                  const modified = simulation && kept !== p.isKeeper;
                  return (
                    <article key={p.playerId} className={`player-row ${kept ? "kept" : ""}`}>
                      <div className="player-identity">
                        <span className={`position-badge pos-${p.position}`}>{p.position}</span>
                        <div>
                          <strong>
                            {p.playerName}
                            {modified && (
                              <span className="modified-dot" title="Changed in this scenario" />
                            )}
                          </strong>
                          <div className="player-detail">
                            {p.contractLabel || "No contract label"}
                            {p.positionRank ? ` · #${p.positionRank} ${p.position}` : ""}
                            {p.underContract && <span className="tag">Locked price</span>}
                            {p.overrideEnabled && <span className="tag">Manual cost</span>}
                          </div>
                          {!p.keeperEligible && (
                            <div className="ineligible">
                              {p.eligibilityNote || "Not eligible to keep"}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="prior-price">
                        <span className="mobile-label">Prior </span>
                        {dollars(p.auctionValue)}
                      </div>
                      <div className="keeper-price">
                        <span className="mobile-label">Keeper </span>
                        {p.keeperEligible ? dollars(p.keeperCost) : "Ineligible"}
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={kept}
                        aria-label={`${kept ? "Remove" : "Keep"} ${p.playerName}`}
                        className={`keeper-switch ${kept ? "on" : ""}`}
                        disabled={!simulation || (!p.keeperEligible && !kept)}
                        title={
                          !simulation
                            ? "Switch to What-if simulator to change decisions"
                            : !p.keeperEligible
                              ? p.eligibilityNote
                              : "Changes only your local scenario"
                        }
                        onClick={() => {
                          const keepers = { ...scenario.keepers };
                          if (!kept === p.isKeeper) {
                            delete keepers[p.playerId];
                          } else {
                            keepers[p.playerId] = !kept;
                          }
                          save({ ...scenario, keepers });
                        }}
                      >
                        <span />
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          </>
        )}
        {tab === "League budgets" && (
          <>
            <div className="section-heading">
              <div>
                <div className="eyebrow">THE BIG PICTURE</div>
                <h2>Every team. Every dollar.</h2>
              </div>
              <span className="badge">{simulation ? "Scenario" : "Published"}</span>
            </div>
            <div className="team-grid">
              {totals.map((t) => (
                <article className="panel team-card" key={t.teamId}>
                  <div className="panel-heading">
                    <h3>{t.teamName}</h3>
                    <span className={`status ${t.status !== "Ready" ? "danger" : ""}`}>
                      {t.status}
                    </span>
                  </div>
                  <div className="team-money">
                    {dollars(t.remaining)}
                    <span>remaining</span>
                  </div>
                  <div className="budget-track">
                    <span
                      style={{
                        width: `${Math.max(0, Math.min(100, t.preBudget > 0 ? (t.spend / t.preBudget) * 100 : 100))}%`,
                      }}
                    />
                  </div>
                  <dl className="team-stats">
                    <div>
                      <dt>Keeper spend</dt>
                      <dd>{dollars(t.spend)}</dd>
                    </div>
                    <div>
                      <dt>Open spots</dt>
                      <dd>{t.open}</dd>
                    </div>
                    <div>
                      <dt>Max bid</dt>
                      <dd>{dollars(t.maxBid)}</dd>
                    </div>
                  </dl>
                  <button
                    className="text-button"
                    onClick={() => {
                      setTeamId(t.teamId);
                      setTab("Roster");
                    }}
                  >
                    Explore roster →
                  </button>
                </article>
              ))}
            </div>
          </>
        )}
        {tab === "Trade lab" && (
          <>
            <div className="section-heading">
              <div>
                <div className="eyebrow">MOVE THE MONEY</div>
                <h2>Auction-dollar trade lab</h2>
                <p>
                  Model dollar transfers. Player-for-player trades are not included in this version.
                </p>
              </div>
            </div>
            <div className="trade-grid">
              <section className="panel trade-form">
                <h3>Build a hypothetical trade</h3>
                <p>
                  Published transfers are already reflected in baseline budgets. This form adds only
                  new hypothetical transfers.
                </p>
                {!simulation && (
                  <div className="callout">
                    <button className="text-button" onClick={() => setSimulation(true)}>
                      Enter the simulator to model a trade →
                    </button>
                  </div>
                )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    try {
                      save(addTrade(s, scenario, from, to, Number(amount)));
                      setTradeError("");
                      setAmount("");
                    } catch (error) {
                      setTradeError(
                        error instanceof Error ? error.message : "Unable to model trade.",
                      );
                    }
                  }}
                >
                  <label>
                    Sending team
                    <select
                      value={from}
                      disabled={!simulation}
                      onChange={(e) => setFrom(e.target.value)}
                    >
                      {s.teams.map((t) => (
                        <option value={t.teamId} key={t.teamId}>
                          {t.teamName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="trade-arrow" aria-hidden="true">
                    ↓
                  </div>
                  <label>
                    Receiving team
                    <select
                      value={to}
                      disabled={!simulation}
                      onChange={(e) => setTo(e.target.value)}
                    >
                      {s.teams.map((t) => (
                        <option value={t.teamId} key={t.teamId}>
                          {t.teamName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Auction dollars
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      step="1"
                      value={amount}
                      required
                      disabled={!simulation}
                      placeholder="e.g. 15"
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </label>
                  {tradeError && (
                    <p role="alert" className="ineligible">
                      {tradeError}
                    </p>
                  )}
                  <button className="primary-button" disabled={!simulation} type="submit">
                    Add hypothetical trade ↗
                  </button>
                </form>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h3>Scenario trades</h3>
                  <span className="badge">{scenario.trades.length}</span>
                </div>
                {scenario.trades.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-icon">⇄</span>No hypothetical trades yet.
                    <p>Try moving auction dollars between teams.</p>
                  </div>
                ) : (
                  scenario.trades.map((t) => (
                    <article className="trade-row" key={t.id}>
                      <div>
                        <strong>
                          {teamName(t.fromTeamId)} → {teamName(t.toTeamId)}
                        </strong>
                        <span>{dollars(t.amount)} · hypothetical</span>
                      </div>
                      <button
                        className="text-button"
                        disabled={!simulation}
                        onClick={() =>
                          save({
                            ...scenario,
                            trades: scenario.trades.filter((tr) => tr.id !== t.id),
                          })
                        }
                      >
                        Remove
                      </button>
                    </article>
                  ))
                )}
              </section>
            </div>
            <section className="panel ledger">
              <div className="panel-heading">
                <h3>Published trade ledger</h3>
                <span className="subtle">Read-only</span>
              </div>
              {s.trades.length === 0 ? (
                <div className="empty-state">No recorded trades in this snapshot.</div>
              ) : (
                [...s.trades]
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .map((t) => (
                    <div className="trade-row" key={t.tradeId}>
                      <div>
                        <strong>
                          {teamName(t.fromTeamId)} → {teamName(t.toTeamId)}
                        </strong>
                        <span>
                          {date(t.createdAt)} · {t.status}
                        </span>
                      </div>
                      <strong>{dollars(t.amount)}</strong>
                    </div>
                  ))
              )}
            </section>
          </>
        )}
        {tab === "Rules" && (
          <>
            <div className="section-heading">
              <div>
                <div className="eyebrow">THE PLAYBOOK</div>
                <h2>Know the rules.</h2>
                <p>Published league configuration · {s.rulesVersion}</p>
              </div>
            </div>
            <div className="rules-grid">
              <section className="panel rules-card">
                <h3>Auction fundamentals</h3>
                <dl>
                  <div>
                    <dt>Base team budget</dt>
                    <dd>{dollars(s.league.baseBudget)}</dd>
                  </div>
                  <div>
                    <dt>Roster size</dt>
                    <dd>{s.league.rosterSize}</dd>
                  </div>
                  <div>
                    <dt>Minimum bid</dt>
                    <dd>{dollars(s.league.minimumBid)}</dd>
                  </div>
                </dl>
                <p>
                  Remaining budget = base budget + net adjustments − keeper spend. Maximum bid
                  reserves a minimum bid for each other open slot.
                </p>
              </section>
              <section className="panel rules-card">
                <h3>Offense keeper pricing</h3>
                <p>
                  Rounded maximum of prior price × (1 + rate), prior price + premium, and the
                  minimum price.
                </p>
                <dl>
                  <div>
                    <dt>Elite</dt>
                    <dd>
                      +{s.league.eliteIncrease * 100}% / +{dollars(s.league.elitePremium)} /{" "}
                      {dollars(s.league.eliteMinimum)} floor
                    </dd>
                  </div>
                  <div>
                    <dt>Standard</dt>
                    <dd>
                      +{s.league.standardIncrease * 100}% / +{dollars(s.league.standardPremium)} /{" "}
                      {dollars(s.league.standardMinimum)} floor
                    </dd>
                  </div>
                  <div>
                    <dt>Elite rank cutoffs</dt>
                    <dd>
                      QB {s.league.qbEliteRank} · RB {s.league.rbEliteRank} · WR{" "}
                      {s.league.wrEliteRank} · TE {s.league.teEliteRank}
                    </dd>
                  </div>
                </dl>
              </section>
              <section className="panel rules-card">
                <h3>Contract & eligibility</h3>
                <p>
                  Expired or otherwise ineligible contracts cannot be kept. Eligible manual cost
                  overrides take priority over contract pricing. Otherwise, contract-locked players
                  retain their prior auction price.
                </p>
                <p>
                  All other positions: maximum of prior price + {dollars(s.league.defenseIncrease)}{" "}
                  and {dollars(s.league.defenseMinimum)}.
                </p>
              </section>
              <section className="panel rules-card">
                <h3>A sandbox, not a submission</h3>
                <p>
                  No decisions or trades are sent to Foundry. Scenarios are saved only in this
                  browser and tied to the snapshot you started with.
                </p>
                <p>
                  Daily updates never silently rebase your active scenario. Refreshing loads the
                  latest published snapshot and its separate local scenario.
                </p>
              </section>
            </div>
          </>
        )}
        <footer>
          <strong>
            YMFFL <span> / </span> THE KEEPER LAB
          </strong>
          <p>{s.league.season} · Read-only snapshots. Unlimited what-ifs.</p>
          <span>Built for the next move.</span>
        </footer>
      </main>
    </div>
  );
}
function Metric({
  label,
  value,
  detail,
  featured = false,
}: {
  label: string;
  value: string;
  detail: string;
  featured?: boolean;
}) {
  return (
    <article className={`metric ${featured ? "featured" : ""}`}>
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}
