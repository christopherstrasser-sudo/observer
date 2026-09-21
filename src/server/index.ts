import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import type { BroadcastConfig, BroadcastEvent, BroadcastState, GsiPayload, KillfeedEvent } from "../shared/types.js";

const PORT = Number(process.env.PORT || 3194);
const HOST = process.env.HOST || "0.0.0.0";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");
const dataPath = path.join(projectRoot, "data");
const tokenPath = path.join(dataPath, "gsi-token.txt");
const broadcastConfigPath = path.join(dataPath, "broadcast-config.json");
const distPath = path.resolve(__dirname, "../../dist");

function loadOrCreateGsiToken() {
  const envToken = process.env.OBSERVER_GSI_TOKEN?.trim();
  if (envToken) {
    return envToken;
  }

  mkdirSync(dataPath, { recursive: true });

  if (existsSync(tokenPath)) {
    const existing = readFileSync(tokenPath, "utf8").trim();
    if (existing) {
      return existing;
    }
  }

  const token = randomBytes(24).toString("hex");
  writeFileSync(tokenPath, token + "\n", { encoding: "utf8" });
  return token;
}

const GSI_TOKEN = loadOrCreateGsiToken();

const defaultBroadcastConfig: BroadcastConfig = {
  eventName: "OBSERVER MATCH",
  bestOf: 3,
  mapNumber: 1,
  productionStatus: "live",
  team1Side: "CT",
  team1: {
    name: "Team Alpha",
    shortName: "ALPHA",
    color: "#71e7ff",
    logoDataUrl: "",
    seriesWins: 0
  },
  team2: {
    name: "Team Bravo",
    shortName: "BRAVO",
    color: "#ffbd75",
    logoDataUrl: "",
    seriesWins: 0
  }
};

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function cleanText(value: unknown, fallback: string, max = 64) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : fallback;
}

function cleanColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value
    : fallback;
}

function cleanLogo(value: unknown) {
  if (typeof value !== "string") return "";
  if (!value) return "";
  if (!value.startsWith("data:image/")) return "";
  return value.length <= 1_500_000 ? value : "";
}

function sanitizeBroadcastConfig(raw: Partial<BroadcastConfig> | undefined): BroadcastConfig {
  const candidate = raw ?? {};
  const bestOf = candidate.bestOf === 1 || candidate.bestOf === 3 || candidate.bestOf === 5
    ? candidate.bestOf
    : defaultBroadcastConfig.bestOf;
  const productionStatus = candidate.productionStatus === "tactical_pause"
    || candidate.productionStatus === "tech_pause"
    || candidate.productionStatus === "live"
    ? candidate.productionStatus
    : defaultBroadcastConfig.productionStatus;
  const team1Side = candidate.team1Side === "T" ? "T" : "CT";

  return {
    eventName: cleanText(candidate.eventName, defaultBroadcastConfig.eventName, 72),
    bestOf,
    mapNumber: clampInt(candidate.mapNumber, 1, bestOf, 1),
    productionStatus,
    team1Side,
    team1: {
      name: cleanText(candidate.team1?.name, defaultBroadcastConfig.team1.name, 40),
      shortName: cleanText(candidate.team1?.shortName, defaultBroadcastConfig.team1.shortName, 12).toUpperCase(),
      color: cleanColor(candidate.team1?.color, defaultBroadcastConfig.team1.color),
      logoDataUrl: cleanLogo(candidate.team1?.logoDataUrl),
      seriesWins: clampInt(candidate.team1?.seriesWins, 0, 3, 0)
    },
    team2: {
      name: cleanText(candidate.team2?.name, defaultBroadcastConfig.team2.name, 40),
      shortName: cleanText(candidate.team2?.shortName, defaultBroadcastConfig.team2.shortName, 12).toUpperCase(),
      color: cleanColor(candidate.team2?.color, defaultBroadcastConfig.team2.color),
      logoDataUrl: cleanLogo(candidate.team2?.logoDataUrl),
      seriesWins: clampInt(candidate.team2?.seriesWins, 0, 3, 0)
    }
  };
}

function loadBroadcastConfig() {
  mkdirSync(dataPath, { recursive: true });

  if (!existsSync(broadcastConfigPath)) {
    writeFileSync(broadcastConfigPath, JSON.stringify(defaultBroadcastConfig, null, 2) + "\n", "utf8");
    return defaultBroadcastConfig;
  }

  try {
    const parsed = JSON.parse(readFileSync(broadcastConfigPath, "utf8")) as Partial<BroadcastConfig>;
    return sanitizeBroadcastConfig(parsed);
  } catch {
    return defaultBroadcastConfig;
  }
}

function saveBroadcastConfig(config: BroadcastConfig) {
  mkdirSync(dataPath, { recursive: true });
  writeFileSync(broadcastConfigPath, JSON.stringify(config, null, 2) + "\n", "utf8");
}


const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: true,
    credentials: true
  }
});

const state: BroadcastState = {
  gsi: null,
  lastGsiAt: null,
  packetsReceived: 0,
  rejectedPackets: 0,
  lastGsiSource: null,
  broadcastEvents: [],
  killfeed: [],
  config: loadBroadcastConfig(),
  serverStartedAt: Date.now()
};

app.use(cors());
app.use(express.json({ limit: "4mb" }));

function tokenMatches(candidate: unknown) {
  if (typeof candidate !== "string") {
    return false;
  }

  const expected = Buffer.from(GSI_TOKEN);
  const received = Buffer.from(candidate);

  return expected.length === received.length && timingSafeEqual(expected, received);
}

function getDefaultGsiUri(req: express.Request) {
  const configured = process.env.OBSERVER_GSI_URL?.trim();
  if (configured) {
    return configured;
  }

  const hostname = req.hostname || "127.0.0.1";
  return `http://${hostname}:${PORT}/api/gsi`;
}

function normalizeGsiUri(raw: unknown, req: express.Request) {
  const fallback = getDefaultGsiUri(req);
  const candidate = typeof raw === "string" && raw.trim() ? raw.trim() : fallback;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return fallback;
    }
    return parsed.toString();
  } catch {
    return fallback;
  }
}

function buildGsiConfig(uri: string) {
  return [
    '"Observer v0.5.0"',
    "{",
    `  "uri" "${uri}"`,
    '  "timeout" "5.0"',
    '  "buffer" "0.1"',
    '  "throttle" "0.1"',
    '  "heartbeat" "10.0"',
    '  "auth"',
    "  {",
    `    "token" "${GSI_TOKEN}"`,
    "  }",
    '  "data"',
    "  {",
    '    "provider" "1"',
    '    "map" "1"',
    '    "round" "1"',
    '    "player_id" "1"',
    '    "player_state" "1"',
    '    "player_weapons" "1"',
    '    "player_match_stats" "1"',
    '    "allplayers_id" "1"',
    '    "allplayers_state" "1"',
    '    "allplayers_match_stats" "1"',
    '    "allplayers_weapons" "1"',
    '    "allplayers_position" "1"',
    '    "allgrenades" "1"',
    '    "map_round_wins" "1"',
    '    "player_position" "1"',
    '    "bomb" "1"',
    '    "phase_countdowns" "1"',
    "  }",
    "}"
  ].join("\n");
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "observer",
    version: "0.5.0",
    uptimeSeconds: Math.round(process.uptime()),
    gsiConnected: state.lastGsiAt !== null && Date.now() - state.lastGsiAt < 20_000,
    gsiAuth: true
  });
});

app.get("/api/state", (_req, res) => {
  res.json(state);
});

app.get("/api/config", (_req, res) => {
  res.json(state.config);
});

app.put("/api/config", (req, res) => {
  state.config = sanitizeBroadcastConfig(req.body as Partial<BroadcastConfig>);
  saveBroadcastConfig(state.config);
  io.emit("state:update", state);
  res.json(state.config);
});

app.post("/api/config/swap-sides", (_req, res) => {
  state.config = {
    ...state.config,
    team1Side: state.config.team1Side === "CT" ? "T" : "CT"
  };
  saveBroadcastConfig(state.config);
  io.emit("state:update", state);
  res.json(state.config);
});



app.post("/api/events/kill", (req, res) => {
  if (!externalEventAuthorized(req)) {
    res.status(401).json({ error: "Invalid Observer token" });
    return;
  }

  const body = req.body ?? {};
  const killerName = cleanText(body.killerName, "", 64);
  const victimName = cleanText(body.victimName, "", 64);

  if (!killerName || !victimName) {
    res.status(400).json({ error: "killerName and victimName are required" });
    return;
  }

  const killerSide = body.killerSide === "CT" || body.killerSide === "T" ? body.killerSide : undefined;
  const victimSide = body.victimSide === "CT" || body.victimSide === "T" ? body.victimSide : undefined;

  const event = pushKillfeedEvent({
    killerName,
    killerSteamId: typeof body.killerSteamId === "string" ? body.killerSteamId.slice(0, 32) : undefined,
    killerSide,
    victimName,
    victimSteamId: typeof body.victimSteamId === "string" ? body.victimSteamId.slice(0, 32) : undefined,
    victimSide,
    weapon: normalizeWeaponName(body.weapon),
    headshot: Boolean(body.headshot),
    wallbang: Boolean(body.wallbang),
    noscope: Boolean(body.noscope),
    throughSmoke: Boolean(body.throughSmoke),
    source: "external"
  });

  res.status(201).json(event);
});

app.post("/api/events/kill/test", (_req, res) => {
  const players = playerEntries(state.gsi);
  const killer = players.find((player) => player.team === "CT") ?? players[0];
  const victim = players.find((player) => player.team === "T" && player.steamid !== killer?.steamid)
    ?? players.find((player) => player.steamid !== killer?.steamid);

  const event = pushKillfeedEvent({
    killerName: killer?.name || teamName(state.gsi ?? {}, "CT"),
    killerSteamId: killer?.steamid,
    killerSide: killer?.team ?? "CT",
    victimName: victim?.name || teamName(state.gsi ?? {}, "T"),
    victimSteamId: victim?.steamid,
    victimSide: victim?.team ?? "T",
    weapon: "ak47",
    headshot: true,
    wallbang: false,
    noscope: false,
    throughSmoke: false,
    source: "test"
  });

  res.status(201).json(event);
});

app.get("/api/gsi/info", (req, res) => {
  res.json({
    defaultUri: getDefaultGsiUri(req),
    configFileName: "gamestate_integration_observer.cfg",
    authEnabled: true
  });
});

app.get("/api/gsi/config", (req, res) => {
  const uri = normalizeGsiUri(req.query.uri, req);

  res
    .type("text/plain")
    .setHeader("Content-Disposition", 'inline; filename="gamestate_integration_observer.cfg"')
    .send(buildGsiConfig(uri));
});


let eventCounter = 0;

function playerEntries(payload: GsiPayload | null | undefined) {
  return Object.entries(payload?.allplayers ?? {}).map(([steamid, player]) => ({
    ...player,
    steamid: player.steamid ?? steamid
  }));
}

function teamName(payload: GsiPayload, side: "CT" | "T") {
  const team1OnSide = state.config.team1Side === side;
  const configured = team1OnSide ? state.config.team1.name : state.config.team2.name;

  return configured
    || (side === "CT"
      ? payload.map?.team_ct?.name?.trim() || "Counter-Terrorists"
      : payload.map?.team_t?.name?.trim() || "Terrorists");
}


let killfeedCounter = 0;

function pruneKillfeed() {
  const now = Date.now();
  state.killfeed = state.killfeed
    .filter((item) => now - item.createdAt < 10_000)
    .slice(-6);
}

function normalizeWeaponName(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "unknown";
  return value.trim().replace(/^weapon_/, "").slice(0, 48);
}

function activeWeaponName(player: ReturnType<typeof playerEntries>[number] | undefined) {
  if (!player) return "unknown";

  const weapons = Object.values(player.weapons ?? {});
  const active = weapons.find((weapon) => weapon.state === "active")
    ?? weapons.find((weapon) => weapon.type !== "Grenade" && !weapon.name?.includes("c4"));

  return normalizeWeaponName(active?.name);
}

function sameKill(a: KillfeedEvent, b: Pick<KillfeedEvent, "killerName" | "victimName" | "createdAt">) {
  return a.killerName === b.killerName
    && a.victimName === b.victimName
    && Math.abs(a.createdAt - b.createdAt) < 1_500;
}

function pushKillfeedEvent(event: Omit<KillfeedEvent, "id" | "createdAt"> & { createdAt?: number }) {
  pruneKillfeed();

  const createdAt = event.createdAt ?? Date.now();
  const candidate = { ...event, createdAt };

  if (event.source === "gsi_inferred") {
    const exactAlreadyExists = state.killfeed.some(
      (item) => item.source === "external" && sameKill(item, candidate)
    );
    if (exactAlreadyExists) return null;
  }

  if (event.source === "external") {
    state.killfeed = state.killfeed.filter(
      (item) => !(item.source === "gsi_inferred" && sameKill(item, candidate))
    );
  }

  const next: KillfeedEvent = {
    ...event,
    id: `${createdAt}-kill-${killfeedCounter++}`,
    createdAt
  };

  state.killfeed.push(next);
  state.killfeed = state.killfeed.slice(-6);
  io.emit("killfeed:event", next);
  io.emit("state:update", state);
  return next;
}

function detectKillfeed(previous: GsiPayload | null, current: GsiPayload) {
  if (!previous) return;

  const previousPlayers = new Map(
    playerEntries(previous).map((player) => [player.steamid, player] as const)
  );
  const currentPlayers = playerEntries(current);

  const deaths = currentPlayers.filter((player) => {
    const before = previousPlayers.get(player.steamid);
    return (before?.state?.health ?? 0) > 0 && (player.state?.health ?? 0) <= 0;
  });

  const killers = currentPlayers
    .map((player) => {
      const before = previousPlayers.get(player.steamid);
      const killDelta = (player.match_stats?.kills ?? 0) - (before?.match_stats?.kills ?? 0);
      const hsDelta = (player.state?.round_killhs ?? 0) - (before?.state?.round_killhs ?? 0);
      return { player, before, killDelta, hsDelta };
    })
    .filter((entry) => entry.killDelta === 1);

  // GSI has no native kill event. Only infer when the packet transition is unambiguous:
  // exactly one player died and exactly one player gained exactly one kill.
  if (deaths.length !== 1 || killers.length !== 1) return;

  const victim = deaths[0];
  const killerEntry = killers[0];
  const killer = killerEntry.player;

  if (!killer.name || !victim.name || killer.steamid === victim.steamid) return;

  pushKillfeedEvent({
    killerName: killer.name,
    killerSteamId: killer.steamid,
    killerSide: killer.team,
    victimName: victim.name,
    victimSteamId: victim.steamid,
    victimSide: victim.team,
    weapon: activeWeaponName(killer) !== "unknown"
      ? activeWeaponName(killer)
      : activeWeaponName(killerEntry.before),
    headshot: killerEntry.hsDelta > 0,
    wallbang: false,
    noscope: false,
    throughSmoke: false,
    source: "gsi_inferred"
  });
}

function externalEventAuthorized(req: express.Request) {
  const headerToken = req.get("x-observer-token")?.trim();
  const bearer = req.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const bodyToken = typeof req.body?.token === "string" ? req.body.token.trim() : undefined;
  return tokenMatches(headerToken ?? bearer ?? bodyToken);
}

function pushBroadcastEvent(event: Omit<BroadcastEvent, "id" | "createdAt">) {
  const now = Date.now();
  state.broadcastEvents = state.broadcastEvents.filter((item) => now - item.createdAt < 15_000);

  const next: BroadcastEvent = {
    ...event,
    id: `${now}-${eventCounter++}`,
    createdAt: now
  };

  state.broadcastEvents.push(next);
  io.emit("broadcast:event", next);
}

function detectBroadcastEvents(previous: GsiPayload | null, current: GsiPayload) {
  const round = current.map?.round ?? -1;
  const previousRound = previous?.map?.round ?? -1;
  const winner = current.round?.win_team;
  const previousWinner = previous?.round?.win_team;

  if (winner && (winner !== previousWinner || round !== previousRound)) {
    const winners = playerEntries(current).filter((player) => player.team === winner);
    const aliveWinners = winners.filter((player) => (player.state?.health ?? 0) > 0);
    const winnerLabel = teamName(current, winner);

    if (aliveWinners.length === 1) {
      const clutchPlayer = aliveWinners[0];
      pushBroadcastEvent({
        type: "clutch",
        title: "CLUTCH",
        subtitle: `${clutchPlayer.name || "Player"} closes the round for ${winnerLabel}`,
        side: winner,
        playerName: clutchPlayer.name
      });
    } else {
      pushBroadcastEvent({
        type: "round_win",
        title: `${winnerLabel} WIN THE ROUND`,
        subtitle: round >= 0 ? `Round ${round + 1}` : undefined,
        side: winner
      });
    }
  }

  const currentPlayers = playerEntries(current);
  const previousPlayers = new Map(
    playerEntries(previous).map((player) => [player.steamid, player] as const)
  );

  for (const player of currentPlayers) {
    const currentKills = player.state?.round_kills ?? 0;
    const previousKills = previousPlayers.get(player.steamid)?.state?.round_kills ?? 0;

    if (currentKills >= 5 && previousKills < 5) {
      pushBroadcastEvent({
        type: "ace",
        title: "ACE",
        subtitle: `${player.name || "Player"} eliminates the entire enemy team`,
        side: player.team,
        playerName: player.name
      });
    }
  }
}

app.post("/api/gsi", (req, res) => {
  const payload = req.body as GsiPayload;

  if (!tokenMatches(payload.auth?.token)) {
    state.rejectedPackets += 1;
    res.status(401).json({ error: "Invalid GSI token" });
    return;
  }

  const previous = state.gsi;
  detectBroadcastEvents(previous, payload);
  detectKillfeed(previous, payload);

  state.gsi = payload;
  pruneKillfeed();
  state.broadcastEvents = state.broadcastEvents.filter((item) => Date.now() - item.createdAt < 15_000);
  state.lastGsiAt = Date.now();
  state.lastGsiSource = req.ip || req.socket.remoteAddress || null;
  state.packetsReceived += 1;

  io.emit("gsi:update", state);
  res.status(204).end();
});

io.on("connection", (socket) => {
  socket.emit("state:init", state);
});

app.use(express.static(distPath));
app.use((_req, res) => {
  res.sendFile(path.join(distPath, "index.html"), (error) => {
    if (error && !res.headersSent) {
      res.status(404).json({
        error: "Web build not found",
        hint: "Run npm run build first, or use npm run dev during development."
      });
    }
  });
});

httpServer.listen(PORT, HOST, () => {
  console.log("");
  console.log("  OBSERVER // CONTROL ROOM");
  console.log("  ------------------------");
  console.log("  API:     http://localhost:" + PORT);
  console.log("  GSI:     http://<server-ip>:" + PORT + "/api/gsi");
  console.log("  Overlay: http://localhost:" + PORT + "/overlay");
  console.log("  Auth:    enabled");
  console.log("");
});
