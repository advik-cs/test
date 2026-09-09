import React from 'react';
import { Home, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';

export interface VerificationItem {
  step: string;
  passed: boolean;
  details: string;
}

export interface VerificationResponse {
  success: boolean;
  stage: string;
  summary: string;
  checks: VerificationItem[];
}

interface Stage3VerificationPanelProps {
  stage3Result: VerificationResponse | null;
  verifyingStage3: boolean;
  onRunVerification: () => void;
}

export const Stage3VerificationPanel: React.FC<Stage3VerificationPanelProps> = ({
  stage3Result,
  verifyingStage3,
  onRunVerification,
}) => {
  return (
    <section
      id="stage3-verification-suite"
      className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Home className="w-5 h-5 text-emerald-400" />
            Stage 3: Household, Member CRUD & Demographics Verification Suite (17 Checks)
          </h2>
          <p className="text-xs text-slate-400">
            Automated testing of Household registration, Member CRUD, automatic Population/Adult/Child/Elderly recalculation, and strict Citizen Ownership Protection (403 Forbidden).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onRunVerification}
            disabled={verifyingStage3}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
          >
            <Sparkles className={`w-3.5 h-3.5 ${verifyingStage3 ? 'animate-spin' : ''}`} />
            {verifyingStage3 ? 'Running Checks...' : 'Re-run Stage 3 Tests'}
          </button>
          {stage3Result && (
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                stage3Result.success
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}
            >
              {stage3Result.success ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              {stage3Result.summary}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {stage3Result?.checks.map((c, idx) => (
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
  );
};
