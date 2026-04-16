import { motion } from 'motion/react';
import { Voice } from '../types';

interface VoiceCardProps {
  key?: string | number;
  voice: Voice;
  onClick?: () => void;
  selected?: boolean;
}

export default function VoiceCard({ voice, onClick, selected }: VoiceCardProps) {
  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.02 }}
      onClick={onClick}
      className={`flex-shrink-0 w-36 sm:w-44 glass-card p-4 sm:p-5 rounded-xl flex flex-col items-center space-y-2 sm:space-y-3 transition-all cursor-pointer ${
        selected
          ? 'border-2 border-primary shadow-xl shadow-pink-200 bg-primary/5'
          : 'hover:shadow-xl hover:shadow-pink-100'
      }`}
    >
      <div className="relative">
        {voice.avatarUrl ? (
          <img
            src={voice.avatarUrl}
            alt={voice.name}
           
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-4 border-white shadow-sm"
          />
        ) : (
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-4 border-white shadow-sm bg-primary/15 flex items-center justify-center text-primary text-xl sm:text-2xl font-bold">
            {voice.name.slice(0, 1)}
          </div>
        )}
        {voice.status === 'ready' && (
          <div className="absolute bottom-0 right-0 w-6 h-6 bg-green-400 border-2 border-white rounded-full" />
        )}
        {voice.status === 'processing' && (
          <div className="absolute bottom-0 right-0 w-6 h-6 bg-yellow-400 border-2 border-white rounded-full animate-pulse" />
        )}
      </div>
      <span className="font-semibold text-on-surface">{voice.name}</span>
      <span className="text-[10px] px-2 py-1 bg-primary/10 text-primary rounded-full uppercase tracking-widest font-bold">
        {voice.status === 'ready' ? '已就绪' : '处理中'}
      </span>
    </motion.div>
  );
}
