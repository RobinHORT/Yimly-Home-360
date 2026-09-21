import React, { useState } from "react";
import { Circle } from "../types";
import { Users, Plus, Clipboard, Check, QrCode, LogIn, X, Compass, ChevronDown } from "lucide-react";

interface CircleSelectorProps {
  circles: Circle[];
  selectedCircle: Circle | null;
  onSelectCircle: (circle: Circle) => void;
  onCreateCircle: (name: string) => Promise<void>;
  onJoinCircle: (code: string) => Promise<void>;
  loading: boolean;
}

export const CircleSelector: React.FC<CircleSelectorProps> = ({
  circles,
  selectedCircle,
  onSelectCircle,
  onCreateCircle,
  onJoinCircle,
  loading
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newCircleName, setNewCircleName] = useState("");
  const [joinInviteCode, setJoinInviteCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!newCircleName.trim()) return;

    try {
      await onCreateCircle(newCircleName.trim());
      setNewCircleName("");
      setShowCreateModal(false);
    } catch (err: any) {
      setError(err.message || "Failed to create Circle");
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!joinInviteCode.trim()) return;

    try {
      await onJoinCircle(joinInviteCode.trim());
      setJoinInviteCode("");
      setShowJoinModal(false);
    } catch (err: any) {
      setError(err.message || "Failed to join Circle");
    }
  };

  const qrCodeUrl = selectedCircle
    ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(selectedCircle.invite_code)}`
    : "";

  return (
    <div className="flex items-center gap-2 max-w-full">
      
      {/* Sleek Floating Pill Container */}
      <div className="flex items-center justify-between gap-2 bg-white/90 backdrop-blur-2xl p-1.5 pl-3 pr-2.5 rounded-full border border-white/80 shadow-xl w-full">
        
        {circles.length === 0 ? (
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center">
              <Compass className="w-4 h-4 animate-pulse" />
            </div>
            <span className="text-xs font-bold text-slate-700">No Circle Joined</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center shrink-0">
              <Users className="w-3.5 h-3.5" />
            </div>

            <div className="relative flex items-center min-w-0">
              <select
                value={selectedCircle?.id || ""}
                onChange={(e) => {
                  const matched = circles.find(c => c.id === Number(e.target.value));
                  if (matched) onSelectCircle(matched);
                }}
                className="bg-transparent border-0 text-xs font-extrabold text-slate-800 focus:ring-0 focus:outline-none pr-5 cursor-pointer truncate max-w-[120px] sm:max-w-[180px]"
              >
                {circles.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-0 pointer-events-none" />
            </div>

            {selectedCircle && (
              <div className="hidden sm:flex items-center gap-1.5 bg-slate-100/70 px-2.5 py-1 rounded-full text-[11px] font-bold text-slate-600">
                <span className="text-slate-400">Code:</span>
                <span className="text-slate-800 tracking-wider">{selectedCircle.invite_code}</span>
                <button
                  onClick={() => handleCopyCode(selectedCircle.invite_code)}
                  className="ml-0.5 text-slate-400 hover:text-indigo-600 transition cursor-pointer"
                  title="Copy Code"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Clipboard className="w-3 h-3" />}
                </button>
                <button
                  onClick={() => setShowQRModal(true)}
                  className="text-slate-400 hover:text-indigo-600 transition cursor-pointer"
                  title="Show QR Code"
                >
                  <QrCode className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setShowJoinModal(true)}
            disabled={loading}
            className="p-1.5 sm:px-3 sm:py-1.5 rounded-full bg-slate-100/80 hover:bg-slate-200/80 text-slate-700 font-bold text-xs transition cursor-pointer flex items-center gap-1"
            title="Join Circle"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Join</span>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            disabled={loading}
            className="p-1.5 sm:px-3 sm:py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition shadow-sm cursor-pointer flex items-center gap-1"
            title="Create Circle"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden md:inline">New Circle</span>
          </button>
        </div>
      </div>

      {/* CREATE CIRCLE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl bg-white/95 p-6 shadow-2xl border border-white/80">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-600" />
                Create Family Circle
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {error && (
              <div className="mb-3 text-xs bg-rose-50 border border-rose-100 text-rose-600 p-3 rounded-2xl">
                {error}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Circle Name</label>
                <input
                  type="text"
                  placeholder="e.g. Smith Family, My Home Circle"
                  value={newCircleName}
                  onChange={(e) => setNewCircleName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs text-slate-800 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-2xl text-xs uppercase tracking-wider transition shadow-sm"
              >
                Create Circle
              </button>
            </form>
          </div>
        </div>
      )}

      {/* JOIN CIRCLE MODAL */}
      {showJoinModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl bg-white/95 p-6 shadow-2xl border border-white/80">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <LogIn className="w-4 h-4 text-indigo-600" />
                Join Family Circle
              </h3>
              <button
                onClick={() => setShowJoinModal(false)}
                className="text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {error && (
              <div className="mb-3 text-xs bg-rose-50 border border-rose-100 text-rose-600 p-3 rounded-2xl">
                {error}
              </div>
            )}

            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Invitation Code</label>
                <input
                  type="text"
                  placeholder="Enter 8-digit code"
                  value={joinInviteCode}
                  onChange={(e) => setJoinInviteCode(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs text-slate-800 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition uppercase tracking-widest"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-2xl text-xs uppercase tracking-wider transition shadow-sm"
              >
                Join Circle
              </button>
            </form>
          </div>
        </div>
      )}

      {/* QR CODE MODAL */}
      {showQRModal && selectedCircle && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl bg-white/95 p-6 shadow-2xl border border-white/80 text-center">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-slate-800">Invitation QR Code</h3>
              <button
                onClick={() => setShowQRModal(false)}
                className="text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Scan QR code to join <strong className="text-slate-700">{selectedCircle.name}</strong>.
            </p>

            <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 inline-block mb-4">
              <img
                src={qrCodeUrl}
                alt="Circle Invite QR Code"
                className="w-48 h-48 mx-auto rounded-xl"
              />
            </div>

            <div className="bg-indigo-50 text-indigo-600 px-4 py-2.5 rounded-2xl border border-indigo-100 text-sm font-extrabold tracking-widest select-all">
              {selectedCircle.invite_code}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
