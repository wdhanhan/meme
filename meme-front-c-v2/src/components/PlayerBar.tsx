import { motion } from 'motion/react';
import { 
  Shuffle, 
  SkipBack, 
  Pause, 
  Play, 
  SkipForward, 
  Repeat, 
  Mic2, 
  Music, 
  VolumeX, 
  Volume2 
} from 'lucide-react';
import type { TtsPlayerBarState } from '../types';

interface PlayerBarProps {
  /** 有值且 active 时展示 TTS 合成/播放状态，否则为演示内容 */
  tts?: TtsPlayerBarState | null;
  /** 追加到 footer 上的定位类，如 "md:left-72" 用于侧边栏布局 */
  footerClassName?: string;
}

export default function PlayerBar({ tts = null, footerClassName = '' }: PlayerBarProps) {
  const demoTitle = '森林里的小兔与月亮';
  const demoSubtitle = '妈妈的声音';
  const title = tts?.active ? tts.title : demoTitle;
  const subtitle = tts?.active ? tts.subtitle : demoSubtitle;
  const progressPct = tts?.active ? Math.min(100, Math.max(0, tts.progressPct)) : 33;
  const showBusy = tts?.active && tts.isBusy;

  return (
    <footer className={`fixed bottom-0 left-0 right-0 z-50 px-4 md:px-6 pb-4 md:pb-6 ${footerClassName}`}>
      <div className="max-w-7xl mx-auto glass-card rounded-xl p-4 md:p-6 shadow-[0_-10px_40px_rgba(167,41,90,0.1)] flex flex-wrap items-center gap-4 md:gap-8">
        {/* Story Info */}
        <div className="flex items-center gap-4 min-w-[200px] md:min-w-[240px]">
          <div className="w-12 h-12 md:w-14 md:h-14 rounded-lg overflow-hidden shadow-md">
            <img
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuAaRGqxtbg24A64LWjmJXkuuC927zwb0vbK3oqnrUsOo7EGq_UH6nEvVljnsqXavD2B2K8AGfjRQi9tQJHd8ZfzS9wJ1JnQB49Lrz7ZprPcVuB58cId0yUS0pAwEjVvlBbBBHeUNIipIhrPFUAC6_GBU3ki6iwgw9-EjPpR9O862mpHvE7gLQcgmExr8jxjKOVtt8rHA8KycexPvoJFw8PmBI0rZTKalV7J9ziOf8OQHEOPM_9lxLdTb51sKsKjlOCEm5ODknnzCDQ"
              alt="Current Playing"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <h5 className="font-bold text-on-surface truncate max-w-[180px] md:max-w-[240px]" title={title}>
              {title}
            </h5>
            <p
              className="text-xs text-primary font-medium flex items-center gap-1 truncate max-w-[200px] md:max-w-[280px]"
              title={subtitle}
            >
              <Mic2 className="w-3 h-3 fill-primary shrink-0" />
              <span className="truncate">{subtitle}</span>
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex-1 flex flex-col items-center gap-2 order-3 md:order-none w-full md:w-auto">
          <div className="flex items-center gap-4 md:gap-6">
            <button className="text-secondary hover:text-primary transition-colors">
              <Shuffle className="w-4 h-4" />
            </button>
            <button className="text-secondary hover:text-primary transition-colors">
              <SkipBack className="w-6 h-6 fill-current" />
            </button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/30 hover:scale-105 transition-all"
            >
              {tts?.active ? (
                showBusy ? (
                  <Pause className="w-6 h-6 md:w-8 md:h-8 fill-current" />
                ) : (
                  <Play className="w-6 h-6 md:w-8 md:h-8 fill-current pl-0.5" />
                )
              ) : (
                <Pause className="w-6 h-6 md:w-8 md:h-8 fill-current" />
              )}
            </motion.button>
            <button className="text-secondary hover:text-primary transition-colors">
              <SkipForward className="w-6 h-6 fill-current" />
            </button>
            <button className="text-secondary hover:text-primary transition-colors">
              <Repeat className="w-4 h-4" />
            </button>
          </div>
          <div className="w-full max-w-md flex items-center gap-3">
            <span className="text-[10px] text-secondary/60">12:45</span>
            <div className="flex-1 h-1 bg-primary/10 rounded-full relative overflow-hidden">
              <div
                className="absolute left-0 top-0 bottom-0 bg-primary rounded-full transition-[width] duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-[10px] text-secondary/60">34:20</span>
          </div>
        </div>

        {/* Background Music & Volume */}
        <div className="flex items-center gap-4 md:gap-8 ml-auto md:ml-0">
          {/* BG Music Selector */}
          <div className="hidden lg:flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wider font-bold text-secondary/50 ml-2">背景音乐</label>
            <div className="flex gap-2">
              <button className="px-4 py-2 bg-primary/10 text-primary text-xs font-bold rounded-full border border-primary/20">森林雨声</button>
              <button className="px-4 py-2 bg-white/50 text-secondary text-xs font-bold rounded-full hover:bg-white transition-colors">轻柔钢琴</button>
              <button className="px-4 py-2 bg-white/50 text-secondary text-xs font-bold rounded-full hover:bg-white transition-colors">白噪音</button>
            </div>
          </div>

          {/* Music Volume Slider */}
          <div className="flex flex-col gap-1 w-24 md:w-32">
            <label className="text-[10px] uppercase tracking-wider font-bold text-secondary/50 flex items-center gap-1">
              <Music className="w-3 h-3" />
              音乐音量
            </label>
            <div className="flex items-center gap-2">
              <VolumeX className="w-4 h-4 text-secondary/40" />
              <input
                type="range"
                className="w-full accent-primary h-1 bg-primary/10 rounded-full appearance-none cursor-pointer"
              />
              <Volume2 className="w-4 h-4 text-secondary/40" />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
