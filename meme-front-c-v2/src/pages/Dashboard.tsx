import { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Star, 
  CloudRain, 
  Settings, 
  Bot, 
  FileEdit,
  Home,
  LogIn,
  PlusCircle
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

  function scrollToTts() {
    document.getElementById('tts-workshop')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

      <Sidebar
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        onStartVoiceClone={() => onNavigate('voice-clone')}
      />

      <main className="ml-0 md:ml-72 pt-32 pb-48 px-6 md:px-12 relative min-h-screen">
        {/* Ethereal Background Elements */}
        <div className="fixed inset-0 pointer-events-none -z-10">
          <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px]" />
          <div className="absolute bottom-[10%] left-[20%] w-[400px] h-[400px] bg-secondary/5 rounded-full blur-[100px]" />
        </div>

        <div className="max-w-6xl mx-auto space-y-16">
          {/* Section 1: Voice Selection */}
          <section>
            <div className="flex items-baseline justify-between mb-8">
              <h3 className="text-2xl font-bold font-headline text-primary tracking-tight">选择音色</h3>
              <p className="text-secondary/60 text-sm italic hidden sm:block">复刻入口已独立为单独页面</p>
            </div>
            <div className="glass-card rounded-xl border border-white/60 p-4 md:p-5 space-y-5">
              <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
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
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-secondary/75">
                  当前用于朗读的参考音色 ID：
                  <span className="font-semibold text-primary ml-1">{ttsReferenceId || '未选择（将使用系统默认）'}</span>
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('voice-clone')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  <PlusCircle className="w-4 h-4" />
                  去声音复刻页
                </button>
              </div>
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
