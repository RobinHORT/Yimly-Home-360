import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Lock,
  User,
  CheckCircle,
  LogOut,
  RefreshCw,
  AlertCircle,
  Eye,
  EyeOff,
  Home,
  UserCheck,
  Compass,
  Bell,
  Settings as SettingsIcon,
  Users,
  Smartphone,
  Info
} from "lucide-react";

import { Circle, CircleMember, UserInfo } from "./types";
import { MapComponent } from "./components/MapComponent";
import { CircleSelector } from "./components/CircleSelector";
import { PeopleTab } from "./components/PeopleTab";
import { PlacesTab } from "./components/PlacesTab";
import { AlertsTab } from "./components/AlertsTab";
import { SettingsTab } from "./components/SettingsTab";

export default function App() {
  const [status, setStatus] = useState<"checking" | "setup" | "login" | "authenticated" | "register">("checking");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);

  // Circles States
  const [circles, setCircles] = useState<Circle[]>([]);
  const [selectedCircle, setSelectedCircle] = useState<Circle | null>(null);
  const [circleMembers, setCircleMembers] = useState<CircleMember[]>([]);
  const [circlesLoading, setCirclesLoading] = useState(false);

  // Tab State: "map" | "people" | "places" | "alerts" | "settings"
  const [activeTab, setActiveTab] = useState<"map" | "people" | "places" | "alerts" | "settings">("map");

  // Run on mount to check existing session, setup status, and register SW
  useEffect(() => {
    checkSessionAndSetup();
    registerServiceWorker();
  }, []);

  // Periodic location polling for active members
  useEffect(() => {
    if (status !== "authenticated" || !selectedCircle) return;

    fetchCircleMembers(selectedCircle.id); // Load immediately on circle switch

    const interval = setInterval(() => {
      fetchCircleMembers(selectedCircle.id, true); // Silent background reload
    }, 15000); // 15 seconds real-time update loop

    return () => clearInterval(interval);
  }, [status, selectedCircle]);

  const registerServiceWorker = () => {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => {
            console.log("Service Worker registered successfully with scope:", reg.scope);
          })
          .catch((err) => {
            console.error("Service Worker registration failed:", err);
          });
      });
    }
  };

  const checkSessionAndSetup = async () => {
    setStatus("checking");
    setError(null);
    const token = localStorage.getItem("access_token");
    const savedUser = localStorage.getItem("user_info");

    if (token) {
      try {
        // Validate session against the backend and fetch latest profile data
        const res = await fetch("/api/auth/me", {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (res.ok) {
          const fetchedUser = await res.json();
          localStorage.setItem("user_info", JSON.stringify(fetchedUser));
          setUser(fetchedUser);
          setStatus("authenticated");
          await fetchCircles(token);
          return;
        } else {
          // Token is expired or invalid, clear local storage
          localStorage.removeItem("access_token");
          localStorage.removeItem("user_info");
        }
      } catch (err) {
        console.error("Error validating session:", err);
      }
    }

    // Determine if setup is required
    try {
      const setupRes = await fetch("/api/setup/status");
      if (setupRes.ok) {
        const setupData = await setupRes.json();
        if (setupData.needs_setup) {
          setStatus("setup");
        } else {
          setStatus("login");
        }
      } else {
        setError("Unable to retrieve server status. Please verify the backend is running.");
        setStatus("login");
      }
    } catch (err) {
      setError("Network error: Server is unreachable. Check your connection.");
      setStatus("login");
    }
  };

  // FETCH CIRCLES
  const fetchCircles = async (tokenVal?: string) => {
    const token = tokenVal || localStorage.getItem("access_token");
    if (!token) return;

    setCirclesLoading(true);
    try {
      const res = await fetch("/api/circles", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setCircles(data);
        if (data.length > 0) {
          // If no circle selected or selected circle is not in the list, choose the first
          if (!selectedCircle || !data.some((c: Circle) => c.id === selectedCircle.id)) {
            setSelectedCircle(data[0]);
          }
        } else {
          setSelectedCircle(null);
          setCircleMembers([]);
        }
      }
    } catch (err) {
      console.error("Error fetching family circles:", err);
    } finally {
      setCirclesLoading(false);
    }
  };

  // FETCH CIRCLE MEMBERS (AND RELEVANT TRACKERS)
  const fetchCircleMembers = async (circleId: number, silent = false) => {
    if (!circleId) return;
    const token = localStorage.getItem("access_token");
    if (!token) return;

    if (!silent) setCirclesLoading(true);
    try {
      const res = await fetch(`/api/circles/${circleId}/members`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setCircleMembers(data);
      } else if (res.status === 401) {
        handleLogout();
      } else if (res.status === 403 || res.status === 404) {
        setCircleMembers([]);
      }
    } catch (err) {
      console.error("Error loading circle members:", err);
    } finally {
      if (!silent) setCirclesLoading(false);
    }
  };

  // CREATE CIRCLE
  const handleCreateCircle = async (name: string) => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    const res = await fetch("/api/circles", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ name })
    });

    if (res.ok) {
      const newCircle = await res.json();
      await fetchCircles(token);
      setSelectedCircle(newCircle);
    } else {
      const data = await res.json();
      throw new Error(data.detail || "Failed to create Circle");
    }
  };

  // JOIN CIRCLE
  const handleJoinCircle = async (code: string) => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    const res = await fetch("/api/circles/join", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ invite_code: code.trim().toUpperCase() })
    });

    if (res.ok) {
      const joinedCircle = await res.json();
      await fetchCircles(token);
      setSelectedCircle(joinedCircle);
    } else {
      const data = await res.json();
      throw new Error(data.detail || "Invalid invite code or already a member");
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Frontend validations
    if (!username.trim() || !displayName.trim() || !password || !confirmPassword) {
      setError("All fields are required.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const endpoint = status === "setup" ? "/api/setup/register" : "/api/auth/register";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
          display_name: displayName.trim()
        })
      });

      const data = await res.json();

      if (res.ok) {
        // Automatically attempt to log in with the new account
        await performLogin(username.trim(), password);
      } else {
        setError(data.detail || "Account creation failed. Please check your credentials.");
        setLoading(false);
      }
    } catch (err) {
      setError("Connection to server failed during account creation.");
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);
    await performLogin(username.trim(), password);
  };

  const performLogin = async (userVal: string, passVal: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username: userVal,
          password: passVal
        })
      });

      const data = await res.json();

      if (res.ok) {
        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("user_info", JSON.stringify(data.user));
        setUser(data.user);
        setStatus("authenticated");
        
        // Load circles instantly on login
        await fetchCircles(data.access_token);

        // Reset form inputs safely
        setPassword("");
        setConfirmPassword("");
        setUsername("");
        setDisplayName("");
      } else {
        setError(data.detail || "Invalid username or password.");
      }
    } catch (err) {
      setError("Failed to connect to the authentication server.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user_info");
    setUser(null);
    setCircles([]);
    setSelectedCircle(null);
    setCircleMembers([]);
    setStatus("login");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      
      {/* AUTHENTICATED SYSTEM FLOW */}
      {status === "authenticated" ? (
        <div className="flex-1 flex flex-col md:flex-row h-screen overflow-hidden">
          
          {/* SIDEBAR NAVIGATION - DESKTOP */}
          <aside className="hidden md:flex flex-col w-64 bg-[#fafbfe]/90 backdrop-blur-md border-r border-slate-100 p-6 shrink-0 justify-between">
            <div className="space-y-6">
              {/* Brand Logo & Name */}
              <div className="flex items-center gap-3 select-none">
                <div className="h-10 w-10 rounded-2xl bg-indigo-500/10 border border-indigo-100/30 flex items-center justify-center text-indigo-600 shadow-sm">
                  <Home className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-xs font-black tracking-wider text-slate-800 leading-tight">
                    YIMLY HOME
                  </h1>
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest block">
                    Family Circle Hub
                  </span>
                </div>
              </div>

              {/* Navigation Tabs List */}
              <nav className="space-y-1.5">
                <button
                  onClick={() => setActiveTab("map")}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer ${
                    activeTab === "map"
                      ? "bg-indigo-50 text-indigo-600 border border-indigo-100/40 shadow-sm"
                      : "text-slate-500 hover:bg-slate-50/50 hover:text-slate-800"
                  }`}
                >
                  <Home className="w-4 h-4 shrink-0" />
                  Map Homepage
                </button>

                <button
                  onClick={() => setActiveTab("people")}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer ${
                    activeTab === "people"
                      ? "bg-indigo-50 text-indigo-600 border border-indigo-100/40 shadow-sm"
                      : "text-slate-500 hover:bg-slate-50/50 hover:text-slate-800"
                  }`}
                >
                  <Users className="w-4 h-4 shrink-0" />
                  Family Members
                </button>

                <button
                  onClick={() => setActiveTab("places")}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer ${
                    activeTab === "places"
                      ? "bg-indigo-50 text-indigo-600 border border-indigo-100/40 shadow-sm"
                      : "text-slate-500 hover:bg-slate-50/50 hover:text-slate-800"
                  }`}
                >
                  <Compass className="w-4 h-4 shrink-0" />
                  Circle Places
                </button>

                <button
                  onClick={() => setActiveTab("alerts")}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer ${
                    activeTab === "alerts"
                      ? "bg-indigo-50 text-indigo-600 border border-indigo-100/40 shadow-sm"
                      : "text-slate-500 hover:bg-slate-50/50 hover:text-slate-800"
                  }`}
                >
                  <Bell className="w-4 h-4 shrink-0" />
                  Circle Alerts
                </button>

                <button
                  onClick={() => setActiveTab("settings")}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer ${
                    activeTab === "settings"
                      ? "bg-indigo-50 text-indigo-600 border border-indigo-100/40 shadow-sm"
                      : "text-slate-500 hover:bg-slate-50/50 hover:text-slate-800"
                  }`}
                >
                  <SettingsIcon className="w-4 h-4 shrink-0" />
                  App Settings
                </button>
              </nav>
            </div>

            {/* Logged in metadata / status footer */}
            <div className="border-t border-slate-100/60 pt-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div 
                  className="h-9 w-9 rounded-full text-white font-bold text-xs flex items-center justify-center select-none shadow-sm transition-all duration-300"
                  style={{ 
                    backgroundColor: user?.avatar_color || "#4f46e5", 
                    border: user?.avatar_color ? "2px solid white" : "none",
                    boxShadow: user?.avatar_color ? `0 0 0 2px ${user.avatar_color}` : "none" 
                  }}
                >
                  {user?.display_name?.charAt(0).toUpperCase()}
                </div>
                <div className="truncate w-28">
                  <p className="text-xs font-bold text-slate-800 truncate">{user?.display_name}</p>
                  <span className="text-[9px] text-slate-400 font-semibold truncate block">{user?.username}</span>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50/80 transition cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </aside>

          {/* MAIN CONTAINER LAYOUT */}
          <main className="flex-1 flex flex-col h-full overflow-hidden">
            
            {/* TOP HEADER / BAR */}
            <header className="bg-white/95 backdrop-blur-md border-b border-slate-100 px-4 py-3 shrink-0 flex items-center justify-between z-10">
              <div className="flex items-center gap-2.5 md:hidden select-none">
                <div className="h-8 w-8 rounded-xl bg-indigo-500/10 border border-indigo-100/20 flex items-center justify-center text-indigo-600 shadow-sm">
                  <Home className="h-4.5 w-4.5" />
                </div>
                <h1 className="text-xs font-black tracking-wider text-slate-800 leading-none">
                  YIMLY
                </h1>
              </div>

              {/* Circle Selector component integrated securely */}
              <div className="flex-1 md:max-w-xl">
                <CircleSelector
                  circles={circles}
                  selectedCircle={selectedCircle}
                  onSelectCircle={(c) => setSelectedCircle(c)}
                  onCreateCircle={handleCreateCircle}
                  onJoinCircle={handleJoinCircle}
                  loading={circlesLoading}
                />
              </div>
            </header>

            {/* TAB CONTAINER WITH TRANSITIONS */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6">
              <AnimatePresence mode="wait">
                {activeTab === "map" && (
                  <motion.div
                    key="map"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.15 }}
                    className="w-full h-[calc(100vh-140px)] md:h-[calc(100vh-110px)]"
                  >
                    <MapComponent
                      members={circleMembers}
                      onRefresh={() => selectedCircle && fetchCircleMembers(selectedCircle.id)}
                      loading={circlesLoading}
                    />
                  </motion.div>
                )}

                {activeTab === "people" && (
                  <motion.div
                    key="people"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.15 }}
                  >
                    <PeopleTab members={circleMembers} loading={circlesLoading} />
                  </motion.div>
                )}

                {activeTab === "places" && (
                  <motion.div
                    key="places"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.15 }}
                  >
                    <PlacesTab />
                  </motion.div>
                )}

                {activeTab === "alerts" && (
                  <motion.div
                    key="alerts"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.15 }}
                  >
                    <AlertsTab />
                  </motion.div>
                )}

                {activeTab === "settings" && (
                  <motion.div
                    key="settings"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.15 }}
                  >
                    <SettingsTab 
                      user={user} 
                      onLogout={handleLogout} 
                      onUserUpdate={(updated) => {
                        setUser(updated);
                        localStorage.setItem("user_info", JSON.stringify(updated));
                      }} 
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* MOBILE BOTTOM NAVIGATION TABS */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-100 px-2 py-2 flex justify-around items-center z-[999] shadow-[0_-4px_20px_rgba(148,163,184,0.06)] rounded-t-3xl">
              <button
                onClick={() => setActiveTab("map")}
                className={`flex flex-col items-center gap-1.5 py-1 px-4.5 rounded-2xl transition cursor-pointer ${
                  activeTab === "map" ? "text-indigo-600 bg-indigo-50/60 font-bold" : "text-slate-400"
                }`}
              >
                <Home className="w-5 h-5" />
                <span className="text-[9px] uppercase tracking-wider font-semibold">Map</span>
              </button>

              <button
                onClick={() => setActiveTab("people")}
                className={`flex flex-col items-center gap-1.5 py-1 px-4.5 rounded-2xl transition cursor-pointer ${
                  activeTab === "people" ? "text-indigo-600 bg-indigo-50/60 font-bold" : "text-slate-400"
                }`}
              >
                <Users className="w-5 h-5" />
                <span className="text-[9px] uppercase tracking-wider font-semibold">People</span>
              </button>

              <button
                onClick={() => setActiveTab("places")}
                className={`flex flex-col items-center gap-1.5 py-1 px-4.5 rounded-2xl transition cursor-pointer ${
                  activeTab === "places" ? "text-indigo-600 bg-indigo-50/60 font-bold" : "text-slate-400"
                }`}
              >
                <Compass className="w-5 h-5" />
                <span className="text-[9px] uppercase tracking-wider font-semibold">Places</span>
              </button>

              <button
                onClick={() => setActiveTab("alerts")}
                className={`flex flex-col items-center gap-1.5 py-1 px-4.5 rounded-2xl transition cursor-pointer ${
                  activeTab === "alerts" ? "text-indigo-600 bg-indigo-50/60 font-bold" : "text-slate-400"
                }`}
              >
                <Bell className="w-5 h-5" />
                <span className="text-[9px] uppercase tracking-wider font-semibold">Alerts</span>
              </button>

              <button
                onClick={() => setActiveTab("settings")}
                className={`flex flex-col items-center gap-1.5 py-1 px-4.5 rounded-2xl transition cursor-pointer ${
                  activeTab === "settings" ? "text-indigo-600 bg-indigo-50/60 font-bold" : "text-slate-400"
                }`}
              >
                <SettingsIcon className="w-5 h-5" />
                <span className="text-[9px] uppercase tracking-wider font-semibold">Settings</span>
              </button>
            </nav>
          </main>

        </div>
      ) : (
        /* FIRST-RUN SETUP / LOGIN / ANONYMOUS FLOW */
        <div className="min-h-screen flex flex-col justify-between py-12 px-4 sm:px-6 lg:px-8">
          <div className="sr-only" role="status" aria-live="polite">
            {error && `Error: ${error}`}
            {status === "checking" && "Checking server connection status."}
          </div>

          <header className="flex flex-col items-center space-y-3 select-none" id="app-header">
            <div className="h-12 w-12 rounded-2xl bg-indigo-50/80 text-indigo-600 flex items-center justify-center shadow-sm border border-indigo-100/30">
              <Home className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-black tracking-widest text-slate-800" id="brand-title">
              YIMLY HOME
            </h1>
            <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">
              Secure Companion Bridge & Family Hub
            </p>
          </header>

          <main className="my-auto py-8 flex flex-col items-center">
            <AnimatePresence mode="wait">
              {status === "checking" && (
                <motion.div
                  key="checking"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col items-center space-y-3"
                >
                  <RefreshCw className="h-7 w-7 text-indigo-600 animate-spin" />
                  <p className="text-sm font-semibold text-slate-500">Checking server initialization state...</p>
                </motion.div>
              )}

              {(status === "setup" || status === "register") && (
                <motion.div
                  key={status}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.25 }}
                  className="w-full max-w-md bg-white rounded-3xl shadow-[0_16px_48px_rgba(148,163,184,0.08)] border border-slate-100 p-8 space-y-6"
                >
                  <div className="text-center">
                    <h2 className="text-lg font-bold text-slate-800">Create your account</h2>
                    <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                      {status === "setup"
                        ? "First-run installation detected. Set up your administrator credentials."
                        : "Create your user account to join a Family Circle."}
                    </p>
                  </div>

                  {error && (
                    <div className="bg-rose-50 border border-rose-100 text-rose-700 p-3 rounded-2xl flex items-start gap-2 text-xs" role="alert">
                      <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5 text-rose-500" />
                      <span>{error}</span>
                    </div>
                  )}

                  <form onSubmit={handleRegister} className="space-y-4">
                    <div>
                      <label htmlFor="setup-username" className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                        Username / Email
                      </label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-slate-400" />
                        <input
                          id="setup-username"
                          name="username"
                          type="text"
                          autoComplete="username"
                          required
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="e.g. admin or admin@example.com"
                          disabled={loading}
                          className="w-full pl-11 pr-4 py-3 bg-slate-50/50 border border-slate-100 rounded-2xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="setup-display-name" className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                        Display Name
                      </label>
                      <div className="relative">
                        <UserCheck className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-slate-400" />
                        <input
                          id="setup-display-name"
                          name="displayName"
                          type="text"
                          autoComplete="name"
                          required
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="e.g. Administrator"
                          disabled={loading}
                          className="w-full pl-11 pr-4 py-3 bg-slate-50/50 border border-slate-100 rounded-2xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="setup-password" className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                        Password
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-slate-400" />
                        <input
                          id="setup-password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Minimum 6 characters"
                          disabled={loading}
                          className="w-full pl-11 pr-11 py-3 bg-slate-50/50 border border-slate-100 rounded-2xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                        >
                          {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="setup-confirm-password" className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                        Confirm Password
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-slate-400" />
                        <input
                          id="setup-confirm-password"
                          name="confirmPassword"
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Repeat password"
                          disabled={loading}
                          className="w-full pl-11 pr-4 py-3 bg-slate-50/50 border border-slate-100 rounded-2xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-indigo-600/90 hover:bg-indigo-600 active:bg-indigo-700 disabled:bg-indigo-400/80 text-white font-bold py-3 rounded-2xl text-xs uppercase tracking-wider transition focus:outline-none focus:ring-4 focus:ring-indigo-500/20 shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {loading ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          <span>Creating account...</span>
                        </>
                      ) : (
                        <span>Create Account</span>
                      )}
                    </button>
                  </form>

                  {status === "register" && (
                    <div className="text-center mt-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setUsername("");
                          setPassword("");
                          setConfirmPassword("");
                          setDisplayName("");
                          setStatus("login");
                        }}
                        className="text-xs text-indigo-600 hover:text-indigo-700 font-bold cursor-pointer transition"
                      >
                        Already have an account? Log In
                      </button>
                    </div>
                  )}
                </motion.div>
              )}

              {status === "login" && (
                <motion.div
                  key="login"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.25 }}
                  className="w-full max-w-md bg-white rounded-3xl shadow-[0_16px_48px_rgba(148,163,184,0.08)] border border-slate-100 p-8 space-y-6"
                >
                  <div className="text-center">
                    <h2 className="text-lg font-bold text-slate-800">Log In</h2>
                    <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                      Authenticate to connect to Yimly Home
                    </p>
                  </div>

                  {error && (
                    <div className="bg-rose-50 border border-rose-100 text-rose-700 p-3 rounded-2xl flex items-start gap-2 text-xs" role="alert">
                      <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5 text-rose-500" />
                      <span>{error}</span>
                    </div>
                  )}

                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <label htmlFor="login-username" className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                        Username / Email
                      </label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-slate-400" />
                        <input
                          id="login-username"
                          name="username"
                          type="text"
                          autoComplete="username"
                          required
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="Username or email"
                          disabled={loading}
                          className="w-full pl-11 pr-4 py-3 bg-slate-50/50 border border-slate-100 rounded-2xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="login-password" className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                        Password
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-slate-400" />
                        <input
                          id="login-password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter password"
                          disabled={loading}
                          className="w-full pl-11 pr-11 py-3 bg-slate-50/50 border border-slate-100 rounded-2xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                        >
                          {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-indigo-600/90 hover:bg-indigo-600 active:bg-indigo-700 disabled:bg-indigo-400/80 text-white font-bold py-3 rounded-2xl text-xs uppercase tracking-wider transition focus:outline-none focus:ring-4 focus:ring-indigo-500/20 shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {loading ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          <span>Logging in...</span>
                        </>
                      ) : (
                        <span>Log In</span>
                      )}
                    </button>
                  </form>

                  <div className="text-center mt-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setUsername("");
                        setPassword("");
                        setConfirmPassword("");
                        setDisplayName("");
                        setStatus("register");
                      }}
                      className="text-xs text-indigo-600 hover:text-indigo-700 font-bold cursor-pointer transition"
                    >
                      Don't have an account? Create Account / Sign Up
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </main>

          <footer className="text-center text-xs text-slate-400 font-medium tracking-wide flex flex-col items-center space-y-1 select-none" id="app-footer">
            <p>© 2026 Yimly Technologies. All rights reserved.</p>
            <div className="flex items-center gap-1.5 justify-center">
              <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span>Core Security Enabled</span>
            </div>
          </footer>
        </div>
      )}

    </div>
  );
}
