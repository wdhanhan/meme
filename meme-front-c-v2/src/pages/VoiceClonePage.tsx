import { useRef, useState } from 'react';
import { ArrowLeft, Home, LogIn, Upload } from 'lucide-react';
import { motion } from 'motion/react';
import VoiceCard from '../components/VoiceCard';
import { VOICES } from '../constants';
import type { Page } from '../types';

interface VoiceClonePageProps {
  onNavigate: (page: Page) => void;
}

export default function VoiceClonePage({ onNavigate }: VoiceClonePageProps) {
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [voiceDurationSec, setVoiceDurationSec] = useState<number | null>(null);
  const [voiceRefId, setVoiceRefId] = useState('');
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
      if (!Number.isFinite(duration) || duration <= 0) {
        throw new Error('音频时长无效');
      }
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
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${body || '上传失败'}`);
      }
      setVoiceStatusKind('ok');
      setVoiceStatus(`上传成功，音色 ID：${voiceRefId.trim()}`);
    } catch (e) {
      setVoiceStatusKind('err');
      setVoiceStatus(`上传失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setUploadingVoice(false);
    }
  }

  const statusClass =
    voiceStatusKind === 'err'
      ? 'text-red-600'
      : voiceStatusKind === 'ok'
        ? 'text-emerald-600'
        : voiceStatusKind === 'loading'
          ? 'text-primary'
          : 'text-secondary/70';

  return (
    <div className="bg-background font-body text-on-background min-h-screen overflow-x-hidden">
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
          <span className="text-2xl font-bold text-primary drop-shadow-sm font-headline">声音复刻</span>
        </div>
        <div className="flex items-center gap-4 md:gap-6">
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

      <main className="pt-28 pb-16 px-6 md:px-12 relative min-h-screen">
        <div className="max-w-5xl mx-auto space-y-8">
          <section className="glass-card p-6 md:p-8 rounded-2xl border-2 border-white/50 space-y-5">
            <div className="flex items-baseline justify-between">
              <h3 className="text-2xl font-bold font-headline text-primary tracking-tight">上传声音样本</h3>
              <p className="text-secondary/60 text-sm italic hidden sm:block">建议 10-20 秒，环境安静、音量稳定</p>
            </div>

            <motion.button
              type="button"
              whileHover={{ scale: 1.01 }}
              onClick={() => voiceInputRef.current?.click()}
              className="w-full border-2 border-dashed border-primary/25 rounded-xl p-8 flex flex-col items-center justify-center text-center space-y-3 hover:border-primary/45 transition-colors"
            >
              <div className="w-14 h-14 rounded-full bg-primary-container/20 flex items-center justify-center text-primary">
                <Upload className="w-7 h-7" />
              </div>
              <div>
                <h4 className="font-bold text-on-surface">选择音频文件</h4>
                <p className="text-xs text-secondary/70 mt-1">点击上传（支持常见音频格式）</p>
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

            <div className="grid grid-cols-1 gap-3">
              <input
                type="text"
                value={voiceRefId}
                onChange={(e) => setVoiceRefId(e.target.value)}
                placeholder="请输入音色 ID（如 mom_voice_002）"
                className="px-4 py-2.5 rounded-full bg-white/70 border border-white/60 text-on-surface placeholder:text-outline/50 focus:ring-2 focus:ring-primary-container outline-hidden"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void uploadVoiceSample()}
                disabled={uploadingVoice || !voiceFile}
                className="px-5 py-2 rounded-full bg-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {uploadingVoice ? '上传中…' : '上传并创建音色'}
              </button>
              {voiceDurationSec !== null && (
                <span className="text-xs text-secondary/75">当前音频时长：{voiceDurationSec.toFixed(1)} 秒</span>
              )}
            </div>
            <p className={`text-xs ${statusClass}`}>{voiceStatus}</p>
          </section>

          <section className="space-y-4">
            <h3 className="text-xl font-bold font-headline text-primary tracking-tight">当前可选音色</h3>
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
              {VOICES.map((voice) => (
                <VoiceCard key={voice.id} voice={voice} />
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
