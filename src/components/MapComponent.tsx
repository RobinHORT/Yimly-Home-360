import React, { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { CircleMember } from "../types";
import { getMapStyle } from "../lib/mapStyles";
import { MapPin, Battery, RefreshCw, Plus, Minus, Navigation, Clock, Smartphone, X } from "lucide-react";

interface MapComponentProps {
  members: CircleMember[];
  onRefresh: () => void;
  loading: boolean;
  mapStyle?: string | null;
}

export const MapComponent: React.FC<MapComponentProps> = ({ members, onRefresh, loading, mapStyle }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<{ [key: string]: maplibregl.Marker }>({});
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);

  const currentStyleIdRef = useRef<string | null>(null);

  // Filter members that actually have valid, non-null real device locations
  const membersWithLocation = members.filter(m => 
    m.devices && m.devices.some(d => d.latitude !== null && d.longitude !== null)
  );

  // Selected member object if any
  const selectedMember = membersWithLocation.find(m => m.id === selectedMemberId);

  // Initialize MapLibre GL map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const initialStyleOption = getMapStyle(mapStyle);
    currentStyleIdRef.current = initialStyleOption.id;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: initialStyleOption.style,
      center: [0, 20],
      zoom: 2,
      trackResize: true,
      attributionControl: { compact: false }
    });

    map.on("error", (e: maplibregl.ErrorEvent) => {
      console.error("[MapLibre GL Error]", e);
    });

    mapRef.current = map;

    // Set up ResizeObserver to observe the container element
    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    });

    resizeObserver.observe(mapContainerRef.current);

    // Initial resize trigger after DOM layout settlement
    const animFrame = requestAnimationFrame(() => {
      map.resize();
    });

    return () => {
      cancelAnimationFrame(animFrame);
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      markersRef.current = {};
    };
  }, []);

  // Update Map Style dynamically when mapStyle changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentStyleOption = getMapStyle(mapStyle);
    if (currentStyleIdRef.current === currentStyleOption.id) return;

    currentStyleIdRef.current = currentStyleOption.id;
    map.setStyle(currentStyleOption.style, { diff: false });
    map.once("styledata", () => {
      map.resize();
    });
  }, [mapStyle]);

  // Custom Map Actions
  const handleZoomIn = () => {
    mapRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapRef.current?.zoomOut();
  };

  const handleFitBounds = () => {
    setSelectedMemberId(null);
    if (!mapRef.current || membersWithLocation.length === 0) return;

    const bounds = new maplibregl.LngLatBounds();
    membersWithLocation.forEach(m => {
      m.devices.forEach(d => {
        if (d.longitude !== null && d.latitude !== null) {
          bounds.extend([d.longitude, d.latitude]);
        }
      });
    });

    if (!bounds.isEmpty()) {
      mapRef.current.fitBounds(bounds, { padding: 80, maxZoom: 16 });
    }
  };

  const handleFocusMember = (member: CircleMember) => {
    setSelectedMemberId(member.id);
    const primaryDevice = member.devices?.[0];
    if (primaryDevice && mapRef.current && primaryDevice.longitude !== null && primaryDevice.latitude !== null) {
      mapRef.current.flyTo({
        center: [primaryDevice.longitude, primaryDevice.latitude],
        zoom: 16,
        duration: 1200
      });

      const marker = markersRef.current[primaryDevice.entity_id];
      if (marker && !marker.getPopup()?.isOpen()) {
        marker.togglePopup();
      }
    }
  };

  // Sync Markers when members or locations change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentEntityIds = new Set<string>();

    membersWithLocation.forEach(member => {
      member.devices.forEach(dev => {
        if (dev.longitude !== null && dev.latitude !== null) {
          currentEntityIds.add(dev.entity_id);
        }
      });
    });

    // Remove obsolete markers
    Object.keys(markersRef.current).forEach(entityId => {
      if (!currentEntityIds.has(entityId)) {
        markersRef.current[entityId].remove();
        delete markersRef.current[entityId];
      }
    });

    // Draw active markers with saved avatar colours
    membersWithLocation.forEach((member, mIdx) => {
      const defaultColors = ["#4f46e5", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899", "#06b6d4"];
      const memberColor = member.avatar_color || defaultColors[mIdx % defaultColors.length];

      member.devices.forEach(dev => {
        const { latitude, longitude, device_name, battery, last_updated } = dev;
        if (latitude === null || longitude === null) return;

        const initials = member.display_name.charAt(0).toUpperCase();
        const isSelected = selectedMemberId === member.id;

        const updatedDate = new Date(last_updated);
        const timeStr = updatedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const batteryHtml = battery !== undefined && battery !== null 
          ? `<div style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: #64748b; margin-top: 4px;">
              <span style="font-weight: 600;">Battery:</span> ${battery}%
             </div>`
          : "";

        const popupContent = `
          <div style="font-family: system-ui, sans-serif; padding: 4px 2px; min-width: 140px;">
            <p style="margin: 0; font-size: 13px; font-weight: 800; color: #0f172a;">${member.display_name}</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #64748b; font-weight: 600;">${device_name}</p>
            <hr style="margin: 6px 0; border: 0; border-top: 1px solid #f1f5f9;" />
            <div style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: #64748b;">
              <span style="font-weight: 600;">Updated:</span> ${timeStr}
            </div>
            ${batteryHtml}
          </div>
        `;

        const pictureImgHtml = member.profile_picture_url
          ? `<img src="${member.profile_picture_url}" alt="${member.display_name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />`
          : initials;

        const iconHtml = `
          <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; cursor: pointer;">
            <div style="position: absolute; width: 48px; height: 48px; background-color: ${memberColor}; opacity: ${isSelected ? '0.35' : '0.2'}; border-radius: 50%; transform: scale(${isSelected ? '1.25' : '1.05'}); transition: all 0.3s ease;"></div>
            <div style="position: relative; width: 38px; height: 38px; background-color: ${memberColor}; border: 3px solid white; border-radius: 50%; box-shadow: 0 8px 20px rgba(0,0,0,0.18); display: flex; align-items: center; justify-content: center; font-family: system-ui, -apple-system, sans-serif; font-size: 14px; font-weight: 800; color: white; text-shadow: 0 1px 2px rgba(0,0,0,0.25); overflow: hidden;">
              ${pictureImgHtml}
            </div>
            <div style="position: absolute; bottom: -2px; width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 6px solid white; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.15));"></div>
          </div>
        `;

        if (markersRef.current[dev.entity_id]) {
          const marker = markersRef.current[dev.entity_id];
          marker.setLngLat([longitude, latitude]);
          marker.getPopup()?.setHTML(popupContent);

          const el = marker.getElement();
          el.innerHTML = iconHtml;
        } else {
          const el = document.createElement("div");
          el.className = "yimly-custom-marker";
          el.innerHTML = iconHtml;

          const popup = new maplibregl.Popup({ offset: [0, -38], closeButton: false }).setHTML(popupContent);

          const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
            .setLngLat([longitude, latitude])
            .setPopup(popup)
            .addTo(map);

          el.addEventListener("click", () => {
            setSelectedMemberId(member.id);
          });

          markersRef.current[dev.entity_id] = marker;
        }
      });
    });

    // Fit bounds on initial load if no specific member selected
    if (membersWithLocation.length > 0 && selectedMemberId === null) {
      const bounds = new maplibregl.LngLatBounds();
      membersWithLocation.forEach(m => {
        m.devices.forEach(d => {
          if (d.longitude !== null && d.latitude !== null) {
            bounds.extend([d.longitude, d.latitude]);
          }
        });
      });

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 80, maxZoom: 16 });
      }
    }
  }, [membersWithLocation, selectedMemberId]);

  return (
    <div className="relative w-full h-full overflow-hidden select-none">
      
      {/* FULL-SCREEN MAP CANVAS */}
      <div ref={mapContainerRef} className="w-full h-full absolute inset-0 z-0 bg-[#f8fafc]" />

      {/* FLOATING MEMBER AVATARS BAR */}
      {membersWithLocation.length > 0 && (
        <div className="absolute top-20 md:top-4 left-4 right-16 md:right-auto md:left-80 z-20 pointer-events-none flex items-center">
          <div className="pointer-events-auto flex items-center gap-1.5 overflow-x-auto p-1.5 bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.08)] rounded-full max-w-full scrollbar-none">
            
            {/* Fit All Members Pill */}
            <button
              onClick={handleFitBounds}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                selectedMemberId === null
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100/80"
              }`}
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>All ({membersWithLocation.length})</span>
            </button>

            {/* Member Pills with Saved Avatar Colors (Icon-Only) */}
            {membersWithLocation.map((member) => {
              const isSelected = selectedMemberId === member.id;
              const memberColor = member.avatar_color || "#4f46e5";

              return (
                <button
                  key={member.id}
                  onClick={() => handleFocusMember(member)}
                  title={member.display_name}
                  aria-label={member.display_name}
                  className={`relative p-0.5 rounded-full transition shrink-0 cursor-pointer border ${
                    isSelected
                      ? "bg-white text-slate-900 shadow-md scale-105"
                      : "bg-white/60 text-slate-700 hover:bg-white/90 hover:scale-105 border-slate-100"
                  }`}
                  style={{
                    borderColor: isSelected ? memberColor : "rgba(226, 232, 240, 0.8)",
                    boxShadow: isSelected ? `0 0 0 2.5px ${memberColor}` : "none"
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-full text-white font-extrabold text-xs flex items-center justify-center shadow-sm overflow-hidden shrink-0"
                    style={{ backgroundColor: memberColor }}
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
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* FLOATING MAP CONTROLS (RIGHT SIDEBAR) */}
      <div className="absolute right-4 top-20 md:top-4 z-20 pointer-events-auto flex flex-col gap-2">
        <div className="bg-white/80 backdrop-blur-xl p-1 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-white/60 flex flex-col gap-1">
          <button
            onClick={handleZoomIn}
            className="w-9 h-9 rounded-xl hover:bg-slate-100/80 flex items-center justify-center text-slate-700 transition cursor-pointer"
            title="Zoom In"
          >
            <Plus className="w-4 h-4" />
          </button>

          <div className="w-6 h-px bg-slate-200/60 mx-auto" />

          <button
            onClick={handleZoomOut}
            className="w-9 h-9 rounded-xl hover:bg-slate-100/80 flex items-center justify-center text-slate-700 transition cursor-pointer"
            title="Zoom Out"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={handleFitBounds}
          className="w-11 h-11 bg-white/80 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-white/60 flex items-center justify-center text-slate-700 hover:bg-white hover:text-indigo-600 transition cursor-pointer"
          title="Recenter / Fit All"
        >
          <Navigation className="w-4.5 h-4.5" />
        </button>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="w-11 h-11 bg-white/80 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-white/60 flex items-center justify-center text-slate-700 hover:bg-white hover:text-indigo-600 transition cursor-pointer disabled:opacity-50"
          title="Refresh Locations"
        >
          <RefreshCw className={`w-4.5 h-4.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* SELECTED MEMBER FLOATING CARD OVERLAY */}
      {selectedMember && selectedMember.devices?.[0] && (
        <div className="absolute bottom-20 md:bottom-6 left-4 right-4 md:right-auto md:max-w-sm z-20 pointer-events-auto bg-white/90 backdrop-blur-2xl p-5 rounded-3xl shadow-2xl border border-white/80 transition-all duration-300">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-2xl text-white font-extrabold text-base flex items-center justify-center shadow-sm overflow-hidden shrink-0"
                style={{
                  backgroundColor: selectedMember.avatar_color || "#4f46e5",
                  boxShadow: `0 4px 14px ${selectedMember.avatar_color || '#4f46e5'}40`
                }}
              >
                {selectedMember.profile_picture_url ? (
                  <img
                    src={selectedMember.profile_picture_url}
                    alt={selectedMember.display_name}
                    className="w-full h-full object-cover rounded-2xl"
                  />
                ) : (
                  selectedMember.display_name.charAt(0).toUpperCase()
                )}
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800">{selectedMember.display_name}</h3>
                <p className="text-[11px] text-slate-400 font-semibold flex items-center gap-1 mt-0.5">
                  <Smartphone className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span>{selectedMember.devices[0].device_name}</span>
                </p>
              </div>
            </div>

            <button
              onClick={() => setSelectedMemberId(null)}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100/60 transition cursor-pointer"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>

          <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            {selectedMember.devices[0].battery !== undefined && selectedMember.devices[0].battery !== null && (
              <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
                <Battery className="w-4 h-4 text-emerald-500" />
                <span className="font-bold text-slate-700">{selectedMember.devices[0].battery}%</span>
              </div>
            )}

            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>{new Date(selectedMember.devices[0].last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
        </div>
      )}

      {/* NO FAKE LOCATIONS EMPTY STATE FLOATING OVERLAY */}
      {membersWithLocation.length === 0 && (
        <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center p-4">
          <div className="bg-white/90 backdrop-blur-2xl p-7 rounded-3xl shadow-2xl border border-white/80 pointer-events-auto text-center max-w-sm">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3.5 mx-auto shadow-sm border border-indigo-100/40">
              <MapPin className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">No device locations available</h3>
            <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed font-semibold">
              Locations will automatically appear when family members connect their Home Assistant Companion App and send real coordinates.
            </p>

            <div className="mt-4 p-3.5 rounded-2xl bg-slate-50/70 border border-slate-100 text-left">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Connection steps:</h4>
              <ul className="mt-2 space-y-1 text-[10px] text-slate-400 list-disc list-inside font-semibold">
                <li>Install Home Assistant Companion App</li>
                <li>Enter this bridge's URL address</li>
                <li>Sign in to sync real location telemetry</li>
              </ul>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
