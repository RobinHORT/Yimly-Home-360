import React from "react";
import { CircleMember } from "../types";
import { UserCheck, Smartphone, MapPin, Battery, Clock, Wifi } from "lucide-react";

interface PeopleTabProps {
  members: CircleMember[];
  loading: boolean;
}

export const PeopleTab: React.FC<PeopleTabProps> = ({ members, loading }) => {
  return (
    <div className="bg-white p-7 sm:p-8 rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.015)] max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-indigo-600" />
          Family Members
        </h2>
        <p className="text-xs text-slate-400 font-semibold mt-1 leading-relaxed">
          Review the status of members and companion apps registered under this Circle.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-xs text-slate-400 font-bold tracking-wide">Loading members...</div>
      ) : members.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-100 rounded-3xl bg-slate-50/20 px-6">
          <p className="text-sm font-bold text-slate-600">No members in this Circle</p>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed font-semibold max-w-xs mx-auto">
            Invite family members by sharing your active Circle's invite code.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4.5">
          {members.map((member, idx) => {
            const hasLocation = member.devices && member.devices.length > 0;
            const primaryDevice = hasLocation ? member.devices[0] : null;

            return (
              <div
                key={member.id}
                className="p-6 rounded-3xl bg-[#fafbfe]/40 border border-slate-100/80 flex flex-col justify-between hover:shadow-[0_12px_32px_rgba(148,163,184,0.04)] hover:border-slate-200/50 transition duration-200"
              >
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div 
                      className="h-10 w-10 text-white font-black text-sm rounded-full flex items-center justify-center select-none shadow-sm transition-all duration-300 overflow-hidden shrink-0"
                      style={{ 
                        backgroundColor: member.avatar_color || "#4f46e5", 
                        border: member.avatar_color ? "2px solid white" : "none",
                        boxShadow: member.avatar_color ? `0 0 0 2px ${member.avatar_color}` : "none" 
                      }}
                    >
                      {member.profile_picture_url ? (
                        <img
                          src={member.profile_picture_url}
                          alt={member.display_name}
                          className="w-full h-full object-cover rounded-full"
                        />
                      ) : (
                        member.display_name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">{member.display_name}</p>
                      <p className="text-[10px] text-slate-400 font-bold mt-0.5">{member.username}</p>
                    </div>
                  </div>

                  <div className="space-y-3 border-t border-slate-100 pt-4">
                    {primaryDevice ? (
                      <>
                        <div className="flex items-center gap-2 text-xs text-slate-600 font-semibold">
                          <Smartphone className="w-4 h-4 text-indigo-400 shrink-0" />
                          <span className="text-slate-400">Device:</span>
                          <span className="text-slate-700 truncate">{primaryDevice.device_name}</span>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-slate-600 font-semibold">
                          <MapPin className="w-4 h-4 text-indigo-400 shrink-0" />
                          <span className="text-slate-400">Coordinates:</span>
                          <span className="font-mono text-[10px] text-slate-500 bg-white border border-slate-100/80 px-2 py-0.5 rounded-lg font-bold">
                            {primaryDevice.latitude.toFixed(4)}, {primaryDevice.longitude.toFixed(4)}
                          </span>
                        </div>

                        {primaryDevice.battery !== undefined && primaryDevice.battery !== null && (
                          <div className="flex items-center gap-2 text-xs text-slate-600 font-semibold">
                            <Battery className="w-4 h-4 text-indigo-400 shrink-0" />
                            <span className="text-slate-400">Battery Level:</span>
                            <span className="text-slate-700 font-bold">{primaryDevice.battery}%</span>
                          </div>
                        )}

                        <div className="flex items-center gap-2 text-xs text-slate-600 font-semibold">
                          <Clock className="w-4 h-4 text-indigo-400 shrink-0" />
                          <span className="text-slate-400">Last Seen:</span>
                          <span className="text-slate-400 text-[11px]">
                            {new Date(primaryDevice.last_updated).toLocaleString()}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="p-4 bg-white rounded-2xl border border-slate-100/80 text-center">
                        <p className="text-[11px] font-bold text-slate-700">No Companion App Connected</p>
                        <p className="text-[10px] text-slate-400 font-semibold mt-1 leading-relaxed max-w-[200px] mx-auto">
                          Location updates will become active when this user pairs their device.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {primaryDevice && (
                  <div className="mt-4.5 flex items-center gap-1.5 justify-end">
                    <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-[9px] text-emerald-600 font-extrabold uppercase tracking-widest">Active State</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
