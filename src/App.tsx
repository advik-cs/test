import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Database,
  Server,
  Radio,
  Users,
  Home,
  Tent,
  Ambulance,
  FileCheck2,
  Layers,
  Building2,
  Sparkles,
  Lock,
  KeyRound,
  UserCheck,
  LogOut,
  ShieldCheck,
  ShieldX,
  UserPlus,
  Send,
} from 'lucide-react';
import { HouseholdPlayground } from './components/HouseholdPlayground';
import { Stage3VerificationPanel } from './components/Stage3VerificationPanel';
import { HomeLocationPlayground } from './components/HomeLocationPlayground';
import { Stage4VerificationPanel } from './components/Stage4VerificationPanel';

interface HealthData {
  status: string;
  service: string;
  version: string;
  environment: string;
  timestamp: string;
  uptimeSeconds: number;
  stage: string;
  database: {
    configured: boolean;
    provider: string;
    status: string;
    details?: string;
    stats?: {
      users: number;
      citizens: number;
      rescuers: number;
      households: number;
      householdMembers: number;
      locations: number;
      disasters: number;
      affectedZones: number;
      shelters: number;
      expectedLocations: number;
      facilities: number;
      roads: number;
      notifications: number;
    };
  };
}

interface VerificationItem {
  step: string;
  passed: boolean;
  details: string;
}

interface VerificationResponse {
  success: boolean;
  stage: string;
  summary: string;
  checks: VerificationItem[];
}

interface AuthUser {
  id: string;
  name: string;
  mobileNumber: string;
  role: 'CITIZEN' | 'RESCUER';
  identityLast4: string;
  createdAt?: string;
}

export default function App() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<string | null>(null);

  // Stage 1 Verification state
  const [verifyingStage1, setVerifyingStage1] = useState<boolean>(false);
  const [stage1Result, setStage1Result] = useState<VerificationResponse | null>(null);

  // Stage 2 Verification state
  const [verifyingStage2, setVerifyingStage2] = useState<boolean>(false);
  const [stage2Result, setStage2Result] = useState<VerificationResponse | null>(null);

  // Stage 3 Verification state
  const [verifyingStage3, setVerifyingStage3] = useState<boolean>(false);
  const [stage3Result, setStage3Result] = useState<VerificationResponse | null>(null);

  // Stage 4 Verification state
  const [verifyingStage4, setVerifyingStage4] = useState<boolean>(false);
  const [stage4Result, setStage4Result] = useState<VerificationResponse | null>(null);

  // Seeding state
  const [seeding, setSeeding] = useState<boolean>(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);

  // Auth & RBAC State
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('dm_jwt_token'));
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem('dm_auth_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [authActionLoading, setAuthActionLoading] = useState<boolean>(false);
  const [authResponseBox, setAuthResponseBox] = useState<{
    endpoint: string;
    status: number;
    success: boolean;
    data: any;
  } | null>(null);

  // Custom Login & Signup Form States
  const [loginMobile, setLoginMobile] = useState('+919876543201');
  const [loginPassword, setLoginPassword] = useState('Citizen@123');
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [signupForm, setSignupForm] = useState({
    name: '',
    mobileNumber: '',
    password: '',
    identityNumber: '',
    role: 'CITIZEN' as 'CITIZEN' | 'RESCUER',
  });
  const [signupStatus, setSignupStatus] = useState<string | null>(null);

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/health');
      if (!res.ok && res.status !== 500 && res.status !== 503) {
        throw new Error(`HTTP error: ${res.status}`);
      }
      const data = await res.json();
      setHealth(data);
      setLastFetched(new Date().toLocaleTimeString());
    } catch (err: any) {
      setError(err?.message || 'Failed to ping /api/health');
    } finally {
      setLoading(false);
    }
  };

  const runStage1Verification = async () => {
    setVerifyingStage1(true);
    try {
      const res = await fetch('/api/seed/verify');
      const data: VerificationResponse = await res.json();
      setStage1Result(data);
    } catch (err: any) {
      alert('Stage 1 verification error: ' + (err?.message || 'Unknown'));
    } finally {
      setVerifyingStage1(false);
    }
  };

  const runStage2Verification = async () => {
    setVerifyingStage2(true);
    try {
      const res = await fetch('/api/auth/verify-stage2');
      const data: VerificationResponse = await res.json();
      setStage2Result(data);
    } catch (err: any) {
      alert('Stage 2 verification error: ' + (err?.message || 'Unknown'));
    } finally {
      setVerifyingStage2(false);
    }
  };

  const runStage3Verification = async () => {
    setVerifyingStage3(true);
    try {
      const res = await fetch('/api/verify-stage3');
      const data: VerificationResponse = await res.json();
      setStage3Result(data);
    } catch (err: any) {
      console.error('Stage 3 verification error:', err);
    } finally {
      setVerifyingStage3(false);
    }
  };

  const runStage4Verification = async () => {
    setVerifyingStage4(true);
    try {
      const res = await fetch('/api/verify-stage4');
      const data: VerificationResponse = await res.json();
      setStage4Result(data);
    } catch (err: any) {
      console.error('Stage 4 verification error:', err);
    } finally {
      setVerifyingStage4(false);
    }
  };

  const triggerSeed = async () => {
    setSeeding(true);
    setSeedMessage(null);
    try {
      const res = await fetch('/api/seed', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSeedMessage('Database re-seeded successfully with fictional demo dataset.');
        await fetchHealth();
        await runStage1Verification();
        await runStage2Verification();
        await runStage3Verification();
        await runStage4Verification();
      } else {
        setSeedMessage('Seeding error: ' + (data.error?.message || 'Unknown'));
      }
    } catch (err: any) {
      setSeedMessage('Seeding network failure: ' + (err?.message || 'Unknown'));
    } finally {
      setSeeding(false);
    }
  };

  // Auth Operations
  const handleLogin = async (mobile: string, pass: string) => {
    setAuthActionLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobileNumber: mobile, password: pass }),
      });
      const data = await res.json();
      setAuthResponseBox({
        endpoint: 'POST /api/auth/login',
        status: res.status,
        success: data.success,
        data,
      });
      if (data.success && data.token) {
        setToken(data.token);
        setCurrentUser(data.user);
        localStorage.setItem('dm_jwt_token', data.token);
        localStorage.setItem('dm_auth_user', JSON.stringify(data.user));
      }
    } catch (err: any) {
      setAuthResponseBox({
        endpoint: 'POST /api/auth/login',
        status: 500,
        success: false,
        data: { error: err.message },
      });
    } finally {
      setAuthActionLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setCurrentUser(null);
    localStorage.removeItem('dm_jwt_token');
    localStorage.removeItem('dm_auth_user');
    setAuthResponseBox(null);
  };

  const testEndpoint = async (endpoint: string, includeAuth = true) => {
    setAuthActionLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (includeAuth && token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(endpoint, { method: 'GET', headers });
      const data = await res.json();
      setAuthResponseBox({
        endpoint: `GET ${endpoint} ${includeAuth ? '(with Bearer token)' : '(WITHOUT token)'}`,
        status: res.status,
        success: data.success,
        data,
      });
    } catch (err: any) {
      setAuthResponseBox({
        endpoint: `GET ${endpoint}`,
        status: 500,
        success: false,
        data: { error: err.message },
      });
    } finally {
      setAuthActionLoading(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthActionLoading(true);
    setSignupStatus(null);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signupForm),
      });
      const data = await res.json();
      setAuthResponseBox({
        endpoint: 'POST /api/auth/signup',
        status: res.status,
        success: data.success,
        data,
      });
      if (data.success && data.token) {
        setToken(data.token);
        setCurrentUser(data.user);
        localStorage.setItem('dm_jwt_token', data.token);
        localStorage.setItem('dm_auth_user', JSON.stringify(data.user));
        setShowSignupModal(false);
        setSignupStatus('Registration successful!');
      } else {
        setSignupStatus(data.error?.message || 'Registration failed');
      }
    } catch (err: any) {
      setSignupStatus('Signup network error: ' + err.message);
    } finally {
      setAuthActionLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    runStage1Verification();
    runStage2Verification();
    runStage3Verification();
    runStage4Verification();
  }, []);

  const stats = health?.database?.stats;

  return (
    <div id="root-container" className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Top Header */}
        <header
          id="backend-header"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-6"
        >
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-white">Disaster Management API</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Stage 4 Active (Home GPS &amp; Decoupled Expected Locations)
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-0.5">
                Registered Home &amp; Building Location, GPS Coordinates (-90..90, -180..180) &amp; Disaster Separation
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              id="verify-stage4-header-btn"
              onClick={runStage4Verification}
              disabled={verifyingStage4}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50 shadow-sm"
            >
              <Building2 className={`w-3.5 h-3.5 ${verifyingStage4 ? 'animate-spin' : ''}`} />
              {verifyingStage4 ? 'Testing Stage 4...' : 'Run Stage 4 Tests'}
            </button>
            <button
              id="verify-stage3-header-btn"
              onClick={runStage3Verification}
              disabled={verifyingStage3}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition disabled:opacity-50"
            >
              <Home className={`w-3.5 h-3.5 ${verifyingStage3 ? 'animate-spin' : ''}`} />
              {verifyingStage3 ? 'Testing Stage 3...' : 'Run Stage 3 Tests'}
            </button>
            <button
              id="verify-stage2-header-btn"
              onClick={runStage2Verification}
              disabled={verifyingStage2}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50 shadow-sm"
            >
              <KeyRound className={`w-3.5 h-3.5 ${verifyingStage2 ? 'animate-spin' : ''}`} />
              {verifyingStage2 ? 'Testing Stage 2...' : 'Run Stage 2 Tests'}
            </button>
            <button
              id="verify-stage1-header-btn"
              onClick={runStage1Verification}
              disabled={verifyingStage1}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition disabled:opacity-50"
            >
              <FileCheck2 className={`w-3.5 h-3.5 ${verifyingStage1 ? 'animate-spin' : ''}`} />
              {verifyingStage1 ? 'Testing Stage 1...' : 'Run Stage 1 Tests'}
            </button>
            <button
              id="trigger-seed-header-btn"
              onClick={triggerSeed}
              disabled={seeding}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700 transition disabled:opacity-50"
            >
              <Sparkles className={`w-3.5 h-3.5 ${seeding ? 'animate-spin' : ''}`} />
              {seeding ? 'Seeding...' : 'Seed Data'}
            </button>
            <button
              id="refresh-health-header-btn"
              onClick={fetchHealth}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg border border-slate-700 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </header>

        {seedMessage && (
          <div className="p-3.5 bg-indigo-900/30 border border-indigo-700/60 text-indigo-200 rounded-lg text-xs flex items-center justify-between">
            <span>{seedMessage}</span>
            <button onClick={() => setSeedMessage(null)} className="text-slate-400 hover:text-white">✕</button>
          </div>
        )}

        {/* STAGE 2 INTERACTIVE AUTH & RBAC PLAYGROUND */}
        <section
          id="stage2-auth-playground"
          className="bg-slate-900/90 border border-indigo-500/30 rounded-xl p-6 shadow-xl space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-indigo-400">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  Stage 2: Live Authentication & RBAC Access Console
                </h2>
                <p className="text-xs text-slate-400">
                  Test JWT issuance, login, profile inspection, and verify that role barriers strictly block unauthorized access.
                </p>
              </div>
            </div>

            {/* Quick Demo Login Switchers */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                id="quick-login-citizen-btn"
                onClick={() => handleLogin('+919876543201', 'Citizen@123')}
                disabled={authActionLoading}
                className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-medium transition flex items-center gap-1.5"
              >
                <Users className="w-3.5 h-3.5" />
                Quick Login: Citizen
              </button>
              <button
                id="quick-login-rescuer-btn"
                onClick={() => handleLogin('+919876543101', 'Rescuer@123')}
                disabled={authActionLoading}
                className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 rounded-lg text-xs font-medium transition flex items-center gap-1.5"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                Quick Login: Rescuer
              </button>
              <button
                id="open-signup-modal-btn"
                onClick={() => setShowSignupModal(true)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition flex items-center gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                New Signup
              </button>
            </div>
          </div>

          {/* Active Session Card */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* User Session Profile */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between text-xs border-b border-slate-800/80 pb-2">
                <span className="font-semibold text-slate-300 uppercase tracking-wider">Active Session</span>
                {currentUser ? (
                  <button
                    onClick={handleLogout}
                    className="text-red-400 hover:text-red-300 flex items-center gap-1 text-[11px]"
                  >
                    <LogOut className="w-3 h-3" /> Logout
                  </button>
                ) : (
                  <span className="text-slate-500">Unauthenticated</span>
                )}
              </div>

              {currentUser ? (
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Authenticated User:</span>
                    <span className="font-bold text-white">{currentUser.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Assigned Role:</span>
                    <span
                      className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                        currentUser.role === 'RESCUER'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      }`}
                    >
                      {currentUser.role}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Mobile Number:</span>
                    <span className="font-mono text-slate-300">{currentUser.mobileNumber}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Identity Last 4:</span>
                    <span className="font-mono text-amber-300">•••• •••• {currentUser.identityLast4}</span>
                  </div>
                  <div className="pt-2 border-t border-slate-800/60">
                    <span className="text-[11px] text-slate-400 block mb-1">Signed JWT Token:</span>
                    <div className="p-2 bg-slate-900 rounded font-mono text-[10px] text-slate-400 break-all select-all border border-slate-800 max-h-16 overflow-y-auto">
                      {token}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center space-y-2 text-xs text-slate-400">
                  <UserCheck className="w-6 h-6 text-slate-600 mx-auto" />
                  <p>No active login token.</p>
                  <p className="text-[11px] text-slate-500">
                    Use quick login above or log in with credentials to acquire a signed JWT token.
                  </p>
                </div>
              )}
            </div>

            {/* Role-Based Access Control Testers */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 space-y-3 lg:col-span-2">
              <div className="flex items-center justify-between text-xs border-b border-slate-800/80 pb-2">
                <span className="font-semibold text-slate-300 uppercase tracking-wider">
                  Test Role Authorization Barriers
                </span>
                <span className="text-slate-500 text-[11px]">Enforces HTTP 200 or 403 Forbidden</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                {/* Test /api/auth/me */}
                <button
                  id="test-auth-me-btn"
                  onClick={() => testEndpoint('/api/auth/me', true)}
                  disabled={authActionLoading}
                  className="p-3 bg-slate-900 hover:bg-slate-800/90 border border-slate-700/80 rounded-lg text-left transition space-y-1"
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-white">
                    <span>GET /api/auth/me</span>
                    <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Requires valid Bearer token. Returns authenticated profile without sensitive password/identity hashes.
                  </p>
                </button>

                {/* Test /api/auth/me without token */}
                <button
                  id="test-unauth-me-btn"
                  onClick={() => testEndpoint('/api/auth/me', false)}
                  disabled={authActionLoading}
                  className="p-3 bg-slate-900 hover:bg-slate-800/90 border border-slate-700/80 rounded-lg text-left transition space-y-1"
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-amber-300">
                    <span>GET /api/auth/me (No Token)</span>
                    <ShieldX className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Tests missing header. Must return 401 Unauthorized with descriptive error.
                  </p>
                </button>

                {/* Test Citizen Portal */}
                <button
                  id="test-citizen-only-btn"
                  onClick={() => testEndpoint('/api/auth/citizen-only', true)}
                  disabled={authActionLoading}
                  className="p-3 bg-slate-900 hover:bg-slate-800/90 border border-blue-500/30 rounded-lg text-left transition space-y-1"
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-blue-300">
                    <span>GET /api/auth/citizen-only</span>
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Restricted to CITIZEN role. Returns 200 OK for Citizens; 403 Forbidden for Rescuers.
                  </p>
                </button>

                {/* Test Rescuer Portal */}
                <button
                  id="test-rescuer-only-btn"
                  onClick={() => testEndpoint('/api/auth/rescuer-only', true)}
                  disabled={authActionLoading}
                  className="p-3 bg-slate-900 hover:bg-slate-800/90 border border-red-500/30 rounded-lg text-left transition space-y-1"
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-red-300">
                    <span>GET /api/auth/rescuer-only</span>
                    <ShieldCheck className="w-3.5 h-3.5 text-red-400" />
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Restricted to RESCUER role. Returns 200 OK for Rescuers; 403 Forbidden for Citizens.
                  </p>
                </button>
              </div>

              {/* Live HTTP Response Viewer */}
              {authResponseBox && (
                <div className="mt-3 p-3 bg-slate-900 rounded-lg border border-slate-800 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-slate-300">{authResponseBox.endpoint}</span>
                    <span
                      className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                        authResponseBox.status === 200 || authResponseBox.status === 201
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : authResponseBox.status === 403
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      HTTP {authResponseBox.status}
                    </span>
                  </div>
                  <pre className="p-2 bg-slate-950 rounded text-[11px] font-mono text-slate-300 overflow-x-auto max-h-36">
                    {JSON.stringify(authResponseBox.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {/* Direct Login Form */}
          <div className="p-4 bg-slate-950/40 border border-slate-800/60 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-indigo-400" />
              <span className="font-semibold text-slate-300">Manual Login Test:</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={loginMobile}
                onChange={(e) => setLoginMobile(e.target.value)}
                placeholder="Mobile (+91...)"
                className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-slate-200 font-mono text-xs focus:outline-none focus:border-indigo-500"
              />
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Password"
                className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-slate-200 font-mono text-xs focus:outline-none focus:border-indigo-500"
              />
              <button
                id="manual-login-submit-btn"
                onClick={() => handleLogin(loginMobile, loginPassword)}
                disabled={authActionLoading}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded text-xs transition disabled:opacity-50"
              >
                Log In
              </button>
            </div>
          </div>
        </section>

        {/* STAGE 4 REGISTERED HOME LOCATION & GPS PLAYGROUND */}
        <HomeLocationPlayground
          token={token}
          currentUser={currentUser}
          onRefreshHealth={fetchHealth}
        />

        {/* STAGE 4 SPECIFICATION VERIFICATION SUITE */}
        <Stage4VerificationPanel
          stage4Result={stage4Result}
          verifyingStage4={verifyingStage4}
          onRunVerification={runStage4Verification}
        />

        {/* STAGE 3 HOUSEHOLD & FAMILY DEMOGRAPHICS PLAYGROUND */}
        <HouseholdPlayground
          token={token}
          currentUser={currentUser}
          onRefreshHealth={fetchHealth}
        />

        {/* STAGE 3 SPECIFICATION VERIFICATION SUITE */}
        <Stage3VerificationPanel
          stage3Result={stage3Result}
          verifyingStage3={verifyingStage3}
          onRunVerification={runStage3Verification}
        />

        {/* STAGE 2 SPECIFICATION VERIFICATION SUITE */}
        <section id="stage2-verification-suite" className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-indigo-400" />
                Stage 2: JWT & RBAC Automated Test Suite (13 Checks)
              </h2>
              <p className="text-xs text-slate-400">
                Verifies cryptographic bcrypt hashing, token generation/tamper resistance, signup/login/me APIs, and strict CITIZEN / RESCUER permission barriers.
              </p>
            </div>
            {stage2Result && (
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                  stage2Result.success
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}
              >
                {stage2Result.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {stage2Result.summary}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {stage2Result?.checks.map((c, idx) => (
              <div
                key={idx}
                className="p-3.5 bg-slate-950/70 border border-slate-800/80 rounded-lg flex items-start gap-3"
              >
                <div className="mt-0.5 shrink-0">
                  {c.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-200">{c.step}</div>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{c.details}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* STAGE 1 SPECIFICATION TEST SUITE (Preserved) */}
        <section id="stage1-verification-suite" className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-emerald-400" />
                Stage 1: Relational Schema & Demo Seed Test Suite (Preserved)
              </h2>
              <p className="text-xs text-slate-400">
                Validation of database schema, relations, households, facilities, dynamic shelter occupancies, and spatial flood zones.
              </p>
            </div>
            {stage1Result && (
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                  stage1Result.success
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}
              >
                {stage1Result.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {stage1Result.summary}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {stage1Result?.checks.map((c, idx) => (
              <div
                key={idx}
                className="p-3.5 bg-slate-950/70 border border-slate-800/80 rounded-lg flex items-start gap-3"
              >
                <div className="mt-0.5 shrink-0">
                  {c.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-200">{c.step}</div>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{c.details}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Database Entities Metrics Grid */}
        {stats && (
          <section id="database-stats-section" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-400" />
                Live PostgreSQL Entity Records (11 Models)
              </h2>
              <span className="text-xs text-slate-500 font-mono">Fictional Demo Seed Active</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span className="text-xs">Users</span>
                  <Users className="w-4 h-4 text-blue-400" />
                </div>
                <div className="text-xl font-bold text-white">{stats.users}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{stats.citizens} Cit. / {stats.rescuers} Res.</div>
              </div>

              <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span className="text-xs">Households</span>
                  <Home className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-xl font-bold text-white">{stats.households}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{stats.householdMembers} Family Members</div>
              </div>

              <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span className="text-xs">Home Locations</span>
                  <Building2 className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-xl font-bold text-white">{stats.locations}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">GPS Registered</div>
              </div>

              <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span className="text-xs">Disaster & Zones</span>
                  <ShieldAlert className="w-4 h-4 text-red-400" />
                </div>
                <div className="text-xl font-bold text-white">{stats.disasters}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{stats.affectedZones} Polygon Zone</div>
              </div>

              <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span className="text-xs">Shelters</span>
                  <Tent className="w-4 h-4 text-purple-400" />
                </div>
                <div className="text-xl font-bold text-white">{stats.shelters}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{stats.expectedLocations} Expected Arrivals</div>
              </div>

              <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span className="text-xs">Facilities & Alerts</span>
                  <Ambulance className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-xl font-bold text-white">{stats.facilities}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{stats.notifications} Alerts / {stats.roads} Roads</div>
              </div>
            </div>
          </section>
        )}

        {/* Demo Accounts Reference Table for Testing */}
        <section id="demo-credentials" className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-400" />
              Citizen Demo Accounts (Hashed Aadhaar + Passwords)
            </h3>
            <div className="overflow-x-auto text-xs">
              <table className="w-full text-left font-mono text-slate-300">
                <thead className="border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="py-2">Name</th>
                    <th className="py-2">Mobile</th>
                    <th className="py-2">Last 4</th>
                    <th className="py-2">Password</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  <tr>
                    <td className="py-1.5 text-white">Ramesh Sharma</td>
                    <td>+919876543201</td>
                    <td className="text-amber-300">0001</td>
                    <td className="text-slate-400">Citizen@123</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-white">Arvind Patel</td>
                    <td>+919876543204</td>
                    <td className="text-amber-300">0004</td>
                    <td className="text-slate-400">Citizen@123</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-white">Lakshmi Iyer</td>
                    <td>+919876543207</td>
                    <td className="text-amber-300">0007</td>
                    <td className="text-slate-400">Citizen@123</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-500">
              *Full 12-digit fictional Aadhaar IDs are bcrypt hashed; only last-4 digits are retrievable for verification.
            </p>
          </div>

          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              Rescuer & Authority Demo Accounts
            </h3>
            <div className="overflow-x-auto text-xs">
              <table className="w-full text-left font-mono text-slate-300">
                <thead className="border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="py-2">Name</th>
                    <th className="py-2">Mobile</th>
                    <th className="py-2">Role</th>
                    <th className="py-2">Password</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  <tr>
                    <td className="py-1.5 text-white">Insp. Rajesh Kumar</td>
                    <td>+919876543101</td>
                    <td className="text-red-400 font-bold">RESCUER</td>
                    <td className="text-slate-400">Rescuer@123</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-white">Cdr. Vikram Singh</td>
                    <td>+919876543102</td>
                    <td className="text-red-400 font-bold">RESCUER</td>
                    <td className="text-slate-400">Rescuer@123</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-500">
              *Rescuer credentials grant authority to incident dispatch and emergency coordination endpoints.
            </p>
          </div>
        </section>

        {/* Modal for New User Registration */}
        {showSignupModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-emerald-400" />
                  Test New Account Signup (POST /api/auth/signup)
                </h3>
                <button onClick={() => setShowSignupModal(false)} className="text-slate-400 hover:text-white">✕</button>
              </div>

              <form onSubmit={handleSignupSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={signupForm.name}
                    onChange={(e) => setSignupForm({ ...signupForm, name: e.target.value })}
                    placeholder="e.g., Ananya Sharma"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Mobile Number (Unique)</label>
                  <input
                    type="text"
                    required
                    value={signupForm.mobileNumber}
                    onChange={(e) => setSignupForm({ ...signupForm, mobileNumber: e.target.value })}
                    placeholder="e.g., +919811223344"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">National ID / Aadhaar (Hashed via Bcrypt)</label>
                  <input
                    type="text"
                    required
                    value={signupForm.identityNumber}
                    onChange={(e) => setSignupForm({ ...signupForm, identityNumber: e.target.value })}
                    placeholder="e.g., 998877665544 (12 digits)"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-[10px] text-slate-500">Only last 4 digits stored for UI; full ID hashed</span>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Password</label>
                  <input
                    type="password"
                    required
                    value={signupForm.password}
                    onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })}
                    placeholder="Min 6 characters"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Role Assignment</label>
                  <select
                    value={signupForm.role}
                    onChange={(e) => setSignupForm({ ...signupForm, role: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="CITIZEN">CITIZEN</option>
                    <option value="RESCUER">RESCUER</option>
                  </select>
                </div>

                {signupStatus && (
                  <p className="text-[11px] text-amber-400 font-medium">{signupStatus}</p>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSignupModal(false)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={authActionLoading}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium disabled:opacity-50"
                  >
                    {authActionLoading ? 'Creating...' : 'Create Account'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
