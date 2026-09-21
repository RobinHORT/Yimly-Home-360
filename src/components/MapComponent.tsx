import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as maplibregl from "maplibre-gl";
import { CircleMember, LocationHistoryItem } from "../types";
import { getMapStyle } from "../lib/mapStyles";
import { 
  MapPin, 
  RefreshCw, 
  Plus, 
  Minus, 
  Navigation, 
  History, 
  Smartphone, 
  Battery, 
  Clock, 
  X,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Check,
  AlertCircle,
  Eye,
  EyeOff
} from "lucide-react";

interface MapComponentProps {
  members: CircleMember[];
  onRefresh: () => void;
  loading: boolean;
  mapStyle?: string | null;
  selectedIconSize?: number | null;
  unselectedIconSize?: number | null;
}

type ActiveCardView = 'member_info' | 'history' | 'custom_range';

interface ActiveRangeConfig {
  type: 'preset' | 'custom';
  presetId?: string; // '1h' | '6h' | '24h' | '7d' | 'all'
  hours?: number | null;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  label: string; // e.g. "24 hours", "Custom: 18 Sep – 21 Sep"
}

interface RangePreset {
  id: string;
  label: string;
  hours: number | null;
}

const PRESET_RANGES: RangePreset[] = [
  { id: "1h", label: "1 hour", hours: 1 },
  { id: "6h", label: "6 hours", hours: 6 },
  { id: "24h", label: "24 hours", hours: 24 },
  { id: "7d", label: "7 days", hours: 168 },
  { id: "all", label: "All", hours: null },
];

function toDateInputValue(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCustomRangeLabel(startStr: string, endStr: string): string {
  const parts1 = startStr.split("-");
  const parts2 = endStr.split("-");
  if (parts1.length === 3 && parts2.length === 3) {
    const d1 = new Date(Number(parts1[0]), Number(parts1[1]) - 1, Number(parts1[2]));
    const d2 = new Date(Number(parts2[0]), Number(parts2[1]) - 1, Number(parts2[2]));
    const s1 = d1.toLocaleDateString("en-US", { day: "numeric", month: "short" });
    const s2 = d2.toLocaleDateString("en-US", { day: "numeric", month: "short" });
    if (startStr === endStr) {
      return `Custom: ${s1}`;
    }
    return `Custom: ${s1} – ${s2}`;
  }
  return `Custom: ${startStr} – ${endStr}`;
}

/**
 * Calculates a smooth color gradient along the member's journey based on their saved pastel avatar color.
 * 
 * EARLIEST HISTORY (progress = 0.0):
 * -> softer / lighter version of the member's pastel colour
 * 
 * MIDDLE OF JOURNEY (progress = 0.5):
 * -> progressively deeper version
 * 
 * LATEST / NEWEST HISTORY (progress = 1.0):
 * -> darker matching version of the member's pastel colour
 * 
 * Strictly preserves the exact same color family (hue) throughout the entire journey.
 */
function getRouteGradientColor(hexColor?: string | null, progress: number = 1.0): string {
  if (!hexColor || !hexColor.startsWith("#")) return "#3730a3";
  let hex = hexColor.replace("#", "");
  if (hex.length === 3) {
    hex = hex.split("").map((c) => c + c).join("");
  }
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / d + 2;
        break;
      case bNorm:
        h = (rNorm - gNorm) / d + 4;
        break;
    }
    h /= 6;
  }

  // Clamped progress between 0 (oldest/earliest) and 1 (latest/newest)
  const clampedProgress = Math.max(0, Math.min(1, progress));

  // Earliest / oldest history endpoint: soft, subtle light pastel in the same hue
  const lightL = Math.min(0.85, Math.max(0.76, l * 1.15));
  const lightS = Math.min(0.55, Math.max(0.35, s * 0.85));

  // Latest / newest history endpoint: slightly deeper matching pastel (NOT dark or harsh)
  const darkL = Math.min(0.52, Math.max(0.42, l * 0.72));
  const darkS = Math.min(0.70, Math.max(0.48, s * 1.10));

  // Smooth low-contrast interpolation along the journey timeline
  const targetL = lightL + (darkL - lightL) * clampedProgress;
  const targetS = lightS + (darkS - lightS) * clampedProgress;

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = targetL < 0.5 ? targetL * (1 + targetS) : targetL + targetS - targetL * targetS;
  const p = 2 * targetL - q;
  const resR = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const resG = Math.round(hue2rgb(p, q, h) * 255);
  const resB = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);

  return `#${resR.toString(16).padStart(2, "0")}${resG.toString(16).padStart(2, "0")}${resB.toString(16).padStart(2, "0")}`;
}

function getDarkerRouteColor(hexColor?: string | null): string {
  return getRouteGradientColor(hexColor, 1.0);
}

// Calculate distance in km between two coordinates using Haversine formula
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const MapComponent: React.FC<MapComponentProps> = ({ 
  members, 
  onRefresh, 
  loading, 
  mapStyle,
  selectedIconSize,
  unselectedIconSize
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<{ [key: string]: maplibregl.Marker }>({});
  const cardContainerRef = useRef<HTMLDivElement>(null);
  const currentTargetCoordRef = useRef<[number, number] | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);

  // Card View and History Navigation States
  const [cardView, setCardView] = useState<ActiveCardView>('member_info');
  const [isCardHidden, setIsCardHidden] = useState<boolean>(false);
  const [activeRange, setActiveRange] = useState<ActiveRangeConfig>({
    type: 'preset',
    presetId: '24h',
    hours: 24,
    label: '24 hours'
  });
  const [isRangePickerOpen, setIsRangePickerOpen] = useState<boolean>(false);

  // Custom Range Draft Values
  const todayStr = useMemo(() => toDateInputValue(new Date()), []);
  const threeDaysAgoStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    return toDateInputValue(d);
  }, []);
  const [draftStartDate, setDraftStartDate] = useState<string>(threeDaysAgoStr);
  const [draftEndDate, setDraftEndDate] = useState<string>(todayStr);
  const [customDateError, setCustomDateError] = useState<string | null>(null);

  const [historyData, setHistoryData] = useState<LocationHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const currentStyleIdRef = useRef<string | null>(null);

  // Filter members that actually have valid, non-null real device locations
  const membersWithLocation = members.filter(m => 
    m.devices && m.devices.some(d => d.latitude !== null && d.longitude !== null)
  );
  const membersWithLocRef = useRef(membersWithLocation);
  membersWithLocRef.current = membersWithLocation;

  const selectedMember = membersWithLocation.find(m => m.id === selectedMemberId) || null;
  const primaryDevice = selectedMember?.devices?.[0];

  // Solid darker route color automatically derived from member's pastel color
  const darkerRouteColor = useMemo(() => {
    return getDarkerRouteColor(selectedMember?.avatar_color);
  }, [selectedMember?.avatar_color]);

  // Retrieve selected member's real location history from Yimly Home Core
  const fetchMemberHistory = useCallback(async (
    memberId: number, 
    range: ActiveRangeConfig
  ) => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const token = localStorage.getItem("access_token");
      const queryParams = new URLSearchParams();
      queryParams.set("user_id", String(memberId));
      if (range.type === 'preset') {
        if (range.hours !== undefined && range.hours !== null) {
          queryParams.set("hours", String(range.hours));
        }
      } else if (range.type === 'custom' && range.startDate && range.endDate) {
        queryParams.set("start_date", `${range.startDate}T00:00:00.000Z`);
        queryParams.set("end_date", `${range.endDate}T23:59:59.999Z`);
      }

      const res = await fetch(`/api/history/period?${queryParams.toString()}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      if (res.ok) {
        const data: LocationHistoryItem[] = await res.json();
        setHistoryData(data);
      } else {
        const err = await res.json().catch(() => ({ detail: "Failed to load location history" }));
        setHistoryError(err.detail || "Unable to retrieve location history for this member.");
      }
    } catch (err) {
      console.error("Error fetching location history:", err);
      setHistoryError("Network error while communicating with Yimly Core.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

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

  // Sync Smooth Gradient History Route on the Map Canvas with Gap Preservation
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const removeHistoryLayers = () => {
      if (map.getLayer("history-route-points")) map.removeLayer("history-route-points");
      if (map.getLayer("history-route-line")) map.removeLayer("history-route-line");
      if (map.getSource("history-route-source")) map.removeSource("history-route-source");
    };

    // Route is displayed when viewing History Card or Custom Range Card
    const isHistoryActive = cardView === 'history' || cardView === 'custom_range';

    if (!isHistoryActive || !selectedMemberId || historyData.length === 0) {
      removeHistoryLayers();
      return;
    }

    // Sort chronological ascending (oldest first to draw route progression)
    const validPoints = historyData
      .filter(d => d.longitude != null && d.latitude != null)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (validPoints.length === 0) {
      removeHistoryLayers();
      return;
    }

    const totalPoints = validPoints.length;
    const geojsonFeatures: GeoJSON.Feature[] = [];

    // Build contiguous 2-point LineString segments with smooth gradient coloring
    // preserving gaps (> 6 hours or > 50km without recorded points)
    for (let i = 1; i < totalPoints; i++) {
      const prevPt = validPoints[i - 1];
      const currPt = validPoints[i];

      const timeDiffHours = Math.abs(new Date(currPt.timestamp).getTime() - new Date(prevPt.timestamp).getTime()) / (3600 * 1000);
      const distKm = calculateDistanceKm(prevPt.latitude, prevPt.longitude, currPt.latitude, currPt.longitude);

      // Do NOT invent paths across large gaps in recorded history
      if (timeDiffHours > 6 || distKm > 50) {
        continue;
      }

      // Progress along chronological journey: oldest is 0.0 (lightest), newest is 1.0 (darkest)
      const segmentProgress = totalPoints > 1 ? (i - 0.5) / (totalPoints - 1) : 1.0;
      const segmentColor = getRouteGradientColor(selectedMember?.avatar_color, segmentProgress);

      geojsonFeatures.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [prevPt.longitude, prevPt.latitude],
            [currPt.longitude, currPt.latitude]
          ]
        },
        properties: {
          color: segmentColor
        }
      });
    }

    // Add individual waypoint circles with matching gradient color
    validPoints.forEach((pt, idx) => {
      const ptProgress = totalPoints > 1 ? idx / (totalPoints - 1) : 1.0;
      const ptColor = getRouteGradientColor(selectedMember?.avatar_color, ptProgress);

      geojsonFeatures.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [pt.longitude, pt.latitude]
        },
        properties: {
          color: ptColor,
          isLatest: idx === totalPoints - 1
        }
      });
    });

    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: geojsonFeatures
    };

    try {
      const existingSource = map.getSource("history-route-source") as maplibregl.GeoJSONSource;
      if (existingSource) {
        existingSource.setData(geojson);
        if (map.getLayer("history-route-line")) {
          map.setPaintProperty("history-route-line", "line-color", ["get", "color"]);
        }
        if (map.getLayer("history-route-points")) {
          map.setPaintProperty("history-route-points", "circle-color", ["get", "color"]);
        }
      } else {
        map.addSource("history-route-source", {
          type: "geojson",
          data: geojson
        });

        // Gradient route line segments with rounded joins and caps
        map.addLayer({
          id: "history-route-line",
          type: "line",
          source: "history-route-source",
          filter: ["==", "$type", "LineString"],
          layout: {
            "line-join": "round",
            "line-cap": "round"
          },
          paint: {
            "line-color": ["get", "color"],
            "line-width": 4.5,
            "line-opacity": 0.95
          }
        });

        // Waypoint circles along gradient
        map.addLayer({
          id: "history-route-points",
          type: "circle",
          source: "history-route-source",
          filter: ["==", "$type", "Point"],
          paint: {
            "circle-radius": 5,
            "circle-color": ["get", "color"],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff"
          }
        });
      }
    } catch (err) {
      console.warn("History layer update deferred until style data is ready:", err);
    }
  }, [cardView, selectedMemberId, historyData, selectedMember?.avatar_color, mapStyle]);

  // Custom Map Actions
  const handleZoomIn = () => {
    mapRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapRef.current?.zoomOut();
  };

  const handleFitBounds = () => {
    if (!mapRef.current || membersWithLocation.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    membersWithLocation.forEach((m) => {
      m.devices.forEach((d) => {
        if (d.longitude !== null && d.latitude !== null) {
          bounds.extend([d.longitude, d.latitude]);
        }
      });
    });

    if (!bounds.isEmpty()) {
      mapRef.current.fitBounds(bounds, { padding: 80, maxZoom: 16, duration: 1000 });
    }
    setSelectedMemberId(null);
    setCardView('member_info');
    setIsRangePickerOpen(false);
    setHistoryData([]);
    setIsCardHidden(false);
  };

  // Card-aware bottom padding calculation
  const getBottomPaddingForView = useCallback((view: ActiveCardView, isHidden: boolean) => {
    if (isHidden) return 28;
    if (view === 'history') {
      if (cardContainerRef.current) {
        const rect = cardContainerRef.current.getBoundingClientRect();
        const measured = window.innerHeight - rect.top + 16;
        if (measured > 100 && measured < window.innerHeight * 0.7) return measured;
      }
      return 420;
    }
    if (view === 'custom_range') {
      if (cardContainerRef.current) {
        const rect = cardContainerRef.current.getBoundingClientRect();
        const measured = window.innerHeight - rect.top + 16;
        if (measured > 100 && measured < window.innerHeight * 0.7) return measured;
      }
      return 360;
    }
    // view === 'member_info' (wide pill card)
    if (cardContainerRef.current) {
      const rect = cardContainerRef.current.getBoundingClientRect();
      const measured = window.innerHeight - rect.top + 16;
      if (measured > 80 && measured < window.innerHeight * 0.65) return measured;
    }
    // Highly reliable geometric default above navigation dock:
    // dock offset (80px mobile / 88px desktop) + pill card height (~56px) + buffer (16px) = ~152px-160px
    return window.innerWidth >= 768 ? 160 : 152;
  }, []);

  // Directly fly map camera to clicked member's current real coordinates
  const flyToMemberLocation = useCallback((
    member: CircleMember,
    targetView: ActiveCardView = 'member_info',
    isHidden: boolean = false,
    duration = 800
  ) => {
    const dev = member.devices?.find(d => d.latitude !== null && d.longitude !== null) || member.devices?.[0];
    if (!dev || dev.latitude === null || dev.longitude === null) return;
    const map = mapRef.current;
    if (!map) return;

    const bottomPad = getBottomPaddingForView(targetView, isHidden);
    const topPad = 76;

    // Direct target coordinate tracking (avoid stale React state)
    currentTargetCoordRef.current = [dev.longitude, dev.latitude];

    const currentZoom = map.getZoom();
    const targetZoom = currentZoom < 14 ? 15 : currentZoom;

    map.flyTo({
      center: [dev.longitude, dev.latitude],
      zoom: targetZoom,
      padding: { top: topPad, bottom: bottomPad, left: 0, right: 0 },
      duration,
      essential: true
    });
  }, [getBottomPaddingForView]);

  // Focus member, center map in usable area above card, and show member information card on the SAME FIRST CLICK
  const handleFocusMember = useCallback((member: CircleMember) => {
    setSelectedMemberId(member.id);
    setCardView('member_info');
    setIsRangePickerOpen(false);
    setCustomDateError(null);
    setIsCardHidden(false);

    // Direct flyTo using clicked member's current coordinates on first click
    flyToMemberLocation(member, 'member_info', false, 800);
  }, [flyToMemberLocation]);

  // Show Card action: restores card and re-centers member in usable area above card
  const handleShowCard = useCallback(() => {
    setIsCardHidden(false);
    if (selectedMember) {
      flyToMemberLocation(selectedMember, cardView, false, 400);
    }
  }, [selectedMember, cardView, flyToMemberLocation]);

  // Hide Card action: hides card and expands usable map area to full viewport
  const handleHideCard = useCallback(() => {
    setIsCardHidden(true);
    if (selectedMember) {
      const dev = selectedMember.devices?.find(d => d.latitude !== null && d.longitude !== null);
      if (dev && dev.longitude !== null && dev.latitude !== null && mapRef.current) {
        mapRef.current.easeTo({
          center: [dev.longitude, dev.latitude],
          padding: { top: 76, bottom: 28, left: 0, right: 0 },
          duration: 350
        });
      }
    }
  }, [selectedMember]);

  // Navigate to History Card
  const openHistoryView = useCallback(() => {
    setCardView('history');
    setIsRangePickerOpen(false);
    if (selectedMember) {
      fetchMemberHistory(selectedMember.id, activeRange);
      flyToMemberLocation(selectedMember, 'history', false, 400);
    }
  }, [selectedMember, activeRange, fetchMemberHistory, flyToMemberLocation]);

  // Back from History Card to Member Information Card
  const backToMemberInfo = useCallback(() => {
    setCardView('member_info');
    setIsRangePickerOpen(false);
    if (selectedMember) {
      flyToMemberLocation(selectedMember, 'member_info', false, 400);
    }
  }, [selectedMember, flyToMemberLocation]);

  // Open Custom Range Card
  const openCustomRangeView = useCallback(() => {
    setIsRangePickerOpen(false);
    setDraftStartDate(activeRange.startDate || threeDaysAgoStr);
    setDraftEndDate(activeRange.endDate || todayStr);
    setCustomDateError(null);
    setCardView('custom_range');
    if (selectedMember) {
      flyToMemberLocation(selectedMember, 'custom_range', false, 400);
    }
  }, [activeRange, threeDaysAgoStr, todayStr, selectedMember, flyToMemberLocation]);

  // Back from Custom Range Card to History Card
  const backToHistoryFromCustom = useCallback(() => {
    setCardView('history');
    setCustomDateError(null);
    if (selectedMember) {
      flyToMemberLocation(selectedMember, 'history', false, 400);
    }
  }, [selectedMember, flyToMemberLocation]);

  // Post-layout camera adjustment: when card finishes rendering or changes dimensions,
  // ensure the selected member is visually centered in the usable map area ABOVE the bottom card
  useEffect(() => {
    if (!cardContainerRef.current || !selectedMemberId || isCardHidden) return;

    const observer = new ResizeObserver(() => {
      const map = mapRef.current;
      const targetCoord = currentTargetCoordRef.current;
      if (!map || !targetCoord) return;

      // Do NOT interrupt active flyTo animations during initial selection!
      if (map.isMoving()) return;

      const rect = cardContainerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const actualBottomPad = Math.max(80, Math.min(window.innerHeight * 0.65, window.innerHeight - rect.top + 16));

      map.easeTo({
        center: targetCoord,
        padding: { top: 76, bottom: actualBottomPad, left: 0, right: 0 },
        duration: 200
      });
    });

    observer.observe(cardContainerRef.current);
    return () => observer.disconnect();
  }, [selectedMemberId, cardView, isCardHidden]);

  // Update Markers & Sync Selection
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentMemberIds = new Set<string>();

    membersWithLocation.forEach((member) => {
      const primaryDevice = member.devices?.[0];
      if (!primaryDevice || primaryDevice.longitude === null || primaryDevice.latitude === null) return;

      const markerKey = `member_${member.id}`;
      currentMemberIds.add(markerKey);

      const isSelected = selectedMemberId === member.id;
      const baseColor = member.avatar_color || "#4f46e5";

      // Effective marker dimensions based on user customization settings
      const unselSize = unselectedIconSize || 44;
      const selSize = selectedIconSize || 54;
      const markerSize = isSelected ? selSize : unselSize;
      const innerSize = markerSize - 6;

      let marker = markersRef.current[markerKey];

      if (!marker) {
        // Create custom MapLibre HTML marker element
        const el = document.createElement("div");
        el.className = "custom-member-marker cursor-pointer transition-transform duration-200";
        el.style.zIndex = isSelected ? "10" : "1";

        marker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([primaryDevice.longitude, primaryDevice.latitude])
          .addTo(map);

        markersRef.current[markerKey] = marker;
      } else {
        marker.setLngLat([primaryDevice.longitude, primaryDevice.latitude]);
      }

      // Update marker element styling and dynamic HTML with avatar picture / initials
      const el = marker.getElement();
      el.style.zIndex = isSelected ? "20" : "5";
      el.style.width = `${markerSize}px`;
      el.style.height = `${markerSize}px`;

      // Always wire click handler to freshest member coordinates, selecting & centering on the same first click (no popup)
      el.onclick = (e) => {
        e.stopPropagation();
        const freshMember = membersWithLocRef.current.find(m => m.id === member.id) || member;
        handleFocusMember(freshMember);
      };

      el.innerHTML = `
        <div class="relative w-full h-full rounded-full flex items-center justify-center transition-all duration-300"
             style="
               background-color: white;
               padding: 3px;
               box-shadow: ${
                 isSelected
                   ? `0 0 0 3.5px ${baseColor}, 0 8px 24px rgba(0,0,0,0.22)`
                   : `0 2px 10px rgba(0,0,0,0.12)`
               };
             ">
          <div class="w-full h-full rounded-full text-white font-black text-xs flex items-center justify-center overflow-hidden"
               style="
                 width: ${innerSize}px;
                 height: ${innerSize}px;
                 background-color: ${baseColor};
               ">
            ${
              member.profile_picture_url
                ? `<img src="${member.profile_picture_url}" alt="${member.display_name}" class="w-full h-full object-cover rounded-full pointer-events-none" />`
                : member.display_name.charAt(0).toUpperCase()
            }
          </div>
          ${
            primaryDevice.battery !== undefined && primaryDevice.battery !== null
              ? `
                <div class="absolute -bottom-1 -right-1 bg-white text-slate-800 text-[9px] font-black px-1 rounded-full shadow-sm border border-slate-200">
                  ${primaryDevice.battery}%
                </div>
              `
              : ''
          }
        </div>
      `;
    });

    // Cleanup markers for removed members
    Object.keys(markersRef.current).forEach((key) => {
      if (!currentMemberIds.has(key)) {
        markersRef.current[key].remove();
        delete markersRef.current[key];
      }
    });

    // Auto-fit initial bounds when markers first load if nothing is selected
    if (selectedMemberId === null && membersWithLocation.length > 0 && map.getZoom() <= 2) {
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
  }, [membersWithLocation, selectedMemberId, selectedIconSize, unselectedIconSize, handleFocusMember]);

  return (
    <div className="relative w-full h-full overflow-hidden select-none">
      
      {/* FULL-SCREEN MAP CANVAS */}
      <div ref={mapContainerRef} className="w-full h-full absolute inset-0 z-0 bg-[#f8fafc]" />

      {/* FLOATING MEMBER AVATARS BAR (CENTRED AT VERY TOP) */}
      {membersWithLocation.length > 0 && (
        <div className="absolute top-[max(0.75rem,env(safe-area-inset-top))] sm:top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none flex justify-center max-w-[calc(100vw-2rem)]">
          <div className="pointer-events-auto flex items-center gap-2 overflow-x-auto p-1.5 bg-white/85 backdrop-blur-2xl border border-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.08)] rounded-full max-w-full scrollbar-none">
            {/* Member Pills with Saved Avatar Colors (Icon/Avatar Only) */}
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
                      ? "bg-white text-slate-900 shadow-md scale-110"
                      : "bg-white/60 text-slate-700 hover:bg-white/90 hover:scale-105 border-slate-100"
                  }`}
                  style={{
                    borderColor: isSelected ? memberColor : "rgba(226, 232, 240, 0.8)",
                    boxShadow: isSelected ? `0 0 0 2.5px ${memberColor}` : "none"
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-full text-white font-extrabold text-xs flex items-center justify-center shadow-sm overflow-hidden shrink-0"
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
      <div className="absolute right-3 sm:right-4 top-16 sm:top-20 z-20 pointer-events-auto flex flex-col gap-2">
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

      {/* 1. COMPACT HORIZONTAL MEMBER INFORMATION CARD (WIDE PILL) */}
      {selectedMember && !isCardHidden && cardView === 'member_info' && (
        <div 
          ref={cardContainerRef}
          className="absolute bottom-20 md:bottom-22 left-3 right-3 sm:left-1/2 sm:-translate-x-1/2 sm:w-[500px] sm:max-w-[calc(100vw-3rem)] z-30 pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <div className="bg-white/95 backdrop-blur-2xl px-4 py-2 sm:px-5 sm:py-2.5 rounded-full shadow-[0_12px_36px_rgba(0,0,0,0.14)] border border-white/80 transition-all duration-300 flex items-center justify-between gap-2.5 sm:gap-3">
            {/* Left: Avatar & Member details */}
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
              <div
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full text-white font-black text-xs sm:text-sm flex items-center justify-center select-none shadow-sm overflow-hidden shrink-0"
                style={{
                  backgroundColor: selectedMember.avatar_color || "#4f46e5",
                  boxShadow: `0 0 0 2px white, 0 2px 6px ${selectedMember.avatar_color || '#4f46e5'}40`
                }}
              >
                {selectedMember.profile_picture_url ? (
                  <img
                    src={selectedMember.profile_picture_url}
                    alt={selectedMember.display_name}
                    className="w-full h-full object-cover rounded-full"
                  />
                ) : (
                  selectedMember.display_name.charAt(0).toUpperCase()
                )}
              </div>

              <div className="min-w-0 flex-1">
                <h4 className="text-xs sm:text-sm font-bold text-slate-800 truncate leading-tight">
                  {selectedMember.display_name}
                </h4>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium leading-tight mt-0.5 truncate">
                  {primaryDevice?.battery !== undefined && primaryDevice?.battery !== null && (
                    <span className="flex items-center gap-1 shrink-0 font-semibold text-slate-600">
                      <Battery className="w-3 h-3 text-emerald-500" />
                      {primaryDevice.battery}%
                    </span>
                  )}
                  {primaryDevice?.battery !== undefined && primaryDevice?.last_updated && (
                    <span className="text-slate-300">•</span>
                  )}
                  {primaryDevice?.last_updated && (
                    <span className="flex items-center gap-1 truncate text-slate-400">
                      <Clock className="w-3 h-3 shrink-0" />
                      {new Date(primaryDevice.last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              <button
                onClick={openHistoryView}
                className="py-1.5 px-3 rounded-full text-xs font-bold transition flex items-center gap-1.5 cursor-pointer bg-indigo-50 text-indigo-700 hover:bg-indigo-100 shadow-xs active:scale-95"
                title="View History"
              >
                <History className="w-3.5 h-3.5" />
                <span className="whitespace-nowrap"><span className="hidden xs:inline sm:inline">View </span>History</span>
              </button>

              <button
                onClick={() => handleFocusMember(selectedMember)}
                className="p-1.5 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
                title="Center on member"
                aria-label="Center on member"
              >
                <Navigation className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={handleHideCard}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                title="Hide card"
                aria-label="Hide card"
              >
                <ChevronDown className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  setSelectedMemberId(null);
                  setCardView('member_info');
                  setHistoryData([]);
                  setIsRangePickerOpen(false);
                  setIsCardHidden(false);
                  currentTargetCoordRef.current = null;
                }}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                title="Close card"
                aria-label="Close card"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. DEDICATED LOCATION HISTORY CARD */}
      {selectedMember && !isCardHidden && cardView === 'history' && (
        <div 
          ref={cardContainerRef}
          className="absolute bottom-20 md:bottom-24 left-4 right-4 md:left-6 md:right-auto md:w-[350px] z-30 pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <div className="bg-white/95 backdrop-blur-2xl p-4.5 rounded-3xl shadow-[0_16px_40px_rgba(0,0,0,0.12)] border border-white/80 transition-all duration-300">
            
            {/* Header: ← Back to Member Information Card, Title, Actions */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={backToMemberInfo}
                  className="p-1.5 -ml-1 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
                  title="Back to Member Information"
                  aria-label="Back to Member Information"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <h4 className="text-sm font-bold text-slate-800 truncate">Location History</h4>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={handleHideCard}
                  className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                  title="Hide card"
                  aria-label="Hide card"
                >
                  <EyeOff className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setSelectedMemberId(null);
                    setCardView('member_info');
                    setHistoryData([]);
                    setIsRangePickerOpen(false);
                    setIsCardHidden(false);
                  }}
                  className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                  title="Close"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Range Section with Compact Control */}
            <div className="pt-3 pb-2.5 relative">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Range
              </div>

              <button
                onClick={() => setIsRangePickerOpen(!isRangePickerOpen)}
                className="w-full px-3.5 py-2 rounded-2xl bg-slate-50 hover:bg-slate-100/90 border border-slate-200/80 text-xs font-bold text-slate-800 flex items-center justify-between transition cursor-pointer shadow-sm"
              >
                <span className="truncate">{activeRange.label}</span>
                {isRangePickerOpen ? (
                  <ChevronUp className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
                )}
              </button>

              {/* Range Selection Popover */}
              {isRangePickerOpen && (
                <div className="absolute left-0 right-0 top-[68px] z-50 bg-white/95 backdrop-blur-xl rounded-2xl shadow-[0_12px_32px_rgba(0,0,0,0.14)] border border-slate-100 p-1.5 space-y-0.5 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Range
                  </div>
                  {PRESET_RANGES.map((preset) => {
                    const isSelected = activeRange.type === 'preset' && activeRange.presetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        onClick={() => {
                          const newRange: ActiveRangeConfig = {
                            type: 'preset',
                            presetId: preset.id,
                            hours: preset.hours,
                            label: preset.label
                          };
                          setActiveRange(newRange);
                          setIsRangePickerOpen(false);
                          fetchMemberHistory(selectedMember.id, newRange);
                        }}
                        className={`w-full px-3 py-1.5 rounded-xl text-xs font-semibold text-left flex items-center justify-between transition cursor-pointer ${
                          isSelected
                            ? "bg-indigo-50 text-indigo-700 font-bold"
                            : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span>{preset.label}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                      </button>
                    );
                  })}

                  {/* Custom Option */}
                  <button
                    onClick={openCustomRangeView}
                    className={`w-full px-3 py-1.5 rounded-xl text-xs font-semibold text-left flex items-center justify-between transition cursor-pointer ${
                      activeRange.type === 'custom'
                        ? "bg-indigo-50 text-indigo-700 font-bold"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span>Custom</span>
                    {activeRange.type === 'custom' && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                  </button>
                </div>
              )}
            </div>

            {/* Waypoint History Timeline List (Scrollable Inside Card) */}
            <div className="pt-1">
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-0.5 scrollbar-thin">
                {historyLoading ? (
                  <div className="flex items-center justify-center py-7 text-xs text-slate-400 font-semibold gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                    Loading history...
                  </div>
                ) : historyError ? (
                  <div className="py-3 text-center text-xs text-rose-500 font-semibold bg-rose-50 rounded-xl px-2.5">
                    {historyError}
                  </div>
                ) : historyData.length === 0 ? (
                  <div className="py-5 text-center text-xs text-slate-400 font-semibold">
                    No location logs in selected time window.
                  </div>
                ) : (
                  (() => {
                    const validHistoryItems = historyData.filter(d => d.longitude != null && d.latitude != null);
                    return historyData.map((item, idx) => {
                      const validIdx = validHistoryItems.findIndex(p => p.id === item.id || (p.timestamp === item.timestamp && p.latitude === item.latitude));
                      const itemProgress = validHistoryItems.length > 1 && validIdx >= 0
                        ? (validHistoryItems.length - 1 - validIdx) / (validHistoryItems.length - 1)
                        : 1.0;
                      const itemColor = getRouteGradientColor(selectedMember?.avatar_color, itemProgress);

                      return (
                        <div
                          key={item.id || idx}
                          onClick={() => {
                            if (mapRef.current && item.longitude != null && item.latitude != null) {
                              mapRef.current.flyTo({
                                center: [item.longitude, item.latitude],
                                zoom: 16,
                                duration: 700
                              });
                            }
                          }}
                          className="p-2 rounded-xl bg-slate-50/80 hover:bg-indigo-50/60 border border-slate-100/80 hover:border-indigo-100 transition cursor-pointer flex items-center justify-between text-xs"
                        >
                          <div className="min-w-0 flex items-start gap-2">
                            <span 
                              className="text-xs mt-0.5 leading-none shrink-0"
                              style={{ color: itemColor }}
                            >
                              ●
                            </span>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-700 text-xs">
                                {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                              <p className="text-[10px] text-slate-400 font-medium truncate">
                                Location recorded
                              </p>
                            </div>
                          </div>

                          <div className="text-right shrink-0 flex items-center gap-1.5">
                            <span className="font-mono text-[9px] text-slate-500 bg-white/90 px-1.5 py-0.5 rounded border border-slate-100 font-bold">
                              {item.latitude.toFixed(3)}, {item.longitude.toFixed(3)}
                            </span>
                            {item.battery_level !== undefined && item.battery_level !== null && (
                              <span className="text-[9px] font-bold text-slate-500 bg-white/90 px-1.5 py-0.5 rounded border border-slate-100">
                                {item.battery_level}%
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 3. DEDICATED CUSTOM RANGE CARD */}
      {selectedMember && !isCardHidden && cardView === 'custom_range' && (
        <div 
          ref={cardContainerRef}
          className="absolute bottom-20 md:bottom-24 left-4 right-4 md:left-6 md:right-auto md:w-[350px] z-30 pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <div className="bg-white/95 backdrop-blur-2xl p-4.5 rounded-3xl shadow-[0_16px_40px_rgba(0,0,0,0.12)] border border-white/80 transition-all duration-300">
            
            {/* Header: ← Cancel & Return to History Card, Title, Actions */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={backToHistoryFromCustom}
                  className="p-1.5 -ml-1 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
                  title="Back to History"
                  aria-label="Back to History"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <h4 className="text-sm font-bold text-slate-800 truncate">Custom Range</h4>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={handleHideCard}
                  className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                  title="Hide card"
                  aria-label="Hide card"
                >
                  <EyeOff className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setSelectedMemberId(null);
                    setCardView('member_info');
                    setHistoryData([]);
                    setCustomDateError(null);
                    setIsCardHidden(false);
                  }}
                  className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                  title="Close"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Custom Date Inputs */}
            <div className="py-3 space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Start date
                </label>
                <input
                  type="date"
                  value={draftStartDate}
                  onChange={(e) => {
                    setDraftStartDate(e.target.value);
                    setCustomDateError(null);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  End date
                </label>
                <input
                  type="date"
                  value={draftEndDate}
                  onChange={(e) => {
                    setDraftEndDate(e.target.value);
                    setCustomDateError(null);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                />
              </div>

              {/* Clear Validation Error Message */}
              {customDateError && (
                <div className="flex items-center gap-1.5 p-2 rounded-xl bg-rose-50 text-rose-600 text-xs font-semibold">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{customDateError}</span>
                </div>
              )}

              {/* Apply Action Button */}
              <div className="pt-1">
                <button
                  onClick={() => {
                    if (!draftStartDate || !draftEndDate) {
                      setCustomDateError("Please select both start and end dates.");
                      return;
                    }
                    if (draftStartDate > draftEndDate) {
                      setCustomDateError("Start date cannot be after End date.");
                      return;
                    }

                    const customLabel = formatCustomRangeLabel(draftStartDate, draftEndDate);
                    const newRange: ActiveRangeConfig = {
                      type: 'custom',
                      startDate: draftStartDate,
                      endDate: draftEndDate,
                      label: customLabel
                    };
                    setActiveRange(newRange);
                    setCustomDateError(null);
                    fetchMemberHistory(selectedMember.id, newRange);
                    setCardView('history');

                    const dev = selectedMember?.devices?.[0];
                    if (dev && dev.longitude !== null && dev.latitude !== null && mapRef.current) {
                      mapRef.current.easeTo({
                        center: [dev.longitude, dev.latitude],
                        padding: { top: 76, bottom: 420, left: 0, right: 0 },
                        duration: 400
                      });
                    }
                  }}
                  className="w-full py-2.5 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>Apply</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 4. REOPEN / SHOW CARD FLOATING BUTTON (WHEN TEMPORARILY COLLAPSED) */}
      {selectedMember && isCardHidden && (
        <div className="absolute bottom-20 md:bottom-22 left-4 md:left-6 z-30 pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-200">
          <button
            onClick={handleShowCard}
            className="w-10 h-10 sm:w-11 sm:h-11 bg-white/90 backdrop-blur-2xl rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/80 flex items-center justify-center text-slate-700 hover:text-indigo-600 hover:bg-white transition cursor-pointer"
            title="Show card"
            aria-label="Show card"
          >
            <ChevronUp className="w-4.5 h-4.5" />
          </button>
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
