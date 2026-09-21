import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { CircleMember } from "../types";
import { MapPin, Battery, RefreshCw, Layers } from "lucide-react";

interface MapComponentProps {
  members: CircleMember[];
  onRefresh: () => void;
  loading: boolean;
}

export const MapComponent: React.FC<MapComponentProps> = ({ members, onRefresh, loading }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [key: string]: L.Marker }>({});

  // Filter members that actually have valid, non-null real device locations
  const membersWithLocation = members.filter(m => 
    m.devices && m.devices.some(d => d.latitude !== null && d.longitude !== null)
  );

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Standard OpenStreetMap tiles with appropriately licensed open data
    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: true
    }).setView([20, 0], 2); // default global view

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    L.control.zoom({ position: "topright" }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update Markers when members or locations change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear removed markers
    const currentEntityIds = new Set<string>();
    
    membersWithLocation.forEach(member => {
      member.devices.forEach(dev => {
        currentEntityIds.add(dev.entity_id);
      });
    });

    Object.keys(markersRef.current).forEach(entityId => {
      if (!currentEntityIds.has(entityId)) {
        markersRef.current[entityId].remove();
        delete markersRef.current[entityId];
      }
    });

    // Draw active markers
    membersWithLocation.forEach((member, mIdx) => {
      // Pick a consistent elegant color based on index if no custom color saved
      const colors = ["#2563eb", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899", "#06b6d4"];
      const memberColor = member.avatar_color || colors[mIdx % colors.length];

      member.devices.forEach(dev => {
        const { latitude, longitude, device_name, battery, last_updated } = dev;

        const initials = member.display_name.charAt(0).toUpperCase();
        
        // Custom HTML Div Icon matching modern Yimly design system
        const iconHtml = `
          <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 44px; height: 44px;">
            <!-- Outer ripple/pulse -->
            <div style="position: absolute; width: 44px; height: 44px; background-color: ${memberColor}; opacity: 0.2; border-radius: 50%; transform: scale(1.1);"></div>
            <!-- Inner circle -->
            <div style="position: relative; width: 34px; height: 34px; background-color: ${memberColor}; border: 2.5px solid white; border-radius: 50%; box-shadow: 0 4px 10px rgba(0,0,0,0.15); display: flex; align-items: center; justify-content: center; font-family: sans-serif; font-size: 13px; font-weight: bold; color: white; text-shadow: 0 1px 2px rgba(0,0,0,0.2);">
              ${initials}
            </div>
            <!-- Pointer pin -->
            <div style="position: absolute; bottom: -4px; width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 6px solid white; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.1));"></div>
          </div>
        `;

        const customIcon = L.divIcon({
          html: iconHtml,
          className: "yimly-custom-marker",
          iconSize: [44, 44],
          iconAnchor: [22, 44],
          popupAnchor: [0, -44]
        });

        // Format updated time
        const updatedDate = new Date(last_updated);
        const timeStr = updatedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const batteryStr = battery !== undefined && battery !== null 
          ? `<div style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: #64748b; margin-top: 4px;">
              <span style="font-weight: 600;">Battery:</span> ${battery}%
             </div>`
          : "";

        const popupContent = `
          <div style="font-family: sans-serif; padding: 4px 2px; min-width: 140px;">
            <p style="margin: 0; font-size: 13px; font-weight: 700; color: #1e293b;">${member.display_name}</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #64748b; font-weight: 500;">${device_name}</p>
            <hr style="margin: 6px 0; border: 0; border-top: 1px solid #e2e8f0;" />
            <div style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: #64748b;">
              <span style="font-weight: 600;">Updated:</span> ${timeStr}
            </div>
            ${batteryStr}
          </div>
        `;

        if (markersRef.current[dev.entity_id]) {
          // Update existing marker's position & popup
          const marker = markersRef.current[dev.entity_id];
          marker.setLatLng([latitude, longitude]);
          marker.setIcon(customIcon);
          marker.getPopup()?.setContent(popupContent);
        } else {
          // Create new marker
          const marker = L.marker([latitude, longitude], { icon: customIcon })
            .addTo(map)
            .bindPopup(popupContent, { closeButton: false });
          markersRef.current[dev.entity_id] = marker;
        }
      });
    });

    // Auto-center map if we have real locations on load
    if (membersWithLocation.length > 0) {
      const bounds = L.latLngBounds(
        membersWithLocation.flatMap(m => m.devices.map(d => [d.latitude, d.longitude] as L.LatLngTuple))
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [membersWithLocation]);

  return (
    <div className="relative w-full h-full flex flex-col bg-[#f8fafc] rounded-3xl overflow-hidden border border-slate-100">
      
      {/* Top Floating Map Bar */}
      <div className="absolute top-4 left-4 right-4 z-[999] flex items-center justify-between pointer-events-none select-none">
        <div className="bg-white/90 backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-sm border border-slate-100/80 pointer-events-auto flex items-center gap-2.5">
          <div className="h-2 w-2 bg-emerald-400 rounded-full animate-pulse" />
          <span className="text-xs font-bold text-slate-700">
            {membersWithLocation.length} Active {membersWithLocation.length === 1 ? "Person" : "People"} Sharing
          </span>
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="bg-white/90 backdrop-blur-md p-3 rounded-2xl shadow-sm border border-slate-100/80 pointer-events-auto hover:bg-slate-50 hover:text-indigo-600 text-slate-500 transition cursor-pointer disabled:opacity-50"
          title="Refresh Locations"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Leaflet Container */}
      <div ref={mapContainerRef} className="w-full flex-1 z-0" />

      {/* NO FAKE LOCATIONS EMPTY STATE OVERLAY */}
      {membersWithLocation.length === 0 && (
        <div className="absolute inset-0 z-[999] pointer-events-none flex items-center justify-center p-4">
          <div className="bg-white/95 backdrop-blur-md p-7 rounded-3xl shadow-[0_24px_64px_rgba(148,163,184,0.1)] border border-slate-100 pointer-events-auto text-center max-w-sm">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50/80 border border-indigo-100/20 flex items-center justify-center text-indigo-600 mb-3.5 mx-auto shadow-sm">
              <MapPin className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">No device locations available yet</h3>
            <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed font-semibold">
              Locations will appear once family members connect their Home Assistant Companion App and report real coordinates.
            </p>

            <div className="mt-4 p-4 rounded-2xl bg-slate-50/50 border border-slate-100/60 text-left">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Quick connection checklist:</h4>
              <ul className="mt-2 space-y-1.5 text-[10px] text-slate-400 list-disc list-inside font-semibold">
                <li>Download official Companion App</li>
                <li>Enter this bridge's server address</li>
                <li>Login and enable location tracking</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Bottom overlay with quick details card of members (only when locations exist) */}
      {membersWithLocation.length > 0 && (
        <div className="absolute bottom-4 left-4 right-4 z-[999] max-w-md pointer-events-auto bg-white/90 backdrop-blur-md p-4 rounded-3xl shadow-[0_16px_48px_rgba(148,163,184,0.06)] border border-slate-100">
          <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Circle Member Tracker</h4>
          <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
            {membersWithLocation.map((member, idx) => {
              const colors = ["bg-indigo-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500", "bg-pink-500", "bg-cyan-500"];
              const colorBg = colors[idx % colors.length];
              
              return (
                <div key={member.id} className="flex items-center justify-between p-2 rounded-2xl bg-slate-50/50 border border-slate-100/60 hover:bg-slate-50 transition">
                  <div className="flex items-center gap-2.5">
                    <div className={`h-7 w-7 rounded-full ${colorBg} text-white font-bold text-xs flex items-center justify-center`}>
                      {member.display_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">{member.display_name}</p>
                      <p className="text-[10px] text-slate-400 font-semibold">
                        {member.devices[0]?.device_name || "Connected Tracker"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {member.devices[0]?.battery !== undefined && member.devices[0]?.battery !== null && (
                      <div className="flex items-center gap-1 text-[10px] text-slate-500 font-bold bg-white px-2 py-0.5 rounded-lg border border-slate-100/60">
                        <Battery className="w-3.5 h-3.5 text-slate-400" />
                        <span>{member.devices[0].battery}%</span>
                      </div>
                    )}
                    <span className="text-[10px] text-slate-400 font-bold">
                      {new Date(member.devices[0].last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
