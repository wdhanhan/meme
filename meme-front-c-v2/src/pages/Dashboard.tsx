import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Star, CloudRain, Settings, Home, LogIn, CheckCircle2, Mic2, Headphones,
  Bot, Upload, AlertCircle, Loader2, ChevronDown, ChevronUp, PlusCircle,
  Music2, Droplets, Wind, Waves, Moon, Flame, Play, Crown, Shield,
  HelpCircle, MessageCircle, Mail, ChevronRight, Bell, User, BookOpen,
  Castle, GraduationCap,
} from 'lucide-react';
import { Sparkles } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import VoiceCard from '../components/VoiceCard';
import StoryCard from '../components/StoryCard';
import PlayerBar from '../components/PlayerBar';
import PricingCard from '../components/PricingCard';
import TtsWorkshopPanel from '../components/TtsWorkshopPanel';
import { VOICES, STORIES, PRICING_PLANS } from '../constants';
import type { Page, TtsPlayerBarState, Voice } from '../types';

// ─────────────────────────────────────────────────────────
// 情感电台
// ─────────────────────────────────────────────────────────
const ambients = [
  { id: 'rain',    icon: Droplets, label: '森林雨声',  sub: '轻柔降雨 · 环境音',  color: 'from-blue-400 to-cyan-400' },
  { id: 'piano',   icon: Music2,   label: '轻柔钢琴',  sub: '睡前古典 · 舒缓',    color: 'from-purple-400 to-pink-400' },
  { id: 'ocean',   icon: Waves,    label: '海浪声',    sub: '自然海浪 · 冥想',    color: 'from-teal-400 to-blue-400' },
  { id: 'white',   icon: Wind,     label: '白噪音',    sub: '专注屏蔽 · 环境音',  color: 'from-slate-400 to-gray-400' },
  { id: 'fire',    icon: Flame,    label: '壁炉篝火',  sub: '温暖噼啪 · 治愈',    color: 'from-orange-400 to-red-400' },
  { id: 'sleep',   icon: Moon,     label: '深睡引导',  sub: '呼吸音频 · 助眠',    color: 'from-indigo-400 to-violet-400' },
];

const moods = ['好梦模式', '专注模式', '解压放松', '冥想静心'];

function RadioPanel() {
  const [activeMood, setActiveMood] = useState(0);
  const [playing, setPlaying] = useState<string | null>(null);

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-2xl font-bold font-headline text-primary mb-1">情感电台</h2>
        <p className="text-sm text-secondary/70">选择你此刻的心情，让声音陪伴你</p>
      </div>

      {/* 心情横幅 */}
      <div className="glass-card rounded-2xl border border-white/60 p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
        <div className="w-14 h-14 rounded-full dream-gradient flex items-center justify-center text-white shadow-lg shrink-0">
          <Moon className="w-7 h-7" />
        </div>
        <div className="flex-1">
          <p className="text-xs text-secondary/60 font-semibold uppercase tracking-wider mb-2">选择心情</p>
          <div className="flex flex-wrap gap-2">
            {moods.map((m, i) => (
              <button
                key={m}
                onClick={() => setActiveMood(i)}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                  activeMood === i
                    ? 'bg-primary text-white shadow-md shadow-primary/30'
                    : 'bg-white/60 text-secondary hover:bg-white/90'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 环境音卡片 */}
      <div>
        <h3 className="text-lg font-bold font-headline text-primary mb-4">环境音库</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {ambients.map((a) => {
            const isPlaying = playing === a.id;
            return (
              <motion.button
                key={a.id}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setPlaying(isPlaying ? null : a.id)}
                className={`glass-card rounded-2xl p-5 text-left transition-all border-2 ${
                  isPlaying ? 'border-primary shadow-xl shadow-pink-100' : 'border-white/50'
                }`}
              >
                <div className={`w-12 h-12 rounded-full bg-linear-to-br ${a.color} flex items-center justify-center text-white mb-3 shadow-md`}>
                  <a.icon className="w-6 h-6" />
                </div>
                <p className="font-bold text-sm text-on-surface">{a.label}</p>
                <p className="text-xs text-secondary/60 mt-0.5">{a.sub}</p>
                <div className={`mt-3 flex items-center gap-1.5 text-xs font-semibold ${isPlaying ? 'text-primary' : 'text-secondary/50'}`}>
                  {isPlaying ? (
                    <>
                      <span className="w-1.5 h-3 bg-primary rounded-full animate-[bounce_0.6s_ease-in-out_infinite]" />
                      <span className="w-1.5 h-4 bg-primary rounded-full animate-[bounce_0.6s_ease-in-out_0.1s_infinite]" />
                      <span className="w-1.5 h-2 bg-primary rounded-full animate-[bounce_0.6s_ease-in-out_0.2s_infinite]" />
                      <span className="ml-1">播放中</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3" />
                      <span>点击播放</span>
                    </>
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 故事类通用面板（童话 / 历史 / 知识）
// ─────────────────────────────────────────────────────────
interface StoryPanelProps {
  title: string;
  icon: React.FC<{ className?: string }>;
  description: string;
  color: string;
  onGoAudition: () => void;
  voices: Voice[];
  selectedVoiceId: string;
  onVoiceSelect: (id: string) => void;
}

function StoryPanel({
  title, icon: Icon, description, color,
  onGoAudition, voices, selectedVoiceId, onVoiceSelect,
}: StoryPanelProps) {
  const selected = voices.find((v) => v.referenceId === selectedVoiceId) ?? voices[0];

  return (
    <div className="space-y-10">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-full ${color} flex items-center justify-center text-white shadow-lg`}>
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-2xl font-bold font-headline text-primary">{title}</h2>
          <p className="text-sm text-secondary/70">{description}</p>
        </div>
      </div>

      {/* 音色选择 */}
      <div className="glass-card rounded-2xl border border-white/60 p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-secondary uppercase tracking-wider">朗读音色</p>
          <button
            onClick={onGoAudition}
            className="inline-flex items-center gap-1 text-xs text-primary font-semibold hover:opacity-80"
          >
            <Headphones className="w-3.5 h-3.5" />
            去试音
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {voices.map((v) => {
            const isSel = selected?.id === v.id;
            return (
              <button
                key={v.id}
                onClick={() => onVoiceSelect(v.referenceId ?? '')}
                className={`flex items-center gap-2 px-3 py-2 rounded-full border-2 text-sm transition-all ${
                  isSel ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-white/60 bg-white/50 text-on-surface hover:border-primary/30'
                }`}
              >
                {v.avatarUrl ? (
                  <img src={v.avatarUrl} alt={v.name} referrerPolicy="no-referrer" className="w-6 h-6 rounded-full object-cover" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center text-primary text-xs font-bold">{v.name[0]}</div>
                )}
                {v.name}
                {isSel && <CheckCircle2 className="w-3.5 h-3.5" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* 快捷工具 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <motion.div whileHover={{ y: -3 }} className="glass-card p-5 rounded-2xl border-2 border-white/50 flex items-center gap-4 cursor-pointer group">
          <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white shadow-md group-hover:scale-110 transition-transform shrink-0">
            <Bot className="w-6 h-6 fill-current" />
          </div>
          <div>
            <p className="font-bold text-on-surface text-sm">智能推荐</p>
            <p className="text-xs text-secondary/70 mt-0.5">AI 根据时间与情绪自动选故事</p>
          </div>
        </motion.div>
        <motion.button type="button" whileHover={{ y: -3 }} onClick={onGoAudition}
          className="glass-card p-5 rounded-2xl border-2 border-white/50 flex items-center gap-4 text-left cursor-pointer group w-full">
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-white shadow-md group-hover:scale-110 transition-transform shrink-0">
            <Headphones className="w-6 h-6" />
          </div>
          <div>
            <p className="font-bold text-on-surface text-sm">自定义朗读</p>
            <p className="text-xs text-secondary/70 mt-0.5">输入文字，用选定声音朗读出来</p>
          </div>
        </motion.button>
      </div>

      {/* 故事卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {STORIES.map((story) => (
          <StoryCard key={story.id} story={story} />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 试音工坊
// ─────────────────────────────────────────────────────────
interface VoiceAuditionPanelProps {
  voices: Voice[];
  onPlayerChange: (s: TtsPlayerBarState | null) => void;
}

function VoiceAuditionPanel({ voices, onPlayerChange }: VoiceAuditionPanelProps) {
  const [selected, setSelected] = useState<Voice | null>(voices[0] ?? null);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
          <Headphones className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold font-headline text-primary">试音工坊</h2>
          <p className="text-sm text-secondary/70">选择音色，输入文字，即时试听</p>
        </div>
      </div>

      {/* 音色选择 */}
      <section className="glass-card rounded-2xl border border-white/60 p-6">
        <div className="flex items-baseline justify-between mb-5">
          <h3 className="text-base font-bold text-primary">选择试音音色</h3>
          <p className="text-xs text-secondary/60 italic hidden sm:block">点击卡片切换</p>
        </div>
        <div className="flex flex-wrap gap-4">
          {voices.map((v) => (
            <motion.div key={v.id} layout>
              <VoiceCard voice={v} selected={selected?.id === v.id} onClick={() => setSelected(v)} />
            </motion.div>
          ))}
        </div>
        {selected && (
          <p className="mt-3 text-xs text-secondary/70">
            当前：<span className="font-semibold text-primary ml-1">{selected.name}</span>
            <span className="text-outline/60 ml-2">（{selected.referenceId ?? '—'}）</span>
          </p>
        )}
      </section>

      {/* TTS */}
      <TtsWorkshopPanel
        referenceId={selected?.referenceId ?? ''}
        onReferenceIdChange={() => {}}
        onPlayerUiChange={onPlayerChange}
        hideReferenceInput
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 声音复刻
// ─────────────────────────────────────────────────────────
interface VoiceClonePanelProps {
  voices: Voice[];
  onVoiceAdded: (v: Voice) => void;
}

function VoiceClonePanel({ voices, onVoiceAdded }: VoiceClonePanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [refId, setRefId] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState('点击上传区域，选择 10-20 秒音频样本');
  const [kind, setKind] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function authHeaders() {
    const t = localStorage.getItem('memec_auth_token') || '';
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  async function readDuration(f: File): Promise<number> {
    const url = URL.createObjectURL(f);
    try {
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      audio.src = url;
      return await new Promise<number>((res, rej) => {
        audio.onloadedmetadata = () => res(audio.duration);
        audio.onerror = () => rej(new Error('无法解析音频'));
      });
    } finally { URL.revokeObjectURL(url); }
  }

  async function handlePick(f: File | null) {
    if (!f) return;
    if (!f.type.startsWith('audio/')) { setKind('err'); setStatus('请选择音频文件'); return; }
    try {
      const d = await readDuration(f);
      setFile(f); setDuration(d); setKind('ok');
      setStatus(`已选择：${f.name}（${d.toFixed(1)} 秒）`);
    } catch (e) {
      setKind('err'); setStatus(`读取失败：${e instanceof Error ? e.message : String(e)}`);
      setFile(null); setDuration(null);
    }
  }

  async function handleUpload() {
    if (!file) { setKind('err'); setStatus('请先选择音频文件'); return; }
    if (!refId.trim()) { setKind('err'); setStatus('请填写音色 ID'); return; }
    setUploading(true); setKind('loading'); setStatus('上传中…');
    try {
      const form = new FormData();
      form.append('id', refId.trim());
      form.append('text', 'sample');
      form.append('audio', file);
      const resp = await fetch('/api/references/add', { method: 'POST', headers: authHeaders(), body: form });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
      const nv: Voice = { id: `local-${Date.now()}`, name: name.trim() || refId.trim(), avatarUrl: '', status: 'processing', referenceId: refId.trim() };
      onVoiceAdded(nv);
      setKind('ok'); setStatus(`上传成功！音色「${nv.name}」已添加到试音工坊。`);
      setFile(null); setDuration(null); setRefId(''); setName('');
    } catch (e) {
      setKind('err'); setStatus(`上传失败：${e instanceof Error ? e.message : String(e)}`);
    } finally { setUploading(false); }
  }

  const StatusIcon = kind === 'err' ? AlertCircle : kind === 'ok' ? CheckCircle2 : kind === 'loading' ? Loader2 : null;
  const statusCls = kind === 'err' ? 'text-red-600 bg-red-50 border-red-100'
    : kind === 'ok' ? 'text-emerald-700 bg-emerald-50 border-emerald-100'
    : kind === 'loading' ? 'text-primary bg-primary/5 border-primary/15'
    : 'text-secondary/70 bg-white/60 border-white/40';

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
          <Mic2 className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold font-headline text-primary">声音复刻</h2>
          <p className="text-sm text-secondary/70">上传音频样本，一键复刻专属声音</p>
        </div>
      </div>

      {/* 提示 */}
      <div className="glass-card rounded-xl border border-white/60 px-5 py-4 flex items-start gap-3">
        <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <p className="text-sm text-secondary/80 leading-relaxed">
          建议选择 <strong>10-20 秒</strong>的安静录音，音量稳定效果最佳。上传后可前往
          <strong>试音工坊</strong>验证效果。
        </p>
      </div>

      {/* 上传区 */}
      <section className="glass-card p-6 md:p-8 rounded-2xl border-2 border-white/50 space-y-5">
        <h3 className="text-base font-bold text-primary">上传声音样本</h3>
        <motion.button type="button" whileHover={{ scale: 1.005 }} onClick={() => inputRef.current?.click()}
          className={`w-full border-2 border-dashed rounded-xl p-8 flex flex-col items-center space-y-2 transition-colors ${
            file ? 'border-emerald-300 bg-emerald-50/30' : 'border-primary/25 hover:border-primary/45'
          }`}>
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${file ? 'bg-emerald-100 text-emerald-600' : 'bg-primary/10 text-primary'}`}>
            {file ? <CheckCircle2 className="w-6 h-6" /> : <Upload className="w-6 h-6" />}
          </div>
          <p className="font-bold text-sm text-on-surface">{file ? file.name : '点击选择音频文件'}</p>
          <p className="text-xs text-secondary/60">{duration != null ? `时长：${duration.toFixed(1)} 秒` : '支持 mp3 / wav / m4a 等格式'}</p>
        </motion.button>
        <input ref={inputRef} type="file" accept="audio/*" className="hidden"
          onChange={(e) => { void handlePick(e.target.files?.[0] || null); e.currentTarget.value = ''; }} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-secondary mb-1.5 ml-1">音色 ID <span className="text-red-400">*</span></label>
            <input type="text" value={refId} onChange={(e) => setRefId(e.target.value)} placeholder="如 grandma_001"
              className="w-full px-4 py-2.5 rounded-full bg-white/70 border border-white/60 text-sm text-on-surface placeholder:text-outline/50 focus:ring-2 focus:ring-primary-container outline-hidden" />
          </div>
          <div>
            <label className="block text-xs font-bold text-secondary mb-1.5 ml-1">显示名称（可选）</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="如 奶奶的声音"
              className="w-full px-4 py-2.5 rounded-full bg-white/70 border border-white/60 text-sm text-on-surface placeholder:text-outline/50 focus:ring-2 focus:ring-primary-container outline-hidden" />
          </div>
        </div>

        <button type="button" onClick={() => void handleUpload()} disabled={uploading || !file}
          className="w-full py-3 rounded-full dream-gradient text-white text-sm font-bold shadow-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity">
          {uploading ? '上传中…' : '上传并创建音色'}
        </button>

        <div className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-xs ${statusCls}`}>
          {StatusIcon && <StatusIcon className={`w-4 h-4 mt-0.5 shrink-0 ${kind === 'loading' ? 'animate-spin' : ''}`} />}
          <span>{status}</span>
        </div>
      </section>

      {/* 已有音色 */}
      <section className="space-y-4">
        <h3 className="text-base font-bold text-primary">已有音色</h3>
        <div className="flex flex-wrap gap-3">
          {voices.map((v) => (
            <div key={v.id} className="flex items-center gap-3 px-4 py-2.5 glass-card rounded-full border border-white/60">
              {v.avatarUrl ? (
                <img src={v.avatarUrl} alt={v.name} referrerPolicy="no-referrer" className="w-8 h-8 rounded-full object-cover border border-white shadow-sm" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-primary text-sm font-bold">{v.name[0]}</div>
              )}
              <div>
                <p className="text-sm font-semibold text-on-surface leading-none">{v.name}</p>
                <p className="text-[10px] text-secondary/60 mt-0.5">{v.referenceId}</p>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${v.status === 'ready' ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {v.status === 'ready' ? '就绪' : '处理中'}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 订阅套餐
// ─────────────────────────────────────────────────────────
function PricingPanel() {
  return (
    <div className="space-y-10">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-yellow-400 flex items-center justify-center">
          <Crown className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold font-headline text-primary">订阅套餐</h2>
          <p className="text-sm text-secondary/70">选择适合你家庭的梦境守护方案</p>
        </div>
      </div>

      {/* 当前计划提示 */}
      <div className="glass-card rounded-xl border border-white/60 px-5 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Shield className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-on-surface">当前方案：<span className="text-secondary/60 font-normal">免费版</span></p>
          <p className="text-xs text-secondary/60">升级后可解锁全部声音复刻与 AI 故事功能</p>
        </div>
      </div>

      {/* 价格卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-start">
        {PRICING_PLANS.map((plan) => (
          <PricingCard key={plan.id} plan={plan} onJoin={() => {}} />
        ))}
      </div>

      {/* 权益对比简表 */}
      <div className="glass-card rounded-2xl border border-white/60 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/40">
          <h3 className="font-bold text-primary text-sm">权益一览</h3>
        </div>
        {[
          ['声音复刻次数', '每月 1 次', '每月 3 次', '无限次'],
          ['故事库', '50 篇', '全部', '全部'],
          ['AI 智能推荐', '✕', '✓', '✓'],
          ['多设备同步', '✕', '✕', '✓'],
        ].map(([feat, ...vals]) => (
          <div key={feat} className="grid grid-cols-4 px-6 py-3 border-b border-white/20 last:border-0 hover:bg-white/20 transition-colors">
            <span className="text-sm text-secondary/80">{feat}</span>
            {vals.map((v, i) => (
              <span key={i} className={`text-sm text-center ${v === '✕' ? 'text-secondary/40' : 'text-primary font-semibold'}`}>{v}</span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 账号设置
// ─────────────────────────────────────────────────────────
function SettingsPanel() {
  const [notify, setNotify] = useState(true);
  const [autoPlay, setAutoPlay] = useState(false);
  const [slowMode, setSlowMode] = useState(true);

  return (
    <div className="space-y-8 max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Settings className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-bold font-headline text-primary">账号设置</h2>
          <p className="text-sm text-secondary/70">管理你的个人信息与偏好</p>
        </div>
      </div>

      {/* 个人信息 */}
      <section className="glass-card rounded-2xl border border-white/60 p-6 space-y-5">
        <h3 className="font-bold text-sm text-primary uppercase tracking-wider">个人信息</h3>
        <div className="flex items-center gap-5">
          <div className="relative">
            <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-white shadow-md">
              <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuBa-HcTtqncJhNe7PmFxDpOKIdgAJmHe_gN6iHsR3mbyyRiCnY5afaoV5aRzhCDqU1OOF_-TwqXUdwS6Hd0IoQT2YTyq9c1Fxl8U9ci5sYhLtFVB2bxVD-KtMamA_0DYGeV7qKA9Wcx79wdc7zKB87UATRqGryHcFK_LltW4KNCaQ_Y_IVeMzOqjGLa59CviVtNvJ5FRzyn6WX_qWAhPjg4bXGgc1rnmVQ7aayvgLn8OjlICLx_HlqERSgaRo__iiY75ypXjDBGHFc"
                alt="avatar" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
            </div>
            <button className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center shadow-md">
              <PlusCircle className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <label className="block text-xs font-bold text-secondary mb-1">昵称</label>
              <input defaultValue="小星星妈妈" className="w-full px-4 py-2.5 rounded-full bg-white/70 border border-white/60 text-sm text-on-surface focus:ring-2 focus:ring-primary-container outline-hidden" />
            </div>
            <div>
              <label className="block text-xs font-bold text-secondary mb-1">邮箱</label>
              <input defaultValue="mama@example.com" className="w-full px-4 py-2.5 rounded-full bg-white/70 border border-white/60 text-sm text-on-surface focus:ring-2 focus:ring-primary-container outline-hidden" />
            </div>
          </div>
        </div>
        <button className="px-6 py-2.5 rounded-full dream-gradient text-white text-sm font-bold hover:opacity-90 transition-opacity">
          保存更改
        </button>
      </section>

      {/* 应用偏好 */}
      <section className="glass-card rounded-2xl border border-white/60 p-6 space-y-4">
        <h3 className="font-bold text-sm text-primary uppercase tracking-wider">应用偏好</h3>
        {[
          { label: '故事播完后通知', sub: '播放结束时发送提醒', val: notify, set: setNotify, icon: Bell },
          { label: '自动连续播放',   sub: '结束后自动播放下一个', val: autoPlay, set: setAutoPlay, icon: Play },
          { label: '睡前慢速模式',   sub: '默认以 0.85x 语速朗读', val: slowMode, set: setSlowMode, icon: Moon },
        ].map(({ label, sub, val, set, icon: Icon }) => (
          <div key={label} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-on-surface">{label}</p>
                <p className="text-xs text-secondary/60">{sub}</p>
              </div>
            </div>
            <button
              onClick={() => set(!val)}
              className={`relative w-11 h-6 rounded-full transition-colors ${val ? 'bg-primary' : 'bg-secondary/20'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${val ? 'left-5' : 'left-0.5'}`} />
            </button>
          </div>
        ))}
      </section>

      {/* 安全 */}
      <section className="glass-card rounded-2xl border border-white/60 p-6 space-y-3">
        <h3 className="font-bold text-sm text-primary uppercase tracking-wider">安全与隐私</h3>
        {['修改密码', '退出登录', '注销账号'].map((item, i) => (
          <button key={item} className={`w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-white/60 transition-colors ${i === 2 ? 'text-red-500' : 'text-on-surface'}`}>
            <span className="text-sm font-medium">{item}</span>
            <ChevronRight className="w-4 h-4 text-secondary/40" />
          </button>
        ))}
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 使用帮助
// ─────────────────────────────────────────────────────────
const faqs = [
  { q: '如何复刻家人的声音？', a: '进入「声音复刻」，上传 10-20 秒清晰录音，填写音色 ID 后上传即可。建议在安静环境下录制，效果更佳。' },
  { q: '试音的文字有长度限制吗？', a: '单次建议不超过 500 字，过长内容会自动分段合成并顺序播放，体验不受影响。' },
  { q: '上传的声音数据安全吗？', a: '所有音频仅用于声音模型训练，不会对外共享。你可以随时在账号设置中删除已上传的声音。' },
  { q: '为什么合成速度有时较慢？', a: 'AI 合成需要 GPU 计算资源，高峰期可能需要 5-15 秒。开通年度套餐可享受优先队列。' },
];

function HelpPanel() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="space-y-10 max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <HelpCircle className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-bold font-headline text-primary">使用帮助</h2>
          <p className="text-sm text-secondary/70">快速上手，充分体验梦幻庇护所</p>
        </div>
      </div>

      {/* 快速上手 */}
      <section className="space-y-3">
        <h3 className="font-bold text-sm text-primary uppercase tracking-wider">快速上手</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { step: '01', title: '复刻声音', desc: '进入「声音复刻」，上传 10-20 秒录音', icon: Mic2 },
            { step: '02', title: '选择音色', desc: '在故事页或试音工坊选择已复刻的声音', icon: User },
            { step: '03', title: '开始朗读', desc: '选好故事或输入文字，点击播放即可', icon: Play },
          ].map(({ step, title, desc, icon: Icon }) => (
            <div key={step} className="glass-card rounded-2xl border border-white/60 p-5">
              <span className="text-3xl font-black text-primary/10 font-headline leading-none">{step}</span>
              <div className="flex items-center gap-2 mt-2 mb-1">
                <Icon className="w-4 h-4 text-primary" />
                <p className="font-bold text-sm text-on-surface">{title}</p>
              </div>
              <p className="text-xs text-secondary/70 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="space-y-3">
        <h3 className="font-bold text-sm text-primary uppercase tracking-wider">常见问题</h3>
        <div className="space-y-2">
          {faqs.map((faq, i) => (
            <div key={i} className="glass-card rounded-xl border border-white/60 overflow-hidden">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left"
              >
                <span className="text-sm font-semibold text-on-surface">{faq.q}</span>
                {open === i ? <ChevronUp className="w-4 h-4 text-primary/60 shrink-0" /> : <ChevronDown className="w-4 h-4 text-secondary/40 shrink-0" />}
              </button>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <p className="px-5 pb-4 text-sm text-secondary/80 leading-relaxed border-t border-white/40 pt-3">{faq.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </section>

      {/* 联系我们 */}
      <section className="space-y-3">
        <h3 className="font-bold text-sm text-primary uppercase tracking-wider">联系我们</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { icon: Mail,           label: '发送邮件',  sub: 'support@memec.ai' },
            { icon: MessageCircle,  label: '加入社群',  sub: '微信群·用户交流' },
          ].map(({ icon: Icon, label, sub }) => (
            <button key={label} className="glass-card rounded-xl border border-white/60 p-4 flex items-center gap-3 hover:bg-white/60 transition-colors text-left">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-on-surface">{label}</p>
                <p className="text-xs text-secondary/60">{sub}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-secondary/30 ml-auto" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Dashboard 主体
// ─────────────────────────────────────────────────────────
interface DashboardProps {
  onNavigate: (page: Page) => void;
}

export default function Dashboard({ onNavigate: _onNavigate }: DashboardProps) {
  const [activeCategory, setActiveCategory] = useState('stories');
  const [voices, setVoices] = useState<Voice[]>([...VOICES]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(VOICES[0]?.referenceId ?? '');
  const [ttsPlayer, setTtsPlayer] = useState<TtsPlayerBarState | null>(null);

  function renderPanel() {
    switch (activeCategory) {
      case 'radio':
        return <RadioPanel />;
      case 'stories':
        return (
          <StoryPanel
            title="童话故事" icon={BookOpen} color="bg-primary"
            description="经典童话与创意故事，用最爱的声音讲给孩子听"
            onGoAudition={() => setActiveCategory('voice-audition')}
            voices={voices} selectedVoiceId={selectedVoiceId} onVoiceSelect={setSelectedVoiceId}
          />
        );
      case 'history':
        return (
          <StoryPanel
            title="战争与历史" icon={Castle} color="bg-secondary"
            description="波澜壮阔的历史故事，感受时代风云变幻"
            onGoAudition={() => setActiveCategory('voice-audition')}
            voices={voices} selectedVoiceId={selectedVoiceId} onVoiceSelect={setSelectedVoiceId}
          />
        );
      case 'knowledge':
        return (
          <StoryPanel
            title="学科知识" icon={GraduationCap} color="bg-teal-500"
            description="趣味学科故事，让知识在睡前悄悄扎根"
            onGoAudition={() => setActiveCategory('voice-audition')}
            voices={voices} selectedVoiceId={selectedVoiceId} onVoiceSelect={setSelectedVoiceId}
          />
        );
      case 'voice-audition':
        return <VoiceAuditionPanel voices={voices} onPlayerChange={setTtsPlayer} />;
      case 'voice-clone':
        return <VoiceClonePanel voices={voices} onVoiceAdded={(v) => setVoices((prev) => [...prev, v])} />;
      case 'pricing':
        return <PricingPanel />;
      case 'settings':
        return <SettingsPanel />;
      case 'help':
        return <HelpPanel />;
      default:
        return null;
    }
  }

  return (
    <div className="bg-background font-body text-on-background min-h-screen overflow-x-hidden">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-4 md:px-10 h-20 bg-background/80 backdrop-blur-xl shadow-[0_4px_30px_rgba(167,41,90,0.05)]">
        <span className="text-2xl font-bold text-primary drop-shadow-sm font-headline">梦幻粉色庇护所</span>
        <div className="flex items-center gap-3 md:gap-5">
          <div className="h-6 w-px bg-primary/20 hidden sm:block" />
          <button className="text-primary hover:opacity-80 hover:scale-105 transition-all">
            <Star className="w-5 h-5" />
          </button>
          <button className="text-primary hover:opacity-80 hover:scale-105 transition-all">
            <CloudRain className="w-5 h-5" />
          </button>
          <button onClick={() => setActiveCategory('settings')} className="text-primary hover:opacity-80 hover:scale-105 transition-all">
            <Settings className="w-5 h-5" />
          </button>
          <button onClick={() => setActiveCategory('settings')}>
            <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-primary-container">
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBa-HcTtqncJhNe7PmFxDpOKIdgAJmHe_gN6iHsR3mbyyRiCnY5afaoV5aRzhCDqU1OOF_-TwqXUdwS6Hd0IoQT2YTyq9c1Fxl8U9ci5sYhLtFVB2bxVD-KtMamA_0DYGeV7qKA9Wcx79wdc7zKB87UATRqGryHcFK_LltW4KNCaQ_Y_IVeMzOqjGLa59CviVtNvJ5FRzyn6WX_qWAhPjg4bXGgc1rnmVQ7aayvgLn8OjlICLx_HlqERSgaRo__iiY75ypXjDBGHFc"
                alt="User Avatar" referrerPolicy="no-referrer" className="w-full h-full object-cover"
              />
            </div>
          </button>
        </div>
      </header>

      <Sidebar activeCategory={activeCategory} onCategoryChange={setActiveCategory} />

      <main className="ml-0 md:ml-72 pt-28 pb-44 px-6 md:px-10 relative min-h-screen">
        {/* Background blobs */}
        <div className="fixed inset-0 pointer-events-none -z-10">
          <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px]" />
          <div className="absolute bottom-[10%] left-[20%] w-[400px] h-[400px] bg-secondary/5 rounded-full blur-[100px]" />
        </div>

        <div className="max-w-5xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeCategory}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
            >
              {renderPanel()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <PlayerBar tts={ttsPlayer} footerClassName="md:left-72" />
    </div>
  );
}
