import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  Megaphone,
  UserPlus,
  KeyRound,
  Ban,
  CheckCircle2,
  Trash2,
  Sliders,
  Download,
  Upload,
  Clock,
  RefreshCw,
  CalendarClock,
} from 'lucide-react';
import {
  FullGameState,
  Game,
  ScheduledTaskActionType,
  User,
  authFetch,
  formatISTDateTime,
  formatISTTime,
  getCurrentISTInputString,
} from '../types';
import { formatINR } from './PlayerTerminal';

interface AdminGodViewProps {
  users: User[];
  games: Game[];
  selectedGameId: number | null;
  onSelectGame: (id: number) => void;
  gameState: FullGameState | null;
  onRefreshAll: () => void;
}

export const AdminGodView: React.FC<AdminGodViewProps> = ({
  users,
  games,
  selectedGameId,
  onSelectGame,
  gameState,
  onRefreshAll,
}) => {
  const [activeSection, setActiveSection] = useState<
    'godview' | 'manipulation' | 'scheduler' | 'rules' | 'users' | 'games' | 'intel'
  >('godview');

  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  // Live IST Clock in Admin Bar
  const [currentIstClock, setCurrentIstClock] = useState<string>(() =>
    formatISTTime(new Date())
  );
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIstClock(formatISTTime(new Date()));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // File Input Ref for Importing Round JSON Archive
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  // User Creation & Password Reset State
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'Player' | 'Admin'>('Player');
  const [resetTargetId, setResetTargetId] = useState<number | null>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState('');

  // News Broadcast State
  const [newsHeadline, setNewsHeadline] = useState('');
  const [newsSummary, setNewsSummary] = useState('');
  const [newsSeverity, setNewsSeverity] = useState<'Info' | 'Bullish' | 'Bearish' | 'Critical'>('Bullish');
  const [newsTicker, setNewsTicker] = useState<string>('');
  const [newsDeltaPct, setNewsDeltaPct] = useState<string>('0');

  // Stock custom price input map
  const [customPrices, setCustomPrices] = useState<Record<number, string>>({});

  // Player custom cash & credit input maps
  const [customPlayerCash, setCustomPlayerCash] = useState<Record<number, string>>({});
  const [customPlayerCredits, setCustomPlayerCredits] = useState<Record<number, string>>({});

  // 6-Char Alphanumeric Join Code Management State (for Active Game)
  const [customJoinCodeInput, setCustomJoinCodeInput] = useState('');
  const [joinCodeDurationMode, setJoinCodeDurationMode] = useState<string>('infinite');
  const [customJoinCodeMinutes, setCustomJoinCodeMinutes] = useState<string>('30');

  // Scheduled Task Automation State (IST +5:30)
  const [schedTimeIst, setSchedTimeIst] = useState<string>(() => getCurrentISTInputString(5));
  const [schedActionType, setSchedActionType] = useState<ScheduledTaskActionType>('SET_STATUS');
  // Payloads for Scheduled Tasks
  const [schedStatusTarget, setSchedStatusTarget] = useState<'Active' | 'Paused' | 'Completed'>('Active');
  const [schedStatusResetBaseline, setSchedStatusResetBaseline] = useState<boolean>(false);
  const [schedResetBaselineTicker, setSchedResetBaselineTicker] = useState<string>('ALL');
  const [schedNewsHeadline, setSchedNewsHeadline] = useState('');
  const [schedNewsSummary, setSchedNewsSummary] = useState('');
  const [schedNewsSeverity, setSchedNewsSeverity] = useState<'Info' | 'Bullish' | 'Bearish' | 'Critical'>('Bullish');
  const [schedNewsTicker, setSchedNewsTicker] = useState('');
  const [schedNewsDelta, setSchedNewsDelta] = useState('0');
  const [schedStockTicker, setSchedStockTicker] = useState('');
  const [schedStockMode, setSchedStockMode] = useState<'delta' | 'exact'>('delta');
  const [schedStockVal, setSchedStockVal] = useState('10');
  const [schedStockVol, setSchedStockVol] = useState('');
  const [schedPlayerTarget, setSchedPlayerTarget] = useState<string>('ALL');
  const [schedPlayerCashMode, setSchedPlayerCashMode] = useState<'none' | 'delta' | 'exact'>('delta');
  const [schedPlayerCashVal, setSchedPlayerCashVal] = useState('100000');
  const [schedPlayerCreditsMode, setSchedPlayerCreditsMode] = useState<'none' | 'delta' | 'exact'>('none');
  const [schedPlayerCreditsVal, setSchedPlayerCreditsVal] = useState('5');
  const [schedRuleTickMs, setSchedRuleTickMs] = useState('');
  const [schedRuleFeePct, setSchedRuleFeePct] = useState('');
  const [schedRuleDriftBias, setSchedRuleDriftBias] = useState('');
  const [schedRuleAllowShort, setSchedRuleAllowShort] = useState<'keep' | 'true' | 'false'>('keep');

  // Add Stock to current game
  const [addStockName, setAddStockName] = useState('');
  const [addStockTicker, setAddStockTicker] = useState('');
  const [addStockSector, setAddStockSector] = useState('Technology');
  const [addStockPrice, setAddStockPrice] = useState('1200');
  const [addStockVol, setAddStockVol] = useState('0.025');

  // Live Active Game Rule Editor State
  const [editStartCap, setEditStartCap] = useState('1000000');
  const [editInitCreds, setEditInitCreds] = useState('10');
  const [editTickMs, setEditTickMs] = useState('3000');
  const [editDemandFactor, setEditDemandFactor] = useState('0.0018');
  const [editDriftBias, setEditDriftBias] = useState('0');
  const [editNoiseMult, setEditNoiseMult] = useState('0.45');
  const [editFeePct, setEditFeePct] = useState('0.1');
  const [editMaxOrderQty, setEditMaxOrderQty] = useState('2500');
  const [editMaxPosPct, setEditMaxPosPct] = useState('50');
  const [editCbDown, setEditCbDown] = useState('45');
  const [editCbUp, setEditCbUp] = useState('150');
  const [editCbResetMins, setEditCbResetMins] = useState('0');
  const [editAllowShort, setEditAllowShort] = useState(true);
  const [editShortMargin, setEditShortMargin] = useState('0.5');

  useEffect(() => {
    if (gameState?.game) {
      const g = gameState.game;
      setEditStartCap(String(g.starting_capital));
      setEditInitCreds(String(g.initial_credits));
      setEditTickMs(String(g.tick_interval_ms ?? 3000));
      setEditDemandFactor(String(g.demand_impact_factor ?? 0.0018));
      setEditDriftBias(String(g.random_drift_bias ?? 0));
      setEditNoiseMult(String(g.noise_multiplier ?? 0.45));
      setEditFeePct(String(g.trade_fee_percent ?? 0.1));
      setEditMaxOrderQty(String(g.max_order_quantity ?? 5000));
      setEditMaxPosPct(String(g.max_position_percent ?? 100));
      setEditCbDown(String(g.circuit_breaker_down_pct ?? 50));
      setEditCbUp(String(g.circuit_breaker_up_pct ?? 200));
      setEditCbResetMins(String(g.circuit_breaker_reset_minutes ?? 0));
      setEditAllowShort(Boolean(g.allow_short_selling));
      setEditShortMargin(String(g.short_margin_requirement ?? 0.5));
      setCustomJoinCodeInput(g.join_code || '');
    }
  }, [gameState?.game?.id, gameState?.game?.join_code]);

  // New Game / Round Creator State (Explicit Market Rules + Join Code)
  const [gameName, setGameName] = useState('');
  const [startCap, setStartCap] = useState('1000000');
  const [initCreds, setInitCreds] = useState('10');
  const [tickMs, setTickMs] = useState('3000');
  const [demandFactor, setDemandFactor] = useState('0.0018');
  const [driftBias, setDriftBias] = useState('0.0005');
  const [noiseMult, setNoiseMult] = useState('0.45');
  const [feePct, setFeePct] = useState('0.10');
  const [maxOrderQty, setMaxOrderQty] = useState('2500');
  const [maxPosPct, setMaxPosPct] = useState('50');
  const [cbDown, setCbDown] = useState('45');
  const [cbUp, setCbUp] = useState('150');
  const [cbResetMins, setCbResetMins] = useState('0');
  const [allowShort, setAllowShort] = useState(true);
  const [shortMargin, setShortMargin] = useState('0.50');
  const [newGameJoinCode, setNewGameJoinCode] = useState('');
  const [newGameCodeDuration, setNewGameCodeDuration] = useState('infinite');

  const [selectedNewGamePlayers, setSelectedNewGamePlayers] = useState<number[]>([]);
  const [draftStocks, setDraftStocks] = useState<
    { name: string; ticker: string; sector: string; base_price: number; volatility: number }[]
  >([
    { name: 'Orion Quantum Systems', ticker: 'ORQN', sector: 'Semiconductors', base_price: 1850, volatility: 0.025 },
    { name: 'Meridian Green Hydrogen', ticker: 'MGH2', sector: 'Energy', base_price: 740, volatility: 0.02 },
    { name: 'Aegis Cybernetics Corp', ticker: 'AEGS', sector: 'Defense', base_price: 2950, volatility: 0.03 },
    { name: 'NovaGen Therapeutics', ticker: 'NVGN', sector: 'Biotech', base_price: 1120, volatility: 0.035 },
  ]);
  const [draftStockName, setDraftStockName] = useState('');
  const [draftStockTicker, setDraftStockTicker] = useState('');
  const [draftStockSector, setDraftStockSector] = useState('Technology');
  const [draftStockPrice, setDraftStockPrice] = useState('1000');
  const [draftStockVol, setDraftStockVol] = useState('0.02');

  // Initial Hints for New Game
  const [draftHints, setDraftHints] = useState<
    { ticker: string; title: string; category: string; risk_rating: string; content: string; cost_credits: number }[]
  >([
    {
      ticker: 'ORQN',
      title: 'Cryogenic Chip Yield Breakthrough Note',
      category: 'Insider Intel',
      risk_rating: 'HIGH VOLATILITY // BETA 1.80',
      content: 'Yield rates on next-gen quantum processors beat internal targets by 22%. Major sovereign cloud order imminent.',
      cost_credits: 3,
    },
    {
      ticker: 'NVGN',
      title: 'Toxicology Screening Audit Flag',
      category: 'Regulatory Audit',
      risk_rating: 'EXTREME TAIL RISK // BETA 2.30',
      content: 'FDA reviewers requested supplemental safety data on lead gene-editing candidate; potential 2-quarter delay.',
      cost_credits: 4,
    },
  ]);
  const [draftHintTicker, setDraftHintTicker] = useState('ORQN');
  const [draftHintTitle, setDraftHintTitle] = useState('');
  const [draftHintCategory, setDraftHintCategory] = useState('Insider Intel');
  const [draftHintRisk, setDraftHintRisk] = useState('MEDIUM RISK // BETA 1.40');
  const [draftHintCost, setDraftHintCost] = useState('3');
  const [draftHintContent, setDraftHintContent] = useState('');

  // New Hint Dossier State for Existing Game
  const [hintStockId, setHintStockId] = useState<string>('');
  const [hintTitle, setHintTitle] = useState('');
  const [hintCategory, setHintCategory] = useState('Insider Intel');
  const [hintRisk, setHintRisk] = useState('HIGH VOLATILITY // BETA 1.75');
  const [hintContent, setHintContent] = useState('');
  const [hintCost, setHintCost] = useState('3');

  const notify = (type: 'ok' | 'err', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4500);
  };

  const applyRulePreset = (preset: 'institutional' | 'hft_bull' | 'crash_stress' | 'unrestricted') => {
    if (preset === 'institutional') {
      setStartCap('1000000');
      setInitCreds('10');
      setTickMs('3000');
      setDemandFactor('0.0018');
      setDriftBias('0.0005');
      setNoiseMult('0.45');
      setFeePct('0.10');
      setMaxOrderQty('2500');
      setMaxPosPct('50');
      setCbDown('45');
      setCbUp('150');
      setAllowShort(true);
      setShortMargin('0.50');
    } else if (preset === 'hft_bull') {
      setStartCap('2500000');
      setInitCreds('15');
      setTickMs('1200');
      setDemandFactor('0.0032');
      setDriftBias('0.0025');
      setNoiseMult('0.65');
      setFeePct('0.05');
      setMaxOrderQty('5000');
      setMaxPosPct('75');
      setCbDown('60');
      setCbUp('300');
      setAllowShort(true);
      setShortMargin('0.35');
    } else if (preset === 'crash_stress') {
      setStartCap('500000');
      setInitCreds('12');
      setTickMs('2000');
      setDemandFactor('0.0025');
      setDriftBias('-0.0030');
      setNoiseMult('0.75');
      setFeePct('0.25');
      setMaxOrderQty('1000');
      setMaxPosPct('40');
      setCbDown('30');
      setCbUp('80');
      setAllowShort(true);
      setShortMargin('0.60');
    } else {
      setStartCap('5000000');
      setInitCreds('25');
      setTickMs('2500');
      setDemandFactor('0.0040');
      setDriftBias('0.0');
      setNoiseMult('0.50');
      setFeePct('0.0');
      setMaxOrderQty('50000');
      setMaxPosPct('100');
      setCbDown('90');
      setCbUp('500');
      setAllowShort(true);
      setShortMargin('0.25');
    }
    notify('ok', 'Loaded market rule preset into form');
  };

  // Manual Open Market Reset Baseline checkbox state
  const [manualOpenResetBaseline, setManualOpenResetBaseline] = useState<boolean>(false);

  const handleToggleGameStatus = async (forceResetBaseline?: boolean) => {
    if (!gameState) return;
    const nextStatus = gameState.game.status === 'Active' ? 'Paused' : 'Active';
    const shouldReset =
      nextStatus === 'Active' && (forceResetBaseline ?? manualOpenResetBaseline);
    await authFetch(`/api/admin/games/${gameState.game.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus, resetBaseline: shouldReset }),
    });
    notify(
      'ok',
      shouldReset
        ? `Round status set to ${nextStatus} & Circuit Breaker Baselines reset to current prices`
        : `Round status set to ${nextStatus}`
    );
    onRefreshAll();
  };

  // ==================== SINGLE ROUND EXPORT / DELETE / IMPORT HANDLERS ====================
  const handleExportCurrentRound = async () => {
    if (!selectedGameId || !gameState) return;
    try {
      const res = await authFetch(`/api/admin/games/${selectedGameId}/export`);
      if (!res.ok) {
        notify('err', 'Failed to export round data');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = gameState.game.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      a.download = `iitb_stoxchange_round_${selectedGameId}_${safeName}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      notify('ok', `Exported complete archive for "${gameState.game.name}"`);
    } catch {
      notify('err', 'Error downloading round archive');
    }
  };

  const handleDeleteCurrentRound = async (exportFirst: boolean) => {
    if (!selectedGameId || !gameState) return;
    const roundName = gameState.game.name;
    if (exportFirst) {
      await handleExportCurrentRound();
    }
    try {
      const res = await authFetch(`/api/admin/games/${selectedGameId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        notify('err', data.error || 'Failed to delete round');
        return;
      }
      notify(
        'ok',
        exportFirst
          ? `Exported & permanently deleted round "${roundName}" from database`
          : `Permanently deleted round "${roundName}" from database`
      );
      if (data.games && data.games.length > 0) {
        onSelectGame(data.games[0].id);
      }
      onRefreshAll();
    } catch {
      notify('err', 'Error deleting round from database');
    }
  };

  const handleImportRoundFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await authFetch('/api/admin/games/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      if (!res.ok) {
        notify('err', data.error || 'Failed to import round archive');
      } else {
        notify('ok', 'Successfully imported round archive for analysis/replay!');
        if (data.gameId) {
          onSelectGame(data.gameId);
          setActiveSection('godview');
        }
        onRefreshAll();
      }
    } catch {
      notify('err', 'Invalid JSON round archive file');
    } finally {
      if (importFileInputRef.current) {
        importFileInputRef.current.value = '';
      }
    }
  };

  // ==================== 6-CHAR JOIN CODE HANDLERS ====================
  const handleUpdateJoinCode = async (opts: { regenerate?: boolean; disable?: boolean }) => {
    if (!selectedGameId) return;
    const durationVal =
      joinCodeDurationMode === 'custom'
        ? Number(customJoinCodeMinutes) || 30
        : joinCodeDurationMode === 'infinite'
        ? 'infinite'
        : Number(joinCodeDurationMode);

    const res = await authFetch(`/api/admin/games/${selectedGameId}/join-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customCode: opts.regenerate ? undefined : customJoinCodeInput.trim().toUpperCase(),
        durationMinutes: durationVal,
        disable: opts.disable,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      if (opts.disable) {
        notify('ok', 'Disabled 6-character join code for this round');
      } else {
        setCustomJoinCodeInput(data.join_code || '');
        notify(
          'ok',
          `Join code set to ${data.join_code} (${
            data.join_code_expires_at
              ? `Valid until ${formatISTTime(data.join_code_expires_at)}`
              : 'Infinite Validity'
          })`
        );
      }
      onRefreshAll();
    } else {
      notify('err', data.error || 'Failed to update join code');
    }
  };

  // ==================== SCHEDULED TASKS (IST +5:30) HANDLERS ====================
  const handleCreateScheduledTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGameId || !schedTimeIst) return;

    // Interpret the datetime-local input strictly as IST (+05:30)
    const executeAtIso = new Date(`${schedTimeIst}:00+05:30`).toISOString();
    let payload: any = {};

    if (schedActionType === 'SET_STATUS') {
      payload = {
        status: schedStatusTarget,
        resetBaseline: schedStatusTarget === 'Active' ? schedStatusResetBaseline : false,
      };
    } else if (schedActionType === 'RESET_BASELINE') {
      payload = {
        ticker: schedResetBaselineTicker || 'ALL',
      };
    } else if (schedActionType === 'BROADCAST_NEWS') {
      if (!schedNewsHeadline.trim()) {
        notify('err', 'Enter a headline for the scheduled announcement');
        return;
      }
      payload = {
        headline: schedNewsHeadline.trim(),
        impact_summary: schedNewsSummary.trim(),
        severity: schedNewsSeverity,
        affected_ticker: schedNewsTicker || null,
        price_delta_percent: Number(schedNewsDelta) || 0,
      };
    } else if (schedActionType === 'MANIPULATE_STOCK') {
      const targetTicker = schedStockTicker || gameState?.stocks[0]?.ticker || '';
      if (!targetTicker) {
        notify('err', 'Select a target stock ticker');
        return;
      }
      payload = {
        ticker: targetTicker,
        ...(schedStockMode === 'exact'
          ? { exactPrice: Number(schedStockVal) }
          : { deltaPercent: Number(schedStockVal) }),
        ...(schedStockVol.trim() !== '' ? { volatility: Number(schedStockVol) } : {}),
      };
    } else if (schedActionType === 'ALTER_PLAYER') {
      payload = {
        userId: schedPlayerTarget === 'ALL' ? 'ALL' : Number(schedPlayerTarget),
        ...(schedPlayerCashMode === 'delta'
          ? { cashDelta: Number(schedPlayerCashVal) }
          : schedPlayerCashMode === 'exact'
          ? { exactCash: Number(schedPlayerCashVal) }
          : {}),
        ...(schedPlayerCreditsMode === 'delta'
          ? { creditsDelta: Number(schedPlayerCreditsVal) }
          : schedPlayerCreditsMode === 'exact'
          ? { exactCredits: Number(schedPlayerCreditsVal) }
          : {}),
      };
    } else if (schedActionType === 'UPDATE_RULES') {
      payload = {
        ...(schedRuleTickMs.trim() !== '' ? { tick_interval_ms: Number(schedRuleTickMs) } : {}),
        ...(schedRuleFeePct.trim() !== '' ? { trade_fee_percent: Number(schedRuleFeePct) } : {}),
        ...(schedRuleDriftBias.trim() !== '' ? { random_drift_bias: Number(schedRuleDriftBias) } : {}),
        ...(schedRuleAllowShort !== 'keep'
          ? { allow_short_selling: schedRuleAllowShort === 'true' }
          : {}),
      };
    }

    const res = await authFetch(`/api/admin/games/${selectedGameId}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        execute_at: executeAtIso,
        action_type: schedActionType,
        payload,
      }),
    });

    if (res.ok) {
      notify('ok', `Scheduled ${schedActionType} for ${formatISTDateTime(executeAtIso)}`);
      setSchedNewsHeadline('');
      setSchedNewsSummary('');
      onRefreshAll();
    } else {
      const errData = await res.json();
      notify('err', errData.error || 'Failed to schedule task');
    }
  };

  const handleDeleteScheduledTask = async (taskId: number) => {
    if (!selectedGameId) return;
    await authFetch(`/api/admin/games/${selectedGameId}/schedule/${taskId}`, {
      method: 'DELETE',
    });
    notify('ok', 'Removed scheduled task');
    onRefreshAll();
  };

  const handleSaveActiveGameRules = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGameId) return;
    const res = await authFetch(`/api/admin/games/${selectedGameId}/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        starting_capital: Number(editStartCap),
        initial_credits: Number(editInitCreds),
        tick_interval_ms: Number(editTickMs),
        demand_impact_factor: Number(editDemandFactor),
        random_drift_bias: Number(editDriftBias),
        noise_multiplier: Number(editNoiseMult),
        trade_fee_percent: Number(editFeePct),
        max_order_quantity: Number(editMaxOrderQty),
        max_position_percent: Number(editMaxPosPct),
        circuit_breaker_down_pct: Number(editCbDown),
        circuit_breaker_up_pct: Number(editCbUp),
        circuit_breaker_reset_minutes: Number(editCbResetMins) || 0,
        allow_short_selling: editAllowShort,
        short_margin_requirement: Number(editShortMargin),
      }),
    });
    if (res.ok) {
      notify('ok', 'Live market rules updated and broadcast to all connected terminals');
      onRefreshAll();
    }
  };

  const handleResetBaselineNow = async () => {
    if (!selectedGameId) return;
    const res = await authFetch(`/api/admin/games/${selectedGameId}/reset-baseline`, {
      method: 'POST',
    });
    if (res.ok) {
      notify('ok', 'Reset Circuit Breaker Baseline (base_price = current_price) for all stocks');
      onRefreshAll();
    }
  };

  const handleManipulateStock = async (
    stockId: number,
    opts: { deltaPercent?: number; exactPrice?: number; volatility?: number }
  ) => {
    if (!selectedGameId) return;
    const res = await authFetch(`/api/admin/games/${selectedGameId}/manipulate-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stockId, ...opts }),
    });
    if (res.ok) {
      const data = await res.json();
      notify('ok', `Updated stock price to ₹${formatINR(data.newPrice)}`);
      onRefreshAll();
    }
  };

  const handleAlterPlayer = async (
    userId: number | 'ALL',
    opts: { cashDelta?: number; exactCash?: number; creditsDelta?: number; exactCredits?: number }
  ) => {
    if (!selectedGameId) return;
    const res = await authFetch(`/api/admin/games/${selectedGameId}/alter-player`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, ...opts }),
    });
    if (res.ok) {
      notify('ok', 'Player balance/credits updated in real time');
      onRefreshAll();
    }
  };

  const handleBroadcastNews = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGameId || !newsHeadline.trim()) return;
    const res = await authFetch(`/api/admin/games/${selectedGameId}/news`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        headline: newsHeadline,
        impact_summary: newsSummary,
        severity: newsSeverity,
        affected_ticker: newsTicker || null,
        price_delta_percent: Number(newsDeltaPct) || 0,
      }),
    });
    if (res.ok) {
      setNewsHeadline('');
      setNewsSummary('');
      setNewsDeltaPct('0');
      notify('ok', 'News event broadcast to all connected player terminals');
      onRefreshAll();
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim()) return;
    const res = await authFetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: newUsername,
        password: newPassword,
        role: newRole,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      notify('err', data.error || 'Failed to create user');
    } else {
      setNewUsername('');
      setNewPassword('');
      notify('ok', `Created account: ${newUsername}`);
      onRefreshAll();
    }
  };

  const handleResetPassword = async (userId: number) => {
    if (!resetPasswordVal.trim()) return;
    const res = await authFetch(`/api/admin/users/${userId}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: resetPasswordVal }),
    });
    if (res.ok) {
      setResetTargetId(null);
      setResetPasswordVal('');
      notify('ok', 'Password reset saved');
    }
  };

  const handleToggleBan = async (userId: number) => {
    const res = await authFetch(`/api/admin/users/${userId}/toggle-ban`, {
      method: 'POST',
    });
    if (res.ok) {
      notify('ok', 'Updated user suspension status');
      onRefreshAll();
    }
  };

  const handleDeleteUser = async (userId: number, username: string) => {
    const res = await authFetch(`/api/admin/users/${userId}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!res.ok) {
      notify('err', data.error || 'Failed to remove user');
    } else {
      notify('ok', `Permanently removed user: ${username}`);
      onRefreshAll();
    }
  };

  const handleExportBackup = async () => {
    try {
      const res = await authFetch('/api/admin/export-backup');
      if (!res.ok) {
        notify('err', 'Failed to export database snapshot');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `iitb_stoxchange_backup_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      notify('ok', 'Downloaded full database JSON snapshot');
    } catch {
      notify('err', 'Error downloading backup');
    }
  };

  const handleEnrollPlayerToggle = async (userId: number, isEnrolled: boolean) => {
    if (!selectedGameId) return;
    await authFetch(`/api/admin/games/${selectedGameId}/players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        action: isEnrolled ? 'remove' : 'add',
      }),
    });
    notify('ok', isEnrolled ? 'Removed player from round' : 'Added player to round');
    onRefreshAll();
  };

  const handleAddStockToCurrentGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGameId || !addStockName.trim() || !addStockTicker.trim()) return;
    const res = await authFetch(`/api/admin/games/${selectedGameId}/stocks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: addStockName,
        ticker: addStockTicker,
        sector: addStockSector,
        base_price: Number(addStockPrice) || 1000,
        volatility: Number(addStockVol) || 0.02,
      }),
    });
    if (res.ok) {
      setAddStockName('');
      setAddStockTicker('');
      notify('ok', `Listed ${addStockTicker.toUpperCase()} on exchange floor`);
      onRefreshAll();
    }
  };

  const handleCreateNewGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gameName.trim()) return;
    const res = await authFetch('/api/admin/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: gameName,
        starting_capital: Number(startCap) || 1000000,
        initial_credits: Number(initCreds) ?? 10,
        tick_interval_ms: Number(tickMs) || 3000,
        demand_impact_factor: Number(demandFactor) ?? 0.0018,
        random_drift_bias: Number(driftBias) || 0,
        noise_multiplier: Number(noiseMult) ?? 0.45,
        trade_fee_percent: Number(feePct) ?? 0.1,
        max_order_quantity: Number(maxOrderQty) || 5000,
        max_position_percent: Number(maxPosPct) || 100,
        circuit_breaker_down_pct: Number(cbDown) || 50,
        circuit_breaker_up_pct: Number(cbUp) || 200,
        circuit_breaker_reset_minutes: Number(cbResetMins) || 0,
        allow_short_selling: allowShort,
        short_margin_requirement: Number(shortMargin) || 0.5,
        join_code: newGameJoinCode.trim().toUpperCase() || undefined,
        join_code_duration_minutes:
          newGameCodeDuration === 'infinite' ? 'infinite' : Number(newGameCodeDuration) || 30,
        stocks: draftStocks,
        hints: draftHints,
        playerIds: selectedNewGamePlayers,
      }),
    });
    const data = await res.json();
    if (res.ok && data.gameId) {
      setGameName('');
      setNewGameJoinCode('');
      onSelectGame(data.gameId);
      setActiveSection('godview');
      notify('ok', 'New simulation round launched with custom market rules');
      onRefreshAll();
    }
  };

  const handleCreateHint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGameId || !hintTitle.trim() || !hintContent.trim()) return;
    const targetStockId =
      Number(hintStockId) || (gameState?.stocks[0]?.id ?? 0);
    if (!targetStockId) return;

    const res = await authFetch(`/api/admin/games/${selectedGameId}/hints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stock_id: targetStockId,
        title: hintTitle,
        category: hintCategory,
        risk_rating: hintRisk,
        content: hintContent,
        cost_credits: Number(hintCost) || 2,
      }),
    });
    if (res.ok) {
      setHintTitle('');
      setHintContent('');
      notify('ok', 'Published new dossier to Information Store');
      onRefreshAll();
    }
  };

  const handleDeleteHint = async (hintId: number) => {
    if (!selectedGameId) return;
    await authFetch(`/api/admin/games/${selectedGameId}/hints/${hintId}`, {
      method: 'DELETE',
    });
    notify('ok', 'Removed dossier from Information Store');
    onRefreshAll();
  };

  const isJoinCodeExpired =
    gameState?.game.join_code_expires_at &&
    new Date(gameState.game.join_code_expires_at).getTime() < Date.now();

  return (
    <div className="min-h-[calc(100vh-57px)] bg-[#0B0F17] text-slate-100 flex flex-col">
      {/* Hidden file input for Round Archive JSON import */}
      <input
        ref={importFileInputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleImportRoundFile}
        className="hidden"
      />

      {/* SUDO MODE CONTROL STRIP */}
      <div className="px-6 py-3 bg-[#111827] border-b border-[#1E293B] flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
              Target Round:
            </span>
            <select
              value={selectedGameId || ''}
              onChange={(e) => onSelectGame(Number(e.target.value))}
              className="bg-[#0B0F17] border border-[#1E293B] text-white text-xs px-3 py-1.5 font-medium focus:outline-none focus:border-amber-500"
            >
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  #{g.id} — {g.name} ({g.status})
                </option>
              ))}
            </select>
          </div>

          {gameState && (
            <>
              <div className="flex items-center gap-2 bg-[#0B0F17] border border-[#1E293B] p-1">
                <button
                  onClick={() => handleToggleGameStatus()}
                  className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    gameState.game.status === 'Active'
                      ? 'bg-amber-600 hover:bg-amber-500 text-slate-950'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  {gameState.game.status === 'Active' ? (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      Pause Market
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      {manualOpenResetBaseline
                        ? 'Open Market + Reset Baseline'
                        : 'Open Market'}
                    </>
                  )}
                </button>

                {gameState.game.status !== 'Active' && (
                  <label
                    className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-slate-300 cursor-pointer select-none whitespace-nowrap"
                    title="When checked, opening the market will also reset every stock's base_price to its current_price"
                  >
                    <input
                      type="checkbox"
                      checked={manualOpenResetBaseline}
                      onChange={(e) => setManualOpenResetBaseline(e.target.checked)}
                    />
                    <span>Reset Baseline on Start</span>
                  </label>
                )}
              </div>

              <button
                type="button"
                onClick={handleExportCurrentRound}
                className="px-2.5 py-1.5 bg-[#0B0F17] border border-[#1E293B] hover:border-emerald-500 text-emerald-400 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap"
                title="Download complete JSON archive of this single round"
              >
                <Download className="w-3.5 h-3.5" />
                Export Round
              </button>

              <button
                type="button"
                onClick={() => handleDeleteCurrentRound(true)}
                className="px-2.5 py-1.5 bg-red-950/70 border border-red-800 hover:bg-red-900 text-red-200 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap"
                title="Auto-export this round to JSON and permanently delete it from the database"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Export & Delete Round
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => importFileInputRef.current?.click()}
            className="px-2.5 py-1.5 bg-[#0B0F17] border border-[#1E293B] hover:border-amber-500 text-amber-300 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap"
            title="Import a previously exported single-round JSON archive for analysis or replay"
          >
            <Upload className="w-3.5 h-3.5" />
            Import Round JSON
          </button>

          <div className="px-2.5 py-1 bg-[#0B0F17] border border-[#1E293B] text-[11px] font-mono text-slate-300 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>{currentIstClock}</span>
          </div>
        </div>

        {/* Section Navigation */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#0B0F17] border border-[#1E293B]">
          <button
            onClick={() => setActiveSection('godview')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              activeSection === 'godview'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Live Sudo Mode
          </button>
          <button
            onClick={() => setActiveSection('manipulation')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              activeSection === 'manipulation'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Market Manipulation & News
          </button>
          <button
            onClick={() => setActiveSection('scheduler')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1 ${
              activeSection === 'scheduler'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5" />
            Task Scheduler (IST)
            {gameState?.scheduledTasks?.some((t) => t.status === 'Pending') && (
              <span className="ml-1 px-1.5 py-0.2 bg-emerald-600 text-white text-[10px] font-mono">
                {gameState.scheduledTasks.filter((t) => t.status === 'Pending').length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveSection('rules')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              activeSection === 'rules'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Live Market Rules
          </button>
          <button
            onClick={() => setActiveSection('games')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              activeSection === 'games'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            + Create / Archive Rounds
          </button>
          <button
            onClick={() => setActiveSection('users')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              activeSection === 'users'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Users ({users.length})
          </button>
          <button
            onClick={() => setActiveSection('intel')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              activeSection === 'intel'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Info Store Dossiers
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`px-6 py-2 text-xs font-mono border-b ${
            feedback.type === 'ok'
              ? 'bg-emerald-950/60 border-emerald-700 text-emerald-200'
              : 'bg-red-950/60 border-red-700 text-red-200'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* 1. LIVE SUDO MODE DASHBOARD */}
      {activeSection === 'godview' && gameState && (
        <div className="p-6 space-y-6 max-w-[1440px] mx-auto w-full">
          {/* 6-Character Join Code & Round Archive Quick Control Bar */}
          <div className="p-4 bg-[#111827] border border-[#1E293B] flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <span className="text-[11px] text-slate-400 uppercase tracking-wider block">
                  6-Digit Alphanumeric Player Join Code
                </span>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xl font-mono font-bold tracking-widest text-amber-400 bg-[#0B0F17] border border-[#1E293B] px-3 py-1">
                    {gameState.game.join_code || 'DISABLED'}
                  </span>
                  <div className="text-xs text-slate-300 font-mono">
                    {!gameState.game.join_code ? (
                      <span className="text-red-400">Code Entry Disabled</span>
                    ) : isJoinCodeExpired ? (
                      <span className="text-red-400">
                        EXPIRED ({formatISTDateTime(gameState.game.join_code_expires_at!)})
                      </span>
                    ) : gameState.game.join_code_expires_at ? (
                      <span className="text-emerald-400">
                        Valid until {formatISTDateTime(gameState.game.join_code_expires_at)}
                      </span>
                    ) : (
                      <span className="text-emerald-400">VALID FOR INFINITE TIME</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <input
                type="text"
                maxLength={6}
                placeholder="Custom 6-Char"
                value={customJoinCodeInput}
                onChange={(e) => setCustomJoinCodeInput(e.target.value.toUpperCase())}
                className="w-28 bg-[#0B0F17] border border-[#1E293B] px-2.5 py-1.5 font-mono uppercase text-white focus:outline-none focus:border-amber-500"
              />
              <select
                value={joinCodeDurationMode}
                onChange={(e) => setJoinCodeDurationMode(e.target.value)}
                className="bg-[#0B0F17] border border-[#1E293B] px-2.5 py-1.5 text-white"
              >
                <option value="infinite">Infinite Validity</option>
                <option value="5">Valid for 5 Mins</option>
                <option value="15">Valid for 15 Mins</option>
                <option value="30">Valid for 30 Mins</option>
                <option value="60">Valid for 60 Mins</option>
                <option value="180">Valid for 3 Hours</option>
                <option value="custom">Custom Minutes...</option>
              </select>
              {joinCodeDurationMode === 'custom' && (
                <input
                  type="number"
                  min="1"
                  placeholder="Mins"
                  value={customJoinCodeMinutes}
                  onChange={(e) => setCustomJoinCodeMinutes(e.target.value)}
                  className="w-20 bg-[#0B0F17] border border-[#1E293B] px-2 py-1.5 font-mono text-white"
                />
              )}
              <button
                type="button"
                onClick={() => handleUpdateJoinCode({ regenerate: false })}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold whitespace-nowrap"
              >
                Save Join Code
              </button>
              <button
                type="button"
                onClick={() => handleUpdateJoinCode({ regenerate: true })}
                className="px-2.5 py-1.5 bg-[#0B0F17] border border-[#1E293B] hover:border-slate-500 text-slate-200 flex items-center gap-1 whitespace-nowrap"
              >
                <RefreshCw className="w-3 h-3" />
                Random 6-Char
              </button>
              {gameState.game.join_code && (
                <button
                  type="button"
                  onClick={() => handleUpdateJoinCode({ disable: true })}
                  className="px-2.5 py-1.5 bg-red-950/70 border border-red-800 text-red-300 hover:bg-red-900 whitespace-nowrap"
                >
                  Disable Code
                </button>
              )}
            </div>
          </div>

          {/* Active Market Rules Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3.5 bg-[#111827] border border-[#1E293B]">
              <span className="text-[11px] text-slate-400 block">Starting Capital</span>
              <span className="text-sm font-bold font-mono text-white">
                ₹{formatINR(gameState.game.starting_capital)}
              </span>
            </div>
            <div className="p-3.5 bg-[#111827] border border-[#1E293B]">
              <span className="text-[11px] text-slate-400 block">Tick Speed / Drift</span>
              <span className="text-sm font-bold font-mono text-emerald-400">
                {gameState.game.tick_interval_ms}ms ·{' '}
                {gameState.game.random_drift_bias >= 0 ? '+' : ''}
                {(gameState.game.random_drift_bias * 100).toFixed(2)}%
              </span>
            </div>
            <div className="p-3.5 bg-[#111827] border border-[#1E293B]">
              <span className="text-[11px] text-slate-400 block">Commission Fee</span>
              <span className="text-sm font-bold font-mono text-white">
                {gameState.game.trade_fee_percent}% / trade
              </span>
            </div>
            <div className="p-3.5 bg-[#111827] border border-[#1E293B]">
              <span className="text-[11px] text-slate-400 block">Max Order / Max Conc.</span>
              <span className="text-sm font-bold font-mono text-white">
                {gameState.game.max_order_quantity} sh · {gameState.game.max_position_percent}%
              </span>
            </div>
            <div className="p-3.5 bg-[#111827] border border-[#1E293B]">
              <span className="text-[11px] text-slate-400 block">Circuit Breakers</span>
              <span className="text-sm font-bold font-mono text-amber-400">
                -{gameState.game.circuit_breaker_down_pct}% / +{gameState.game.circuit_breaker_up_pct}%
              </span>
            </div>
            <div className="p-3.5 bg-[#111827] border border-[#1E293B]">
              <span className="text-[11px] text-slate-400 block">Short Selling Rule</span>
              <span className="text-sm font-bold font-mono text-white">
                {gameState.game.allow_short_selling
                  ? `ENABLED (${(gameState.game.short_margin_requirement * 100).toFixed(0)}% Margin)`
                  : 'DISABLED (Long Only)'}
              </span>
            </div>
          </div>

          {/* Master Player Matrix with Instant Balance/Credit Controls */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-white">
                  Master Player Telemetry & Live Balance Override
                </h2>
                <p className="text-xs text-slate-400">
                  Monitor every participant's live cash, equity holdings (including short positions), net worth, and alter balances or credits on the fly.
                </p>
              </div>
            </div>

            <div className="border border-[#1E293B] bg-[#111827] overflow-x-auto">
              <table className="w-full text-left text-xs font-mono tabular-nums">
                <thead className="bg-[#0B0F17] text-slate-400 border-b border-[#1E293B]">
                  <tr>
                    <th className="py-3 px-4 font-sans">Trader</th>
                    <th className="py-3 px-4 text-right">Cash Balance</th>
                    <th className="py-3 px-4 text-right">Portfolio Value</th>
                    <th className="py-3 px-4 text-right">Net Worth</th>
                    <th className="py-3 px-4 text-right">Credits</th>
                    <th className="py-3 px-4 font-sans">Live Equity Holdings</th>
                    <th className="py-3 px-4 text-right font-sans">Sudo-Mode Balance & Credit Controls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B]">
                  {gameState.players.map((p) => (
                    <tr key={p.user_id} className="hover:bg-[#1E293B]/30">
                      <td className="py-3 px-4 font-sans">
                        <div className="font-semibold text-white">{p.username}</div>
                        <div className="text-[11px] text-slate-400">
                          {p.pnlPercent >= 0 ? '+' : ''}
                          {p.pnlPercent}% vs start
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right text-slate-200 font-semibold">
                        ₹{formatINR(p.cash_balance)}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-300">
                        ₹{formatINR(p.portfolioValue)}
                      </td>
                      <td className="py-3 px-4 text-right text-emerald-400 font-bold">
                        ₹{formatINR(p.netWorth)}
                      </td>
                      <td className="py-3 px-4 text-right text-amber-400 font-bold">
                        {p.info_credits} CR
                      </td>
                      <td className="py-3 px-4 font-sans">
                        {p.holdings.length > 0 ? (
                          <div className="flex flex-wrap gap-2 text-[11px] font-mono">
                            {p.holdings.map((h) => (
                              <span
                                key={h.id}
                                className={
                                  h.quantity < 0 ? 'text-red-400 font-semibold' : 'text-slate-200'
                                }
                              >
                                {h.ticker}: {h.quantity}sh
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-500 text-[11px]">100% Cash</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex flex-col items-end gap-2">
                          {/* Row 1: Exact Value Setters for Cash & Credits */}
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <div className="flex items-center">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                placeholder="Exact Cash ₹"
                                value={customPlayerCash[p.user_id] ?? ''}
                                onChange={(e) =>
                                  setCustomPlayerCash({
                                    ...customPlayerCash,
                                    [p.user_id]: e.target.value,
                                  })
                                }
                                className="w-28 bg-[#0B0F17] border border-[#1E293B] px-2 py-1 text-[11px] text-white font-mono focus:outline-none focus:border-emerald-500"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const raw = customPlayerCash[p.user_id];
                                  if (raw !== undefined && raw.trim() !== '') {
                                    const val = Number(raw);
                                    if (!Number.isNaN(val) && val >= 0) {
                                      handleAlterPlayer(p.user_id, { exactCash: val });
                                      setCustomPlayerCash({
                                        ...customPlayerCash,
                                        [p.user_id]: '',
                                      });
                                    }
                                  }
                                }}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold whitespace-nowrap"
                              >
                                Set Cash
                              </button>
                            </div>

                            <div className="flex items-center">
                              <input
                                type="number"
                                min="0"
                                step="1"
                                placeholder="Exact CR"
                                value={customPlayerCredits[p.user_id] ?? ''}
                                onChange={(e) =>
                                  setCustomPlayerCredits({
                                    ...customPlayerCredits,
                                    [p.user_id]: e.target.value,
                                  })
                                }
                                className="w-20 bg-[#0B0F17] border border-[#1E293B] px-2 py-1 text-[11px] text-white font-mono focus:outline-none focus:border-amber-500"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const raw = customPlayerCredits[p.user_id];
                                  if (raw !== undefined && raw.trim() !== '') {
                                    const val = Number(raw);
                                    if (!Number.isNaN(val) && val >= 0) {
                                      handleAlterPlayer(p.user_id, { exactCredits: val });
                                      setCustomPlayerCredits({
                                        ...customPlayerCredits,
                                        [p.user_id]: '',
                                      });
                                    }
                                  }
                                }}
                                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-semibold whitespace-nowrap"
                              >
                                Set CR
                              </button>
                            </div>
                          </div>

                          {/* Row 2: Quick Nudge Buttons */}
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleAlterPlayer(p.user_id, { cashDelta: 100000 })}
                              className="px-2 py-0.5 bg-emerald-950/80 border border-emerald-700/70 text-emerald-300 hover:bg-emerald-900 text-[10px] whitespace-nowrap"
                            >
                              +₹1L
                            </button>
                            <button
                              onClick={() => handleAlterPlayer(p.user_id, { cashDelta: -100000 })}
                              className="px-2 py-0.5 bg-red-950/80 border border-red-700/70 text-red-300 hover:bg-red-900 text-[10px] whitespace-nowrap"
                            >
                              -₹1L
                            </button>
                            <button
                              onClick={() => handleAlterPlayer(p.user_id, { creditsDelta: 5 })}
                              className="px-2 py-0.5 bg-amber-950/80 border border-amber-700/70 text-amber-300 hover:bg-amber-900 text-[10px] whitespace-nowrap"
                            >
                              +5 CR
                            </button>
                            <button
                              onClick={() => handleAlterPlayer(p.user_id, { creditsDelta: -2 })}
                              className="px-2 py-0.5 bg-[#0B0F17] border border-[#1E293B] text-slate-300 hover:border-slate-500 text-[10px] whitespace-nowrap"
                            >
                              -2 CR
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {gameState.players.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 font-sans">
                        No players enrolled yet. Share Join Code{' '}
                        <span className="text-amber-400 font-mono font-bold">
                          {gameState.game.join_code || 'N/A'}
                        </span>{' '}
                        or use the Roster panel below to enroll players manually.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Enroll / Remove Created Users for this Game */}
          <div className="p-5 bg-[#111827] border border-[#1E293B] space-y-3">
            <h3 className="text-sm font-semibold text-white">
              Game Roster Assignment (Add or Remove Players in {gameState.game.name})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {users
                .filter((u) => u.role === 'Player')
                .map((u) => {
                  const enrolled = gameState.players.some((p) => p.user_id === u.id);
                  return (
                    <div
                      key={u.id}
                      className="p-3 bg-[#0B0F17] border border-[#1E293B] flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white truncate">
                          {u.username}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {enrolled ? 'Enrolled in Round' : 'Not in Round'}
                        </div>
                      </div>
                      <button
                        onClick={() => handleEnrollPlayerToggle(u.id, enrolled)}
                        className={`px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                          enrolled
                            ? 'bg-red-950/60 border border-red-800 text-red-300 hover:bg-red-900'
                            : 'bg-emerald-600 text-white hover:bg-emerald-500'
                        }`}
                      >
                        {enrolled ? 'Remove' : '+ Add to Game'}
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* 2. MARKET MANIPULATION & BREAKING NEWS FLASH */}
      {activeSection === 'manipulation' && gameState && (
        <div className="p-6 max-w-[1440px] mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-6">
            <div>
              <h2 className="text-base font-semibold text-white">
                Direct Stock Price Manipulation Matrix
              </h2>
              <p className="text-xs text-slate-400">
                Force any stock's price up or down immediately via percentage shocks or exact price override. Connected player screens update via Socket.io in real time.
              </p>
            </div>

            <div className="border border-[#1E293B] bg-[#111827] divide-y divide-[#1E293B]">
              {gameState.stocks.map((st) => (
                <div
                  key={st.id}
                  className="p-4 flex flex-wrap items-center justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-white">
                        {st.ticker}
                      </span>
                      <span className="text-xs text-slate-300">{st.name}</span>
                    </div>
                    <div className="text-xs font-mono tabular-nums text-slate-400 mt-1">
                      Spot:{' '}
                      <span className="text-emerald-400 font-semibold">
                        ₹{formatINR(st.current_price)}
                      </span>{' '}
                      · Base: ₹{formatINR(st.base_price)} · Vol:{' '}
                      {(st.volatility * 100).toFixed(1)}%
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 font-mono">
                    <button
                      onClick={() => handleManipulateStock(st.id, { deltaPercent: 15 })}
                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                    >
                      +15% Pump
                    </button>
                    <button
                      onClick={() => handleManipulateStock(st.id, { deltaPercent: 5 })}
                      className="px-2.5 py-1.5 bg-emerald-950 border border-emerald-700 text-emerald-300 hover:bg-emerald-900 text-xs"
                    >
                      +5%
                    </button>
                    <button
                      onClick={() => handleManipulateStock(st.id, { deltaPercent: -5 })}
                      className="px-2.5 py-1.5 bg-red-950 border border-red-700 text-red-300 hover:bg-red-900 text-xs"
                    >
                      -5%
                    </button>
                    <button
                      onClick={() => handleManipulateStock(st.id, { deltaPercent: -15 })}
                      className="px-2.5 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
                    >
                      -15% Crash
                    </button>

                    <div className="flex items-center ml-2">
                      <input
                        type="number"
                        placeholder="Exact ₹"
                        value={customPrices[st.id] || ''}
                        onChange={(e) =>
                          setCustomPrices({ ...customPrices, [st.id]: e.target.value })
                        }
                        className="w-24 bg-[#0B0F17] border border-[#1E293B] px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500"
                      />
                      <button
                        onClick={() => {
                          const val = Number(customPrices[st.id]);
                          if (val > 0) {
                            handleManipulateStock(st.id, { exactPrice: val });
                            setCustomPrices({ ...customPrices, [st.id]: '' });
                          }
                        }}
                        className="px-2.5 py-1 bg-[#1E293B] hover:bg-slate-700 text-xs text-white border border-l-0 border-[#1E293B]"
                      >
                        Set
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <form
              onSubmit={handleAddStockToCurrentGame}
              className="p-4 bg-[#111827] border border-[#1E293B] space-y-3"
            >
              <div className="text-xs font-semibold text-white">
                IPO / List Additional Stock in Current Game
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <input
                  type="text"
                  placeholder="Company Name"
                  value={addStockName}
                  onChange={(e) => setAddStockName(e.target.value)}
                  className="sm:col-span-2 bg-[#0B0F17] border border-[#1E293B] px-2.5 py-1.5 text-xs text-white"
                  required
                />
                <input
                  type="text"
                  placeholder="Ticker (e.g. NVDA)"
                  value={addStockTicker}
                  onChange={(e) => setAddStockTicker(e.target.value)}
                  className="bg-[#0B0F17] border border-[#1E293B] px-2.5 py-1.5 text-xs text-white font-mono uppercase"
                  required
                />
                <input
                  type="number"
                  placeholder="Base ₹"
                  value={addStockPrice}
                  onChange={(e) => setAddStockPrice(e.target.value)}
                  className="bg-[#0B0F17] border border-[#1E293B] px-2.5 py-1.5 text-xs text-white font-mono"
                  required
                />
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5"
                >
                  + List IPO
                </button>
              </div>
            </form>
          </div>

          <div className="lg:col-span-5 space-y-4">
            <div className="p-5 bg-[#111827] border border-[#1E293B] space-y-4">
              <div className="flex items-center gap-2 border-b border-[#1E293B] pb-3">
                <Megaphone className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-white">
                  Trigger Live News Event Banner
                </h3>
              </div>

              <form onSubmit={handleBroadcastNews} className="space-y-3 text-xs">
                <div>
                  <label className="text-slate-300 block mb-1">
                    Breaking Headline (Broadcasts to all player screens)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. CENTRAL BANK ANNOUNCES EMERGENCY 75 BPS RATE CUT"
                    value={newsHeadline}
                    onChange={(e) => setNewsHeadline(e.target.value)}
                    className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-slate-300 block mb-1">
                    Market Context / Analyst Note
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Optional details on institutional order flow..."
                    value={newsSummary}
                    onChange={(e) => setNewsSummary(e.target.value)}
                    className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-slate-400 block mb-1">Banner Severity</label>
                    <select
                      value={newsSeverity}
                      onChange={(e) => setNewsSeverity(e.target.value as any)}
                      className="w-full bg-[#0B0F17] border border-[#1E293B] px-2 py-1.5 text-white"
                    >
                      <option value="Bullish">Bullish (Green)</option>
                      <option value="Bearish">Bearish (Red)</option>
                      <option value="Critical">Critical Alert</option>
                      <option value="Info">Neutral Wire</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Target Stock</label>
                    <select
                      value={newsTicker}
                      onChange={(e) => setNewsTicker(e.target.value)}
                      className="w-full bg-[#0B0F17] border border-[#1E293B] px-2 py-1.5 text-white font-mono"
                    >
                      <option value="">None (Banner Only)</option>
                      <option value="ALL">ALL STOCKS</option>
                      {gameState.stocks.map((s) => (
                        <option key={s.id} value={s.ticker}>
                          {s.ticker}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Auto Price Shock %</label>
                    <input
                      type="number"
                      step="1"
                      value={newsDeltaPct}
                      onChange={(e) => setNewsDeltaPct(e.target.value)}
                      className="w-full bg-[#0B0F17] border border-[#1E293B] px-2 py-1.5 text-white font-mono"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold uppercase tracking-wider transition-colors"
                >
                  Broadcast News Event Now
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 3. TASK SCHEDULER & AUTOMATION TIMELINE (IST +5:30) */}
      {activeSection === 'scheduler' && gameState && (
        <div className="p-6 max-w-[1440px] mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5">
            <form
              onSubmit={handleCreateScheduledTask}
              className="p-5 bg-[#111827] border border-[#1E293B] space-y-4 text-xs"
            >
              <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
                <div className="flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-semibold text-white">
                    Schedule Automated Exchange Task (IST +5:30)
                  </h3>
                </div>
                <span className="font-mono text-[11px] text-emerald-400">
                  Now: {currentIstClock}
                </span>
              </div>

              <p className="text-slate-400">
                Schedule market open/close, news announcements, stock price shocks, player cash/credit gifts or penalties, or rule changes at an exact Indian Standard Time (IST).
              </p>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-300 font-medium">
                    Execution Date & Time (IST +5:30)
                  </label>
                  <div className="flex items-center gap-1 text-[10px] font-mono">
                    <button
                      type="button"
                      onClick={() => setSchedTimeIst(getCurrentISTInputString(1))}
                      className="px-1.5 py-0.5 bg-[#0B0F17] border border-[#1E293B] text-slate-300 hover:border-amber-500"
                    >
                      +1m
                    </button>
                    <button
                      type="button"
                      onClick={() => setSchedTimeIst(getCurrentISTInputString(5))}
                      className="px-1.5 py-0.5 bg-[#0B0F17] border border-[#1E293B] text-slate-300 hover:border-amber-500"
                    >
                      +5m
                    </button>
                    <button
                      type="button"
                      onClick={() => setSchedTimeIst(getCurrentISTInputString(15))}
                      className="px-1.5 py-0.5 bg-[#0B0F17] border border-[#1E293B] text-slate-300 hover:border-amber-500"
                    >
                      +15m
                    </button>
                    <button
                      type="button"
                      onClick={() => setSchedTimeIst(getCurrentISTInputString(30))}
                      className="px-1.5 py-0.5 bg-[#0B0F17] border border-[#1E293B] text-slate-300 hover:border-amber-500"
                    >
                      +30m
                    </button>
                    <button
                      type="button"
                      onClick={() => setSchedTimeIst(getCurrentISTInputString(60))}
                      className="px-1.5 py-0.5 bg-[#0B0F17] border border-[#1E293B] text-slate-300 hover:border-amber-500"
                    >
                      +1h
                    </button>
                  </div>
                </div>
                <input
                  type="datetime-local"
                  value={schedTimeIst}
                  onChange={(e) => setSchedTimeIst(e.target.value)}
                  className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Task Action Category
                </label>
                <select
                  value={schedActionType}
                  onChange={(e) => setSchedActionType(e.target.value as ScheduledTaskActionType)}
                  className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white"
                >
                  <option value="SET_STATUS">
                    Open / Pause / Close Market (Change Session Status)
                  </option>
                  <option value="RESET_BASELINE">
                    Reset Circuit Breaker Baseline (base_price = current_price)
                  </option>
                  <option value="BROADCAST_NEWS">
                    Make News Announcement & Auto Stock Price Shock
                  </option>
                  <option value="MANIPULATE_STOCK">
                    Manipulate Stock Price or Volatility
                  </option>
                  <option value="ALTER_PLAYER">
                    Gift / Penalize / Set Player Cash or Info Credits
                  </option>
                  <option value="UPDATE_RULES">
                    Change Live Market Settings & Rules
                  </option>
                </select>
              </div>

              {/* Dynamic Action Configuration Fields */}
              {schedActionType === 'SET_STATUS' && (
                <div className="p-3.5 bg-[#0B0F17] border border-[#1E293B] space-y-3">
                  <div>
                    <label className="text-slate-300 block mb-1">Target Market Status</label>
                    <select
                      value={schedStatusTarget}
                      onChange={(e) => setSchedStatusTarget(e.target.value as any)}
                      className="w-full bg-[#111827] border border-[#1E293B] px-3 py-2 text-white font-semibold"
                    >
                      <option value="Active">Active (Open / Resume Trading Floor)</option>
                      <option value="Paused">Paused (Halt Trading Floor)</option>
                      <option value="Completed">Completed (Close Round Permanently)</option>
                    </select>
                  </div>

                  {schedStatusTarget === 'Active' && (
                    <label className="flex items-center gap-2 pt-1 cursor-pointer text-slate-200">
                      <input
                        type="checkbox"
                        checked={schedStatusResetBaseline}
                        onChange={(e) => setSchedStatusResetBaseline(e.target.checked)}
                      />
                      <span>
                        Also Reset Circuit Breaker Baseline (<code className="text-amber-400">base_price = current_price</code>) when Market Opens
                      </span>
                    </label>
                  )}
                </div>
              )}

              {schedActionType === 'RESET_BASELINE' && (
                <div className="p-3.5 bg-[#0B0F17] border border-[#1E293B] space-y-2">
                  <label className="text-slate-300 block">
                    Target Stock(s) to Reset Baseline (<code className="text-amber-400">base_price = current_price</code>)
                  </label>
                  <select
                    value={schedResetBaselineTicker}
                    onChange={(e) => setSchedResetBaselineTicker(e.target.value)}
                    className="w-full bg-[#111827] border border-[#1E293B] px-3 py-2 text-white font-mono"
                  >
                    <option value="ALL">ALL STOCKS IN ROUND</option>
                    {gameState.stocks.map((s) => (
                      <option key={s.id} value={s.ticker}>
                        {s.ticker} — {s.name} (Base: ₹{formatINR(s.base_price)} → Spot: ₹{formatINR(s.current_price)})
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400">
                    At the scheduled IST time, the reference base price will re-anchor to the live spot price, giving Upper/Lower Circuit Breakers a fresh window.
                  </p>
                </div>
              )}

              {schedActionType === 'BROADCAST_NEWS' && (
                <div className="p-3.5 bg-[#0B0F17] border border-[#1E293B] space-y-3">
                  <div>
                    <label className="text-slate-300 block mb-1">Announcement Headline</label>
                    <input
                      type="text"
                      placeholder="e.g. RBI SURPRISE LIQUIDITY INJECTION"
                      value={schedNewsHeadline}
                      onChange={(e) => setSchedNewsHeadline(e.target.value)}
                      className="w-full bg-[#111827] border border-[#1E293B] px-2.5 py-1.5 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-slate-300 block mb-1">Impact Summary</label>
                    <input
                      type="text"
                      placeholder="Additional context shown on wire..."
                      value={schedNewsSummary}
                      onChange={(e) => setSchedNewsSummary(e.target.value)}
                      className="w-full bg-[#111827] border border-[#1E293B] px-2.5 py-1.5 text-white"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-slate-400 block mb-1">Severity</label>
                      <select
                        value={schedNewsSeverity}
                        onChange={(e) => setSchedNewsSeverity(e.target.value as any)}
                        className="w-full bg-[#111827] border border-[#1E293B] px-2 py-1.5 text-white"
                      >
                        <option value="Bullish">Bullish</option>
                        <option value="Bearish">Bearish</option>
                        <option value="Critical">Critical</option>
                        <option value="Info">Info</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">Affected Stock</label>
                      <select
                        value={schedNewsTicker}
                        onChange={(e) => setSchedNewsTicker(e.target.value)}
                        className="w-full bg-[#111827] border border-[#1E293B] px-2 py-1.5 text-white font-mono"
                      >
                        <option value="">Banner Only</option>
                        <option value="ALL">ALL STOCKS</option>
                        {gameState.stocks.map((s) => (
                          <option key={s.id} value={s.ticker}>
                            {s.ticker}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">Price Shock %</label>
                      <input
                        type="number"
                        step="1"
                        value={schedNewsDelta}
                        onChange={(e) => setSchedNewsDelta(e.target.value)}
                        className="w-full bg-[#111827] border border-[#1E293B] px-2 py-1.5 text-white font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {schedActionType === 'MANIPULATE_STOCK' && (
                <div className="p-3.5 bg-[#0B0F17] border border-[#1E293B] space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-slate-300 block mb-1">Stock Ticker</label>
                      <select
                        value={schedStockTicker || (gameState.stocks[0]?.ticker ?? '')}
                        onChange={(e) => setSchedStockTicker(e.target.value)}
                        className="w-full bg-[#111827] border border-[#1E293B] px-2.5 py-1.5 text-white font-mono"
                      >
                        {gameState.stocks.map((s) => (
                          <option key={s.id} value={s.ticker}>
                            {s.ticker} (₹{formatINR(s.current_price)})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-slate-300 block mb-1">Price Action Mode</label>
                      <select
                        value={schedStockMode}
                        onChange={(e) => setSchedStockMode(e.target.value as any)}
                        className="w-full bg-[#111827] border border-[#1E293B] px-2.5 py-1.5 text-white"
                      >
                        <option value="delta">Percentage Shock (+/- %)</option>
                        <option value="exact">Set Exact Price (₹)</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-slate-300 block mb-1">
                        {schedStockMode === 'exact' ? 'New Exact Price (₹)' : 'Delta % (e.g. 20 or -15)'}
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={schedStockVal}
                        onChange={(e) => setSchedStockVal(e.target.value)}
                        className="w-full bg-[#111827] border border-[#1E293B] px-2.5 py-1.5 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-slate-300 block mb-1">
                        Optional New Volatility (e.g. 0.04)
                      </label>
                      <input
                        type="number"
                        step="0.005"
                        placeholder="Leave blank to keep"
                        value={schedStockVol}
                        onChange={(e) => setSchedStockVol(e.target.value)}
                        className="w-full bg-[#111827] border border-[#1E293B] px-2.5 py-1.5 text-white font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {schedActionType === 'ALTER_PLAYER' && (
                <div className="p-3.5 bg-[#0B0F17] border border-[#1E293B] space-y-3">
                  <div>
                    <label className="text-slate-300 block mb-1">Target Player(s)</label>
                    <select
                      value={schedPlayerTarget}
                      onChange={(e) => setSchedPlayerTarget(e.target.value)}
                      className="w-full bg-[#111827] border border-[#1E293B] px-2.5 py-1.5 text-white"
                    >
                      <option value="ALL">ALL ENROLLED PLAYERS IN ROUND</option>
                      {gameState.players.map((p) => (
                        <option key={p.user_id} value={p.user_id}>
                          {p.username} (Cash: ₹{formatINR(p.cash_balance)} · {p.info_credits} CR)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-slate-300 block mb-1">Cash Action</label>
                      <select
                        value={schedPlayerCashMode}
                        onChange={(e) => setSchedPlayerCashMode(e.target.value as any)}
                        className="w-full bg-[#111827] border border-[#1E293B] px-2 py-1.5 text-white"
                      >
                        <option value="delta">Add / Subtract Cash (+/- ₹)</option>
                        <option value="exact">Set Exact Cash Balance (₹)</option>
                        <option value="none">No Cash Change</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-slate-300 block mb-1">Cash Amount (₹)</label>
                      <input
                        type="number"
                        step="any"
                        disabled={schedPlayerCashMode === 'none'}
                        value={schedPlayerCashVal}
                        onChange={(e) => setSchedPlayerCashVal(e.target.value)}
                        className="w-full bg-[#111827] border border-[#1E293B] px-2 py-1.5 text-white font-mono disabled:opacity-40"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-slate-300 block mb-1">Info Credits Action</label>
                      <select
                        value={schedPlayerCreditsMode}
                        onChange={(e) => setSchedPlayerCreditsMode(e.target.value as any)}
                        className="w-full bg-[#111827] border border-[#1E293B] px-2 py-1.5 text-white"
                      >
                        <option value="none">No Credits Change</option>
                        <option value="delta">Add / Subtract Credits (+/- CR)</option>
                        <option value="exact">Set Exact Credits (CR)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-slate-300 block mb-1">Credits Value (CR)</label>
                      <input
                        type="number"
                        step="1"
                        disabled={schedPlayerCreditsMode === 'none'}
                        value={schedPlayerCreditsVal}
                        onChange={(e) => setSchedPlayerCreditsVal(e.target.value)}
                        className="w-full bg-[#111827] border border-[#1E293B] px-2 py-1.5 text-white font-mono disabled:opacity-40"
                      />
                    </div>
                  </div>
                </div>
              )}

              {schedActionType === 'UPDATE_RULES' && (
                <div className="p-3.5 bg-[#0B0F17] border border-[#1E293B] space-y-2.5">
                  <p className="text-[11px] text-slate-400">
                    Fill only the rules you want to change at the scheduled IST time; leave others blank.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-slate-300 block mb-1">New Tick Speed (ms)</label>
                      <input
                        type="number"
                        placeholder={`Current: ${gameState.game.tick_interval_ms}`}
                        value={schedRuleTickMs}
                        onChange={(e) => setSchedRuleTickMs(e.target.value)}
                        className="w-full bg-[#111827] border border-[#1E293B] px-2 py-1.5 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-slate-300 block mb-1">New Trade Fee (%)</label>
                      <input
                        type="number"
                        step="0.05"
                        placeholder={`Current: ${gameState.game.trade_fee_percent}`}
                        value={schedRuleFeePct}
                        onChange={(e) => setSchedRuleFeePct(e.target.value)}
                        className="w-full bg-[#111827] border border-[#1E293B] px-2 py-1.5 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-slate-300 block mb-1">New Drift Bias</label>
                      <input
                        type="number"
                        step="0.0005"
                        placeholder={`Current: ${gameState.game.random_drift_bias}`}
                        value={schedRuleDriftBias}
                        onChange={(e) => setSchedRuleDriftBias(e.target.value)}
                        className="w-full bg-[#111827] border border-[#1E293B] px-2 py-1.5 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-slate-300 block mb-1">Short Selling</label>
                      <select
                        value={schedRuleAllowShort}
                        onChange={(e) => setSchedRuleAllowShort(e.target.value as any)}
                        className="w-full bg-[#111827] border border-[#1E293B] px-2 py-1.5 text-white"
                      >
                        <option value="keep">Keep Current Setting</option>
                        <option value="true">Enable Short Selling</option>
                        <option value="false">Disable Short Selling</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold uppercase tracking-wider"
              >
                + Queue Scheduled Task (IST)
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">
                Scheduled Automation Queue for {gameState.game.name}
              </h3>
              <span className="text-xs font-mono text-slate-400">
                Evaluated every 500ms against IST (+05:30)
              </span>
            </div>

            <div className="border border-[#1E293B] bg-[#111827] overflow-x-auto">
              <table className="w-full text-left text-xs font-mono tabular-nums">
                <thead className="bg-[#0B0F17] text-slate-400 border-b border-[#1E293B]">
                  <tr>
                    <th className="py-3 px-4">Scheduled Time (IST)</th>
                    <th className="py-3 px-4 font-sans">Action</th>
                    <th className="py-3 px-4 font-sans">Details / Payload</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B]">
                  {(gameState.scheduledTasks || []).map((t) => (
                    <tr key={t.id} className="hover:bg-[#1E293B]/30">
                      <td className="py-3 px-4 text-white font-semibold whitespace-nowrap">
                        {formatISTDateTime(t.execute_at)}
                      </td>
                      <td className="py-3 px-4 text-amber-400 font-semibold whitespace-nowrap">
                        {t.action_type}
                      </td>
                      <td className="py-3 px-4 font-sans text-slate-300">
                        {t.action_type === 'SET_STATUS' && (
                          <span>
                            Set Market Status → {t.payload?.status}
                            {t.payload?.resetBaseline ? ' (+ Reset Baseline)' : ''}
                          </span>
                        )}
                        {t.action_type === 'RESET_BASELINE' && (
                          <span>
                            Reset Circuit Breaker Baseline ({t.payload?.ticker || 'ALL STOCKS'})
                          </span>
                        )}
                        {t.action_type === 'BROADCAST_NEWS' && (
                          <span>
                            "{t.payload?.headline}" ({t.payload?.severity}
                            {t.payload?.affected_ticker
                              ? ` · ${t.payload.affected_ticker} ${t.payload.price_delta_percent}%`
                              : ''}
                            )
                          </span>
                        )}
                        {t.action_type === 'MANIPULATE_STOCK' && (
                          <span>
                            {t.payload?.ticker}:{' '}
                            {t.payload?.exactPrice
                              ? `Set ₹${t.payload.exactPrice}`
                              : `${t.payload?.deltaPercent > 0 ? '+' : ''}${t.payload?.deltaPercent}%`}
                          </span>
                        )}
                        {t.action_type === 'ALTER_PLAYER' && (
                          <span>
                            Target: {t.payload?.userId === 'ALL' ? 'ALL PLAYERS' : `User #${t.payload?.userId}`}{' '}
                            {t.payload?.cashDelta !== undefined && `Cash Delta: ₹${t.payload.cashDelta} `}
                            {t.payload?.exactCash !== undefined && `Set Cash: ₹${t.payload.exactCash} `}
                            {t.payload?.creditsDelta !== undefined && `CR Delta: ${t.payload.creditsDelta} `}
                            {t.payload?.exactCredits !== undefined && `Set CR: ${t.payload.exactCredits}`}
                          </span>
                        )}
                        {t.action_type === 'UPDATE_RULES' && (
                          <span>{JSON.stringify(t.payload)}</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-semibold ${
                            t.status === 'Pending'
                              ? 'text-amber-400'
                              : t.status === 'Executed'
                              ? 'text-emerald-400'
                              : 'text-red-400'
                          }`}
                        >
                          {t.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleDeleteScheduledTask(t.id)}
                          className="text-slate-400 hover:text-red-400 p-1"
                          title="Delete or cancel scheduled task"
                        >
                          <Trash2 className="w-3.5 h-3.5 inline" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(!gameState.scheduledTasks || gameState.scheduledTasks.length === 0) && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500 font-sans">
                        No scheduled tasks queued for this round yet. Use the form on the left to automate market open/close, announcements, gifts, or price shocks in IST.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. LIVE MARKET RULES EDITOR FOR CURRENT ACTIVE GAME */}
      {activeSection === 'rules' && gameState && (
        <div className="p-6 max-w-5xl mx-auto w-full space-y-6">
          <div className="flex items-center justify-between border-b border-[#1E293B] pb-4">
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-400" />
                Live Market Rules Override ({gameState.game.name})
              </h2>
              <p className="text-xs text-slate-400">
                Modify any exchange rule for the currently selected round in real time. All changes persist in SQLite and take effect immediately on the next tick or order.
              </p>
            </div>
          </div>

          <form
            onSubmit={handleSaveActiveGameRules}
            className="p-6 bg-[#111827] border border-[#1E293B] space-y-6 text-xs"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Starting Capital Benchmark (₹)
                </label>
                <input
                  type="number"
                  value={editStartCap}
                  onChange={(e) => setEditStartCap(e.target.value)}
                  className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Default Info Credits (CR)
                </label>
                <input
                  type="number"
                  value={editInitCreds}
                  onChange={(e) => setEditInitCreds(e.target.value)}
                  className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Market Tick Interval (ms)
                </label>
                <input
                  type="number"
                  min="500"
                  step="250"
                  value={editTickMs}
                  onChange={(e) => setEditTickMs(e.target.value)}
                  className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Order Demand Impact Factor
                </label>
                <input
                  type="number"
                  step="0.0002"
                  value={editDemandFactor}
                  onChange={(e) => setEditDemandFactor(e.target.value)}
                  className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Background Drift Bias (e.g. 0.001 Bull / -0.001 Bear)
                </label>
                <input
                  type="number"
                  step="0.0005"
                  value={editDriftBias}
                  onChange={(e) => setEditDriftBias(e.target.value)}
                  className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Random Noise Intensity Multiplier
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={editNoiseMult}
                  onChange={(e) => setEditNoiseMult(e.target.value)}
                  className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Exchange Commission / Fee (%)
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={editFeePct}
                  onChange={(e) => setEditFeePct(e.target.value)}
                  className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Max Order Quantity per Ticket (Shares)
                </label>
                <input
                  type="number"
                  value={editMaxOrderQty}
                  onChange={(e) => setEditMaxOrderQty(e.target.value)}
                  className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Max Position Concentration (% of Net Worth)
                </label>
                <input
                  type="number"
                  min="5"
                  max="100"
                  value={editMaxPosPct}
                  onChange={(e) => setEditMaxPosPct(e.target.value)}
                  className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Lower Circuit Breaker (% Drop from Base)
                </label>
                <input
                  type="number"
                  min="5"
                  max="95"
                  value={editCbDown}
                  onChange={(e) => setEditCbDown(e.target.value)}
                  className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Upper Circuit Breaker (% Gain from Base)
                </label>
                <input
                  type="number"
                  min="10"
                  value={editCbUp}
                  onChange={(e) => setEditCbUp(e.target.value)}
                  className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Baseline Reset Window (Mins, 0 = Never)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={editCbResetMins}
                    onChange={(e) => setEditCbResetMins(e.target.value)}
                    className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleResetBaselineNow}
                    className="px-2.5 py-2 bg-[#0B0F17] border border-amber-500/70 hover:border-amber-400 text-amber-300 whitespace-nowrap font-semibold"
                    title="Immediately re-anchor every stock's base_price to its current_price"
                  >
                    Reset Baseline Now
                  </button>
                </div>
              </div>
              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Short Margin Collateral Ratio (0.5 = 50%)
                </label>
                <input
                  type="number"
                  step="0.05"
                  min="0.1"
                  value={editShortMargin}
                  onChange={(e) => setEditShortMargin(e.target.value)}
                  className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#1E293B]">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editAllowShort}
                  onChange={(e) => setEditAllowShort(e.target.checked)}
                />
                <span className="text-slate-200 font-medium">
                  Allow Players to Short Sell Stocks (Negative Share Holdings with Margin Enforcement)
                </span>
              </label>

              <button
                type="submit"
                className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold uppercase tracking-wider"
              >
                Save & Apply Rules Live
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 5. USER MANAGEMENT (CREATE, RESET PASSWORD, BAN/UNBAN, REMOVE) */}
      {activeSection === 'users' && (
        <div className="p-6 max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-4">
            <form
              onSubmit={handleCreateUser}
              className="p-5 bg-[#111827] border border-[#1E293B] space-y-4 text-xs"
            >
              <div className="flex items-center gap-2 border-b border-[#1E293B] pb-3">
                <UserPlus className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">
                  Provision User Account
                </h3>
              </div>
              <p className="text-slate-400">
                Self-registration is disabled. Only the Exchange Admin can issue credentials to Players.
              </p>

              <div>
                <label className="text-slate-300 block mb-1">Username</label>
                <input
                  type="text"
                  placeholder="e.g. rohan_desk"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1">Initial Password</label>
                <input
                  type="text"
                  placeholder="Enter password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1">System Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as any)}
                  className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white"
                >
                  <option value="Player">Player (Trading Terminal)</option>
                  <option value="Admin">Admin (Sudo Mode)</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              >
                Create Account
              </button>
            </form>

            <div className="p-5 bg-[#111827] border border-[#1E293B] space-y-3 text-xs">
              <div className="text-sm font-semibold text-white">
                Database Persistence & Snapshot
              </div>
              <p className="text-slate-400">
                All data is automatically saved on disk to <code className="text-amber-400">simulation.sqlite</code> on every trade and tick. You can also download a JSON snapshot at any time.
              </p>
              <button
                type="button"
                onClick={handleExportBackup}
                className="w-full py-2 bg-[#0B0F17] border border-amber-600/70 hover:border-amber-400 text-amber-300 font-semibold transition-colors"
              >
                Download Full DB Snapshot (.json)
              </button>
            </div>
          </div>

          <div className="lg:col-span-8">
            <div className="border border-[#1E293B] bg-[#111827]">
              <table className="w-full text-left text-xs font-mono tabular-nums">
                <thead className="bg-[#0B0F17] text-slate-400 border-b border-[#1E293B]">
                  <tr>
                    <th className="py-3 px-4">ID</th>
                    <th className="py-3 px-4">Username</th>
                    <th className="py-3 px-4 font-sans">Role</th>
                    <th className="py-3 px-4 font-sans">Account Status</th>
                    <th className="py-3 px-4 text-right font-sans">Security Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B]">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-[#1E293B]/30">
                      <td className="py-3 px-4 text-slate-400">#{u.id}</td>
                      <td className="py-3 px-4 text-white font-semibold">{u.username}</td>
                      <td className="py-3 px-4 font-sans text-slate-300">{u.role}</td>
                      <td className="py-3 px-4 font-sans">
                        {u.is_banned ? (
                          <span className="text-red-400 font-semibold">BANNED // SUSPENDED</span>
                        ) : (
                          <span className="text-emerald-400">ACTIVE</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-sans">
                        <div className="flex items-center justify-end gap-2">
                          {resetTargetId === u.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                placeholder="New password"
                                value={resetPasswordVal}
                                onChange={(e) => setResetPasswordVal(e.target.value)}
                                className="bg-[#0B0F17] border border-[#1E293B] px-2 py-1 text-xs text-white font-mono w-28"
                              />
                              <button
                                onClick={() => handleResetPassword(u.id)}
                                className="px-2 py-1 bg-emerald-600 text-white text-xs"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setResetTargetId(null)}
                                className="px-2 py-1 bg-[#0B0F17] text-slate-400 text-xs"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setResetTargetId(u.id);
                                setResetPasswordVal('');
                              }}
                              className="px-2.5 py-1 bg-[#0B0F17] border border-[#1E293B] text-slate-300 hover:border-slate-500 text-xs flex items-center gap-1 whitespace-nowrap"
                            >
                              <KeyRound className="w-3 h-3" />
                              Reset Password
                            </button>
                          )}

                          {u.role !== 'Admin' && (
                            <>
                              <button
                                onClick={() => handleToggleBan(u.id)}
                                className={`px-2.5 py-1 text-xs font-medium flex items-center gap-1 whitespace-nowrap ${
                                  u.is_banned
                                    ? 'bg-emerald-950/70 border border-emerald-700 text-emerald-300'
                                    : 'bg-amber-950/70 border border-amber-700 text-amber-300'
                                }`}
                              >
                                {u.is_banned ? (
                                  <>
                                    <CheckCircle2 className="w-3 h-3" />
                                    Unban
                                  </>
                                ) : (
                                  <>
                                    <Ban className="w-3 h-3" />
                                    Ban
                                  </>
                                )}
                              </button>

                              <button
                                onClick={() => handleDeleteUser(u.id, u.username)}
                                className="px-2.5 py-1 bg-red-950/80 border border-red-700 hover:bg-red-900 text-red-200 text-xs font-medium flex items-center gap-1 whitespace-nowrap"
                                title="Permanently delete user and their holdings"
                              >
                                <Trash2 className="w-3 h-3" />
                                Remove
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 6. GAME / LOBBY CREATOR & ROUND ARCHIVE MANAGER */}
      {activeSection === 'games' && (
        <div className="p-6 max-w-[1440px] mx-auto w-full space-y-6">
          {/* Existing Rounds Archive Manager (Export / Delete / Import) */}
          <div className="p-5 bg-[#111827] border border-[#1E293B] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1E293B] pb-3">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Round Archive & Database Lifecycle Manager
                </h3>
                <p className="text-xs text-slate-400">
                  Export any single round's complete data (stocks, price history, player portfolios, trades, news, hints) as a portable JSON file, delete completed rounds to keep SQLite clean, or re-import an exported round anytime for analysis.
                </p>
              </div>
              <button
                type="button"
                onClick={() => importFileInputRef.current?.click()}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Import Exported Round Archive (.json)
              </button>
            </div>

            <div className="border border-[#1E293B] bg-[#0B0F17] overflow-x-auto">
              <table className="w-full text-left text-xs font-mono tabular-nums">
                <thead className="border-b border-[#1E293B] text-slate-400">
                  <tr>
                    <th className="py-2.5 px-4">ID</th>
                    <th className="py-2.5 px-4 font-sans">Round Name</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Join Code</th>
                    <th className="py-2.5 px-4">Created (IST)</th>
                    <th className="py-2.5 px-4 text-right font-sans">Archive & Cleanup Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B]">
                  {games.map((g) => (
                    <tr key={g.id} className="hover:bg-[#111827]">
                      <td className="py-2.5 px-4 text-slate-400">#{g.id}</td>
                      <td className="py-2.5 px-4 font-sans font-semibold text-white">
                        {g.name}
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className={
                            g.status === 'Active' ? 'text-emerald-400' : 'text-amber-400'
                          }
                        >
                          {g.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-amber-400 font-bold">
                        {g.join_code || 'NONE'}
                      </td>
                      <td className="py-2.5 px-4 text-slate-400">
                        {formatISTDateTime(g.created_at)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-sans">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await authFetch(`/api/admin/games/${g.id}/export`);
                              if (res.ok) {
                                const blob = await res.blob();
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `round_${g.id}_${g.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
                                document.body.appendChild(a);
                                a.click();
                                a.remove();
                                window.URL.revokeObjectURL(url);
                                notify('ok', `Exported Round #${g.id}`);
                              }
                            }}
                            className="px-2.5 py-1 bg-[#111827] border border-emerald-700 text-emerald-300 hover:bg-emerald-950 text-xs flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" />
                            Export JSON
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await authFetch(`/api/admin/games/${g.id}`, {
                                method: 'DELETE',
                              });
                              if (res.ok) {
                                notify('ok', `Deleted Round #${g.id} (${g.name}) from database`);
                                onRefreshAll();
                              }
                            }}
                            className="px-2.5 py-1 bg-red-950/80 border border-red-800 text-red-200 hover:bg-red-900 text-xs flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete from DB
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1E293B] pb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Create New Simulation Game & Explicitly Define All Market Rules
              </h2>
              <p className="text-xs text-slate-400">
                Zero hardcoded rules: explicitly configure capital, credits, 6-digit join code, price tick dynamics, transaction fees, position limits, circuit breakers, short-selling margin, starting stocks, and pre-seeded intel dossiers.
              </p>
            </div>

            {/* Quick Rule Presets */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-slate-400 mr-1">Quick Rule Templates:</span>
              <button
                type="button"
                onClick={() => applyRulePreset('institutional')}
                className="px-2.5 py-1 bg-[#111827] border border-[#1E293B] hover:border-amber-500 text-slate-200"
              >
                Standard Institutional
              </button>
              <button
                type="button"
                onClick={() => applyRulePreset('hft_bull')}
                className="px-2.5 py-1 bg-[#111827] border border-[#1E293B] hover:border-emerald-500 text-emerald-300"
              >
                High-Frequency Bull
              </button>
              <button
                type="button"
                onClick={() => applyRulePreset('crash_stress')}
                className="px-2.5 py-1 bg-[#111827] border border-[#1E293B] hover:border-red-500 text-red-300"
              >
                Bear Stress Test
              </button>
              <button
                type="button"
                onClick={() => applyRulePreset('unrestricted')}
                className="px-2.5 py-1 bg-[#111827] border border-[#1E293B] hover:border-amber-500 text-amber-300"
              >
                Unrestricted Whale Mode
              </button>
            </div>
          </div>

          <form
            onSubmit={handleCreateNewGame}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-xs"
          >
            {/* LEFT 5 COLS: Explicit Market Rule Architecture */}
            <div className="lg:col-span-5 space-y-5">
              {/* Section A: Capital, Join Code & Session Identity */}
              <div className="p-5 bg-[#111827] border border-[#1E293B] space-y-3.5">
                <h3 className="text-sm font-semibold text-white border-b border-[#1E293B] pb-2">
                  1. Session Identity, Allocations & 6-Char Join Code
                </h3>

                <div>
                  <label className="text-slate-300 block mb-1">Round / Lobby Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Round 2 — High Volatility Finals"
                    value={gameName}
                    onChange={(e) => setGameName(e.target.value)}
                    className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-300 block mb-1">
                      Starting Capital (₹)
                    </label>
                    <input
                      type="number"
                      value={startCap}
                      onChange={(e) => setStartCap(e.target.value)}
                      className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-slate-300 block mb-1">
                      Initial Info Credits (CR)
                    </label>
                    <input
                      type="number"
                      value={initCreds}
                      onChange={(e) => setInitCreds(e.target.value)}
                      className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white font-mono"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-slate-300 block mb-1">
                      6-Char Join Code (Auto if blank)
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="e.g. IITB99"
                      value={newGameJoinCode}
                      onChange={(e) => setNewGameJoinCode(e.target.value.toUpperCase())}
                      className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-amber-400 font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="text-slate-300 block mb-1">
                      Join Code Validity Duration
                    </label>
                    <select
                      value={newGameCodeDuration}
                      onChange={(e) => setNewGameCodeDuration(e.target.value)}
                      className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white"
                    >
                      <option value="infinite">Infinite Time</option>
                      <option value="10">10 Minutes</option>
                      <option value="30">30 Minutes</option>
                      <option value="60">60 Minutes</option>
                      <option value="180">3 Hours</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section B: Price Engine & Microstructure Mechanics */}
              <div className="p-5 bg-[#111827] border border-[#1E293B] space-y-3.5">
                <h3 className="text-sm font-semibold text-white border-b border-[#1E293B] pb-2">
                  2. Price Engine & Microstructure Rules
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-300 block mb-1">
                      Tick Frequency (ms)
                    </label>
                    <input
                      type="number"
                      min="500"
                      step="250"
                      value={tickMs}
                      onChange={(e) => setTickMs(e.target.value)}
                      className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white font-mono"
                    />
                    <span className="text-[11px] text-slate-500">Min 500ms (0.5s)</span>
                  </div>
                  <div>
                    <label className="text-slate-300 block mb-1">
                      Order Demand Impact
                    </label>
                    <input
                      type="number"
                      step="0.0002"
                      value={demandFactor}
                      onChange={(e) => setDemandFactor(e.target.value)}
                      className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white font-mono"
                    />
                    <span className="text-[11px] text-slate-500">Price slip per trade</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-300 block mb-1">
                      Market Drift Bias / Tick
                    </label>
                    <input
                      type="number"
                      step="0.0005"
                      value={driftBias}
                      onChange={(e) => setDriftBias(e.target.value)}
                      className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white font-mono"
                    />
                    <span className="text-[11px] text-slate-500">+Bullish / -Bearish</span>
                  </div>
                  <div>
                    <label className="text-slate-300 block mb-1">
                      Noise Volatility Scale
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      value={noiseMult}
                      onChange={(e) => setNoiseMult(e.target.value)}
                      className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white font-mono"
                    />
                    <span className="text-[11px] text-slate-500">0 = No random noise</span>
                  </div>
                </div>
              </div>

              {/* Section C: Risk Limits, Fees, Circuit Breakers & Short Selling */}
              <div className="p-5 bg-[#111827] border border-[#1E293B] space-y-3.5">
                <h3 className="text-sm font-semibold text-white border-b border-[#1E293B] pb-2">
                  3. Exchange Fees, Risk Limits & Circuit Breakers
                </h3>

                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="text-slate-300 block mb-1">Trade Fee (%)</label>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      value={feePct}
                      onChange={(e) => setFeePct(e.target.value)}
                      className="w-full bg-[#0B0F17] border border-[#1E293B] px-2.5 py-2 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-slate-300 block mb-1">Max Lot (Shares)</label>
                    <input
                      type="number"
                      min="1"
                      value={maxOrderQty}
                      onChange={(e) => setMaxOrderQty(e.target.value)}
                      className="w-full bg-[#0B0F17] border border-[#1E293B] px-2.5 py-2 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-slate-300 block mb-1">Max Conc. (%)</label>
                    <input
                      type="number"
                      min="5"
                      max="100"
                      value={maxPosPct}
                      onChange={(e) => setMaxPosPct(e.target.value)}
                      className="w-full bg-[#0B0F17] border border-[#1E293B] px-2.5 py-2 text-white font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div>
                    <label className="text-slate-300 block mb-1">Lower Limit (-%)</label>
                    <input
                      type="number"
                      min="5"
                      max="95"
                      value={cbDown}
                      onChange={(e) => setCbDown(e.target.value)}
                      className="w-full bg-[#0B0F17] border border-[#1E293B] px-2.5 py-2 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-slate-300 block mb-1">Upper Limit (+%)</label>
                    <input
                      type="number"
                      min="10"
                      value={cbUp}
                      onChange={(e) => setCbUp(e.target.value)}
                      className="w-full bg-[#0B0F17] border border-[#1E293B] px-2.5 py-2 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-slate-300 block mb-1">Reset Window (m)</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0 = Never"
                      value={cbResetMins}
                      onChange={(e) => setCbResetMins(e.target.value)}
                      className="w-full bg-[#0B0F17] border border-[#1E293B] px-2.5 py-2 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-slate-300 block mb-1">Short Margin</label>
                    <input
                      type="number"
                      step="0.05"
                      min="0.1"
                      value={shortMargin}
                      onChange={(e) => setShortMargin(e.target.value)}
                      className="w-full bg-[#0B0F17] border border-[#1E293B] px-2.5 py-2 text-white font-mono"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowShort}
                    onChange={(e) => setAllowShort(e.target.checked)}
                  />
                  <span className="text-slate-200">
                    Enable Short Selling (Players can sell unowned shares using Net Worth margin)
                  </span>
                </label>
              </div>

              {/* Section D: Initial Player Roster */}
              <div className="p-5 bg-[#111827] border border-[#1E293B] space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">
                    4. Enroll Players into Round
                  </h3>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedNewGamePlayers(
                        users.filter((u) => u.role === 'Player').map((u) => u.id)
                      )
                    }
                    className="text-[11px] text-emerald-400 hover:underline"
                  >
                    Select All Players
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto p-2 bg-[#0B0F17] border border-[#1E293B]">
                  {users
                    .filter((u) => u.role === 'Player')
                    .map((u) => {
                      const checked = selectedNewGamePlayers.includes(u.id);
                      return (
                        <label
                          key={u.id}
                          className="flex items-center gap-2 text-slate-200 cursor-pointer py-1"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              if (checked) {
                                setSelectedNewGamePlayers(
                                  selectedNewGamePlayers.filter((id) => id !== u.id)
                                );
                              } else {
                                setSelectedNewGamePlayers([
                                  ...selectedNewGamePlayers,
                                  u.id,
                                ]);
                              }
                            }}
                          />
                          <span className="font-mono truncate">{u.username}</span>
                        </label>
                      );
                    })}
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold uppercase tracking-wider"
                >
                  Launch Custom Simulation Game
                </button>
              </div>
            </div>

            {/* RIGHT 7 COLS: Starting Stocks & Pre-Seeded Intelligence Dossiers */}
            <div className="lg:col-span-7 space-y-6">
              {/* Starting Stocks Builder */}
              <div className="p-5 bg-[#111827] border border-[#1E293B] space-y-4">
                <h3 className="text-sm font-semibold text-white">
                  5. Starting Equities & Individual Volatility Factors ({draftStocks.length})
                </h3>

                <div className="grid grid-cols-12 gap-2">
                  <input
                    type="text"
                    placeholder="Company Name"
                    value={draftStockName}
                    onChange={(e) => setDraftStockName(e.target.value)}
                    className="col-span-3 bg-[#0B0F17] border border-[#1E293B] px-2.5 py-1.5 text-white"
                  />
                  <input
                    type="text"
                    placeholder="Ticker"
                    value={draftStockTicker}
                    onChange={(e) => setDraftStockTicker(e.target.value)}
                    className="col-span-2 bg-[#0B0F17] border border-[#1E293B] px-2.5 py-1.5 text-white font-mono uppercase"
                  />
                  <input
                    type="text"
                    placeholder="Sector"
                    value={draftStockSector}
                    onChange={(e) => setDraftStockSector(e.target.value)}
                    className="col-span-2 bg-[#0B0F17] border border-[#1E293B] px-2.5 py-1.5 text-white"
                  />
                  <input
                    type="number"
                    placeholder="Base ₹"
                    value={draftStockPrice}
                    onChange={(e) => setDraftStockPrice(e.target.value)}
                    className="col-span-2 bg-[#0B0F17] border border-[#1E293B] px-2.5 py-1.5 text-white font-mono"
                  />
                  <input
                    type="number"
                    step="0.005"
                    placeholder="Vol (0.02)"
                    value={draftStockVol}
                    onChange={(e) => setDraftStockVol(e.target.value)}
                    className="col-span-1 bg-[#0B0F17] border border-[#1E293B] px-2 py-1.5 text-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!draftStockName.trim() || !draftStockTicker.trim()) return;
                      const cleanT = draftStockTicker.trim().toUpperCase();
                      setDraftStocks([
                        ...draftStocks,
                        {
                          name: draftStockName.trim(),
                          ticker: cleanT,
                          sector: draftStockSector.trim() || 'Equities',
                          base_price: Number(draftStockPrice) || 1000,
                          volatility: Number(draftStockVol) || 0.02,
                        },
                      ]);
                      setDraftHintTicker(cleanT);
                      setDraftStockName('');
                      setDraftStockTicker('');
                    }}
                    className="col-span-2 bg-amber-500 text-slate-950 font-semibold px-2 py-1.5"
                  >
                    + Add Stock
                  </button>
                </div>

                <div className="border border-[#1E293B] bg-[#0B0F17]">
                  <table className="w-full text-left text-xs font-mono tabular-nums">
                    <thead className="border-b border-[#1E293B] text-slate-400">
                      <tr>
                        <th className="py-2 px-3">Ticker</th>
                        <th className="py-2 px-3 font-sans">Company</th>
                        <th className="py-2 px-3 font-sans">Sector</th>
                        <th className="py-2 px-3 text-right">Base Price</th>
                        <th className="py-2 px-3 text-right">Volatility</th>
                        <th className="py-2 px-3 text-right">Remove</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E293B]">
                      {draftStocks.map((ds, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3 text-white font-semibold">{ds.ticker}</td>
                          <td className="py-2 px-3 font-sans text-slate-300">{ds.name}</td>
                          <td className="py-2 px-3 font-sans text-slate-400">{ds.sector}</td>
                          <td className="py-2 px-3 text-right text-slate-200">
                            ₹{formatINR(ds.base_price)}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-300">
                            {(ds.volatility * 100).toFixed(1)}%
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                setDraftStocks(draftStocks.filter((_, i) => i !== idx))
                              }
                              className="text-red-400 hover:text-red-300"
                            >
                              <Trash2 className="w-3.5 h-3.5 inline" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pre-Seeded Information Store Hints Builder */}
              <div className="p-5 bg-[#111827] border border-[#1E293B] space-y-4">
                <h3 className="text-sm font-semibold text-white">
                  6. Pre-Configure Information Store Hints & Risk Dossiers ({draftHints.length})
                </h3>

                <div className="grid grid-cols-12 gap-2">
                  <select
                    value={draftHintTicker}
                    onChange={(e) => setDraftHintTicker(e.target.value)}
                    className="col-span-2 bg-[#0B0F17] border border-[#1E293B] px-2 py-1.5 text-white font-mono"
                  >
                    {draftStocks.map((s, i) => (
                      <option key={i} value={s.ticker}>
                        {s.ticker}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Dossier Title"
                    value={draftHintTitle}
                    onChange={(e) => setDraftHintTitle(e.target.value)}
                    className="col-span-4 bg-[#0B0F17] border border-[#1E293B] px-2.5 py-1.5 text-white"
                  />
                  <select
                    value={draftHintCategory}
                    onChange={(e) => setDraftHintCategory(e.target.value)}
                    className="col-span-3 bg-[#0B0F17] border border-[#1E293B] px-2 py-1.5 text-white"
                  >
                    <option value="Insider Intel">Insider Intel</option>
                    <option value="Risk Metric">Risk Metric</option>
                    <option value="Earnings Whisper">Earnings Whisper</option>
                    <option value="Regulatory Audit">Regulatory Audit</option>
                  </select>
                  <input
                    type="number"
                    min="1"
                    placeholder="CR"
                    value={draftHintCost}
                    onChange={(e) => setDraftHintCost(e.target.value)}
                    className="col-span-1 bg-[#0B0F17] border border-[#1E293B] px-2 py-1.5 text-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!draftHintTitle.trim() || !draftHintContent.trim()) return;
                      setDraftHints([
                        ...draftHints,
                        {
                          ticker: draftHintTicker || (draftStocks[0]?.ticker ?? 'STK'),
                          title: draftHintTitle.trim(),
                          category: draftHintCategory,
                          risk_rating: draftHintRisk.trim() || 'MEDIUM RISK',
                          content: draftHintContent.trim(),
                          cost_credits: Number(draftHintCost) || 2,
                        },
                      ]);
                      setDraftHintTitle('');
                      setDraftHintContent('');
                    }}
                    className="col-span-2 bg-amber-500 text-slate-950 font-semibold px-2 py-1.5"
                  >
                    + Add Hint
                  </button>
                </div>

                <div className="grid grid-cols-12 gap-2">
                  <input
                    type="text"
                    placeholder="Risk Classification (e.g. HIGH VOLATILITY // BETA 1.80)"
                    value={draftHintRisk}
                    onChange={(e) => setDraftHintRisk(e.target.value)}
                    className="col-span-4 bg-[#0B0F17] border border-[#1E293B] px-2.5 py-1.5 text-white font-mono"
                  />
                  <input
                    type="text"
                    placeholder="Secret intelligence content revealed when player spends credits..."
                    value={draftHintContent}
                    onChange={(e) => setDraftHintContent(e.target.value)}
                    className="col-span-8 bg-[#0B0F17] border border-[#1E293B] px-2.5 py-1.5 text-white"
                  />
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {draftHints.map((dh, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-[#0B0F17] border border-[#1E293B] flex items-start justify-between gap-3"
                    >
                      <div>
                        <div className="text-[11px] font-mono text-amber-400">
                          {dh.ticker} · {dh.category} · {dh.cost_credits} CR · {dh.risk_rating}
                        </div>
                        <div className="text-xs font-semibold text-white">{dh.title}</div>
                        <p className="text-[11px] text-slate-400">{dh.content}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setDraftHints(draftHints.filter((_, i) => i !== idx))
                        }
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* 7. INFORMATION STORE DOSSIER MANAGEMENT */}
      {activeSection === 'intel' && gameState && (
        <div className="p-6 max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5">
            <form
              onSubmit={handleCreateHint}
              className="p-5 bg-[#111827] border border-[#1E293B] space-y-3 text-xs"
            >
              <h3 className="text-sm font-semibold text-white border-b border-[#1E293B] pb-2">
                Author Hidden Stock Hint / Risk Metric
              </h3>

              <div>
                <label className="text-slate-300 block mb-1">Target Stock</label>
                <select
                  value={hintStockId || (gameState.stocks[0]?.id ?? '')}
                  onChange={(e) => setHintStockId(e.target.value)}
                  className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white font-mono"
                >
                  {gameState.stocks.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.ticker} — {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-300 block mb-1">Dossier Title</label>
                <input
                  type="text"
                  placeholder="e.g. Q3 Forensic Accounting & Supply Chain Leak"
                  value={hintTitle}
                  onChange={(e) => setHintTitle(e.target.value)}
                  className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-300 block mb-1">Category</label>
                  <select
                    value={hintCategory}
                    onChange={(e) => setHintCategory(e.target.value)}
                    className="w-full bg-[#0B0F17] border border-[#1E293B] px-2 py-2 text-white"
                  >
                    <option value="Insider Intel">Insider Intel</option>
                    <option value="Risk Metric">Risk Metric</option>
                    <option value="Earnings Whisper">Earnings Whisper</option>
                    <option value="Regulatory Audit">Regulatory Audit</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-300 block mb-1">Credit Cost</label>
                  <input
                    type="number"
                    min="1"
                    value={hintCost}
                    onChange={(e) => setHintCost(e.target.value)}
                    className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 block mb-1">Risk / Beta Classification</label>
                <input
                  type="text"
                  value={hintRisk}
                  onChange={(e) => setHintRisk(e.target.value)}
                  className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1">
                  Secret Intelligence Content (Revealed upon Credit spend)
                </label>
                <textarea
                  rows={3}
                  placeholder="Write the actionable hint or risk intelligence..."
                  value={hintContent}
                  onChange={(e) => setHintContent(e.target.value)}
                  className="w-full bg-[#0B0F17] border border-[#1E293B] px-3 py-2 text-white"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold"
              >
                Publish Hint to Store
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 space-y-3">
            <h3 className="text-sm font-semibold text-white">
              Active Information Store Dossiers ({gameState.hints.length})
            </h3>
            <div className="space-y-2.5">
              {gameState.hints.map((h) => (
                <div
                  key={h.id}
                  className="p-4 bg-[#111827] border border-[#1E293B] flex items-start justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="text-xs font-mono text-amber-400">
                      {h.ticker} · {h.category} · Cost: {h.cost_credits} CR · {h.risk_rating}
                    </div>
                    <div className="text-sm font-semibold text-white">{h.title}</div>
                    <p className="text-xs text-slate-300">{h.content}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteHint(h.id)}
                    className="text-slate-500 hover:text-red-400 p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
