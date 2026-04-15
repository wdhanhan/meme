import { motion } from 'motion/react';
import { Voice } from '../types';

interface VoiceCardProps {
  key?: string | number;
  voice: Voice;
  onClick?: () => void;
}

export default function VoiceCard({ voice, onClick }: VoiceCardProps) {
  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.02 }}
      onClick={onClick}
      className="flex-shrink-0 w-48 glass-card p-6 rounded-xl flex flex-col items-center space-y-3 hover:shadow-xl hover:shadow-pink-100 transition-all cursor-pointer"
    >
      <div className="relative">
        <img
          src={voice.avatarUrl}
          alt={voice.name}
          referrerPolicy="no-referrer"
          className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-sm"
        />
        {voice.status === 'ready' && (
          <div className="absolute bottom-0 right-0 w-6 h-6 bg-green-400 border-2 border-white rounded-full" />
        )}
      </div>
      <span className="font-semibold text-on-surface">{voice.name}</span>
      <span className="text-[10px] px-2 py-1 bg-primary/10 text-primary rounded-full uppercase tracking-widest font-bold">
        {voice.status === 'ready' ? '已就绪' : '处理中'}
      </span>
    </motion.div>
  );
}
