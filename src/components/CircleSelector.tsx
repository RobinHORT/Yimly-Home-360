import React, { useState } from "react";
import { Circle } from "../types";
import { Users, Plus, Shield, Clipboard, Check, QrCode, LogIn, X, Compass } from "lucide-react";

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

  // QR code image URL utilizing the secure public API qrserver
  const qrCodeUrl = selectedCircle
    ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(selectedCircle.invite_code)}`
    : "";

  return (
    <div className="flex flex-col gap-4">
      
      {/* Circle Selection / Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4.5 rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
        
        {circles.length === 0 ? (
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-indigo-50/60 text-indigo-600 rounded-2xl flex items-center justify-center border border-indigo-100/20">
              <Compass className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">No Circle Found</p>
              <p className="text-xs text-slate-400 mt-0.5">Create or join a Circle to start location sharing.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-10 w-10 bg-indigo-50/60 text-indigo-600 rounded-2xl flex items-center justify-center border border-indigo-100/20 shadow-sm">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-none mb-1">Active Circle</p>
                <select
                  value={selectedCircle?.id || ""}
                  onChange={(e) => {
                    const matched = circles.find(c => c.id === Number(e.target.value));
                    if (matched) onSelectCircle(matched);
                  }}
                  className="bg-transparent border-0 text-sm font-bold text-slate-800 focus:ring-0 focus:outline-none pr-6 cursor-pointer"
                >
                  {circles.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {selectedCircle && (
              <div className="flex items-center gap-2 mt-1 sm:mt-0 sm:ml-4 bg-slate-50/50 px-3.5 py-1.5 rounded-2xl border border-slate-100/60 text-xs font-semibold text-slate-600">
                <span className="text-slate-400">Invite Code:</span>
                <span className="font-bold text-slate-800 tracking-wider select-all">{selectedCircle.invite_code}</span>
                <button
                  onClick={() => handleCopyCode(selectedCircle.invite_code)}
                  className="ml-1.5 text-slate-400 hover:text-indigo-600 transition cursor-pointer"
                  title="Copy Invite Code"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Clipboard className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => setShowQRModal(true)}
                  className="ml-1 text-slate-400 hover:text-indigo-600 transition cursor-pointer"
                  title="Show QR Code"
                >
                  <QrCode className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 mt-2 sm:mt-0">
          <button
            onClick={() => setShowJoinModal(true)}
            disabled={loading}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-slate-50/70 hover:bg-slate-100/80 active:bg-slate-200 border border-slate-100 text-slate-700 font-bold px-4 py-2.5 rounded-2xl text-xs transition cursor-pointer"
          >
            <LogIn className="w-3.5 h-3.5 text-slate-500" />
            Join Circle
          </button>
          
          <button
            onClick={() => setShowCreateModal(true)}
            disabled={loading}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-indigo-600/95 hover:bg-indigo-600 text-white font-bold px-4 py-2.5 rounded-2xl text-xs transition shadow-sm hover:shadow cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Circle
          </button>
        </div>
      </div>

      {/* CREATE CIRCLE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-[0_24px_64px_rgba(148,163,184,0.12)] border border-slate-100/80">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-600" />
                Create a Family Circle
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
                  className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-100 rounded-2xl text-xs text-slate-800 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full bg-indigo-600/90 hover:bg-indigo-600 text-white font-bold py-3 rounded-2xl text-xs uppercase tracking-wider transition shadow-sm hover:shadow"
              >
                Create and Administer
              </button>
            </form>
          </div>
        </div>
      )}

      {/* JOIN CIRCLE MODAL */}
      {showJoinModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-[0_24px_64px_rgba(148,163,184,0.12)] border border-slate-100/80">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <LogIn className="w-4 h-4 text-indigo-600" />
                Join a Family Circle
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
                  placeholder="Enter 8-digit invite code"
                  value={joinInviteCode}
                  onChange={(e) => setJoinInviteCode(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-100 rounded-2xl text-xs text-slate-800 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition uppercase tracking-widest"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full bg-indigo-600/90 hover:bg-indigo-600 text-white font-bold py-3 rounded-2xl text-xs uppercase tracking-wider transition shadow-sm hover:shadow"
              >
                Join Circle
              </button>
            </form>
          </div>
        </div>
      )}

      {/* QR CODE MODAL */}
      {showQRModal && selectedCircle && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-[0_24px_64px_rgba(148,163,184,0.12)] border border-slate-100/80 text-center">
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
              Have family members scan this QR code or input the code below in their Yimly Home app to join <strong className="text-slate-700 font-bold">{selectedCircle.name}</strong>.
            </p>

            <div className="bg-slate-50/50 p-4 rounded-3xl border border-slate-100/60 inline-block mb-4">
              <img
                src={qrCodeUrl}
                alt="Circle Invite QR Code"
                className="w-48 h-48 mx-auto rounded-xl shadow-sm border border-slate-100/10"
              />
            </div>

            <div className="bg-indigo-50/40 text-indigo-600 px-4 py-2.5 rounded-2xl border border-indigo-100/20 text-sm font-bold tracking-widest select-all">
              {selectedCircle.invite_code}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
