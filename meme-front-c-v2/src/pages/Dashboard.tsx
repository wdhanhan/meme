import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { 
  Star, 
  CloudRain, 
  Settings, 
  Upload, 
  PlusCircle, 
  Bot, 
  FileEdit,
  Home,
  LogIn
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import VoiceCard from '../components/VoiceCard';
import StoryCard from '../components/StoryCard';
import PlayerBar from '../components/PlayerBar';
import TtsWorkshopPanel from '../components/TtsWorkshopPanel';
import { VOICES, STORIES } from '../constants';
import type { Page, TtsPlayerBarState } from '../types';

interface DashboardProps {
  onNavigate: (page: Page) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [activeCategory, setActiveCategory] = useState('stories');
  const [ttsReferenceId, setTtsReferenceId] = useState('');
  const [ttsPlayer, setTtsPlayer] = useState<TtsPlayerBarState | null>(null);
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [voiceDurationSec, setVoiceDurationSec] = useState<number | null>(null);
  const [voiceRefId, setVoiceRefId] = useState('');
  const [voiceStatus, setVoiceStatus] = useState('点击卡片选择 10-20 秒音频样本');
  const [voiceStatusKind, setVoiceStatusKind] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const voiceInputRef = useRef<HTMLInputElement | null>(null);

  function scrollToTts() {
    document.getElementById('tts-workshop')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      // 后端要求 text 字段，前端固定给占位值即可。
      form.append('text', 'sample');
      form.append('audio', voiceFile);
      const resp = await fetch('/api/references/add', {
        method: 'POST',
        body: form,
      });
      const body = await resp.text();
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${body || '上传失败'}`);
      }
      setVoiceStatusKind('ok');
      setVoiceStatus('上传成功，已可用于复刻。');
      setTtsReferenceId(voiceRefId.trim());
    } catch (e) {
      setVoiceStatusKind('err');
      setVoiceStatus(`上传失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setUploadingVoice(false);
    }
  }

  return (
    <div className="bg-background font-body text-on-background min-h-screen overflow-x-hidden">
      {/* Top Bar */}
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-4 md:px-10 h-20 bg-background/80 backdrop-blur-xl shadow-[0_4px_30px_rgba(167,41,90,0.05)]">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-primary drop-shadow-sm font-headline">梦幻粉色庇护所</span>
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
          <div className="h-6 w-px bg-primary/20 mx-2 hidden sm:block" />
          <button className="text-primary hover:opacity-80 hover:scale-105 transition-all">
            <Star className="w-6 h-6" />
          </button>
          <button className="text-primary hover:opacity-80 hover:scale-105 transition-all">
            <CloudRain className="w-6 h-6" />
          </button>
          <button className="text-primary hover:opacity-80 hover:scale-105 transition-all">
            <Settings className="w-6 h-6" />
          </button>
          <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-primary-container">
            <img
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuBa-HcTtqncJhNe7PmFxDpOKIdgAJmHe_gN6iHsR3mbyyRiCnY5afaoV5aRzhCDqU1OOF_-TwqXUdwS6Hd0IoQT2YTyq9c1Fxl8U9ci5sYhLtFVB2bxVD-KtMamA_0DYGeV7qKA9Wcx79wdc7zKB87UATRqGryHcFK_LltW4KNCaQ_Y_IVeMzOqjGLa59CviVtNvJ5FRzyn6WX_qWAhPjg4bXGgc1rnmVQ7aayvgLn8OjlICLx_HlqERSgaRo__iiY75ypXjDBGHFc"
              alt="User Avatar"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </header>

      <Sidebar activeCategory={activeCategory} onCategoryChange={setActiveCategory} />

      <main className="ml-0 md:ml-72 pt-32 pb-48 px-6 md:px-12 relative min-h-screen">
        {/* Ethereal Background Elements */}
        <div className="fixed inset-0 pointer-events-none -z-10">
          <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px]" />
          <div className="absolute bottom-[10%] left-[20%] w-[400px] h-[400px] bg-secondary/5 rounded-full blur-[100px]" />
        </div>

        <div className="max-w-6xl mx-auto space-y-16">
          {/* Section 1: Voice Cloning */}
          <section>
            <div className="flex items-baseline justify-between mb-8">
              <h3 className="text-2xl font-bold font-headline text-primary tracking-tight">声音复刻</h3>
              <p className="text-secondary/60 text-sm italic hidden sm:block">用熟悉的声音，编织最温暖的梦境</p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Upload Area */}
              <motion.button
                type="button"
                whileHover={{ scale: 1.02 }}
                onClick={() => voiceInputRef.current?.click()}
                className="lg:col-span-1 glass-card p-8 rounded-xl border-2 border-white/50 flex flex-col items-center justify-center text-center space-y-4 hover:border-primary/20 transition-colors group cursor-pointer w-full"
              >
                <div className="w-16 h-16 rounded-full bg-primary-container/20 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                  <Upload className="w-8 h-8" />
                </div>
                <div>
                  <h4 className="font-bold text-on-surface">上传声音样本</h4>
                  <p className="text-xs text-secondary/70 mt-1">点击选择音频并上传（10-20 秒）</p>
                </div>
              </motion.button>

              {/* Cloned Voices List */}
              <div className="lg:col-span-2 flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                {VOICES.map((voice) => (
                  <VoiceCard
                    key={voice.id}
                    voice={voice}
                    onClick={() => {
                      setTtsReferenceId(voice.referenceId ?? '');
                      scrollToTts();
                    }}
                  />
                ))}
                <button className="flex-shrink-0 w-48 border-2 border-dashed border-primary/20 rounded-xl flex flex-col items-center justify-center space-y-2 text-primary/40 hover:text-primary hover:border-primary transition-all group">
                  <PlusCircle className="w-8 h-8 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-bold">新增克隆</span>
                </button>
              </div>
            </div>
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
            <div className="mt-5 glass-card rounded-xl border border-white/60 p-4 md:p-5 space-y-3">
              <div className="grid grid-cols-1 gap-3">
                <input
                  type="text"
                  value={voiceRefId}
                  onChange={(e) => setVoiceRefId(e.target.value)}
                  placeholder="请输入这个音色的名字（用于音色 ID）"
                  className="px-4 py-2.5 rounded-full bg-white/70 border border-white/60 text-on-surface placeholder:text-outline/50 focus:ring-2 focus:ring-primary-container outline-hidden"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => voiceInputRef.current?.click()}
                  className="px-4 py-2 rounded-full border border-primary/25 text-primary text-sm font-semibold hover:bg-primary/5 transition-colors"
                >
                  重新选择音频
                </button>
                <button
                  type="button"
                  onClick={() => void uploadVoiceSample()}
                  disabled={uploadingVoice || !voiceFile}
                  className="px-5 py-2 rounded-full bg-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                >
                  {uploadingVoice ? '上传中…' : '上传声音样本'}
                </button>
                {voiceDurationSec !== null && (
                  <span className="text-xs text-secondary/75">当前音频：{voiceDurationSec.toFixed(1)} 秒</span>
                )}
              </div>
              <p
                className={`text-xs ${
                  voiceStatusKind === 'err'
                    ? 'text-red-600'
                    : voiceStatusKind === 'ok'
                      ? 'text-emerald-600'
                      : voiceStatusKind === 'loading'
                        ? 'text-primary'
                        : 'text-secondary/70'
                }`}
              >
                {voiceStatus}
              </p>
            </div>
          </section>

          {/* Section 2: Story Workshop */}
          <section>
            <div className="flex items-baseline justify-between mb-8">
              <h3 className="text-2xl font-bold font-headline text-primary tracking-tight">故事工坊</h3>
              <div className="flex gap-2">
                <span className="w-2 h-2 rounded-full bg-primary" />
                <span className="w-2 h-2 rounded-full bg-primary/40" />
                <span className="w-2 h-2 rounded-full bg-primary/20" />
              </div>
            </div>

            {/* Workshop Tools */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
              <motion.div 
                whileHover={{ y: -4 }}
                className="glass-card p-6 rounded-2xl border-2 border-white/50 flex items-center gap-6 hover:shadow-xl transition-all cursor-pointer group"
              >
                <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform">
                  <Bot className="w-8 h-8 fill-current" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-on-surface">自动播放</h4>
                  <p className="text-sm text-secondary/70">AI智能推荐最适合此刻心情的故事</p>
                </div>
              </motion.div>
              <motion.button
                type="button"
                whileHover={{ y: -4 }}
                onClick={() => scrollToTts()}
                className="glass-card p-6 rounded-2xl border-2 border-white/50 flex items-center gap-6 hover:shadow-xl transition-all cursor-pointer group text-left w-full"
              >
                <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform shrink-0">
                  <FileEdit className="w-8 h-8 fill-current" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-on-surface">自定义朗读</h4>
                  <p className="text-sm text-secondary/70">输入文字，用指定的声音为您读出来（已接入后端多段流式合成）</p>
                </div>
              </motion.button>
            </div>

            <div className="mb-12">
              <TtsWorkshopPanel
                referenceId={ttsReferenceId}
                onReferenceIdChange={setTtsReferenceId}
                onPlayerUiChange={setTtsPlayer}
              />
            </div>

            {/* Fairy Tale Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
              {STORIES.map((story) => (
                <StoryCard key={story.id} story={story} />
              ))}
            </div>
          </section>
        </div>
      </main>

      <PlayerBar tts={ttsPlayer} />
    </div>
  );
}
