import React, { useEffect, useState, useRef } from "react";
import { UserInfo } from "../types";
import { PWAInstallButton } from "./PWAInstallButton";
import { MAP_STYLES } from "../lib/mapStyles";
import { Settings, Smartphone, LogOut, HelpCircle, Map, Check, Upload, Trash2, Camera, RefreshCw, AlertCircle } from "lucide-react";

interface SettingsTabProps {
  user: UserInfo | null;
  onLogout: () => void;
  onUserUpdate?: (updated: UserInfo) => void;
}

const PASTEL_PALETTE = [
  { name: "Soft Lavender", hex: "#E2D9F3" },
  { name: "Rose Quartz", hex: "#FAD2E1" },
  { name: "Peach Puff", hex: "#FDE2E4" },
  { name: "Pale Melon", hex: "#FFF1E6" },
  { name: "Pale Custard", hex: "#FFFCF2" },
  { name: "Mint Foam", hex: "#E2F0CB" },
  { name: "Pale Turquoise", hex: "#C7F9CC" },
  { name: "Powder Green", hex: "#D8F3DC" },
  { name: "Sky Mist", hex: "#D8E2DC" },
  { name: "Baby Blue", hex: "#BEE3DB" },
  { name: "Periwinkle", hex: "#E8ECFB" },
  { name: "Lilac Whisper", hex: "#E8DBFC" },
  { name: "Orchid Petal", hex: "#F3C6F1" },
  { name: "Cotton Candy", hex: "#FFC6FF" },
  { name: "Desert Sage", hex: "#ECE4DB" }
];

interface ConnectedDevice {
  entityId: string;
  name: string;
  battery: string | number;
  lastUpdated: string;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({ user, onLogout, onUserUpdate }) => {
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string | null>(user?.avatar_color || null);
  const [savingColor, setSavingColor] = useState(false);
  const [selectedMapStyle, setSelectedMapStyle] = useState<string>(user?.map_style || "osm");
  const [savingMapStyle, setSavingMapStyle] = useState(false);

  // Profile Picture Upload States
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadingPicture, setUploadingPicture] = useState(false);
  const [deletingPicture, setDeletingPicture] = useState(false);
  const [pictureError, setPictureError] = useState<string | null>(null);
  const [pictureSuccess, setPictureSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchDevices();
  }, []);

  useEffect(() => {
    if (user?.avatar_color) {
      setSelectedColor(user.avatar_color);
    }
    if (user?.map_style) {
      setSelectedMapStyle(user.map_style);
    }
  }, [user]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPictureError(null);
    setPictureSuccess(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type.toLowerCase())) {
      setPictureError("Unsupported file format. Please select a JPEG, PNG, or WebP photo.");
      return;
    }

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setPictureError("Image file size exceeds maximum limit of 5MB.");
      return;
    }

    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
  };

  const handleCancelPreview = () => {
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setPictureError(null);
  };

  const handleUploadPicture = async () => {
    if (!selectedFile) return;

    setUploadingPicture(true);
    setPictureError(null);
    setPictureSuccess(null);

    const token = localStorage.getItem("access_token");
    if (!token) {
      setPictureError("Authentication required.");
      setUploadingPicture(false);
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch("/api/auth/profile/picture", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      if (res.ok) {
        const updatedUser = await res.json();
        setPictureSuccess("Profile picture updated successfully!");
        handleCancelPreview();
        if (onUserUpdate) {
          onUserUpdate(updatedUser);
        }
      } else {
        const errorData = await res.json().catch(() => ({}));
        setPictureError(errorData.detail || "Failed to upload profile picture.");
      }
    } catch (err) {
      setPictureError("Network error uploading profile picture.");
    } finally {
      setUploadingPicture(false);
    }
  };

  const handleRemovePicture = async () => {
    setDeletingPicture(true);
    setPictureError(null);
    setPictureSuccess(null);

    const token = localStorage.getItem("access_token");
    if (!token) {
      setPictureError("Authentication required.");
      setDeletingPicture(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/profile/picture", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (res.ok) {
        const updatedUser = await res.json();
        setPictureSuccess("Profile picture removed. Restored avatar initial.");
        handleCancelPreview();
        if (onUserUpdate) {
          onUserUpdate(updatedUser);
        }
      } else {
        const errorData = await res.json().catch(() => ({}));
        setPictureError(errorData.detail || "Failed to remove profile picture.");
      }
    } catch (err) {
      setPictureError("Network error removing profile picture.");
    } finally {
      setDeletingPicture(false);
    }
  };

  const handleSelectMapStyle = async (styleId: string) => {
    setSelectedMapStyle(styleId);
    setSavingMapStyle(true);
    const token = localStorage.getItem("access_token");
    if (!token) return;

    try {
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ map_style: styleId })
      });
      if (res.ok) {
        const updatedUser = await res.json();
        if (onUserUpdate) {
          onUserUpdate(updatedUser);
        }
      }
    } catch (err) {
      console.error("Failed to persist map style preference:", err);
    } finally {
      setSavingMapStyle(false);
    }
  };

  const handleSelectColor = async (colorHex: string) => {
    setSelectedColor(colorHex);
    setSavingColor(true);
    const token = localStorage.getItem("access_token");
    if (!token) return;

    try {
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ avatar_color: colorHex })
      });
      if (res.ok) {
        const updatedUser = await res.json();
        if (onUserUpdate) {
          onUserUpdate(updatedUser);
        }
      }
    } catch (err) {
      console.error("Failed to persist avatar color:", err);
    } finally {
      setSavingColor(false);
    }
  };

  const fetchDevices = async () => {
    setLoading(true);
    const token = localStorage.getItem("access_token");
    if (!token) return;

    try {
      const res = await fetch("/api/states", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        const trackerDevices = data
          .filter((entity: any) => entity.entity_id.startsWith("device_tracker."))
          .map((entity: any) => ({
            entityId: entity.entity_id,
            name: entity.attributes?.friendly_name || entity.entity_id.replace("device_tracker.", ""),
            battery: entity.attributes?.battery_level || "100",
            lastUpdated: new Date(entity.last_updated).toLocaleString()
          }));
        setDevices(trackerDevices);
      }
    } catch (err) {
      console.error("Error retrieving device states:", err);
    } finally {
      setLoading(false);
    }
  };

  const serverOrigin = window.location.origin;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      
      {/* Profile & Identity Card */}
      <div className="bg-white p-7 sm:p-8 rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.015)] space-y-6">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-600" />
          <h2 className="text-base font-bold text-slate-800">Account Settings</h2>
        </div>

        {/* Profile Info Summary Header */}
        <div className="p-5 rounded-2xl bg-slate-50/50 border border-slate-100/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div 
              className="h-16 w-16 text-white font-extrabold text-xl rounded-full flex items-center justify-center select-none shadow-sm transition-all duration-300 relative overflow-hidden shrink-0"
              style={{ 
                backgroundColor: selectedColor || "#4f46e5", 
                border: "3px solid white",
                boxShadow: `0 0 0 3px ${selectedColor || "#4f46e5"}` 
              }}
            >
              {previewUrl || user?.profile_picture_url ? (
                <img
                  src={previewUrl || user?.profile_picture_url || ""}
                  alt={user?.display_name || "Profile"}
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                user?.display_name ? user.display_name.charAt(0).toUpperCase() : "U"
              )}
            </div>
            <div>
              <p className="text-base font-bold text-slate-800">{user?.display_name}</p>
              <p className="text-xs text-slate-400 font-bold mt-0.5">Username: {user?.username}</p>
              {user?.profile_picture_url && !previewUrl && (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-bold mt-1">
                  <Check className="w-3 h-3" /> Photo Saved
                </span>
              )}
            </div>
          </div>
          <div>
            <span className="inline-flex items-center rounded-lg bg-indigo-50 px-3 py-1 text-[10px] font-extrabold text-indigo-700 ring-1 ring-inset ring-indigo-700/10 uppercase tracking-wider">
              Administrator
            </span>
          </div>
        </div>

        {/* PROFILE PICTURE MANAGEMENT SECTION */}
        <div className="border-t border-slate-100/80 pt-6 space-y-4">
          <div>
            <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Camera className="w-4 h-4 text-indigo-600" />
              Profile Photo
            </h3>
            <p className="text-[11px] text-slate-400 font-semibold mt-0.5 leading-relaxed">
              Upload a profile picture to represent yourself on the live map and Family Circles. Photos are securely stored on the server.
            </p>
          </div>

          {pictureError && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-100 flex items-center gap-2 text-rose-700 text-xs font-bold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{pictureError}</span>
            </div>
          )}

          {pictureSuccess && (
            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center gap-2 text-emerald-700 text-xs font-bold">
              <Check className="w-4 h-4 shrink-0" />
              <span>{pictureSuccess}</span>
            </div>
          )}

          <input
            type="file"
            ref={fileInputRef}
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileSelect}
            className="hidden"
          />

          <div className="flex flex-wrap items-center gap-3">
            {!previewUrl ? (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold shadow-sm transition cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {user?.profile_picture_url ? "Replace Photo" : "Upload Photo"}
                </button>

                {user?.profile_picture_url && (
                  <button
                    type="button"
                    onClick={handleRemovePicture}
                    disabled={deletingPicture}
                    className="flex items-center gap-2 px-4 py-2 bg-rose-50 hover:bg-rose-100/80 active:bg-rose-200 text-rose-700 border border-rose-100 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50"
                  >
                    {deletingPicture ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                    )}
                    Remove Photo
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleUploadPicture}
                  disabled={uploadingPicture}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-sm transition cursor-pointer disabled:opacity-50"
                >
                  {uploadingPicture ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  Save New Photo
                </button>

                <button
                  type="button"
                  onClick={handleCancelPreview}
                  disabled={uploadingPicture}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
              </>
            )}

            <span className="text-[10px] text-slate-400 font-bold">
              Supported: JPEG, PNG, WebP (Max 5MB)
            </span>
          </div>
        </div>

        {/* Avatar Customize Panel */}
        <div className="border-t border-slate-100/80 pt-6 space-y-4">
          <div>
            <h3 className="text-xs font-bold text-slate-700">Customize Avatar Ring Accent</h3>
            <p className="text-[10px] text-slate-400 font-bold mt-0.5">Select a pastel theme to border your photo or avatar initial across devices.</p>
          </div>

          <div className="grid grid-cols-5 gap-2.5 sm:grid-cols-8 md:grid-cols-15">
            {PASTEL_PALETTE.map((item) => {
              const isSelected = selectedColor === item.hex;
              return (
                <button
                  key={item.hex}
                  type="button"
                  title={item.name}
                  onClick={() => handleSelectColor(item.hex)}
                  className="relative h-8 w-8 rounded-full border cursor-pointer transition-all duration-200 hover:scale-110 active:scale-95 flex items-center justify-center shadow-sm"
                  style={{ 
                    backgroundColor: item.hex,
                    borderColor: isSelected ? "#4f46e5" : "rgba(0,0,0,0.06)",
                    borderWidth: isSelected ? "2px" : "1px",
                    boxShadow: isSelected ? `0 0 8px ${item.hex}` : "none"
                  }}
                >
                  {isSelected && (
                    <div className="w-1.5 h-1.5 bg-slate-700 rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* MAP TILE STYLE SELECTOR CARD */}
      <div className="bg-white p-7 sm:p-8 rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.015)] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Map className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-800">Map Tile Style</h2>
          </div>
          {savingMapStyle && (
            <span className="text-[10px] font-bold text-indigo-600 animate-pulse">
              Saving preference...
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 font-semibold leading-relaxed">
          Select your preferred tile map style. This preference is stored directly in your Yimly Home Core account data on the server.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
          {MAP_STYLES.map((style) => {
            const isSelected = selectedMapStyle === style.id;
            return (
              <button
                key={style.id}
                type="button"
                onClick={() => handleSelectMapStyle(style.id)}
                className={`p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer relative flex flex-col justify-between ${
                  isSelected
                    ? "border-indigo-500 bg-indigo-50/20 ring-2 ring-indigo-500/20 shadow-sm"
                    : "border-slate-100 bg-slate-50/40 hover:bg-slate-50 hover:border-slate-200"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${style.previewBg}`}>
                    {style.name}
                  </span>
                  {isSelected ? (
                    <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-sm">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-slate-200 bg-white" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">{style.name}</p>
                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{style.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* COMPANION APP REGISTRATION GUIDE */}
      <div className="bg-white p-7 sm:p-8 rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.015)] space-y-4">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-indigo-600" />
          <h2 className="text-sm font-bold text-slate-800">Home Assistant Companion Setup Guide</h2>
        </div>
        
        <p className="text-xs text-slate-400 font-semibold leading-relaxed">
          Yimly Home uses standard, production-hardened Home Assistant companion app protocols. You can connect the official Companion App directly to this bridge.
        </p>

        <div className="p-5 rounded-2xl bg-slate-50/50 border border-slate-100/60 space-y-3.5">
          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">1. Server Address</span>
            <input
              type="text"
              readOnly
              value={serverOrigin}
              className="w-full mt-1 px-4 py-2 bg-white border border-slate-100 rounded-xl text-xs font-mono text-indigo-600 select-all shadow-sm focus:outline-none"
            />
          </div>
          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">2. Credentials</span>
            <p className="text-xs text-slate-400 font-semibold mt-1 leading-relaxed">
              Use your Yimly account credentials (<strong className="text-slate-600 font-bold">{user?.username}</strong>) and password directly. No extra token setup required!
            </p>
          </div>
        </div>
      </div>

      {/* REGISTERED TELEMETRY DEVICES */}
      <div className="bg-white p-7 sm:p-8 rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.015)] space-y-4">
        <div className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-indigo-600" />
          <h2 className="text-sm font-bold text-slate-800">Your Connected Devices ({devices.length})</h2>
        </div>

        {loading ? (
          <p className="text-xs text-slate-400 font-semibold">Loading companion telemetry units...</p>
        ) : devices.length === 0 ? (
          <div className="p-5 rounded-2xl bg-slate-50/50 border border-slate-100/60 text-center">
            <p className="text-xs font-bold text-slate-600">No active tracking units paired yet</p>
            <p className="text-[10px] text-slate-400 font-semibold mt-1">Configure the companion app to sync device telemetry.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {devices.map((device) => (
              <div
                key={device.entityId}
                className="p-4 rounded-2xl bg-slate-50/50 border border-slate-100/60 flex items-center justify-between"
              >
                <div>
                  <p className="text-xs font-bold text-slate-800">{device.name}</p>
                  <p className="text-[9px] text-slate-400 font-mono font-semibold mt-1">{device.entityId}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-700 font-bold">{device.battery}% Battery</span>
                  <p className="text-[9px] text-slate-400 font-semibold mt-1">Updated: {device.lastUpdated}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SYSTEM CONTROLS & LOGOUT */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.015)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <PWAInstallButton />
        </div>

        <button
          onClick={onLogout}
          className="flex items-center justify-center gap-2 rounded-2xl bg-rose-50 hover:bg-rose-100/80 active:bg-rose-200 text-rose-700 font-bold px-4 py-2.5 text-xs transition border border-rose-100/30 shadow-sm cursor-pointer"
        >
          <LogOut className="w-4 h-4 text-rose-500" />
          Sign Out of Account
        </button>
      </div>
    </div>
  );
};
