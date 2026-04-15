import { motion } from 'motion/react';
import { 
  Mic2, 
  BookOpen, 
  Castle, 
  GraduationCap, 
  Library, 
  Heart 
} from 'lucide-react';

interface SidebarProps {
  activeCategory: string;
  onCategoryChange: (category: string) => void;
}

export default function Sidebar({ activeCategory, onCategoryChange }: SidebarProps) {
  const navItems = [
    { id: 'radio', icon: Mic2, label: '情感电台' },
    { id: 'stories', icon: BookOpen, label: '童话故事' },
    { id: 'history', icon: Castle, label: '战争与历史' },
    { id: 'knowledge', icon: GraduationCap, label: '学科知识' },
  ];

  return (
    <aside className="fixed left-0 top-0 w-64 flex flex-col py-8 z-40 bg-white/40 backdrop-blur-2xl rounded-r-[3rem] h-[calc(100vh-2rem)] my-4 ml-4 shadow-2xl shadow-pink-100/50 mt-24">
      <div className="px-8 mb-8">
        <h2 className="text-xl font-black text-primary font-headline mb-1">故事工坊</h2>
        <p className="text-sm text-secondary opacity-70">编织梦境中...</p>
      </div>

      <nav className="flex-1 space-y-2 px-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onCategoryChange(item.id)}
            className={`w-full flex items-center gap-4 py-3 px-6 rounded-full transition-all hover:translate-x-1 active:scale-95 ${
              activeCategory === item.id
                ? 'bg-linear-to-r from-primary to-primary-container text-white shadow-lg shadow-pink-200'
                : 'text-secondary hover:bg-pink-50/50'
            }`}
          >
            <item.icon className="w-5 h-5" />
            <span className="font-medium">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="mt-auto px-4">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full py-4 mb-8 bg-primary text-white rounded-full font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-all"
        >
          开始克隆声音
        </motion.button>
        <div className="space-y-1 pb-4">
          <button className="w-full flex items-center gap-4 py-2 px-6 text-secondary text-sm hover:translate-x-1 transition-transform">
            <Library className="w-4 h-4" />
            <span>音乐馆</span>
          </button>
          <button className="w-full flex items-center gap-4 py-2 px-6 text-secondary text-sm hover:translate-x-1 transition-transform">
            <Heart className="w-4 h-4" />
            <span>我的收藏</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
