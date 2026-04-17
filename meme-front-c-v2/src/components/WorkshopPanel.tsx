import { useEffect, useRef, useState } from 'react';
import {
  Sparkles, FileText, Upload, Plus, Trash2, Play,
  Heart, ThumbsDown, RefreshCw, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react';
import type { Voice } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkshopJob {
  id: number;
  title: string;
  text_preview: string;
  reference_id: string;
  mode: string;
  speed: number;
  status: 'pending' | 'processing' | 'done' | 'failed';
  error_msg?: string;
  has_audio: boolean;
  segment_count: number;
  segments_done: number;
  favorite: boolean;
  disliked: boolean;
  created_at: string;
}

interface PendingEntry {
  localId: string;
  title: string;
  text: string;
}

interface WorkshopPanelProps {
  voices: Voice[];
}

function authHdrs(): Record<string, string> {
  const t = localStorage.getItem('memec_auth_token') || '';
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// ─── AudioPlayer ─────────────────────────────────────────────────────────────

function AudioPlayer({ jobId }: { jobId: number }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  async function load() {
    if (blobUrl) { audioRef.current?.play().catch(() => {}); return; }
    setLoading(true); setErr('');
    try {
      const resp = await fetch(`/api/workshop/audio/${jobId}`, { headers: authHdrs() });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const url = URL.createObjectURL(await resp.blob());
      setBlobUrl(url);
      setTimeout(() => audioRef.current?.play().catch(() => {}), 50);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败');
    } finally { setLoading(false); }
  }

  return (
    <div className="mt-2 space-y-1">
      {blobUrl ? (
        <audio ref={audioRef} src={blobUrl} controls className="w-full h-9" />
      ) : (
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary text-sm font-medium transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
          {loading ? '加载中…' : '播放'}
        </button>
      )}
      {err && <p className="text-xs text-red-500">{err}</p>}
    </div>
  );
}

// ─── JobCard ─────────────────────────────────────────────────────────────────

function JobCard({
  job,
  onFavorite,
  onDislike,
  onDelete,
}: {
  job: WorkshopJob;
  onFavorite: (id: number, val: boolean) => void;
  onDislike: (id: number, val: boolean) => void;
  onDelete: (id: number) => void;
}) {
  const pct = job.segment_count > 0 ? Math.round((job.segments_done / job.segment_count) * 100) : 0;

  const badge = {
    pending:    { label: '待处理', cls: 'bg-secondary/15 text-secondary' },
    processing: { label: '生成中', cls: 'bg-primary/10 text-primary' },
    done:       { label: '已完成', cls: 'bg-emerald-100 text-emerald-700' },
    failed:     { label: '失败',   cls: 'bg-red-100 text-red-600' },
  }[job.status] ?? { label: job.status, cls: 'bg-gray-100 text-gray-600' };

  return (
    <div className="glass-card rounded-2xl border border-white/60 p-5 space-y-3">
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
            {job.status === 'processing' && <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />}
            <span className="text-xs text-secondary/50">
              {job.mode === 'sleep' ? '睡前' : '普通'} · {job.speed}x
              {job.reference_id ? ` · ${job.reference_id}` : ''}
            </span>
          </div>
          <p className="font-semibold text-on-surface text-sm mt-1 truncate">{job.title}</p>
          <p className="text-xs text-secondary/60 mt-0.5 line-clamp-2">{job.text_preview}</p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          <button
            type="button"
            title={job.favorite ? '取消收藏' : '收藏'}
            onClick={() => onFavorite(job.id, !job.favorite)}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
              job.favorite ? 'bg-pink-100 text-pink-500' : 'hover:bg-pink-50 text-secondary/40 hover:text-pink-400'
            }`}
          >
            <Heart className={`w-4 h-4 ${job.favorite ? 'fill-current' : ''}`} />
          </button>
          <button
            type="button"
            title={job.disliked ? '取消不喜欢' : '不喜欢'}
            onClick={() => onDislike(job.id, !job.disliked)}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
              job.disliked ? 'bg-gray-100 text-gray-500' : 'hover:bg-gray-50 text-secondary/40 hover:text-gray-400'
            }`}
          >
            <ThumbsDown className={`w-4 h-4 ${job.disliked ? 'fill-current' : ''}`} />
          </button>
          <button
            type="button"
            title="删除"
            onClick={() => onDelete(job.id)}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-red-50 text-secondary/40 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress bar (processing) */}
      {job.status === 'processing' && job.segment_count > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-secondary/60">
            <span>合成进度</span>
            <span>{job.segments_done} / {job.segment_count} 段</span>
          </div>
          <div className="h-1.5 rounded-full bg-primary/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-linear-to-r from-primary to-secondary transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Pending spinner */}
      {job.status === 'pending' && (
        <p className="text-xs text-secondary/50">排队中，等待生成…</p>
      )}

      {/* Error */}
      {job.status === 'failed' && job.error_msg && (
        <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 break-all">{job.error_msg}</p>
      )}

      {/* Audio player */}
      {job.status === 'done' && job.has_audio && <AudioPlayer jobId={job.id} />}

      <p className="text-xs text-secondary/40">
        {new Date(job.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </p>
    </div>
  );
}

// ─── WorkshopPanel ────────────────────────────────────────────────────────────

export default function WorkshopPanel({ voices }: WorkshopPanelProps) {
  // Import section
  const [entries, setEntries] = useState<PendingEntry[]>([]);
  const [manualText, setManualText] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importMsg, setImportMsg] = useState('');
  const [importCollapsed, setImportCollapsed] = useState(false);

  // Config
  const [referenceId, setReferenceId] = useState(voices[0]?.referenceId ?? '');
  const [mode, setMode] = useState('normal');
  const [speed, setSpeed] = useState('0.95');

  // Jobs
  const [jobs, setJobs] = useState<WorkshopJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');
  const [showDisliked, setShowDisliked] = useState(false);

  // ── API helpers ──

  async function loadJobs() {
    try {
      const resp = await fetch(`/api/workshop/jobs?include_disliked=${showDisliked}`, { headers: authHdrs() });
      if (!resp.ok) return;
      const data = await resp.json() as { jobs: WorkshopJob[] };
      setJobs(data.jobs ?? []);
    } catch { /* ignore */ }
  }

  // Load on mount + when showDisliked changes
  useEffect(() => {
    setLoadingJobs(true);
    void loadJobs().finally(() => setLoadingJobs(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDisliked]);

  // Self-perpetuating poll while jobs are active
  useEffect(() => {
    const hasActive = jobs.some(j => j.status === 'pending' || j.status === 'processing');
    if (!hasActive) return;
    const timer = setTimeout(() => void loadJobs(), 3000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs]);

  // ── Import helpers ──

  function parseText(raw: string): PendingEntry[] {
    return raw
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(p => p.length >= 10)
      .map((p, i) => ({
        localId: `e_${Date.now()}_${i}`,
        title: p.replace(/\n/g, ' ').slice(0, 40) + (p.length > 40 ? '…' : ''),
        text: p,
      }));
  }

  async function handleFileDrop(file: File) {
    setImportMsg('读取中…');
    try {
      const parsed = parseText(await file.text());
      if (parsed.length === 0) { setImportMsg('未找到有效段落（段落间请用空行分隔）'); return; }
      setEntries(prev => [...prev, ...parsed]);
      setImportMsg(`已导入 ${parsed.length} 个段落，来自「${file.name}」`);
    } catch (e) {
      setImportMsg(`读取失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function addManual() {
    const text = manualText.trim();
    if (!text) return;
    const title = (manualTitle.trim() || text.slice(0, 40) + (text.length > 40 ? '…' : ''));
    setEntries(prev => [...prev, { localId: `m_${Date.now()}`, title, text }]);
    setManualText(''); setManualTitle('');
  }

  // ── Submit ──

  async function submitBatch() {
    if (entries.length === 0) { setSubmitMsg('请先导入或添加文本'); return; }
    setSubmitting(true);
    setSubmitMsg(`提交 ${entries.length} 条任务…`);
    let ok = 0; let fail = 0;
    for (const entry of entries) {
      try {
        const r = await fetch('/api/workshop/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHdrs() },
          body: JSON.stringify({ title: entry.title, text_content: entry.text, reference_id: referenceId, mode, speed: Number(speed) || 1.0 }),
        });
        r.ok ? ok++ : fail++;
      } catch { fail++; }
    }
    setSubmitMsg(`已提交 ${ok} 条${fail > 0 ? `，失败 ${fail} 条` : ''}，后台生成中…`);
    setEntries([]);
    setSubmitting(false);
    setImportCollapsed(true);
    void loadJobs();
  }

  // ── Job actions ──

  async function onFavorite(id: number, val: boolean) {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, favorite: val } : j));
    await fetch(`/api/workshop/jobs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHdrs() }, body: JSON.stringify({ favorite: val }) }).catch(() => {});
  }

  async function onDislike(id: number, val: boolean) {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, disliked: val } : j));
    if (val && !showDisliked) setTimeout(() => setJobs(prev => prev.filter(j => j.id !== id)), 400);
    await fetch(`/api/workshop/jobs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHdrs() }, body: JSON.stringify({ disliked: val }) }).catch(() => {});
  }

  async function onDelete(id: number) {
    setJobs(prev => prev.filter(j => j.id !== id));
    await fetch(`/api/workshop/jobs/${id}`, { method: 'DELETE', headers: authHdrs() }).catch(() => {});
  }

  const activeCount = jobs.filter(j => j.status === 'pending' || j.status === 'processing').length;

  return (
    <div className="space-y-8 pb-24">
      {/* Page title */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold font-headline text-primary">批量工坊</h2>
          <p className="text-sm text-secondary/70">批量导入文本，生成并保存专属语音，登录后仍可播放</p>
        </div>
      </div>

      {/* ── Import section ── */}
      <section className="glass-card rounded-2xl border border-white/60 overflow-hidden">
        {/* Collapsible header */}
        <button
          type="button"
          onClick={() => setImportCollapsed(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/40 transition-colors"
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <span className="font-bold text-sm text-primary">导入文本 &amp; 配置</span>
            {entries.length > 0 && (
              <span className="text-xs bg-primary text-white px-2 py-0.5 rounded-full">{entries.length} 条待生成</span>
            )}
          </div>
          {importCollapsed
            ? <ChevronDown className="w-4 h-4 text-secondary/60" />
            : <ChevronUp className="w-4 h-4 text-secondary/60" />}
        </button>

        {!importCollapsed && (
          <div className="px-5 pb-6 space-y-5">

            {/* File drop zone */}
            <div
              className="border-2 border-dashed border-primary/20 rounded-xl p-6 text-center hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer select-none"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void handleFileDrop(f); }}
            >
              <Upload className="w-8 h-8 text-primary/30 mx-auto mb-2" />
              <p className="text-sm font-medium text-secondary">点击或拖放文件</p>
              <p className="text-xs text-secondary/50 mt-1">支持 .txt .md .text，以空行分隔段落，每段生成一条语音</p>
              <input
                ref={fileInputRef} type="file"
                accept=".txt,.md,.text,text/plain,text/markdown"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) void handleFileDrop(f); e.target.value = ''; }}
              />
            </div>
            {importMsg && <p className="text-xs text-secondary/70">{importMsg}</p>}

            {/* Manual add */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-secondary uppercase tracking-wider">手动添加</p>
              <input
                type="text" placeholder="标题（可选）" value={manualTitle}
                onChange={e => setManualTitle(e.target.value)}
                className="w-full px-4 py-2.5 rounded-full bg-white/70 border border-white/60 text-sm focus:ring-2 focus:ring-primary-container outline-hidden"
              />
              <textarea
                rows={3} placeholder="输入文本内容…" value={manualText}
                onChange={e => setManualText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addManual(); }}
                className="w-full px-4 py-3 rounded-xl bg-white/70 border border-white/60 text-sm resize-none focus:ring-2 focus:ring-primary-container outline-hidden"
              />
              <button
                type="button" onClick={addManual} disabled={!manualText.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />添加
              </button>
            </div>

            {/* Pending list preview */}
            {entries.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-secondary">待生成（{entries.length} 条）</p>
                  <button type="button" onClick={() => setEntries([])} className="text-xs text-secondary/50 hover:text-red-400 transition-colors">全部清除</button>
                </div>
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                  {entries.map(e => (
                    <div key={e.localId} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/60">
                      <p className="flex-1 text-xs text-on-surface truncate">{e.title}</p>
                      <button type="button" onClick={() => setEntries(prev => prev.filter(x => x.localId !== e.localId))} className="text-secondary/40 hover:text-red-400 shrink-0 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Config: voice / mode / speed */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-secondary">音色</label>
                <select
                  value={voices.find(v => v.referenceId === referenceId) ? referenceId : ''}
                  onChange={e => setReferenceId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-full bg-white/70 border border-white/60 text-sm focus:ring-2 focus:ring-primary-container outline-hidden"
                >
                  <option value="">（默认）</option>
                  {voices.filter(v => v.referenceId).map(v => (
                    <option key={v.id} value={v.referenceId ?? ''}>{v.name}</option>
                  ))}
                </select>
                <input
                  type="text" placeholder="或直接输入音色 ID"
                  value={referenceId}
                  onChange={e => setReferenceId(e.target.value)}
                  className="w-full px-3 py-2 rounded-full bg-white/70 border border-white/60 text-xs focus:ring-2 focus:ring-primary-container outline-hidden"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-secondary">模式</label>
                <select
                  value={mode} onChange={e => setMode(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-full bg-white/70 border border-white/60 text-sm focus:ring-2 focus:ring-primary-container outline-hidden"
                >
                  <option value="normal">普通</option>
                  <option value="sleep">睡前（自动加气口）</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-secondary">语速</label>
                <input
                  type="number" step={0.05} min={0.5} max={2.0}
                  value={speed} onChange={e => setSpeed(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-full bg-white/70 border border-white/60 text-sm focus:ring-2 focus:ring-primary-container outline-hidden"
                />
              </div>
            </div>

            {/* Submit */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => void submitBatch()}
                disabled={submitting || entries.length === 0}
                className="dream-gradient text-white font-headline font-bold px-6 py-2.5 rounded-full shadow-md hover:shadow-lg transition-all disabled:opacity-60 flex items-center gap-2 active:scale-95"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 fill-current" />}
                批量生成{entries.length > 0 ? `（${entries.length} 条）` : ''}
              </button>
              {submitMsg && <p className="text-xs text-secondary/70">{submitMsg}</p>}
            </div>
          </div>
        )}
      </section>

      {/* ── Job list ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-base text-primary">已生成的声音</h3>
            {activeCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-primary animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {activeCount} 条生成中
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDisliked(v => !v)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                showDisliked ? 'bg-secondary/10 border-secondary/20 text-secondary' : 'border-transparent text-secondary/50 hover:text-secondary'
              }`}
            >
              {showDisliked ? '隐藏不喜欢' : '含不喜欢'}
            </button>
            <button
              type="button"
              onClick={() => { setLoadingJobs(true); void loadJobs().finally(() => setLoadingJobs(false)); }}
              disabled={loadingJobs}
              className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-primary/10 text-secondary/50 hover:text-primary transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingJobs ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {loadingJobs && jobs.length === 0 && (
          <div className="text-center py-12 text-secondary/40">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
            <p className="text-sm">加载中…</p>
          </div>
        )}

        {!loadingJobs && jobs.length === 0 && (
          <div className="text-center py-16 text-secondary/30">
            <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">还没有生成记录，上方导入文本开始创作吧！</p>
          </div>
        )}

        <div className="space-y-3">
          {jobs.map(job => (
            <JobCard key={job.id} job={job} onFavorite={onFavorite} onDislike={onDislike} onDelete={onDelete} />
          ))}
        </div>
      </section>
    </div>
  );
}
