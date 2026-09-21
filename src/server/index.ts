import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import type { BroadcastState, GsiPayload } from "../shared/types.js";

const PORT = Number(process.env.PORT || 3194);
const HOST = process.env.HOST || "0.0.0.0";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");
const dataPath = path.join(projectRoot, "data");
const tokenPath = path.join(dataPath, "gsi-token.txt");
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
  serverStartedAt: Date.now()
};

app.use(cors());
app.use(express.json({ limit: "2mb" }));

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
    '"Observer v0.2.1"',
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
    version: "0.2.1",
    uptimeSeconds: Math.round(process.uptime()),
    gsiConnected: state.lastGsiAt !== null && Date.now() - state.lastGsiAt < 20_000,
    gsiAuth: true
  });
});

app.get("/api/state", (_req, res) => {
  res.json(state);
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

app.post("/api/gsi", (req, res) => {
  const payload = req.body as GsiPayload;

  if (!tokenMatches(payload.auth?.token)) {
    state.rejectedPackets += 1;
    res.status(401).json({ error: "Invalid GSI token" });
    return;
  }

  state.gsi = payload;
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
