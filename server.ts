import express, { Request, Response, NextFunction } from "express";
import http from "http";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";

/**
 * ====================================================================================
 * AI STUDIO PREVIEW BACKEND (PREVIEW ONLY)
 * 
 * NOTICE:
 * This Express backend (server.ts) is strictly used for AI Studio Preview sessions.
 * It is completely isolated from the production Yimly Home Core backend.
 * 
 * PRODUCTION BACKEND:
 * The production and launched deployment MUST execute the Python FastAPI backend:
 *   uvicorn app.main:app --host 0.0.0.0 --port 3000
 * 
 * DO NOT use this file in production. Production reads real HA Companion App telemetry
 * from SQLite (yimly_home.db) and contains ZERO preview/fake coordinates.
 * ====================================================================================
 */

const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || "yimly_home_preview_secret_key_2026";
const DATA_FILE = path.join(process.cwd(), "yimly_store_preview.json");

// Core Interfaces
export interface UserData {
  id: number;
  username: string;
  password_hash: string;
  display_name: string;
  avatar_color?: string | null;
  map_style?: string | null;
  created_at: string;
}

export interface CircleData {
  id: number;
  name: string;
  owner_id: number;
  invite_code: string;
  created_at: string;
}

export interface CircleMemberData {
  circle_id: number;
  user_id: number;
}

export interface EntityStateData {
  entity_id: string;
  user_id: number;
  domain: string;
  state: string;
  attributes: Record<string, any>;
  latitude?: number | null;
  longitude?: number | null;
  last_updated: string;
}

export interface LocationHistoryEntry {
  id: string;
  entity_id: string;
  user_id: number;
  latitude: number;
  longitude: number;
  battery_level?: number;
  accuracy?: number;
  timestamp: string;
}

export interface YimlyPreviewDatabase {
  users: UserData[];
  circles: CircleData[];
  circle_members: CircleMemberData[];
  entity_states: EntityStateData[];
  location_history: LocationHistoryEntry[];
}

// Data Store Management (Isolated Preview File Store)
function loadDB(): YimlyPreviewDatabase {
  if (!fs.existsSync(DATA_FILE)) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync("password", salt);
    
    // Seed preview-only data for interactive AI Studio testing
    const initialDB: YimlyPreviewDatabase = {
      users: [
        {
          id: 1,
          username: "admin@yimly.home",
          password_hash: hash,
          display_name: "Yimly Admin (Preview)",
          avatar_color: "#E2D9F3",
          created_at: new Date().toISOString()
        },
        {
          id: 2,
          username: "member@yimly.home",
          password_hash: hash,
          display_name: "Circle Member (Preview)",
          avatar_color: "#fbcfe8",
          created_at: new Date().toISOString()
        }
      ],
      circles: [
        {
          id: 1,
          name: "Yimly Family Circle (Preview)",
          owner_id: 1,
          invite_code: "YIMLY-PREVIEW-HQ",
          created_at: new Date().toISOString()
        }
      ],
      circle_members: [
        { circle_id: 1, user_id: 1 },
        { circle_id: 1, user_id: 2 }
      ],
      entity_states: [
        {
          entity_id: "device_tracker.admin_preview_phone",
          user_id: 1,
          domain: "device_tracker",
          state: "home",
          attributes: { friendly_name: "Admin's Preview Phone", battery_level: 95, gps_accuracy: 5 },
          latitude: 37.7749,
          longitude: -122.4194,
          last_updated: new Date().toISOString()
        },
        {
          entity_id: "device_tracker.member_preview_phone",
          user_id: 2,
          domain: "device_tracker",
          state: "not_home",
          attributes: { friendly_name: "Member's Preview Phone", battery_level: 82, gps_accuracy: 10 },
          latitude: 37.7833,
          longitude: -122.4167,
          last_updated: new Date().toISOString()
        }
      ],
      location_history: []
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialDB, null, 2));
    return initialDB;
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      users: parsed.users || [],
      circles: parsed.circles || [],
      circle_members: parsed.circle_members || [],
      entity_states: parsed.entity_states || [],
      location_history: parsed.location_history || []
    };
  } catch (err) {
    return {
      users: [],
      circles: [],
      circle_members: [],
      entity_states: [],
      location_history: []
    };
  }
}

function saveDB(db: YimlyPreviewDatabase) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

let db = loadDB();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

// WebSocket Setup for Real-time Core updates
const wss = new WebSocketServer({ noServer: true });
const connectedClients = new Set<WebSocket>();

wss.on("connection", (ws: WebSocket) => {
  connectedClients.add(ws);
  ws.send(JSON.stringify({ type: "auth_required", ha_version: "2026.3.0" }));

  ws.on("message", (message: string) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === "auth") {
        ws.send(JSON.stringify({ type: "auth_ok", ha_version: "2026.3.0" }));
      } else if (data.type === "subscribe_events") {
        ws.send(JSON.stringify({ id: data.id, type: "result", success: true, result: null }));
      }
    } catch (e) {
      // Ignore invalid JSON
    }
  });

  ws.on("close", () => {
    connectedClients.delete(ws);
  });
});

server.on("upgrade", (request, socket, head) => {
  const pathname = request.url ? new URL(request.url, `http://${request.headers.host}`).pathname : "";
  if (pathname === "/api/websocket" || pathname === "/api/websocket/") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

function broadcastStateUpdate(event: any) {
  const payload = JSON.stringify({ type: "event", event });
  connectedClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// Authentication Middleware
export interface AuthRequest extends Request {
  user?: UserData;
}

function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ detail: "Authentication required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: string | number };
    const userId = Number(decoded.sub);
    db = loadDB();
    const found = db.users.find((u) => u.id === userId);
    if (!found) {
      return res.status(401).json({ detail: "User not found" });
    }
    req.user = found;
    next();
  } catch (err) {
    return res.status(401).json({ detail: "Invalid or expired token" });
  }
}

// System / Setup status endpoints
app.get("/api/setup/status", (req, res) => {
  db = loadDB();
  res.json({ is_initialized: db.users.length > 0 });
});

app.post("/api/setup/register", (req, res) => {
  const { username, password, display_name } = req.body;
  if (!username || !password || !display_name) {
    return res.status(400).json({ detail: "Username, password, and display name are required" });
  }

  db = loadDB();
  const salt = bcrypt.genSaltSync(10);
  const password_hash = bcrypt.hashSync(password, salt);
  const newUser: UserData = {
    id: db.users.length + 1,
    username,
    password_hash,
    display_name,
    avatar_color: "#E2D9F3",
    created_at: new Date().toISOString()
  };

  db.users.push(newUser);

  // Auto-create initial Family Circle
  const initialCircle: CircleData = {
    id: db.circles.length + 1,
    name: `${display_name}'s Family Circle`,
    owner_id: newUser.id,
    invite_code: "YIMLY-" + crypto.randomBytes(3).toString("hex").toUpperCase(),
    created_at: new Date().toISOString()
  };

  db.circles.push(initialCircle);
  db.circle_members.push({ circle_id: initialCircle.id, user_id: newUser.id });
  saveDB(db);

  const token = jwt.sign({ sub: String(newUser.id) }, JWT_SECRET, { expiresIn: "30d" });

  res.json({
    access_token: token,
    token_type: "Bearer",
    user: {
      id: newUser.id,
      username: newUser.username,
      display_name: newUser.display_name,
      avatar_color: newUser.avatar_color
    }
  });
});

// Authentication Routes
app.post("/api/auth/register", (req, res) => {
  const { username, password, display_name } = req.body;
  if (!username || !password || !display_name) {
    return res.status(400).json({ detail: "Username, password, and display name are required" });
  }

  db = loadDB();
  if (db.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ detail: "Username is already registered" });
  }

  const salt = bcrypt.genSaltSync(10);
  const password_hash = bcrypt.hashSync(password, salt);
  const newUser: UserData = {
    id: db.users.length + 1,
    username,
    password_hash,
    display_name,
    avatar_color: "#E2D9F3",
    map_style: "osm",
    created_at: new Date().toISOString()
  };

  db.users.push(newUser);

  // Auto-add to existing first circle or create a new circle
  if (db.circles.length > 0) {
    db.circle_members.push({ circle_id: db.circles[0].id, user_id: newUser.id });
  } else {
    const defaultCircle: CircleData = {
      id: 1,
      name: "Family Circle",
      owner_id: newUser.id,
      invite_code: "YIMLY-" + crypto.randomBytes(3).toString("hex").toUpperCase(),
      created_at: new Date().toISOString()
    };
    db.circles.push(defaultCircle);
    db.circle_members.push({ circle_id: 1, user_id: newUser.id });
  }
  saveDB(db);

  const token = jwt.sign({ sub: String(newUser.id) }, JWT_SECRET, { expiresIn: "30d" });

  res.json({
    access_token: token,
    token_type: "Bearer",
    user: {
      id: newUser.id,
      username: newUser.username,
      display_name: newUser.display_name,
      avatar_color: newUser.avatar_color,
      map_style: newUser.map_style || "osm"
    }
  });
});

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ detail: "Username and password required" });
  }

  db = loadDB();
  const found = db.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (!found || !bcrypt.compareSync(password, found.password_hash)) {
    return res.status(401).json({ detail: "Invalid username or password" });
  }

  const token = jwt.sign({ sub: String(found.id) }, JWT_SECRET, { expiresIn: "30d" });

  res.json({
    access_token: token,
    token_type: "Bearer",
    user: {
      id: found.id,
      username: found.username,
      display_name: found.display_name,
      avatar_color: found.avatar_color,
      map_style: found.map_style || "osm"
    }
  });
});

app.get("/api/auth/me", authenticateToken, (req: AuthRequest, res) => {
  const u = req.user!;
  res.json({
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    avatar_color: u.avatar_color || "#E2D9F3",
    map_style: u.map_style || "osm",
    is_active: true
  });
});

app.put("/api/auth/profile", authenticateToken, (req: AuthRequest, res) => {
  const { avatar_color, display_name, map_style } = req.body;
  db = loadDB();
  const userIdx = db.users.findIndex((u) => u.id === req.user!.id);
  if (userIdx !== -1) {
    if (avatar_color !== undefined) db.users[userIdx].avatar_color = avatar_color;
    if (display_name !== undefined) db.users[userIdx].display_name = display_name;
    if (map_style !== undefined) {
      const allowed = ["osm", "openfree_positron", "openfree_bright", "openfree_liberty", "openfree_dark", "openfree_fiord", "carto_voyager", "carto_positron", "carto_dark"];
      if (allowed.includes(map_style)) {
        db.users[userIdx].map_style = map_style;
      } else {
        return res.status(400).json({ detail: "Invalid map_style value" });
      }
    }
    saveDB(db);
    const updated = db.users[userIdx];
    res.json({
      id: updated.id,
      username: updated.username,
      display_name: updated.display_name,
      avatar_color: updated.avatar_color,
      map_style: updated.map_style || "osm",
      is_active: true
    });
  } else {
    res.status(404).json({ detail: "User not found" });
  }
});

// Family Circles Routes
app.get("/api/circles", authenticateToken, (req: AuthRequest, res) => {
  db = loadDB();
  const userCircleIds = db.circle_members
    .filter((m) => m.user_id === req.user!.id)
    .map((m) => m.circle_id);

  const userCircles = db.circles.filter((c) => userCircleIds.includes(c.id));
  res.json(userCircles);
});

app.post("/api/circles", authenticateToken, (req: AuthRequest, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ detail: "Circle name required" });

  db = loadDB();
  const newCircle: CircleData = {
    id: db.circles.length + 1,
    name,
    owner_id: req.user!.id,
    invite_code: "YIMLY-" + crypto.randomBytes(3).toString("hex").toUpperCase(),
    created_at: new Date().toISOString()
  };

  db.circles.push(newCircle);
  db.circle_members.push({ circle_id: newCircle.id, user_id: req.user!.id });
  saveDB(db);

  res.json(newCircle);
});

app.post("/api/circles/join", authenticateToken, (req: AuthRequest, res) => {
  const { invite_code } = req.body;
  if (!invite_code) return res.status(400).json({ detail: "Invite code required" });

  db = loadDB();
  const circle = db.circles.find(
    (c) => c.invite_code.toUpperCase() === invite_code.trim().toUpperCase()
  );

  if (!circle) {
    return res.status(404).json({ detail: "Circle not found with this invite code" });
  }

  const isMember = db.circle_members.some(
    (m) => m.circle_id === circle.id && m.user_id === req.user!.id
  );

  if (!isMember) {
    db.circle_members.push({ circle_id: circle.id, user_id: req.user!.id });
    saveDB(db);
  }

  res.json(circle);
});

app.get("/api/circles/:id/members", authenticateToken, (req: AuthRequest, res) => {
  const circleId = Number(req.params.id);
  db = loadDB();

  const isMember = db.circle_members.some(
    (m) => m.circle_id === circleId && m.user_id === req.user!.id
  );

  if (!isMember) {
    return res.status(403).json({ detail: "Not authorized to view this circle" });
  }

  const memberUserIds = db.circle_members
    .filter((m) => m.circle_id === circleId)
    .map((m) => m.user_id);

  const members = db.users
    .filter((u) => memberUserIds.includes(u.id))
    .map((member) => {
      // Find real device tracker telemetry sent for this user
      const userTrackers = db.entity_states.filter(
        (e) => e.user_id === member.id && e.domain === "device_tracker"
      );

      // Extract valid real locations (latitude and longitude must be real numbers)
      const devices = userTrackers
        .filter((dt) => dt.latitude != null && dt.longitude != null)
        .map((dt) => ({
          entity_id: dt.entity_id,
          device_name: dt.attributes?.friendly_name || dt.entity_id,
          latitude: dt.latitude!,
          longitude: dt.longitude!,
          battery: dt.attributes?.battery_level || 100,
          accuracy: dt.attributes?.gps_accuracy || 0,
          last_updated: dt.last_updated
        }));

      return {
        id: member.id,
        username: member.username,
        display_name: member.display_name,
        avatar_color: member.avatar_color || "#E2D9F3",
        devices // Returns [] if no real telemetry has been received from the Companion App
      };
    });

  res.json(members);
});

// Home Assistant Companion App Webhook & Telemetry Receiver
app.post(["/api/webhook/:webhook_id", "/api/mobile_app/registrations"], (req, res) => {
  const { type, data } = req.body;
  db = loadDB();

  // Handle Home Assistant Location Update Payload
  if (type === "update_location" || data?.location || (req.body.latitude && req.body.longitude)) {
    const lat = data?.location?.latitude ?? req.body.latitude;
    const lon = data?.location?.longitude ?? req.body.longitude;
    const battery = data?.location?.battery ?? req.body.battery ?? 100;
    const accuracy = data?.location?.gps_accuracy ?? req.body.gps_accuracy ?? 5;
    const entityId = req.body.entity_id || data?.entity_id || "device_tracker.mobile_app";
    const userId = req.body.user_id || (db.users[0] ? db.users[0].id : 1);

    if (lat != null && lon != null) {
      const now = new Date().toISOString();
      const existingIdx = db.entity_states.findIndex((e) => e.entity_id === entityId);
      
      const updatedState: EntityStateData = {
        entity_id: entityId,
        user_id: userId,
        domain: "device_tracker",
        state: "not_home",
        attributes: {
          friendly_name: req.body.device_name || "Companion Phone",
          battery_level: battery,
          gps_accuracy: accuracy
        },
        latitude: Number(lat),
        longitude: Number(lon),
        last_updated: now
      };

      if (existingIdx !== -1) {
        db.entity_states[existingIdx] = updatedState;
      } else {
        db.entity_states.push(updatedState);
      }

      // Record location history
      db.location_history.push({
        id: crypto.randomBytes(8).toString("hex"),
        entity_id: entityId,
        user_id: userId,
        latitude: Number(lat),
        longitude: Number(lon),
        battery_level: battery,
        accuracy,
        timestamp: now
      });

      saveDB(db);

      // Broadcast update over WebSocket
      broadcastStateUpdate({
        event_type: "state_changed",
        data: {
          entity_id: entityId,
          new_state: updatedState
        }
      });

      return res.json({ success: true, message: "Real location telemetry received" });
    }
  }

  // Registration or general HA response
  res.json({
    id: crypto.randomBytes(8).toString("hex"),
    webhook_id: req.params.webhook_id || "default_webhook",
    secret: crypto.randomBytes(16).toString("hex")
  });
});

// Entity States and History Endpoints
app.get("/api/states", authenticateToken, (req: AuthRequest, res) => {
  db = loadDB();
  const userStates = db.entity_states.filter((e) => e.user_id === req.user!.id);
  res.json(userStates);
});

app.get("/api/history/period", authenticateToken, (req: AuthRequest, res) => {
  db = loadDB();
  const userHistory = db.location_history.filter((h) => h.user_id === req.user!.id);
  res.json(userHistory);
});

// Express / Vite Integration
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Yimly Home Core Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
