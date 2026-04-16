import { motion } from 'motion/react';
import { Clock } from 'lucide-react';
import { Story } from '../types';

interface StoryCardProps {
  key?: string | number;
  story: Story;
  onClick?: () => void;
}

export default function StoryCard({ story, onClick }: StoryCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      onClick={onClick}
      className="group relative aspect-[3/4] rounded-2xl overflow-hidden shadow-md hover:shadow-2xl transition-all cursor-pointer"
    >
      <img
        src={story.imageUrl}
        alt={story.title}
       
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
      />
      <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent" />
      <div className="absolute bottom-0 left-0 p-4 w-full">
        <h4 className="text-white font-bold text-sm truncate">{story.title}</h4>
        <div className="flex items-center gap-1 mt-1 opacity-70">
          <Clock className="w-3 h-3 text-white" />
          <span className="text-[10px] text-white">{story.duration}</span>
        </div>
      </div>
    </motion.div>
  );
}
