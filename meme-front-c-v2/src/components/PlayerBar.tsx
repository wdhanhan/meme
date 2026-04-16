import { motion } from 'motion/react';
import {
  Shuffle, SkipBack, Pause, Play, SkipForward, Repeat,
  Mic2, Music, VolumeX, Volume2,
} from 'lucide-react';
import type { TtsPlayerBarState } from '../types';

interface PlayerBarProps {
  tts?: TtsPlayerBarState | null;
  /** 追加到 footer 的定位类，如 "md:left-72" */
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
    <footer className={`fixed bottom-0 left-0 right-0 z-50 px-3 md:px-6 pb-3 md:pb-5 ${footerClassName}`}>
      <div className="max-w-7xl mx-auto glass-card rounded-xl px-4 py-3 md:px-6 md:py-4 shadow-[0_-10px_40px_rgba(167,41,90,0.1)]">

        {/* ── 移动端：紧凑单行 ───────────────────────── */}
        <div className="flex items-center gap-3 md:hidden">
          {/* 封面 + 标题 */}
          <div className="w-10 h-10 rounded-lg overflow-hidden shadow-md shrink-0">
            <img
              src="/assets/player-art.jpg"
              alt="Playing" className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-on-surface truncate" title={title}>{title}</p>
            <p className="text-xs text-primary font-medium flex items-center gap-1 truncate">
              <Mic2 className="w-3 h-3 fill-primary shrink-0" />
              <span className="truncate">{subtitle}</span>
            </p>
            {/* 进度条 */}
            <div className="mt-1.5 h-1 bg-primary/10 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
          {/* 播放/暂停按钮 */}
          <motion.button type="button" whileTap={{ scale: 0.9 }}
            className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center shadow-md shrink-0">
            {tts?.active ? (
              showBusy
                ? <Pause className="w-5 h-5 fill-current" />
                : <Play className="w-5 h-5 fill-current pl-0.5" />
            ) : (
              <Pause className="w-5 h-5 fill-current" />
            )}
          </motion.button>
        </div>

        {/* ── 桌面端：完整布局 ───────────────────────── */}
        <div className="hidden md:flex items-center gap-8">
          {/* 封面 + 标题 */}
          <div className="flex items-center gap-4 min-w-[240px]">
            <div className="w-14 h-14 rounded-lg overflow-hidden shadow-md shrink-0">
              <img
                src="/assets/player-art.jpg"
                alt="Playing" className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <h5 className="font-bold text-on-surface truncate max-w-[200px]" title={title}>{title}</h5>
              <p className="text-xs text-primary font-medium flex items-center gap-1 truncate max-w-[240px]" title={subtitle}>
                <Mic2 className="w-3 h-3 fill-primary shrink-0" />
                <span className="truncate">{subtitle}</span>
              </p>
            </div>
          </div>

          {/* 播放控制 + 进度 */}
          <div className="flex-1 flex flex-col items-center gap-2">
            <div className="flex items-center gap-5">
              <button className="text-secondary hover:text-primary transition-colors"><Shuffle className="w-4 h-4" /></button>
              <button className="text-secondary hover:text-primary transition-colors"><SkipBack className="w-6 h-6 fill-current" /></button>
              <motion.button type="button" whileTap={{ scale: 0.9 }}
                className="w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/30 hover:scale-105 transition-all">
                {tts?.active ? (
                  showBusy
                    ? <Pause className="w-8 h-8 fill-current" />
                    : <Play className="w-8 h-8 fill-current pl-0.5" />
                ) : (
                  <Pause className="w-8 h-8 fill-current" />
                )}
              </motion.button>
              <button className="text-secondary hover:text-primary transition-colors"><SkipForward className="w-6 h-6 fill-current" /></button>
              <button className="text-secondary hover:text-primary transition-colors"><Repeat className="w-4 h-4" /></button>
            </div>
            <div className="w-full max-w-md flex items-center gap-3">
              <span className="text-[10px] text-secondary/60">12:45</span>
              <div className="flex-1 h-1 bg-primary/10 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-[width] duration-300" style={{ width: `${progressPct}%` }} />
              </div>
              <span className="text-[10px] text-secondary/60">34:20</span>
            </div>
          </div>

          {/* 背景音乐 + 音量 */}
          <div className="flex items-center gap-6 ml-auto">
            <div className="hidden lg:flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider font-bold text-secondary/50 ml-2">背景音乐</label>
              <div className="flex gap-2">
                <button className="px-3 py-1.5 bg-primary/10 text-primary text-xs font-bold rounded-full border border-primary/20">森林雨声</button>
                <button className="px-3 py-1.5 bg-white/50 text-secondary text-xs font-bold rounded-full hover:bg-white transition-colors">钢琴</button>
                <button className="px-3 py-1.5 bg-white/50 text-secondary text-xs font-bold rounded-full hover:bg-white transition-colors">白噪音</button>
              </div>
            </div>
            <div className="flex flex-col gap-1 w-28">
              <label className="text-[10px] uppercase tracking-wider font-bold text-secondary/50 flex items-center gap-1">
                <Music className="w-3 h-3" />音量
              </label>
              <div className="flex items-center gap-2">
                <VolumeX className="w-4 h-4 text-secondary/40" />
                <input type="range" className="w-full accent-primary h-1 rounded-full cursor-pointer" />
                <Volume2 className="w-4 h-4 text-secondary/40" />
              </div>
            </div>
          </div>
        </div>

      </div>
    </footer>
  );
}
