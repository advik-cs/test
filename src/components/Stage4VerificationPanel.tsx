import React from 'react';
import { Building, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import { VerificationResponse } from './Stage3VerificationPanel';

interface Stage4VerificationPanelProps {
  stage4Result: VerificationResponse | null;
  verifyingStage4: boolean;
  onRunVerification: () => void;
}

export const Stage4VerificationPanel: React.FC<Stage4VerificationPanelProps> = ({
  stage4Result,
  verifyingStage4,
  onRunVerification,
}) => {
  return (
    <section
      id="stage4-verification-suite"
      className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Building className="w-5 h-5 text-emerald-400" />
            Stage 4: Registered Home Location & GPS Coordinates Verification Suite (18 Checks)
          </h2>
          <p className="text-xs text-slate-400">
            Automated verification of Registered Home/Building location management, GPS coordinate range bounds (-90..90, -180..180), Citizen Ownership Protection (403), Rescuer read-only inspections, and Strict Separation from disaster-specific expected locations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            id="rerun-stage4-tests-btn"
            onClick={onRunVerification}
            disabled={verifyingStage4}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
          >
            <Sparkles className={`w-3.5 h-3.5 ${verifyingStage4 ? 'animate-spin' : ''}`} />
            {verifyingStage4 ? 'Running Checks...' : 'Re-run Stage 4 Tests'}
          </button>
          {stage4Result && (
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                stage4Result.success
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}
            >
              {stage4Result.success ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              {stage4Result.summary}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {stage4Result?.checks.map((c, idx) => (
          <div
            key={idx}
            className={`p-3.5 rounded-lg border flex items-start justify-between gap-3 text-xs ${
              c.passed
                ? 'bg-slate-950/70 border-emerald-900/40 text-slate-300'
                : 'bg-red-950/30 border-red-800 text-red-200'
            }`}
          >
            <div className="space-y-1">
              <span className="font-semibold text-slate-200 block">{c.step}</span>
              <span className="text-slate-400 block">{c.details}</span>
            </div>
            <div className="shrink-0 mt-0.5">
              {c.passed ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  PASS
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                  FAIL
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
