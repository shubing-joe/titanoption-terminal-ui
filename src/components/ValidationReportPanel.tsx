import { AlertTriangle, CheckCircle2, Cpu, DatabaseZap, ShieldAlert } from 'lucide-react';
import { LiveOptionChainRow, QuoteQualitySummary, RustPositionAnalysisResponse, ValidationReplayResult } from '../types';
import {
  computeEngineSummary,
  formatQualityRatio,
  publicSandboxNote,
  summarizeRustPositionAnalysis,
  summarizeReplayValidation,
  topRejectionReasons,
} from '../lib/validationReport';

interface ValidationReportPanelProps {
  activeSymbol: string;
  qualitySummary?: QuoteQualitySummary;
  liveChain?: LiveOptionChainRow[];
  replayResult?: ValidationReplayResult;
  replayError?: string;
  isReplayLoading?: boolean;
  rustAnalysis?: RustPositionAnalysisResponse;
  isRustAnalysisLoading?: boolean;
}

export default function ValidationReportPanel({
  activeSymbol,
  qualitySummary,
  liveChain = [],
  replayResult,
  replayError,
  isReplayLoading = false,
  rustAnalysis,
  isRustAnalysisLoading = false,
}: ValidationReportPanelProps) {
  const resolvedQualitySummary = qualitySummary || (liveChain.length > 0 ? {
    input_count: liveChain.length,
    accepted_count: liveChain.length,
    rejected_count: 0,
    rejection_reasons: {},
  } : undefined);
  const replay = summarizeReplayValidation(replayResult);
  const rust = summarizeRustPositionAnalysis(rustAnalysis);
  const rejectionReasons = topRejectionReasons(resolvedQualitySummary);
  const engine = computeEngineSummary({ liveChain, qualitySummary: resolvedQualitySummary, replayResult, rustCoreEnabled: true });
  const engineStatusClass = engine.status === 'INSTITUTIONAL_CHECKED'
    ? 'text-emerald-300'
    : engine.status === 'PARTIAL_MODEL'
      ? 'text-amber-300'
      : 'text-gray-400';

  return (
    <section className="bg-[#050507] border border-emerald-500/20 shadow-[0_0_0_1px_rgba(16,185,129,0.08)] p-4 font-mono">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-800 pb-3 mb-3">
        <div>
          <h3 className="text-emerald-400 text-sm font-black tracking-[0.18em] uppercase flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" />
            STRICT VALIDATION GATE
          </h3>
          <p className="text-[11px] text-gray-500 mt-1">
            {activeSymbol} · public mock quote quality · private execution modules excluded
          </p>
        </div>
        <span className="text-[10px] px-2 py-1 border border-emerald-400/30 text-emerald-300 bg-emerald-400/5">
          MOCK ONLY
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <div className="bg-[#111116] border border-gray-800 p-3">
          <div className="text-[10px] text-gray-500 uppercase mb-1 flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-violet-400" />
            Compute Engine
          </div>
          <div className={`text-sm font-black ${engineStatusClass}`}>{engine.status}</div>
          <div className="mt-2 text-[10px] text-gray-400 leading-relaxed space-y-1">
            <div className="text-violet-200/90">{engine.engineLabel}</div>
            <div>{engine.greekCoverageLabel}</div>
            <div>{engine.replayLabel}</div>
            <div>{engine.rustLabel}</div>
            <div className={engine.status === 'PARTIAL_MODEL' ? 'text-amber-300' : 'text-gray-500'}>{engine.degradationLabel}</div>
          </div>
        </div>

        <div className="bg-[#111116] border border-gray-800 p-3">
          <div className="text-[10px] text-gray-500 uppercase mb-1 flex items-center gap-1.5">
            <DatabaseZap className="w-3.5 h-3.5 text-cyan-400" />
            Quote Quality
          </div>
          <div className="text-lg font-black text-cyan-300">{formatQualityRatio(resolvedQualitySummary)}</div>
          <div className="mt-2 min-h-[36px] text-[10px] text-gray-400 space-y-1">
            {rejectionReasons.length > 0 ? (
              rejectionReasons.slice(0, 3).map(reason => <div key={reason}>{reason}</div>)
            ) : (
              <div>No rejected quote rows reported.</div>
            )}
          </div>
        </div>

        <div className="bg-[#111116] border border-gray-800 p-3">
          <div className="text-[10px] text-gray-500 uppercase mb-1 flex items-center gap-1.5">
            <CheckCircle2 className={`w-3.5 h-3.5 ${replay.status === 'PASS' ? 'text-emerald-400' : 'text-amber-400'}`} />
            Replay Validation
          </div>
          <div className={`text-sm font-black ${replay.status === 'PASS' ? 'text-emerald-300' : 'text-amber-300'}`}>
            {isReplayLoading ? 'LOADING...' : replay.status}
          </div>
          <div className="mt-2 text-[10px] text-gray-400 leading-relaxed">
            {replayError || replay.text}
          </div>
        </div>

        <div className="bg-[#111116] border border-gray-800 p-3">
          <div className="text-[10px] text-gray-500 uppercase mb-1 flex items-center gap-1.5">
            <Cpu className={`w-3.5 h-3.5 ${rust.status === 'PASS' ? 'text-violet-400' : 'text-amber-400'}`} />
            Rust Position
          </div>
          <div className={`text-sm font-black ${rust.status === 'PASS' ? 'text-violet-300' : rust.status === 'WARN' ? 'text-amber-300' : 'text-gray-400'}`}>
            {isRustAnalysisLoading ? 'LOADING...' : rust.status}
          </div>
          <div className="mt-2 text-[10px] text-gray-400 leading-relaxed space-y-1">
            <div>{rust.text}</div>
            <div className="text-violet-200/90">{rust.riskText}</div>
          </div>
        </div>

        <div className="bg-[#111116] border border-gray-800 p-3">
          <div className="text-[10px] text-gray-500 uppercase mb-1 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
            Public Boundary
          </div>
          <div className="text-[10px] text-gray-300 leading-relaxed space-y-1">
            <div>{publicSandboxNote('no_live_provider')}</div>
            <div>{publicSandboxNote('no_execution')}</div>
            <div>{publicSandboxNote('private_modules')}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
