import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Braces,
  Check,
  ChevronRight,
  CircleDot,
  Clipboard,
  Download,
  Eye,
  Gauge,
  Layers3,
  Link2,
  MonitorUp,
  Radio,
  Settings,
  Shield,
  Sparkles,
  Swords,
  UsersRound,
  Wifi,
  WifiOff
} from "lucide-react";
import { io } from "socket.io-client";
import type { BroadcastEvent, BroadcastState, GsiPlayer, GsiTeam } from "../shared/types";

const emptyState: BroadcastState = {
  gsi: null,
  lastGsiAt: null,
  packetsReceived: 0,
  rejectedPackets: 0,
  lastGsiSource: null,
  broadcastEvents: [],
  serverStartedAt: Date.now()
};

const socket = io({
  transports: ["websocket", "polling"]
});

const GSI_STALE_AFTER_MS = 20_000;

function isGsiFresh(lastGsiAt: number | null) {
  return lastGsiAt !== null && Date.now() - lastGsiAt < GSI_STALE_AFTER_MS;
}

function defaultGsiTarget() {
  const saved = localStorage.getItem("observer:gsi-target");
  if (saved) {
    return saved;
  }

  const hostname = window.location.hostname || "127.0.0.1";
  return `http://${hostname}:3194/api/gsi`;
}

function useBroadcastState() {
  const [state, setState] = useState<BroadcastState>(emptyState);
  const [socketConnected, setSocketConnected] = useState(socket.connected);

  useEffect(() => {
    const init = (next: BroadcastState) => setState(next);
    const update = (next: BroadcastState) => setState(next);
    const connect = () => setSocketConnected(true);
    const disconnect = () => setSocketConnected(false);

    socket.on("state:init", init);
    socket.on("gsi:update", update);
    socket.on("connect", connect);
    socket.on("disconnect", disconnect);

    fetch("/api/state")
      .then((response) => response.json())
      .then(setState)
      .catch(() => undefined);

    return () => {
      socket.off("state:init", init);
      socket.off("gsi:update", update);
      socket.off("connect", connect);
      socket.off("disconnect", disconnect);
    };
  }, []);

  return { state, socketConnected };
}

function teamLabel(team: GsiTeam | undefined, fallback: string) {
  return team?.name?.trim() || fallback;
}

function formatRoundClock(rawSeconds?: string | number) {
  if (rawSeconds === undefined || rawSeconds === null || rawSeconds === "") {
    return "--:--";
  }

  const value = Number(rawSeconds);
  if (!Number.isFinite(value)) {
    return "--:--";
  }

  const totalSeconds = Math.max(0, Math.floor(value));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function weaponLabel(rawName?: string) {
  if (!rawName) return "—";

  const aliases: Record<string, string> = {
    ak47: "AK-47",
    m4a1: "M4A4",
    m4a1_silencer: "M4A1-S",
    awp: "AWP",
    ssg08: "SSG 08",
    aug: "AUG",
    sg556: "SG 553",
    famas: "FAMAS",
    galilar: "GALIL",
    mp9: "MP9",
    mac10: "MAC-10",
    mp7: "MP7",
    mp5sd: "MP5-SD",
    ump45: "UMP-45",
    p90: "P90",
    bizon: "PP-BIZON",
    deagle: "DEAGLE",
    elite: "DUALIES",
    fiveseven: "FIVE-SEVEN",
    cz75a: "CZ75",
    hkp2000: "P2000",
    usp_silencer: "USP-S",
    glock: "GLOCK",
    tec9: "TEC-9",
    p250: "P250",
    revolver: "R8",
    nova: "NOVA",
    xm1014: "XM1014",
    mag7: "MAG-7",
    sawedoff: "SAWED-OFF",
    m249: "M249",
    negev: "NEGEV",
    knife: "KNIFE",
    knife_t: "KNIFE",
    taser: "ZEUS"
  };

  const key = rawName.replace(/^weapon_/, "");
  return aliases[key] ?? key.replaceAll("_", " ").toUpperCase();
}

function utilityLabel(rawName?: string) {
  const key = rawName?.replace(/^weapon_/, "");
  const labels: Record<string, string> = {
    hegrenade: "HE",
    flashbang: "FB",
    smokegrenade: "SG",
    molotov: "MO",
    incgrenade: "IN",
    decoy: "DC"
  };

  return key ? labels[key] ?? null : null;
}

function getActiveWeapon(player: GsiPlayer) {
  const weapons = Object.values(player.weapons ?? {});
  return weapons.find((weapon) => weapon.state === "active")
    ?? weapons.find((weapon) => weapon.type !== "Grenade" && !weapon.name?.includes("c4"))
    ?? null;
}

function getUtility(player: GsiPlayer) {
  const counts = new Map<string, number>();

  for (const weapon of Object.values(player.weapons ?? {})) {
    if (weapon.type !== "Grenade") continue;

    const label = utilityLabel(weapon.name);
    if (!label) continue;

    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return Array.from(counts.entries()).map(([label, count]) => ({ label, count }));
}

function getTeamPlayers(allPlayers: Record<string, GsiPlayer> | undefined, team: "CT" | "T") {
  return Object.entries(allPlayers ?? {})
    .map(([steamid, player]) => ({ ...player, steamid: player.steamid ?? steamid }))
    .filter((player) => player.team === team)
    .sort((a, b) => (a.observer_slot ?? 99) - (b.observer_slot ?? 99));
}

function PlayerCard({
  player,
  side,
  focused
}: {
  player: GsiPlayer;
  side: "CT" | "T";
  focused: boolean;
}) {
  const health = Math.max(0, Math.min(100, player.state?.health ?? 0));
  const armor = Math.max(0, Math.min(100, player.state?.armor ?? 0));
  const alive = health > 0;
  const activeWeapon = getActiveWeapon(player);
  const utility = getUtility(player);
  const hasBomb = Object.values(player.weapons ?? {}).some((weapon) => weapon.name?.includes("c4"));

  return (
    <div
      className={[
        "player-card",
        `player-card--${side.toLowerCase()}`,
        alive ? "is-alive" : "is-dead",
        focused ? "is-focused" : ""
      ].join(" ")}
    >
      <div className="player-card__accent" />

      <div className="player-card__top">
        <div className="player-card__slot">{player.observer_slot ?? "·"}</div>
        <div className="player-card__identity">
          <strong>{player.name || "Unknown"}</strong>
          <span>
            {player.match_stats?.kills ?? 0} K
            <i>/</i>
            {player.match_stats?.deaths ?? 0} D
            <i>/</i>
            {player.match_stats?.assists ?? 0} A
          </span>
        </div>
        <div className="player-card__economy">
          <strong>${(player.state?.money ?? 0).toLocaleString()}</strong>
          <span>EQ ${(player.state?.equip_value ?? 0).toLocaleString()}</span>
        </div>
      </div>

      <div className="player-card__middle">
        <div className="player-card__vitals">
          <div className="vital-number">{health}</div>
          <div className="vital-bars">
            <span className="vital-bars__hp"><i style={{ width: `${health}%` }} /></span>
            <span className="vital-bars__armor"><i style={{ width: `${armor}%` }} /></span>
          </div>
          <div className="armor-value">
            <Shield size={11} />
            {armor}
            {player.state?.helmet ? <b>H</b> : null}
          </div>
        </div>

        <div className="player-card__weapon">
          <strong>{weaponLabel(activeWeapon?.name)}</strong>
          <span>
            {activeWeapon?.ammo_clip !== undefined
              ? `${activeWeapon.ammo_clip}/${activeWeapon.ammo_reserve ?? 0}`
              : alive ? "READY" : "OUT"}
          </span>
        </div>
      </div>

      <div className="player-card__bottom">
        <div className="utility-row">
          {utility.length
            ? utility.map(({ label, count }) => (
                <span key={label}>
                  {label}
                  {count > 1 ? <b>x{count}</b> : null}
                </span>
              ))
            : <span className="utility-empty">NO UTIL</span>}
        </div>
        <div className="status-badges">
          {hasBomb ? <span className="status-badge status-badge--bomb">C4</span> : null}
          {player.state?.defusekit ? <span className="status-badge status-badge--kit">KIT</span> : null}
          {focused ? <span className="status-badge status-badge--focus">OBS</span> : null}
        </div>
      </div>

      {!alive ? <span className="player-card__dead-label">ELIMINATED</span> : null}
    </div>
  );
}

function TeamRail({
  side,
  players,
  focusedSteamId
}: {
  side: "CT" | "T";
  players: GsiPlayer[];
  focusedSteamId?: string;
}) {
  const totalMoney = players.reduce((sum, player) => sum + (player.state?.money ?? 0), 0);
  const alive = players.filter((player) => (player.state?.health ?? 0) > 0).length;

  return (
    <section className={`player-rail player-rail--${side.toLowerCase()}`}>
      <header className="player-rail__header">
        <span>{side === "CT" ? "COUNTER-TERRORISTS" : "TERRORISTS"}</span>
        <div>
          <strong>{alive}/{players.length || 5}</strong>
          <small>${totalMoney.toLocaleString()}</small>
        </div>
      </header>

      <div className="player-rail__cards">
        {players.map((player, index) => (
          <PlayerCard
            key={player.steamid ?? player.name ?? index}
            player={player}
            side={side}
            focused={Boolean(focusedSteamId && player.steamid === focusedSteamId)}
          />
        ))}
      </div>
    </section>
  );
}

function BroadcastEventBanner({ event }: { event: BroadcastEvent }) {
  return (
    <div className={`broadcast-event broadcast-event--${event.type} broadcast-event--${event.side?.toLowerCase() ?? "neutral"}`}>
      <div className="broadcast-event__eyebrow">
        {event.type === "ace" ? "HIGHLIGHT" : event.type === "clutch" ? "ROUND DECIDER" : "ROUND COMPLETE"}
      </div>
      <strong>{event.title}</strong>
      {event.subtitle ? <span>{event.subtitle}</span> : null}
    </div>
  );
}

function BroadcastOverlay({ state }: { state: BroadcastState }) {
  const map = state.gsi?.map;
  const ct = map?.team_ct;
  const t = map?.team_t;
  const phase = state.gsi?.phase_countdowns;
  const live = isGsiFresh(state.lastGsiAt);
  const ctPlayers = getTeamPlayers(state.gsi?.allplayers, "CT");
  const tPlayers = getTeamPlayers(state.gsi?.allplayers, "T");
  const focusedSteamId = state.gsi?.player?.steamid;
  const bombState = state.gsi?.bomb?.state || state.gsi?.round?.bomb;
  const activeEvent = [...(state.broadcastEvents ?? [])]
    .reverse()
    .find((event) => Date.now() - event.createdAt < 5_500);

  useEffect(() => {
    document.documentElement.classList.add("overlay-mode");
    document.body.classList.add("overlay-mode");
    return () => {
      document.documentElement.classList.remove("overlay-mode");
      document.body.classList.remove("overlay-mode");
    };
  }, []);

  return (
    <main className="broadcast-stage">
      <div className={"scorebug " + (!live ? "scorebug--waiting" : "")}>
        <div className="scorebug__team scorebug__team--ct">
          <span className="scorebug__side">CT</span>
          <strong>{teamLabel(ct, "TEAM ALPHA")}</strong>
          <span className="scorebug__score">{ct?.score ?? 0}</span>
        </div>

        <div className="scorebug__center">
          <div className="scorebug__round">
            <span>{map?.name?.replace("de_", "").toUpperCase() || "OBSERVER"}</span>
            <strong>{formatRoundClock(phase?.phase_ends_in)}</strong>
            <span>{phase?.phase?.replaceAll("_", " ").toUpperCase() || "WAITING FOR GSI"}</span>
          </div>
          {bombState && bombState !== "undefined" ? (
            <div className={`bomb-state bomb-state--${bombState}`}>{bombState.toUpperCase()}</div>
          ) : null}
        </div>

        <div className="scorebug__team scorebug__team--t">
          <span className="scorebug__score">{t?.score ?? 0}</span>
          <strong>{teamLabel(t, "TEAM BRAVO")}</strong>
          <span className="scorebug__side">T</span>
        </div>
      </div>

      {activeEvent ? <BroadcastEventBanner event={activeEvent} /> : null}

      {ctPlayers.length ? (
        <TeamRail side="CT" players={ctPlayers} focusedSteamId={focusedSteamId} />
      ) : null}

      {tPlayers.length ? (
        <TeamRail side="T" players={tPlayers} focusedSteamId={focusedSteamId} />
      ) : null}
    </main>
  );
}

function StatusPill({
  active,
  activeText,
  inactiveText
}: {
  active: boolean;
  activeText: string;
  inactiveText: string;
}) {
  return (
    <span className={"status-pill " + (active ? "is-active" : "")}>
      <span className="status-dot" />
      {active ? activeText : inactiveText}
    </span>
  );
}

function ControlRoom({ state, socketConnected }: { state: BroadcastState; socketConnected: boolean }) {
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [gsiTarget, setGsiTarget] = useState(defaultGsiTarget);
  const map = state.gsi?.map;
  const ct = map?.team_ct;
  const t = map?.team_t;
  const gsiLive = isGsiFresh(state.lastGsiAt);
  const players = Object.values(state.gsi?.allplayers ?? {});
  const hasFullObserverData = players.length > 0;
  const hasBasicGsiData = state.packetsReceived > 0;
  const aliveCt = players.filter((player) => player.team === "CT" && (player.state?.health ?? 0) > 0).length;
  const aliveT = players.filter((player) => player.team === "T" && (player.state?.health ?? 0) > 0).length;

  useEffect(() => {
    localStorage.setItem("observer:gsi-target", gsiTarget);
  }, [gsiTarget]);

  const uptime = useMemo(() => {
    const minutes = Math.floor((Date.now() - state.serverStartedAt) / 60000);
    return minutes < 1 ? "< 1 min" : minutes + " min";
  }, [state.serverStartedAt, state.packetsReceived]);

  async function getGsiConfig() {
    const response = await fetch("/api/gsi/config?uri=" + encodeURIComponent(gsiTarget));
    if (!response.ok) {
      throw new Error("Could not generate GSI config");
    }
    return response.text();
  }

  async function copyGsi() {
    const value = await getGsiConfig();
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function downloadGsi() {
    const value = await getGsiConfig();
    const blob = new Blob([value], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "gamestate_integration_observer.cfg";
    anchor.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
    window.setTimeout(() => setDownloaded(false), 1600);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Eye size={22} /></div>
          <div>
            <strong>OBSERVER</strong>
            <span>BROADCAST SYSTEM</span>
          </div>
        </div>

        <nav className="nav">
          <span className="nav-section">CONTROL</span>
          <button className="nav-item is-active"><Gauge size={18} />Overview</button>
          <button className="nav-item"><Swords size={18} />Match</button>
          <button className="nav-item"><UsersRound size={18} />Teams</button>
          <span className="nav-section">PRODUCTION</span>
          <button className="nav-item"><MonitorUp size={18} />HUD Studio</button>
          <button className="nav-item"><Layers3 size={18} />Scenes</button>
          <button className="nav-item"><Sparkles size={18} />Triggers</button>
        </nav>

        <div className="sidebar-footer">
          <button className="nav-item"><Settings size={18} />Settings</button>
          <div className="build-chip">
            <span>LOCAL CORE</span>
            <strong>v0.3.0</strong>
          </div>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <span className="eyebrow">PRODUCTION / OVERVIEW</span>
            <h1>Control Room</h1>
          </div>
          <div className="topbar-status">
            <StatusPill active={socketConnected} activeText="Realtime online" inactiveText="Realtime offline" />
            <a href="/overlay" target="_blank" className="ghost-button">
              Open overlay <ChevronRight size={16} />
            </a>
          </div>
        </header>

        <section className="hero">
          <div className="hero-glow" />
          <div className="hero-copy">
            <span className="hero-kicker"><Radio size={15} /> LIVE PRODUCTION ENGINE</span>
            <h2>Your match.<br /><em>One control surface.</em></h2>
            <p>
              Observer is running locally and ready to turn CS2 game state into
              broadcast graphics, operator controls and realtime overlays.
            </p>
            <div className="hero-actions">
              <StatusPill active={gsiLive} activeText="CS2 data live" inactiveText="Waiting for CS2" />
              <span className="hero-endpoint">{gsiTarget.replace(/^https?:\/\//, "")}</span>
            </div>
          </div>

          <div className="signal-orb" aria-hidden="true">
            <div className="signal-orb__ring signal-orb__ring--one" />
            <div className="signal-orb__ring signal-orb__ring--two" />
            <div className="signal-orb__core"><Eye size={40} /></div>
          </div>
        </section>

        <section className="metric-grid">
          <article className="metric-card">
            <div className="metric-icon"><Activity size={19} /></div>
            <div><span>GSI STATUS</span><strong>{gsiLive ? "Receiving" : "Standby"}</strong></div>
            <small>{state.packetsReceived.toLocaleString()} accepted</small>
          </article>
          <article className="metric-card">
            <div className="metric-icon"><Wifi size={19} /></div>
            <div><span>REALTIME</span><strong>{socketConnected ? "Connected" : "Offline"}</strong></div>
            <small>Socket.IO</small>
          </article>
          <article className="metric-card">
            <div className="metric-icon"><CircleDot size={19} /></div>
            <div><span>MATCH</span><strong>{map?.phase || "No match"}</strong></div>
            <small>{map?.name || "Waiting for map"}</small>
          </article>
          <article className="metric-card">
            <div className="metric-icon"><Shield size={19} /></div>
            <div><span>CORE UPTIME</span><strong>{uptime}</strong></div>
            <small>{state.rejectedPackets ? state.rejectedPackets + " rejected" : "Auth protected"}</small>
          </article>
        </section>

        <section className="workspace-grid">
          <article className="panel match-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">MATCH PULSE</span>
                <h3>{map?.name ? map.name.replace("de_", "").toUpperCase() : "No active map"}</h3>
              </div>
              <StatusPill active={gsiLive} activeText="Live" inactiveText="Idle" />
            </div>

            <div className="versus">
              <div className="team team--ct">
                <span className="team-side">COUNTER-TERRORISTS</span>
                <strong>{teamLabel(ct, "TEAM ALPHA")}</strong>
                <div className="team-meta">{aliveCt || 0} alive</div>
              </div>
              <div className="score">
                <span>{ct?.score ?? 0}</span>
                <small>ROUND {map?.round !== undefined ? map.round + 1 : "--"}</small>
                <span>{t?.score ?? 0}</span>
              </div>
              <div className="team team--t">
                <span className="team-side">TERRORISTS</span>
                <strong>{teamLabel(t, "TEAM BRAVO")}</strong>
                <div className="team-meta">{aliveT || 0} alive</div>
              </div>
            </div>

            <div className="match-strip">
              <div><span>PHASE</span><strong>{state.gsi?.phase_countdowns?.phase?.replaceAll("_", " ") || "Waiting"}</strong></div>
              <div><span>TIMER</span><strong>{formatRoundClock(state.gsi?.phase_countdowns?.phase_ends_in)}</strong></div>
              <div><span>BOMB</span><strong>{state.gsi?.bomb?.state || state.gsi?.round?.bomb || "—"}</strong></div>
              <div><span>SOURCE</span><strong>{state.lastGsiSource || "—"}</strong></div>
            </div>
          </article>

          <article className="panel setup-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">FIRST CONNECTION</span>
                <h3>Connect CS2</h3>
              </div>
              {gsiLive ? <Check size={20} /> : <Braces size={20} />}
            </div>

            <p className="muted">
              Enter the address your CS2 computer can reach. Use the server's LAN IP
              when both machines share a network, or its Tailscale IP when they do not.
            </p>

            {hasBasicGsiData && !hasFullObserverData ? (
              <div className="gsi-diagnostic">
                <div className="gsi-diagnostic__icon"><Eye size={17} /></div>
                <div>
                  <strong>Basic GSI connected — observer data missing</strong>
                  <span>
                    Score and map data are arriving. Full player panels, round timer,
                    weapons and utility appear when this CS2 client is spectating a match,
                    demo or CSTV/GOTV feed.
                  </span>
                </div>
              </div>
            ) : null}

            {hasFullObserverData ? (
              <div className="gsi-diagnostic gsi-diagnostic--ok">
                <div className="gsi-diagnostic__icon"><Check size={17} /></div>
                <div>
                  <strong>Full observer feed detected</strong>
                  <span>{players.length} players are available to the broadcast HUD.</span>
                </div>
              </div>
            ) : null}

            <label className="endpoint-field">
              <span><Link2 size={14} /> GSI TARGET URL</span>
              <input
                value={gsiTarget}
                onChange={(event) => setGsiTarget(event.target.value)}
                spellCheck={false}
                placeholder="http://192.168.1.50:3194/api/gsi"
              />
            </label>

            <div className="config-actions">
              <button className="config-button" onClick={copyGsi}>
                <span>
                  <Clipboard size={18} />
                  <span>
                    <small>GAMESTATE CONFIG</small>
                    <strong>{copied ? "Copied to clipboard" : "Copy config"}</strong>
                  </span>
                </span>
                <ChevronRight size={18} />
              </button>

              <button className="config-button config-button--secondary" onClick={downloadGsi}>
                <span>
                  <Download size={18} />
                  <span>
                    <small>READY TO DROP IN</small>
                    <strong>{downloaded ? "Downloaded" : "Download .cfg"}</strong>
                  </span>
                </span>
              </button>
            </div>

            <div className="path-box">
              <span>TARGET FILE</span>
              <code>game\csgo\cfg\gamestate_integration_observer.cfg</code>
            </div>
          </article>
        </section>

        <footer className="footer">
          <span>OBSERVER // LOCAL BROADCAST CORE</span>
          <span className={socketConnected ? "footer-live" : ""}>
            {socketConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
            {socketConnected ? "Realtime channel healthy" : "Realtime channel offline"}
          </span>
        </footer>
      </main>
    </div>
  );
}

export default function App() {
  const { state, socketConnected } = useBroadcastState();
  const isOverlay = window.location.pathname.startsWith("/overlay");

  if (isOverlay) {
    return <BroadcastOverlay state={state} />;
  }

  return <ControlRoom state={state} socketConnected={socketConnected} />;
}
