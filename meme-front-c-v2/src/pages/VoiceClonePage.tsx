import { useRef, useState } from 'react';
import { ArrowLeft, Home, LogIn, Upload, Headphones, CheckCircle2, AlertCircle, Loader2, Mic2 } from 'lucide-react';
import { motion } from 'motion/react';
import { VOICES } from '../constants';
import type { Page } from '../types';

interface VoiceClonePageProps {
  onNavigate: (page: Page) => void;
}

export default function VoiceClonePage({ onNavigate }: VoiceClonePageProps) {
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [voiceDurationSec, setVoiceDurationSec] = useState<number | null>(null);
  const [voiceRefId, setVoiceRefId] = useState('');
  const [voiceName, setVoiceName] = useState('');
  const [voiceStatus, setVoiceStatus] = useState('点击上传区域，选择 10-20 秒音频样本');
  const [voiceStatusKind, setVoiceStatusKind] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const voiceInputRef = useRef<HTMLInputElement | null>(null);

  function authHeaders(): Record<string, string> {
    const token = localStorage.getItem('memec_auth_token') || '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function readAudioDurationSec(file: File): Promise<number> {
    const url = URL.createObjectURL(file);
    try {
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      audio.src = url;
      const duration = await new Promise<number>((resolve, reject) => {
        audio.onloadedmetadata = () => resolve(audio.duration);
        audio.onerror = () => reject(new Error('无法解析音频时长'));
      });
      if (!Number.isFinite(duration) || duration <= 0) throw new Error('音频时长无效');
      return duration;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function handlePickVoiceFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      setVoiceStatusKind('err');
      setVoiceStatus('请选择音频文件');
      setVoiceFile(null);
      setVoiceDurationSec(null);
      return;
    }
    try {
      const duration = await readAudioDurationSec(file);
      setVoiceFile(file);
      setVoiceDurationSec(duration);
      setVoiceStatusKind('ok');
      setVoiceStatus(`已选择：${file.name}（${duration.toFixed(1)} 秒）`);
    } catch (e) {
      setVoiceStatusKind('err');
      setVoiceStatus(`读取音频失败：${e instanceof Error ? e.message : String(e)}`);
      setVoiceFile(null);
      setVoiceDurationSec(null);
    }
  }

  async function uploadVoiceSample() {
    if (!voiceFile) {
      setVoiceStatusKind('err');
      setVoiceStatus('请先选择 10-20 秒音频');
      return;
    }
    if (!voiceRefId.trim()) {
      setVoiceStatusKind('err');
      setVoiceStatus('请填写音色 ID');
      return;
    }
    setUploadingVoice(true);
    setVoiceStatusKind('loading');
    setVoiceStatus('上传中…');
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
      setVoiceStatusKind('ok');
      setVoiceStatus(`上传成功！音色 ID：${voiceRefId.trim()}`);
    } catch (e) {
      setVoiceStatusKind('err');
      setVoiceStatus(`上传失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setUploadingVoice(false);
    }
  }

  const StatusIcon =
    voiceStatusKind === 'err' ? AlertCircle :
    voiceStatusKind === 'ok' ? CheckCircle2 :
    voiceStatusKind === 'loading' ? Loader2 : null;

  const statusClass =
    voiceStatusKind === 'err' ? 'text-red-600 bg-red-50 border-red-100' :
    voiceStatusKind === 'ok' ? 'text-emerald-700 bg-emerald-50 border-emerald-100' :
    voiceStatusKind === 'loading' ? 'text-primary bg-primary/5 border-primary/15' :
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
              <Mic2 className="w-4 h-4 text-white" />
            </div>
            <span className="text-2xl font-bold text-primary drop-shadow-sm font-headline">声音复刻</span>
          </div>
        </div>
        <div className="flex items-center gap-3 md:gap-5">
          <button
            onClick={() => onNavigate('voice-audition')}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-secondary/10 text-secondary text-sm font-semibold hover:bg-secondary/20 transition-colors"
          >
            <Headphones className="w-3.5 h-3.5" />
            去试音
          </button>
          <button
            onClick={() => onNavigate('landing')}
            className="flex items-center gap-1 text-primary hover:opacity-80 hover:scale-105 transition-all text-sm font-bold"
          >
            <Home className="w-5 h-5" />
            <span className="hidden sm:inline">首页</span>
          </button>
          <button
            onClick={() => onNavigate('login')}
            className="flex items-center gap-1 text-primary hover:opacity-80 hover:scale-105 transition-all text-sm font-bold"
          >
            <LogIn className="w-5 h-5" />
            <span className="hidden sm:inline">登录</span>
          </button>
        </div>
      </header>

      {/* Background */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[15%] left-[10%] w-[350px] h-[350px] bg-secondary/5 rounded-full blur-[100px]" />
      </div>

      <main className="pt-28 pb-16 px-6 md:px-12">
        <div className="max-w-2xl mx-auto space-y-6">

          {/* Tips Banner */}
          <div className="glass-card rounded-xl border border-white/60 px-5 py-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Mic2 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-on-surface">录音小贴士</p>
              <p className="text-xs text-secondary/70 mt-0.5 leading-relaxed">
                建议选择 10-20 秒样本；环境安静、音量稳定效果最佳。上传后请前往<strong>试音工坊</strong>验证效果。
              </p>
            </div>
          </div>

          {/* Upload Card */}
          <section className="glass-card p-6 md:p-8 rounded-2xl border-2 border-white/50 space-y-5">
            <h3 className="text-xl font-bold font-headline text-primary tracking-tight">上传声音样本</h3>

            <motion.button
              type="button"
              whileHover={{ scale: 1.01 }}
              onClick={() => voiceInputRef.current?.click()}
              className={`w-full border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center space-y-3 transition-colors ${
                voiceFile
                  ? 'border-emerald-300 bg-emerald-50/30'
                  : 'border-primary/25 hover:border-primary/45'
              }`}
            >
              <div className={`w-14 h-14 rounded-full flex items-center justify-center ${
                voiceFile ? 'bg-emerald-100 text-emerald-600' : 'bg-primary-container/20 text-primary'
              }`}>
                {voiceFile ? <CheckCircle2 className="w-7 h-7" /> : <Upload className="w-7 h-7" />}
              </div>
              <div>
                <h4 className="font-bold text-on-surface">
                  {voiceFile ? voiceFile.name : '选择音频文件'}
                </h4>
                <p className="text-xs text-secondary/70 mt-1">
                  {voiceDurationSec != null
                    ? `时长：${voiceDurationSec.toFixed(1)} 秒`
                    : '点击上传（支持常见音频格式）'}
                </p>
              </div>
            </motion.button>

            <input
              ref={voiceInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                void handlePickVoiceFile(e.target.files?.[0] || null);
                e.currentTarget.value = '';
              }}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-secondary mb-1.5 ml-1">音色 ID <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={voiceRefId}
                  onChange={(e) => setVoiceRefId(e.target.value)}
                  placeholder="如 mom_voice_002"
                  className="w-full px-4 py-2.5 rounded-full bg-white/70 border border-white/60 text-on-surface placeholder:text-outline/50 focus:ring-2 focus:ring-primary-container outline-hidden text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-secondary mb-1.5 ml-1">显示名称（可选）</label>
                <input
                  type="text"
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  placeholder="如 奶奶的声音"
                  className="w-full px-4 py-2.5 rounded-full bg-white/70 border border-white/60 text-on-surface placeholder:text-outline/50 focus:ring-2 focus:ring-primary-container outline-hidden text-sm"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void uploadVoiceSample()}
                disabled={uploadingVoice || !voiceFile}
                className="flex-1 py-3 rounded-full dream-gradient text-white text-sm font-bold shadow-md shadow-primary/20 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {uploadingVoice ? '上传中…' : '上传并创建音色'}
              </button>
              {voiceStatusKind === 'ok' && (
                <button
                  type="button"
                  onClick={() => onNavigate('voice-audition')}
                  className="px-5 py-3 rounded-full bg-secondary text-white text-sm font-bold hover:opacity-90 transition-opacity"
                >
                  立即试音
                </button>
              )}
            </div>

            {/* Status */}
            <div className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${statusClass}`}>
              {StatusIcon && (
                <StatusIcon className={`w-4 h-4 mt-0.5 shrink-0 ${voiceStatusKind === 'loading' ? 'animate-spin' : ''}`} />
              )}
              <span>{voiceStatus}</span>
            </div>
          </section>

          {/* Existing Voices */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold font-headline text-primary tracking-tight">已有音色</h3>
              <button
                type="button"
                onClick={() => onNavigate('voice-audition')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:opacity-80 transition-opacity"
              >
                <Headphones className="w-3.5 h-3.5" />
                去试音工坊
              </button>
            </div>
            <div className="flex flex-wrap gap-3">
              {VOICES.map((voice) => (
                <div
                  key={voice.id}
                  className="flex items-center gap-3 px-4 py-2.5 glass-card rounded-full border border-white/60"
                >
                  <img
                    src={voice.avatarUrl}
                    alt={voice.name}
                    referrerPolicy="no-referrer"
                    className="w-8 h-8 rounded-full object-cover border border-white shadow-sm"
                  />
                  <div>
                    <p className="text-sm font-semibold text-on-surface leading-none">{voice.name}</p>
                    <p className="text-[10px] text-secondary/60 mt-0.5">{voice.referenceId}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    voice.status === 'ready' ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {voice.status === 'ready' ? '就绪' : '处理中'}
                  </span>
                </div>
              ))}
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
