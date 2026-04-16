import { useCallback, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import {
  playMultiSegmentStream,
  type OnStreamStatus,
  type StreamProgress,
  type StreamSession,
  type StreamStatusKind,
} from '../lib/ttsStream';
import type { TtsPlayerBarState } from '../types';

interface TtsWorkshopPanelProps {
  referenceId: string;
  onReferenceIdChange: (value: string) => void;
  onPlayerUiChange?: (state: TtsPlayerBarState | null) => void;
  /** 隐藏「参考音色 ID」输入框（在试音页已由音色卡片控制） */
  hideReferenceInput?: boolean;
}

const DEFAULT_TEXT = '你好，这是 Meme C 的前端测试。';

function mapStatusToPlayer(
  msg: string,
  kind: StreamStatusKind,
  progress: StreamProgress | null | undefined
): TtsPlayerBarState {
  const total = progress?.total ?? 0;
  const current = progress?.current ?? 0;
  const progressPct =
    total > 0 ? Math.round((current / total) * 100) : kind === 'loading' ? 8 : 0;
  return {
    active: true,
    title: '多段语音合成',
    subtitle: msg,
    progressPct,
    isBusy: kind === 'loading',
  };
}

export default function TtsWorkshopPanel({
  referenceId,
  onReferenceIdChange,
  onPlayerUiChange,
  hideReferenceInput = false,
}: TtsWorkshopPanelProps) {
  function authHeaders(): Record<string, string> {
    const token = localStorage.getItem('memec_auth_token') || '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  const [text, setText] = useState(DEFAULT_TEXT);
  const [mode, setMode] = useState('normal');
  const [speed, setSpeed] = useState('0.85');
  const [statusMsg, setStatusMsg] = useState('等待操作');
  const [statusKind, setStatusKind] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef<StreamSession | null>(null);

  const pushPlayer = useCallback(
    (msg: string, kind: StreamStatusKind, prog: StreamProgress | null | undefined) => {
      onPlayerUiChange?.(mapStatusToPlayer(msg, kind, prog));
    },
    [onPlayerUiChange]
  );

  const clearPlayer = useCallback(() => {
    onPlayerUiChange?.(null);
  }, [onPlayerUiChange]);

  const setMsg: OnStreamStatus = (msg, type, prog = null) => {
    setStatusMsg(msg);
    setStatusKind(type);
    setProgress(prog);
    if (type === 'loading' || type === 'ok' || type === 'err') {
      pushPlayer(msg, type, prog);
    }
  };

  async function handleGenerate() {
    const ctx = new AudioContext();

    if (sessionRef.current) {
      sessionRef.current.cancelled = true;
      try {
        await sessionRef.current.ctx.close();
      } catch {
        /* ignore */
      }
    }

    if (ctx.state === 'suspended') await ctx.resume();

    const session: StreamSession = { ctx, cancelled: false };
    sessionRef.current = session;

    const trimText = text.trim();
    if (!trimText) {
      setMsg('文本不能为空', 'err', null);
      clearPlayer();
      return;
    }

    setBusy(true);
    setMsg('请求断句与多段合成…', 'loading', null);

    try {
      const resp = await fetch('/api/tts/multi-segment-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          text: trimText,
          reference_id: referenceId.trim() || undefined,
          mode,
          speed: Number(speed) || 1.0,
        }),
      });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`HTTP ${resp.status}\n${t}`);
      }
      await playMultiSegmentStream(resp, session, setMsg);
      if (!session.cancelled) {
        setMsg('多段流式播放结束。', 'ok', null);
        pushPlayer('多段流式播放结束。', 'ok', null);
      }
    } catch (e) {
      if (!session.cancelled) {
        const errText = e instanceof Error ? e.message : String(e);
        setMsg(`多段流式失败:\n${errText}`, 'err', null);
        pushPlayer(`多段流式失败: ${errText}`, 'err', null);
      }
    } finally {
      setBusy(false);
    }
  }

  const statusClass =
    statusKind === 'err'
      ? 'text-red-700 bg-red-50 border-red-100'
      : statusKind === 'ok'
        ? 'text-emerald-800 bg-emerald-50 border-emerald-100'
        : statusKind === 'loading'
          ? 'text-primary bg-primary/5 border-primary/15'
          : 'text-secondary bg-white/60 border-white/40';

  const progressPct =
    progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  return (
    <section
      id="tts-workshop"
      className="glass-card rounded-2xl border-2 border-white/50 p-6 md:p-8 space-y-6"
    >
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white shadow-lg shrink-0">
          <Sparkles className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-xl font-bold font-headline text-primary">文本转复刻语音</h3>
          <p className="text-sm text-secondary/80 mt-1">
            调用后端{' '}
            <code className="text-xs bg-white/70 px-1.5 py-0.5 rounded">/api/tts/multi-segment-stream</code>
            ：DeepSeek 分句后多 GPU 轮流合成，本页按句严格串行播放。
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-secondary mb-1.5 ml-1">文本</label>
          <textarea
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="输入你要合成的文本"
            className="w-full px-4 py-3 rounded-xl bg-white/70 border border-white/60 text-on-surface placeholder:text-outline/50 focus:ring-2 focus:ring-primary-container outline-hidden resize-y min-h-[120px]"
          />
        </div>

        <div className={`grid gap-4 ${hideReferenceInput ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
          {!hideReferenceInput && (
            <div>
              <label className="block text-xs font-bold text-secondary mb-1.5 ml-1">参考音色 ID</label>
              <input
                type="text"
                value={referenceId}
                onChange={(e) => onReferenceIdChange(e.target.value)}
                placeholder="例如 my_voice_001"
                className="w-full px-4 py-3 rounded-full bg-white/70 border border-white/60 text-on-surface placeholder:text-outline/50 focus:ring-2 focus:ring-primary-container outline-hidden"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-secondary mb-1.5 ml-1">生成模式</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="w-full px-4 py-3 rounded-full bg-white/70 border border-white/60 text-on-surface focus:ring-2 focus:ring-primary-container outline-hidden"
            >
              <option value="normal">普通模式</option>
              <option value="sleep">睡前模式（自动加气口）</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-secondary mb-1.5 ml-1">
            语速（1.0 = 正常，0.85 = 慢一点）
          </label>
          <input
            type="number"
            step={0.05}
            min={0.5}
            max={2.0}
            value={speed}
            onChange={(e) => setSpeed(e.target.value)}
            className="w-full max-w-xs px-4 py-3 rounded-full bg-white/70 border border-white/60 text-on-surface focus:ring-2 focus:ring-primary-container outline-hidden"
          />
        </div>

        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={busy}
          className="w-full dream-gradient text-white font-headline font-bold py-4 rounded-full shadow-[0_10px_30px_rgba(167,41,90,0.25)] hover:shadow-[0_15px_40px_rgba(167,41,90,0.35)] transition-all disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99]"
        >
          {busy ? '合成中…' : '多卡断句流式（DeepSeek 分句 + GPU 轮流）'}
        </button>
      </div>

      <div className={`rounded-xl border px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${statusClass}`}>
        {statusMsg}
        {statusKind === 'loading' && progress && progress.total > 0 && (
          <div className="mt-3 h-1.5 rounded-full bg-black/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-linear-to-r from-primary to-secondary transition-[width] duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
      </div>
    </section>
  );
}
