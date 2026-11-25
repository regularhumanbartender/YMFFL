import { useState } from "react";
import {
  type Scenario,
  type Snapshot,
  type TradeInput,
  addTrade,
  budgets,
  effectiveOwnership,
  emptyScenario,
  isKept,
  removeTrade,
} from "./model";

const dollars = (n: number) => `$${n.toLocaleString("en-US")}`;

export default function TradeLab({
  snapshot: s,
  scenario,
  simulation,
  save,
  enterSimulator,
}: {
  snapshot: Snapshot;
  scenario: Scenario;
  simulation: boolean;
  save: (scenario: Scenario) => void;
  enterSimulator: () => void;
}) {
  const [from, setFrom] = useState(s.teams[0].teamId);
  const [to, setTo] = useState(s.teams[1].teamId);
  const [fromPlayers, setFromPlayers] = useState<string[]>([]);
  const [toPlayers, setToPlayers] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<TradeInput["cashDirection"]>("fromTo");
  const [error, setError] = useState("");
  const active = simulation ? scenario : emptyScenario();
  const owners = effectiveOwnership(s, active);
  const totals = budgets(s, active);
  const teamName = (id: string) => s.teams.find((t) => t.teamId === id)!.teamName;
  const playerNames = (ids: string[]) =>
    ids.length
      ? ids.map((id) => s.players.find((p) => p.playerId === id)!.playerName).join(", ")
      : "No players";
  const clearPlayers = () => {
    setFromPlayers([]);
    setToPlayers([]);
  };
  return (
    <>
      <div className="section-heading">
        <div>
          <div className="eyebrow">BUILD YOUR NEXT MOVE</div>
          <h2>Player & auction-dollar trade lab</h2>
          <p>Players only, dollars only, or a package. All moves stay on this device.</p>
        </div>
      </div>
      <div className="callout">
        Players move between simulated rosters in trade order. Keeper selections travel with them;
        trades never auto-keep a player. Prices, contracts, eligibility and points ranks stay
        unchanged. You can toggle eligible keepers on the receiving roster. Player moves or later
        keeper decisions may leave a team underfunded; warnings do not invent dollars.
      </div>
      <div className="trade-grid">
        <section className="panel trade-form">
          <h3>Build a hypothetical trade</h3>
          <p>
            Select from the current {simulation ? "simulated" : "published"} rosters. Unequal
            packages are allowed. Published cash transfers are already in the baseline budgets.
          </p>
          {!simulation && (
            <div className="callout">
              <button className="text-button" onClick={enterSimulator}>
                Enter the simulator to model a trade →
              </button>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!simulation) {
                return;
              }
              try {
                save(
                  addTrade(s, scenario, {
                    fromTeamId: from,
                    toTeamId: to,
                    fromPlayerIds: fromPlayers,
                    toPlayerIds: toPlayers,
                    amount: Number(amount),
                    cashDirection: direction,
                  }),
                );
                setError("");
                setAmount("");
                clearPlayers();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Unable to model trade.");
              }
            }}
          >
            {(["A", "B"] as const).map((side) => {
              const id = side === "A" ? from : to;
              const selected = side === "A" ? fromPlayers : toPlayers;
              const setSelected = side === "A" ? setFromPlayers : setToPlayers;
              const roster = s.players
                .filter((p) => owners.get(p.playerId) === id)
                .sort((a, b) => a.playerName.localeCompare(b.playerName));
              const balance = totals.find((t) => t.teamId === id)!;
              return (
                <div key={side} className="trade-package">
                  <label>
                    Team {side}
                    <select
                      value={id}
                      aria-label={`Team ${side}`}
                      disabled={!simulation}
                      onChange={(e) => {
                        (side === "A" ? setFrom : setTo)(e.target.value);
                        clearPlayers();
                        setError("");
                      }}
                    >
                      {s.teams.map((t) => (
                        <option value={t.teamId} key={t.teamId}>
                          {t.teamName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="trade-balance">
                    {dollars(balance.remaining)} remaining · {balance.count} keepers ·{" "}
                    {balance.rosterCount} players
                    {balance.status !== "Ready" && (
                      <strong className="ineligible"> · {balance.status}</strong>
                    )}
                  </p>
                  <fieldset disabled={!simulation} className="player-package">
                    <legend>
                      Team {side} sends players ({selected.length} selected)
                    </legend>
                    <div className="package-options">
                      {roster.length === 0 && <p>No players on this roster.</p>}
                      {roster.map((p) => (
                        <label className="package-player" key={p.playerId}>
                          <input
                            type="checkbox"
                            checked={selected.includes(p.playerId)}
                            aria-label={`Team ${side} sends ${p.playerName}`}
                            onChange={(e) =>
                              setSelected(
                                e.target.checked
                                  ? [...selected, p.playerId]
                                  : selected.filter((id) => id !== p.playerId),
                              )
                            }
                          />
                          <span>
                            <strong>
                              {p.playerName} <span className="subtle">{p.position}</span>
                            </strong>
                            <small>
                              {p.keeperEligible
                                ? `${dollars(p.keeperCost)} keeper cost`
                                : "Ineligible to keep"}
                              {isKept(p, active) ? " · Selected keeper" : " · Not kept"}
                              {p.contractLabel && ` · ${p.contractLabel}`}
                              {p.underContract && " · Locked price"}
                            </small>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>
              );
            })}
            <label>
              Auction dollars
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={amount}
                disabled={!simulation}
                placeholder="Optional · 0 for players only"
                onChange={(e) => setAmount(e.target.value)}
                aria-describedby="cash-help"
              />
            </label>
            <label>
              Cash direction
              <select
                value={direction}
                aria-label="Cash direction"
                disabled={!simulation}
                onChange={(e) => setDirection(e.target.value as TradeInput["cashDirection"])}
              >
                <option value="fromTo">Team A → Team B</option>
                <option value="toFrom">Team B → Team A</option>
              </select>
            </label>
            <p id="cash-help" className="subtle">
              Whole dollars only. New cash must fit the sender’s remaining budget after both player
              packages move. Select a player or add cash; an empty trade is not allowed.
            </p>
            <button className="primary-button" disabled={!simulation} type="submit">
              Add hypothetical trade ↗
            </button>
          </form>
        </section>
        <section className="panel" aria-label="Scenario trade history">
          <div className="panel-heading">
            <h3>Scenario trades</h3>
            <span className="badge">{scenario.trades.length}</span>
          </div>
          {!simulation && scenario.trades.length > 0 && (
            <p className="callout">
              Saved what-ifs below are not applied to the Published baseline.
            </p>
          )}
          <p className="subtle">
            Replayed top to bottom. Remove dependent later player moves first.
          </p>
          {scenario.trades.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">⇄</span>No hypothetical trades yet.
              <p>Try moving players, auction dollars, or both between teams.</p>
            </div>
          ) : (
            scenario.trades.map((t, index) => (
              <article
                className="trade-row"
                key={t.id}
                aria-label={`Hypothetical trade ${index + 1}`}
              >
                <div>
                  <strong>
                    {index + 1}. {teamName(t.fromTeamId)} ⇄ {teamName(t.toTeamId)}
                  </strong>
                  <span>
                    {teamName(t.fromTeamId)} sends: {playerNames(t.fromPlayerIds)}
                  </span>
                  <span>
                    {teamName(t.toTeamId)} sends: {playerNames(t.toPlayerIds)}
                  </span>
                  <span>{dollars(t.amount)} · hypothetical</span>
                  <span>
                    {t.amount > 0
                      ? `Cash: ${teamName(t.cashDirection === "fromTo" ? t.fromTeamId : t.toTeamId)} → ${teamName(t.cashDirection === "fromTo" ? t.toTeamId : t.fromTeamId)}`
                      : "No auction dollars"}
                  </span>
                </div>
                <button
                  className="text-button"
                  disabled={!simulation}
                  onClick={() => {
                    try {
                      save(removeTrade(s, scenario, t.id));
                      clearPlayers();
                      setError("");
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Unable to remove trade.");
                    }
                  }}
                >
                  Remove
                </button>
              </article>
            ))
          )}
          {error && (
            <p role="alert" className="callout warning">
              {error}
            </p>
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
                    {new Date(t.createdAt).toLocaleString()} · {t.status}
                  </span>
                </div>
                <strong>{dollars(t.amount)}</strong>
              </div>
            ))
        )}
      </section>
    </>
  );
}
