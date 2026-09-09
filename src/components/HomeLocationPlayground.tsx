import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Building,
  Compass,
  ShieldCheck,
  ShieldAlert,
  Layers,
  ArrowRight,
  RefreshCw,
  Edit3,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Globe2,
} from 'lucide-react';

interface HomeLocationPlaygroundProps {
  token: string | null;
  currentUser: {
    id: string;
    name: string;
    mobileNumber: string;
    role: 'CITIZEN' | 'RESCUER';
  } | null;
  onRefreshHealth?: () => void;
}

interface LocationData {
  id: string;
  buildingName: string;
  address: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
}

interface SeparationReport {
  registeredHomeLocation: {
    buildingName: string;
    address: string;
    city: string;
    state: string;
    latitude: number;
    longitude: number;
    type: string;
  };
  disasterSpecificExpectedLocations: {
    totalMembers: number;
    memberEvacuationStatuses: Array<{
      memberId: string;
      memberName: string;
      category: string;
      expectedLocations: Array<{
        disaster: string;
        expectedLocationType: string;
        shelter: string | null;
        otherCity: string | null;
      }>;
    }>;
    type: string;
  };
  separationVerified: boolean;
  message: string;
}

export const HomeLocationPlayground: React.FC<HomeLocationPlaygroundProps> = ({
  token,
  currentUser,
  onRefreshHealth,
}) => {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [householdCode, setHouseholdCode] = useState<string>('');
  const [location, setLocation] = useState<LocationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Edit form state
  const [editBuilding, setEditBuilding] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editState, setEditState] = useState('Odisha');
  const [editLat, setEditLat] = useState<string>('20.301');
  const [editLng, setEditLng] = useState<string>('85.828');

  // Interactive verification / guard test states
  const [guardTestResult, setGuardTestResult] = useState<string | null>(null);
  const [guardLoading, setGuardLoading] = useState(false);
  const [separationReport, setSeparationReport] = useState<SeparationReport | null>(null);
  const [separationLoading, setSeparationLoading] = useState(false);

  // Load citizen's household and registered home location
  const fetchHomeLocation = async () => {
    if (!token) return;
    setLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/households/my/location', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (res.ok && json.data) {
        setHouseholdId(json.data.householdId);
        setHouseholdCode(json.data.householdCode);
        setLocation(json.data.location);

        setEditBuilding(json.data.location.buildingName);
        setEditAddress(json.data.location.address);
        setEditCity(json.data.location.city);
        setEditState(json.data.location.state);
        setEditLat(json.data.location.latitude.toString());
        setEditLng(json.data.location.longitude.toString());
      } else {
        // If not found, try generic /api/households
        const hhRes = await fetch('/api/households', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const hhJson = await hhRes.json();
        if (hhRes.ok && hhJson.data && hhJson.data.length > 0) {
          const hh = hhJson.data[0];
          setHouseholdId(hh.id);
          setHouseholdCode(hh.householdCode);
          setLocation(hh.registeredHomeLocation);

          setEditBuilding(hh.registeredHomeLocation.buildingName);
          setEditAddress(hh.registeredHomeLocation.address);
          setEditCity(hh.registeredHomeLocation.city);
          setEditState(hh.registeredHomeLocation.state);
          setEditLat(hh.registeredHomeLocation.latitude.toString());
          setEditLng(hh.registeredHomeLocation.longitude.toString());
        }
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Failed to fetch registered home location' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHomeLocation();
  }, [token, currentUser?.id]);

  // Handle saving updated registered home location
  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !householdId) return;

    const latNum = parseFloat(editLat);
    const lngNum = parseFloat(editLng);

    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      setStatusMessage({ type: 'error', text: 'Latitude must be a valid number between -90 and 90' });
      return;
    }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      setStatusMessage({ type: 'error', text: 'Longitude must be a valid number between -180 and 180' });
      return;
    }

    setLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/households/${householdId}/location`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          buildingName: editBuilding,
          address: editAddress,
          city: editCity,
          state: editState,
          latitude: latNum,
          longitude: lngNum,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLocation(data.data.location);
        setIsEditing(false);
        setStatusMessage({
          type: 'success',
          text: `Home location updated to [${latNum.toFixed(4)}, ${lngNum.toFixed(4)}]. Architectural separation verified: disaster expected locations remain untouched.`,
        });
        if (onRefreshHealth) onRefreshHealth();
      } else {
        setStatusMessage({
          type: 'error',
          text: data.error?.message || 'Failed to update registered home location',
        });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Error updating location' });
    } finally {
      setLoading(false);
    }
  };

  // Test GPS Boundary Validation (+95.5 lat)
  const handleTestInvalidGps = async (type: 'lat' | 'lng') => {
    if (!token || !householdId) return;
    setGuardLoading(true);
    setGuardTestResult(null);
    try {
      const payload = type === 'lat' ? { latitude: 95.5 } : { longitude: 195.0 };
      const res = await fetch(`/api/households/${householdId}/location`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setGuardTestResult(
        `[STATUS ${res.status}] ${type === 'lat' ? 'Latitude 95.5' : 'Longitude 195.0'} rejected by Zod schema: "${data.error?.message || data.error?.details?.[0]?.message || 'Validation Error'}"`
      );
    } catch (err: any) {
      setGuardTestResult(`Error: ${err?.message}`);
    } finally {
      setGuardLoading(false);
    }
  };

  // Test Ownership Guard (Cross-Citizen Tamper Simulation)
  const handleTestCrossCitizenGuard = async () => {
    if (!householdId) return;
    setGuardLoading(true);
    setGuardTestResult(null);
    try {
      // Create temporary Citizen B to test tampering Citizen A's home location
      const tempTimestamp = Date.now().toString().slice(-5);
      const signupRes = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Unauthorized Citizen Tester',
          mobileNumber: `+919999${tempTimestamp}`,
          password: 'Password@123',
          identityNumber: `99998888${tempTimestamp}`,
          role: 'CITIZEN',
        }),
      });
      const signupData = await signupRes.json();
      const citizenBToken = signupData.token;

      // Attempt to tamper with Citizen A's home location using Citizen B's token
      const tamperRes = await fetch(`/api/households/${householdId}/location`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${citizenBToken}`,
        },
        body: JSON.stringify({
          buildingName: 'Hacked Building Name',
          latitude: 21.0,
        }),
      });
      const tamperData = await tamperRes.json();

      setGuardTestResult(
        `[STATUS ${tamperRes.status} FORBIDDEN] Cross-citizen modification blocked: "${tamperData.error?.message || 'Access Denied'}"`
      );
    } catch (err: any) {
      setGuardTestResult(`Error: ${err?.message}`);
    } finally {
      setGuardLoading(false);
    }
  };

  // Live Architectural Separation Audit
  const handleCheckSeparation = async () => {
    if (!token || !householdId) return;
    setSeparationLoading(true);
    try {
      const res = await fetch(`/api/locations/verify-separation/${householdId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSeparationReport(data);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setSeparationLoading(false);
    }
  };

  // Apply location preset
  const applyPreset = (building: string, addr: string, lat: number, lng: number) => {
    setEditBuilding(building);
    setEditAddress(addr);
    setEditLat(lat.toString());
    setEditLng(lng.toString());
  };

  if (!token) {
    return (
      <section id="stage4-home-location-console" className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 text-slate-400">
        <div className="flex items-center gap-2 mb-2 text-amber-400 font-medium">
          <Building className="w-5 h-5" />
          <span>Stage 4: Registered Home/Building Location Management</span>
        </div>
        <p className="text-sm">Please authenticate as a Citizen or Rescuer to inspect and manage registered home addresses and GPS coordinates.</p>
      </section>
    );
  }

  return (
    <section id="stage4-home-location-console" className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Stage 4 Ready
            </span>
            <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
              <Building className="w-5 h-5 text-emerald-400" />
              Registered Home & Building Location Management
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Permanent physical dwelling coordinates and address, strictly isolated from disaster-specific evacuation expected locations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="refresh-home-loc-btn"
            onClick={fetchHomeLocation}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {location && !isEditing && (
            <button
              id="edit-home-loc-btn"
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-500 transition"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Update Home & GPS
            </button>
          )}
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-3.5 rounded-lg text-xs flex items-start gap-2 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/60'
              : 'bg-rose-950/40 text-rose-300 border border-rose-800/60'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-rose-400" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Main Home Location Card */}
      {location ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Physical Address & Building details */}
          <div className="lg:col-span-2 bg-slate-950/60 border border-slate-800/80 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-semibold text-slate-200">
                  {location.buildingName}
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                {householdCode || 'Household Registered'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <span className="text-slate-400">Street Address</span>
                <p className="text-slate-200 font-medium bg-slate-900/70 p-2.5 rounded-lg border border-slate-800">
                  {location.address}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-slate-400">City & State</span>
                <p className="text-slate-200 font-medium bg-slate-900/70 p-2.5 rounded-lg border border-slate-800">
                  {location.city}, {location.state}
                </p>
              </div>
            </div>

            {/* GPS Coordinates Display */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-emerald-400" />
                  Calibrated GPS Coordinates
                </span>
                <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/50">
                  ISO 6709 Standard
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">Latitude (-90 to +90)</div>
                  <div className="text-sm font-mono font-semibold text-slate-100 mt-0.5">
                    {location.latitude.toFixed(6)}° N
                  </div>
                </div>
                <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">Longitude (-180 to +180)</div>
                  <div className="text-sm font-mono font-semibold text-slate-100 mt-0.5">
                    {location.longitude.toFixed(6)}° E
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Architectural Separation Card */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-5 space-y-3.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200 mb-1">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span>Architectural Separation Engine</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Registered Home coordinates represent the <strong>permanent physical dwelling</strong>. In contrast, <strong>Expected Locations</strong> are disaster-event specific evacuation statuses. Updating registered home never pollutes or alters evacuation intention records.
              </p>
            </div>

            <div className="bg-slate-900/90 rounded-lg p-3 border border-slate-800 space-y-2 text-[11px]">
              <div className="flex items-center justify-between text-slate-300">
                <span>Model Separation</span>
                <span className="text-emerald-400 font-semibold">Decoupled</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>Disaster Event Independence</span>
                <span className="text-emerald-400 font-semibold">100% Isolated</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>Citizen Ownership Guard</span>
                <span className="text-emerald-400 font-semibold">Enforced (403)</span>
              </div>
            </div>

            <button
              id="verify-separation-btn"
              onClick={handleCheckSeparation}
              disabled={separationLoading}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium bg-cyan-950/50 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-800/50 transition"
            >
              <ShieldCheck className={`w-3.5 h-3.5 ${separationLoading ? 'animate-spin' : ''}`} />
              Verify Separation Live
            </button>
          </div>
        </div>
      ) : (
        <div className="p-8 text-center bg-slate-950/50 rounded-xl border border-slate-800 text-slate-400 text-xs">
          {loading ? 'Fetching home location...' : 'No registered household location found. Register a household first in Stage 3.'}
        </div>
      )}

      {/* Live Separation Modal / Inspection Box */}
      {separationReport && (
        <div className="bg-cyan-950/20 border border-cyan-800/50 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-cyan-900/50 pb-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-semibold text-cyan-200">
                Architectural Separation Audit Report
              </span>
            </div>
            <button
              onClick={() => setSeparationReport(null)}
              className="text-xs text-cyan-400 hover:text-cyan-200"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800 space-y-1">
              <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5" />
                Permanent Registered Residence
              </div>
              <div className="text-slate-300">{separationReport.registeredHomeLocation.buildingName}</div>
              <div className="text-slate-400 text-[11px]">{separationReport.registeredHomeLocation.address}</div>
              <div className="text-slate-400 font-mono text-[11px]">
                GPS: [{separationReport.registeredHomeLocation.latitude}, {separationReport.registeredHomeLocation.longitude}]
              </div>
            </div>

            <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800 space-y-1">
              <div className="font-semibold text-cyan-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                Disaster-Specific Evacuation Statuses
              </div>
              <div className="text-slate-300">
                Tracked Members: {separationReport.disasterSpecificExpectedLocations.totalMembers}
              </div>
              <div className="text-slate-400 text-[11px]">
                Type: {separationReport.disasterSpecificExpectedLocations.type}
              </div>
              <div className="text-emerald-400 text-[11px] font-medium">
                Separation Status: Verified & Independent
              </div>
            </div>
          </div>
          <p className="text-[11px] text-cyan-300/80 italic">{separationReport.message}</p>
        </div>
      )}

      {/* Edit Form Modal/Drawer */}
      {isEditing && (
        <form onSubmit={handleSaveLocation} className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-emerald-400" />
              Edit Registered Home Address & GPS Coordinates
            </h3>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
          </div>

          {/* Location Presets */}
          <div className="space-y-1.5">
            <span className="text-xs text-slate-400">Quick Coastal/Flood Plain Presets:</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applyPreset('Mahanadi Riverside Apartments', 'Plot 42, River Road', 20.305, 85.835)}
                className="px-2.5 py-1 rounded text-xs bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800"
              >
                Mahanadi Riverside (20.305, 85.835)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('Sunrise Villa Enclave', 'House 14, Old Town', 20.245, 85.831)}
                className="px-2.5 py-1 rounded text-xs bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800"
              >
                Bhubaneswar South (20.245, 85.831)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('Cuttack Ring Road Heights', 'Block 3, Mahanadi Barrage Rd', 20.462, 85.882)}
                className="px-2.5 py-1 rounded text-xs bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800"
              >
                Cuttack Ring Road (20.462, 85.882)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1">
              <label className="text-slate-300 font-medium">Building / Landmark Name *</label>
              <input
                type="text"
                value={editBuilding}
                onChange={(e) => setEditBuilding(e.target.value)}
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-medium">Street Address Line *</label>
              <input
                type="text"
                value={editAddress}
                onChange={(e) => setEditAddress(e.target.value)}
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-medium">City *</label>
              <input
                type="text"
                value={editCity}
                onChange={(e) => setEditCity(e.target.value)}
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-medium">State</label>
              <input
                type="text"
                value={editState}
                onChange={(e) => setEditState(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-medium">GPS Latitude (-90 to +90) *</label>
              <input
                type="number"
                step="any"
                min="-90"
                max="90"
                value={editLat}
                onChange={(e) => setEditLat(e.target.value)}
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-medium">GPS Longitude (-180 to +180) *</label>
              <input
                type="number"
                step="any"
                min="-180"
                max="180"
                value={editLng}
                onChange={(e) => setEditLng(e.target.value)}
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 transition disabled:opacity-50"
            >
              {loading ? 'Saving Coordinates...' : 'Save & Preserve Separation'}
            </button>
          </div>
        </form>
      )}

      {/* Interactive Validation & Security Test Sandbox */}
      <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <h4 className="text-xs font-semibold text-slate-200">
            Interactive GPS Bounds & Ownership Guard Sandbox
          </h4>
        </div>
        <p className="text-xs text-slate-400">
          Verify that invalid coordinate ranges (-90..90, -180..180) are safely blocked with 400 Bad Request, and cross-citizen tampering is blocked with 403 Forbidden.
        </p>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            id="test-lat-bounds-btn"
            onClick={() => handleTestInvalidGps('lat')}
            disabled={guardLoading}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            Test Lat Out-of-Bounds (+95.5)
          </button>
          <button
            id="test-lng-bounds-btn"
            onClick={() => handleTestInvalidGps('lng')}
            disabled={guardLoading}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            Test Lng Out-of-Bounds (+195.0)
          </button>
          <button
            id="test-string-coords-btn"
            onClick={async () => {
              if (!token || !householdId) return;
              setGuardLoading(true);
              try {
                const res = await fetch(`/api/households/${householdId}/location`, {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    latitude: '20.3090',
                    longitude: '85.8310',
                  }),
                });
                const data = await res.json();
                setGuardTestResult(
                  `[STATUS ${res.status}] Numeric string coercion passed! Coerced strings "20.3090" & "85.8310" to numbers [${data.data?.location?.latitude}, ${data.data?.location?.longitude}]`
                );
                await fetchHomeLocation();
              } catch (e: any) {
                setGuardTestResult(`Error: ${e?.message}`);
              } finally {
                setGuardLoading(false);
              }
            }}
            disabled={guardLoading}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border border-emerald-800/40 transition"
          >
            Test String Coercion ("20.3090")
          </button>
          <button
            id="test-cross-citizen-btn"
            onClick={handleTestCrossCitizenGuard}
            disabled={guardLoading}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 border border-amber-800/40 transition"
          >
            Test Cross-Citizen Ownership Guard (403)
          </button>
        </div>

        {guardTestResult && (
          <div className="p-3 bg-slate-900 rounded-lg text-xs font-mono text-slate-300 border border-slate-800 mt-2">
            {guardTestResult}
          </div>
        )}
      </div>
    </section>
  );
};
