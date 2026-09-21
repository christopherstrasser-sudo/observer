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
import type { BroadcastState, GsiTeam } from "../shared/types";

const emptyState: BroadcastState = {
  gsi: null,
  lastGsiAt: null,
  packetsReceived: 0,
  rejectedPackets: 0,
  lastGsiSource: null,
  serverStartedAt: Date.now()
};

const socket = io({
  transports: ["websocket", "polling"]
});

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

function BroadcastOverlay({ state }: { state: BroadcastState }) {
  const map = state.gsi?.map;
  const ct = map?.team_ct;
  const t = map?.team_t;
  const phase = state.gsi?.phase_countdowns;
  const live = state.lastGsiAt !== null && Date.now() - state.lastGsiAt < 5000;

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
            <strong>{phase?.phase_ends_in ? Number(phase.phase_ends_in).toFixed(1) : "--:--"}</strong>
            <span>{phase?.phase?.replaceAll("_", " ").toUpperCase() || "WAITING FOR GSI"}</span>
          </div>
        </div>

        <div className="scorebug__team scorebug__team--t">
          <span className="scorebug__score">{t?.score ?? 0}</span>
          <strong>{teamLabel(t, "TEAM BRAVO")}</strong>
          <span className="scorebug__side">T</span>
        </div>
      </div>
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
  const gsiLive = state.lastGsiAt !== null && Date.now() - state.lastGsiAt < 5000;
  const players = Object.values(state.gsi?.allplayers ?? {});
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
            <strong>v0.2.0</strong>
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
              <div><span>TIMER</span><strong>{state.gsi?.phase_countdowns?.phase_ends_in ? Number(state.gsi.phase_countdowns.phase_ends_in).toFixed(1) + "s" : "—"}</strong></div>
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
