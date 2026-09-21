import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import type { BroadcastState, GsiPayload } from "../shared/types.js";

const PORT = Number(process.env.PORT || 3194);
const HOST = process.env.HOST || "0.0.0.0";

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
  serverStartedAt: Date.now()
};

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "observer",
    version: "0.1.0",
    uptimeSeconds: Math.round(process.uptime()),
    gsiConnected: state.lastGsiAt !== null && Date.now() - state.lastGsiAt < 5000
  });
});

app.get("/api/state", (_req, res) => {
  res.json(state);
});

app.get("/api/gsi/config", (_req, res) => {
  res.type("text/plain").send(
    [
      '"Observer v0.1"',
      "{",
      '  "uri" "http://127.0.0.1:3194/api/gsi"',
      '  "timeout" "5.0"',
      '  "buffer" "0.1"',
      '  "throttle" "0.1"',
      '  "heartbeat" "10.0"',
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
      '    "bomb" "1"',
      '    "phase_countdowns" "1"',
      "  }",
      "}"
    ].join("\n")
  );
});

app.post("/api/gsi", (req, res) => {
  const payload = req.body as GsiPayload;

  state.gsi = payload;
  state.lastGsiAt = Date.now();
  state.packetsReceived += 1;

  io.emit("gsi:update", state);
  res.status(204).end();
});

io.on("connection", (socket) => {
  socket.emit("state:init", state);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, "../../dist");

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
  console.log("  GSI:     http://127.0.0.1:" + PORT + "/api/gsi");
  console.log("  Overlay: http://localhost:" + PORT + "/overlay");
  console.log("");
});
