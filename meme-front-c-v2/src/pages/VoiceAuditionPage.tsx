import { useRef, useState } from 'react';
import {
  ArrowLeft, Home, LogIn, Headphones, Upload,
  CheckCircle2, AlertCircle, Loader2, Mic2, ChevronDown, ChevronUp,
} from 'lucide-react';
import { motion } from 'motion/react';
import VoiceCard from '../components/VoiceCard';
import TtsWorkshopPanel from '../components/TtsWorkshopPanel';
import PlayerBar from '../components/PlayerBar';
import { VOICES } from '../constants';
import type { Page, TtsPlayerBarState, Voice } from '../types';

interface VoiceAuditionPageProps {
  onNavigate: (page: Page) => void;
  initialVoiceId?: string;
}

export default function VoiceAuditionPage({ onNavigate, initialVoiceId }: VoiceAuditionPageProps) {
  // ── 音色列表（含本次会话新增的） ──────────────────
  const [voices, setVoices] = useState<Voice[]>([...VOICES]);
  const initial = voices.find((v) => v.referenceId === initialVoiceId) ?? voices[0] ?? null;
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(initial);
  /** 试音请求使用的音色 ID，可与卡片联动，也可手填任意已存在的 reference_id */
  const [ttsRefId, setTtsRefId] = useState(initial?.referenceId ?? '');
  const [ttsPlayer, setTtsPlayer] = useState<TtsPlayerBarState | null>(null);

  // ── 上传面板展开状态 ──────────────────────────────
  const [uploadOpen, setUploadOpen] = useState(false);

  // ── 上传表单状态 ─────────────────────────────────
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [voiceDurationSec, setVoiceDurationSec] = useState<number | null>(null);
  const [voiceRefId, setVoiceRefId] = useState('');
  const [voiceName, setVoiceName] = useState('');
  const [uploadStatus, setUploadStatus] = useState('点击上传区域，选择 10-20 秒音频样本');
  const [uploadKind, setUploadKind] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function authHeaders(): Record<string, string> {
    const token = localStorage.getItem('memec_auth_token') || '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function readAudioDuration(file: File): Promise<number> {
    const url = URL.createObjectURL(file);
    try {
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      audio.src = url;
      return await new Promise<number>((resolve, reject) => {
        audio.onloadedmetadata = () => resolve(audio.duration);
        audio.onerror = () => reject(new Error('无法解析音频时长'));
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function handlePickFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      setUploadKind('err');
      setUploadStatus('请选择音频文件');
      setVoiceFile(null);
      setVoiceDurationSec(null);
      return;
    }
    try {
      const dur = await readAudioDuration(file);
      setVoiceFile(file);
      setVoiceDurationSec(dur);
      setUploadKind('ok');
      setUploadStatus(`已选择：${file.name}（${dur.toFixed(1)} 秒）`);
    } catch (e) {
      setUploadKind('err');
      setUploadStatus(`读取失败：${e instanceof Error ? e.message : String(e)}`);
      setVoiceFile(null);
      setVoiceDurationSec(null);
    }
  }

  async function handleUpload() {
    if (!voiceFile) { setUploadKind('err'); setUploadStatus('请先选择音频文件'); return; }
    if (!voiceRefId.trim()) { setUploadKind('err'); setUploadStatus('请填写音色 ID'); return; }
    setUploading(true);
    setUploadKind('loading');
    setUploadStatus('上传中…');
    try {
      const form = new FormData();
      form.append('id', voiceRefId.trim());
      form.append('text', 'sample');
      form.append('audio', voiceFile);
      const resp = await fetch('/api/references/add', {
        method: 'POST',
        headers: authHeaders(),
        body: form,
      });
      const body = await resp.text();
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${body || '上传失败'}`);

      // 乐观更新音色列表
      const newVoice: Voice = {
        id: `local-${Date.now()}`,
        name: voiceName.trim() || voiceRefId.trim(),
        avatarUrl: '',
        status: 'processing',
        referenceId: voiceRefId.trim(),
      };
      setVoices((prev) => [...prev, newVoice]);
      setSelectedVoice(newVoice);
      setTtsRefId(newVoice.referenceId);
      setUploadKind('ok');
      setUploadStatus(`上传成功！音色「${newVoice.name}」已添加，可立即试音。`);
      // 重置表单
      setVoiceFile(null);
      setVoiceDurationSec(null);
      setVoiceRefId('');
      setVoiceName('');
    } catch (e) {
      setUploadKind('err');
      setUploadStatus(`上传失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setUploading(false);
    }
  }

  const UploadStatusIcon =
    uploadKind === 'err' ? AlertCircle :
    uploadKind === 'ok' ? CheckCircle2 :
    uploadKind === 'loading' ? Loader2 : null;

  const uploadStatusClass =
    uploadKind === 'err' ? 'text-red-600 bg-red-50 border-red-100' :
    uploadKind === 'ok' ? 'text-emerald-700 bg-emerald-50 border-emerald-100' :
    uploadKind === 'loading' ? 'text-primary bg-primary/5 border-primary/15' :
    'text-secondary/70 bg-white/60 border-white/40';

  return (
    <div className="bg-background font-body text-on-background min-h-screen overflow-x-hidden">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-4 md:px-10 h-20 bg-background/80 backdrop-blur-xl shadow-[0_4px_30px_rgba(167,41,90,0.05)]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="inline-flex items-center gap-1 text-primary hover:opacity-80 transition-opacity"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="hidden sm:inline">返回</span>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              <Headphones className="w-4 h-4 text-white" />
            </div>
            <span className="text-2xl font-bold text-primary drop-shadow-sm font-headline">试音工坊</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('landing')}
            className="hidden sm:flex items-center gap-1 text-primary hover:opacity-80 transition-all text-sm font-bold"
          >
            <Home className="w-5 h-5" />
            <span>首页</span>
          </button>
          <button
            onClick={() => onNavigate('login')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-white text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            <LogIn className="w-3.5 h-3.5" />
            登录
          </button>
        </div>
      </header>

      {/* Background */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[10%] left-[10%] w-[350px] h-[350px] bg-secondary/5 rounded-full blur-[100px]" />
      </div>

      <main className="pt-24 pb-32 px-4 md:px-12">
        <div className="max-w-4xl mx-auto space-y-8">

          {/* ── 选择音色 ─────────────────────────────── */}
          <section className="glass-card rounded-2xl border border-white/60 p-6 md:p-8">
            <div className="flex items-baseline justify-between mb-5">
              <h3 className="text-xl font-bold font-headline text-primary tracking-tight">选择试音音色</h3>
              <p className="text-xs text-secondary/60 hidden sm:block italic">点击卡片切换朗读声音</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {voices.map((voice) => (
                <motion.div key={voice.id} layout>
                  <VoiceCard
                    voice={voice}
                    selected={selectedVoice?.id === voice.id}
                    onClick={() => {
                      setSelectedVoice(voice);
                      setTtsRefId(voice.referenceId ?? '');
                    }}
                  />
                </motion.div>
              ))}
            </div>
            {selectedVoice && (
              <p className="mt-4 text-xs text-secondary/70">
                当前音色：
                <span className="font-semibold text-primary ml-1">{selectedVoice.name}</span>
                <span className="text-outline/60 ml-2">（ID: {selectedVoice.referenceId ?? '—'}）</span>
              </p>
            )}
          </section>

          {/* ── TTS 合成 ─────────────────────────────── */}
          <TtsWorkshopPanel
            referenceId={ttsRefId}
            onReferenceIdChange={setTtsRefId}
            onPlayerUiChange={setTtsPlayer}
            referenceIdLabel="音色 ID"
          />

          {/* ── 添加新音色（折叠） ───────────────────── */}
          <section className="glass-card rounded-2xl border border-white/60 overflow-hidden">
            <button
              type="button"
              onClick={() => setUploadOpen((o) => !o)}
              className="w-full flex items-center justify-between px-6 md:px-8 py-5 hover:bg-primary/5 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Mic2 className="w-4 h-4 text-primary" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-primary text-sm">添加新音色</p>
                  <p className="text-xs text-secondary/60">上传 10-20 秒音频样本，复刻专属声音</p>
                </div>
              </div>
              {uploadOpen
                ? <ChevronUp className="w-5 h-5 text-primary/60" />
                : <ChevronDown className="w-5 h-5 text-primary/60" />}
            </button>

            <div
              className="overflow-hidden transition-all duration-200"
              style={{ maxHeight: uploadOpen ? '800px' : '0px', opacity: uploadOpen ? 1 : 0 }}
            >
                  <div className="px-6 md:px-8 pb-7 pt-1 space-y-5 border-t border-white/40">

                    {/* 上传区 */}
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.005 }}
                      onClick={() => fileInputRef.current?.click()}
                      className={`w-full border-2 border-dashed rounded-xl p-7 flex flex-col items-center justify-center text-center space-y-2 transition-colors ${
                        voiceFile
                          ? 'border-emerald-300 bg-emerald-50/30'
                          : 'border-primary/25 hover:border-primary/45'
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        voiceFile ? 'bg-emerald-100 text-emerald-600' : 'bg-primary-container/20 text-primary'
                      }`}>
                        {voiceFile ? <CheckCircle2 className="w-6 h-6" /> : <Upload className="w-6 h-6" />}
                      </div>
                      <div>
                        <p className="font-bold text-on-surface text-sm">
                          {voiceFile ? voiceFile.name : '点击选择音频文件'}
                        </p>
                        <p className="text-xs text-secondary/60 mt-0.5">
                          {voiceDurationSec != null
                            ? `时长：${voiceDurationSec.toFixed(1)} 秒`
                            : '支持 mp3 / wav / m4a 等常见格式'}
                        </p>
                      </div>
                    </motion.button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => {
                        void handlePickFile(e.target.files?.[0] || null);
                        e.currentTarget.value = '';
                      }}
                    />

                    {/* 表单字段 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-secondary mb-1.5 ml-1">
                          音色 ID <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          value={voiceRefId}
                          onChange={(e) => setVoiceRefId(e.target.value)}
                          placeholder="如 grandma_voice_001"
                          className="w-full px-4 py-2.5 rounded-full bg-white/70 border border-white/60 text-on-surface placeholder:text-outline/50 focus:ring-2 focus:ring-primary-container outline-hidden text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-secondary mb-1.5 ml-1">
                          显示名称（可选）
                        </label>
                        <input
                          type="text"
                          value={voiceName}
                          onChange={(e) => setVoiceName(e.target.value)}
                          placeholder="如 奶奶的声音"
                          className="w-full px-4 py-2.5 rounded-full bg-white/70 border border-white/60 text-on-surface placeholder:text-outline/50 focus:ring-2 focus:ring-primary-container outline-hidden text-sm"
                        />
                      </div>
                    </div>

                    {/* 上传按钮 */}
                    <button
                      type="button"
                      onClick={() => void handleUpload()}
                      disabled={uploading || !voiceFile}
                      className="w-full py-3 rounded-full dream-gradient text-white text-sm font-bold shadow-md shadow-primary/20 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                    >
                      {uploading ? '上传中…' : '上传并创建音色'}
                    </button>

                    {/* 状态提示 */}
                    <div className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-xs ${uploadStatusClass}`}>
                      {UploadStatusIcon && (
                        <UploadStatusIcon className={`w-4 h-4 mt-0.5 shrink-0 ${uploadKind === 'loading' ? 'animate-spin' : ''}`} />
                      )}
                      <span>{uploadStatus}</span>
                    </div>
                  </div>
            </div>
          </section>

        </div>
      </main>

      <PlayerBar tts={ttsPlayer} />
    </div>
  );
}
