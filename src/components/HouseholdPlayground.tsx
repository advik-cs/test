import React, { useState, useEffect } from 'react';
import {
  Home,
  Users,
  Baby,
  HeartPulse,
  Plus,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  ArrowUpRight,
  RefreshCw,
  MapPin,
  Building2,
  Lock,
  ChevronRight,
} from 'lucide-react';

interface HouseholdPlaygroundProps {
  token: string | null;
  currentUser: {
    id: string;
    name: string;
    mobileNumber: string;
    role: 'CITIZEN' | 'RESCUER';
  } | null;
  onRefreshHealth?: () => void;
}

interface Member {
  id: string;
  name: string;
  age: number;
  relationship: string;
  category: 'ADULT' | 'CHILD' | 'ELDERLY';
  createdAt?: string;
}

interface HouseholdData {
  id: string;
  householdCode: string;
  createdByUserId: string;
  registeredHomeLocation: {
    buildingName: string;
    address: string;
    city: string;
    state: string;
    latitude: number;
    longitude: number;
  };
  members: Member[];
  population: number;
  totalMembers: number;
  adultCount: number;
  childCount: number;
  elderlyCount: number;
}

export const HouseholdPlayground: React.FC<HouseholdPlaygroundProps> = ({
  token,
  currentUser,
  onRefreshHealth,
}) => {
  const [household, setHousehold] = useState<HouseholdData | null>(null);
  const [allHouseholds, setAllHouseholds] = useState<HouseholdData[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
    raw?: any;
  } | null>(null);

  // New Member form state
  const [memberName, setMemberName] = useState('');
  const [memberAge, setMemberAge] = useState<number | ''>(12);
  const [memberRel, setMemberRel] = useState('Daughter');
  const [submittingMember, setSubmittingMember] = useState(false);

  // New Household form state (if citizen has no household)
  const [newHhBuilding, setNewHhBuilding] = useState('Mahanadi Heights Flat 301');
  const [newHhAddress, setNewHhAddress] = useState('14 Riverside Ring Road');
  const [newHhCity, setNewHhCity] = useState('Bhubaneswar');
  const [newHhLat, setNewHhLat] = useState(20.301);
  const [newHhLng, setNewHhLng] = useState(85.828);
  const [registeringHh, setRegisteringHh] = useState(false);

  // Dynamic preview of member category
  const previewCategory =
    typeof memberAge === 'number'
      ? memberAge < 18
        ? 'CHILD'
        : memberAge >= 60
        ? 'ELDERLY'
        : 'ADULT'
      : 'ADULT';

  const fetchHouseholdData = async () => {
    if (!token) {
      setHousehold(null);
      setAllHouseholds([]);
      return;
    }
    setLoading(true);
    try {
      if (currentUser?.role === 'CITIZEN') {
        const res = await fetch('/api/households/my', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          setHousehold(json.data);
        } else {
          setHousehold(null);
        }
      } else {
        // Rescuer: List all households for disaster overview
        const res = await fetch('/api/households', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          setAllHouseholds(json.data || []);
        }
      }
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHouseholdData();
  }, [token, currentUser?.role]);

  // Add Member
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !household || !memberName.trim() || typeof memberAge !== 'number') return;
    setSubmittingMember(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/households/${household.id}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: memberName.trim(),
          age: memberAge,
          relationship: memberRel.trim() || 'Family',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          message: `Added member "${memberName}" (Auto-classified as ${data.data.member.category}).`,
          raw: data,
        });
        setMemberName('');
        setMemberAge(10);
        await fetchHouseholdData();
        if (onRefreshHealth) onRefreshHealth();
      } else {
        setFeedback({
          type: 'error',
          message: data.error?.message || 'Failed to add member',
          raw: data,
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Network error' });
    } finally {
      setSubmittingMember(false);
    }
  };

  // Delete Member
  const handleDeleteMember = async (memberId: string, memberName: string) => {
    if (!token || !household) return;
    setFeedback(null);
    try {
      const res = await fetch(`/api/households/${household.id}/members/${memberId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: 'info',
          message: `Removed "${memberName}". Demographics recounted: Pop: ${data.data?.population}, Adults: ${data.data?.adultCount}, Children: ${data.data?.childCount}, Elderly: ${data.data?.elderlyCount}`,
          raw: data,
        });
        await fetchHouseholdData();
        if (onRefreshHealth) onRefreshHealth();
      } else {
        setFeedback({
          type: 'error',
          message: data.error?.message || 'Failed to remove member',
          raw: data,
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Network error' });
    }
  };

  // Age up a member (transition test)
  const handleAgeUpMember = async (member: Member) => {
    if (!token || !household) return;
    setFeedback(null);
    const newAge = member.age + 1;
    try {
      const res = await fetch(`/api/households/${household.id}/members/${member.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ age: newAge }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const cat = data.data?.member?.category;
        setFeedback({
          type: 'success',
          message: `Aged ${member.name} to ${newAge} years old. Auto-categorized as: ${cat}`,
          raw: data,
        });
        await fetchHouseholdData();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Network error' });
    }
  };

  // Register New Household
  const handleRegisterHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setRegisteringHh(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/households', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          location: {
            buildingName: newHhBuilding,
            address: newHhAddress,
            city: newHhCity,
            state: 'Odisha',
            latitude: Number(newHhLat),
            longitude: Number(newHhLng),
          },
          members: [
            { name: currentUser?.name || 'Primary Citizen', age: 38, relationship: 'Self' },
          ],
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          message: `Household successfully registered: Code ${data.data.householdCode}`,
          raw: data,
        });
        await fetchHouseholdData();
        if (onRefreshHealth) onRefreshHealth();
      } else {
        setFeedback({
          type: 'error',
          message: data.error?.message || 'Failed to register household',
          raw: data,
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Network error' });
    } finally {
      setRegisteringHh(false);
    }
  };

  // Test Citizen Ownership Protection
  const handleTestOwnershipProtection = async () => {
    if (!token) return;
    setFeedback(null);
    try {
      // Find another household code or ID to tamper with
      const res = await fetch('/api/households/00000000-0000-0000-0000-000000000000', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ householdCode: 'HH-TAMPER-TEST' }),
      });
      const data = await res.json();
      setFeedback({
        type: res.status === 403 ? 'success' : 'error',
        message:
          res.status === 403
            ? `[HTTP 403 FORBIDDEN ENFORCED] Citizen Ownership Protection successfully blocked unauthorized modification!`
            : `Attempt returned status ${res.status}`,
        raw: {
          httpStatus: res.status,
          apiResponse: data,
        },
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Network error' });
    }
  };

  return (
    <section
      id="stage3-household-playground"
      className="bg-slate-900/90 border border-emerald-500/30 rounded-xl p-6 shadow-xl space-y-6"
    >
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
            <Home className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-white">
                Stage 3: Household Registration & Family Demographics Console
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                CRUD + Ownership Protected
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Citizen-owned household management with automatic Population, Adult, Child, and Elderly vulnerability calculations.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="test-ownership-btn"
            onClick={handleTestOwnershipProtection}
            className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
            title="Simulates cross-citizen modification to verify HTTP 403 Forbidden protection"
          >
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            Test Ownership Guard
          </button>
          <button
            onClick={fetchHouseholdData}
            disabled={loading}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
            title="Refresh Household"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Response / Feedback Box */}
      {feedback && (
        <div
          className={`p-3.5 rounded-lg border text-xs flex flex-col gap-1.5 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-600/40 text-emerald-200'
              : feedback.type === 'error'
              ? 'bg-red-950/40 border-red-600/40 text-red-200'
              : 'bg-indigo-950/40 border-indigo-600/40 text-indigo-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold">{feedback.message}</span>
            <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">✕</button>
          </div>
          {feedback.raw && (
            <pre className="p-2 bg-slate-950/80 rounded font-mono text-[11px] overflow-x-auto max-h-32 text-slate-300">
              {JSON.stringify(feedback.raw, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Unauthenticated View */}
      {!token && (
        <div className="p-6 bg-slate-950/60 border border-slate-800 rounded-xl text-center space-y-2">
          <p className="text-sm font-medium text-slate-300">
            Please log in with a Citizen or Rescuer account to manage households.
          </p>
          <p className="text-xs text-slate-500">
            Use the "Quick Login: Citizen" button in the Stage 2 console above to log in as Ramesh Sharma.
          </p>
        </div>
      )}

      {/* CITIZEN VIEW: Active Household */}
      {token && currentUser?.role === 'CITIZEN' && (
        <>
          {household ? (
            <div className="space-y-6">
              {/* Household Summary & Coordinates */}
              <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-lg text-white">
                      {household.householdCode}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      Primary Residence
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
                    <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>
                      {household.registeredHomeLocation?.buildingName} •{' '}
                      {household.registeredHomeLocation?.address},{' '}
                      {household.registeredHomeLocation?.city}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] font-mono text-slate-500 mt-0.5">
                    <MapPin className="w-3 h-3 text-red-400" />
                    <span>
                      GPS: {household.registeredHomeLocation?.latitude},{' '}
                      {household.registeredHomeLocation?.longitude}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-slate-400 md:text-right">
                  <div>Owner: <span className="text-white font-medium">{currentUser.name}</span></div>
                  <div className="font-mono text-[11px] text-slate-500">ID: {household.id}</div>
                </div>
              </div>

              {/* Automatic Demographics Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Total Population */}
                <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-xs font-semibold">Total Population</span>
                    <Users className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-black text-white">{household.population}</div>
                  <div className="text-[10px] text-slate-500">Auto-calculated members</div>
                </div>

                {/* Adults Count */}
                <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-xs font-semibold">Adults (18-59)</span>
                    <Users className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="text-2xl font-black text-blue-300">{household.adultCount}</div>
                  <div className="text-[10px] text-slate-500">Able-bodied responders</div>
                </div>

                {/* Children Count */}
                <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-xs font-semibold">Children (&lt;18)</span>
                    <Baby className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-black text-emerald-300">{household.childCount}</div>
                  <div className="text-[10px] text-slate-500">Vulnerable age bracket</div>
                </div>

                {/* Elderly Count */}
                <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-xs font-semibold">Elderly (60+)</span>
                    <HeartPulse className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl font-black text-amber-300">{household.elderlyCount}</div>
                  <div className="text-[10px] text-slate-500">High priority evacuation</div>
                </div>
              </div>

              {/* Members List & Interactive Controls */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-indigo-400" />
                    Family Members ({household.members?.length || 0})
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    Category is auto-assigned: &lt;18 Child, 18-59 Adult, 60+ Elderly
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {household.members?.map((m) => (
                    <div
                      key={m.id}
                      className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-white truncate">{m.name}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              m.category === 'CHILD'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : m.category === 'ELDERLY'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                            }`}
                          >
                            {m.category}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Age: <span className="text-slate-200 font-mono">{m.age} yrs</span> •{' '}
                          Relationship: <span className="text-slate-200">{m.relationship}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleAgeUpMember(m)}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-[11px] font-medium border border-slate-700 transition"
                          title="Increment age to test auto-category transition"
                        >
                          Age +1
                        </button>
                        <button
                          onClick={() => handleDeleteMember(m.id, m.name)}
                          className="p-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-300 rounded border border-red-800/40 transition"
                          title="Delete member"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add Member Form */}
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
                <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-emerald-400" />
                  Add Family Member (POST /api/households/{household.id}/members)
                </h4>

                <form onSubmit={handleAddMember} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={memberName}
                      onChange={(e) => setMemberName(e.target.value)}
                      placeholder="e.g., Ananya Sharma"
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">
                      Age (Years)
                      <span className="ml-1 text-[10px] text-emerald-400 font-bold">
                        Auto: {previewCategory}
                      </span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      required
                      value={memberAge}
                      onChange={(e) =>
                        setMemberAge(e.target.value === '' ? '' : parseInt(e.target.value, 10))
                      }
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Relationship</label>
                    <input
                      type="text"
                      required
                      value={memberRel}
                      onChange={(e) => setMemberRel(e.target.value)}
                      placeholder="e.g. Son, Daughter, Mother"
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={submittingMember}
                      className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded transition disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {submittingMember ? 'Adding...' : 'Register Member'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : (
            /* No Household registered yet for this citizen */
            <div className="p-6 bg-slate-950/60 border border-slate-800 rounded-xl space-y-4">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
                <Building2 className="w-4 h-4" />
                No Registered Household for Active Citizen: {currentUser.name}
              </div>
              <p className="text-xs text-slate-400">
                Register your primary family residence and location to enable emergency evacuation alerts and dynamic shelter allocations.
              </p>

              <form onSubmit={handleRegisterHousehold} className="space-y-3 text-xs max-w-xl">
                <div>
                  <label className="block text-slate-400 mb-1">Building or Landmark Name</label>
                  <input
                    type="text"
                    required
                    value={newHhBuilding}
                    onChange={(e) => setNewHhBuilding(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Address</label>
                  <input
                    type="text"
                    required
                    value={newHhAddress}
                    onChange={(e) => setNewHhAddress(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-slate-400 mb-1">City</label>
                    <input
                      type="text"
                      required
                      value={newHhCity}
                      onChange={(e) => setNewHhCity(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Latitude</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={newHhLat}
                      onChange={(e) => setNewHhLat(parseFloat(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Longitude</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={newHhLng}
                      onChange={(e) => setNewHhLng(parseFloat(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 font-mono"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={registeringHh}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium disabled:opacity-50"
                >
                  {registeringHh ? 'Registering...' : 'Register Household (POST /api/households)'}
                </button>
              </form>
            </div>
          )}
        </>
      )}

      {/* RESCUER VIEW: All Households Overview */}
      {token && currentUser?.role === 'RESCUER' && (
        <div className="space-y-4">
          <div className="p-3 bg-red-950/20 border border-red-500/30 rounded-lg flex items-center justify-between text-xs">
            <span className="text-red-300 font-medium">
              Operational Rescuer Access: Authorized to inspect all registered households and demographic vulnerabilities across evacuation zones.
            </span>
            <span className="font-mono text-slate-400">Total: {allHouseholds.length} Households</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {allHouseholds.map((h) => (
              <div
                key={h.id}
                className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-lg space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-white">{h.householdCode}</span>
                  <span className="font-mono text-[11px] text-emerald-400">
                    Pop: {h.population} (A: {h.adultCount}, C: {h.childCount}, E: {h.elderlyCount})
                  </span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  {h.registeredHomeLocation?.buildingName}, {h.registeredHomeLocation?.address}
                </p>
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pt-1 border-t border-slate-800/60">
                  <span>GPS: {h.registeredHomeLocation?.latitude}, {h.registeredHomeLocation?.longitude}</span>
                  <span>{h.members?.length} Members</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
