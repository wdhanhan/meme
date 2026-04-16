import { useState } from 'react';
import { motion } from 'motion/react';
import {
  Star,
  CloudRain,
  Settings,
  Bot,
  Headphones,
  Home,
  LogIn,
  PlusCircle,
  CheckCircle2,
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import StoryCard from '../components/StoryCard';
import PlayerBar from '../components/PlayerBar';
import { VOICES, STORIES } from '../constants';
import type { Page } from '../types';

interface DashboardProps {
  onNavigate: (page: Page) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [activeCategory, setActiveCategory] = useState('stories');
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(
    VOICES[0]?.referenceId ?? ''
  );

  const selectedVoice = VOICES.find((v) => v.referenceId === selectedVoiceId) ?? VOICES[0];

  return (
    <div className="bg-background font-body text-on-background min-h-screen overflow-x-hidden">
      {/* Top Bar */}
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-4 md:px-10 h-20 bg-background/80 backdrop-blur-xl shadow-[0_4px_30px_rgba(167,41,90,0.05)]">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-primary drop-shadow-sm font-headline">梦幻粉色庇护所</span>
        </div>
        <div className="flex items-center gap-3 md:gap-5">
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
          <div className="h-6 w-px bg-primary/20 hidden sm:block" />
          <button className="text-primary hover:opacity-80 hover:scale-105 transition-all">
            <Star className="w-5 h-5" />
          </button>
          <button className="text-primary hover:opacity-80 hover:scale-105 transition-all">
            <CloudRain className="w-5 h-5" />
          </button>
          <button className="text-primary hover:opacity-80 hover:scale-105 transition-all">
            <Settings className="w-5 h-5" />
          </button>
          <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-primary-container">
            <img
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuBa-HcTtqncJhNe7PmFxDpOKIdgAJmHe_gN6iHsR3mbyyRiCnY5afaoV5aRzhCDqU1OOF_-TwqXUdwS6Hd0IoQT2YTyq9c1Fxl8U9ci5sYhLtFVB2bxVD-KtMamA_0DYGeV7qKA9Wcx79wdc7zKB87UATRqGryHcFK_LltW4KNCaQ_Y_IVeMzOqjGLa59CviVtNvJ5FRzyn6WX_qWAhPjg4bXGgc1rnmVQ7aayvgLn8OjlICLx_HlqERSgaRo__iiY75ypXjDBGHFc"
              alt="User Avatar"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </header>

      <Sidebar
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        onStartVoiceClone={() => onNavigate('voice-clone')}
        onStartAudition={() => onNavigate('voice-audition')}
      />

      <main className="ml-0 md:ml-72 pt-28 pb-48 px-6 md:px-10 relative min-h-screen">
        {/* Ethereal Background */}
        <div className="fixed inset-0 pointer-events-none -z-10">
          <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px]" />
          <div className="absolute bottom-[10%] left-[20%] w-[400px] h-[400px] bg-secondary/5 rounded-full blur-[100px]" />
        </div>

        <div className="max-w-5xl mx-auto space-y-12">

          {/* ── 音色选择 ─────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold font-headline text-primary tracking-tight">当前音色</h3>
              <button
                type="button"
                onClick={() => onNavigate('voice-clone')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:opacity-80 transition-opacity"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                添加声音
              </button>
            </div>

            <div className="glass-card rounded-2xl border border-white/60 p-5">
              {/* Compact Voice Row */}
              <div className="flex flex-wrap gap-3">
                {VOICES.map((voice) => {
                  const isSelected = selectedVoice?.id === voice.id;
                  return (
                    <button
                      key={voice.id}
                      type="button"
                      onClick={() => setSelectedVoiceId(voice.referenceId ?? '')}
                      className={`flex items-center gap-3 px-4 py-2.5 rounded-full border-2 transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/10 shadow-md shadow-pink-100'
                          : 'border-white/60 bg-white/50 hover:border-primary/30 hover:bg-white/70'
                      }`}
                    >
                      <img
                        src={voice.avatarUrl}
                        alt={voice.name}
                        referrerPolicy="no-referrer"
                        className="w-8 h-8 rounded-full object-cover border border-white shadow-sm"
                      />
                      <span className={`text-sm font-semibold ${isSelected ? 'text-primary' : 'text-on-surface'}`}>
                        {voice.name}
                      </span>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-primary" />}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-secondary/70">
                  已选：
                  <span className="font-semibold text-primary ml-1">
                    {selectedVoice?.name ?? '未选择（系统默认）'}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('voice-audition')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-white text-xs font-semibold hover:opacity-90 transition-opacity shadow-sm"
                >
                  <Headphones className="w-3.5 h-3.5" />
                  用此音色试音
                </button>
              </div>
            </div>
          </section>

          {/* ── 故事工坊 ─────────────────────────── */}
          <section>
            <div className="flex items-baseline justify-between mb-6">
              <h3 className="text-xl font-bold font-headline text-primary tracking-tight">故事工坊</h3>
              <div className="flex gap-2">
                <span className="w-2 h-2 rounded-full bg-primary" />
                <span className="w-2 h-2 rounded-full bg-primary/40" />
                <span className="w-2 h-2 rounded-full bg-primary/20" />
              </div>
            </div>

            {/* Workshop Tool Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-10">
              <motion.div
                whileHover={{ y: -3 }}
                className="glass-card p-5 rounded-2xl border-2 border-white/50 flex items-center gap-5 hover:shadow-xl transition-all cursor-pointer group"
              >
                <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform shrink-0">
                  <Bot className="w-7 h-7 fill-current" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-on-surface">自动播放</h4>
                  <p className="text-sm text-secondary/70 mt-0.5">AI 智能推荐最适合此刻心情的故事</p>
                </div>
              </motion.div>

              <motion.button
                type="button"
                whileHover={{ y: -3 }}
                onClick={() => onNavigate('voice-audition')}
                className="glass-card p-5 rounded-2xl border-2 border-white/50 flex items-center gap-5 hover:shadow-xl transition-all cursor-pointer group text-left w-full"
              >
                <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform shrink-0">
                  <Headphones className="w-7 h-7" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-on-surface">自定义朗读</h4>
                  <p className="text-sm text-secondary/70 mt-0.5">输入文字，用选定的声音朗读出来</p>
                </div>
              </motion.button>
            </div>

            {/* Story Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5">
              {STORIES.map((story) => (
                <StoryCard key={story.id} story={story} />
              ))}
            </div>
          </section>
        </div>
      </main>

      <PlayerBar footerClassName="md:left-72" />
    </div>
  );
}
