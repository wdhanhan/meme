import {
  Mic2,
  BookOpen,
  Castle,
  GraduationCap,
  Headphones,
  Crown,
  Settings,
  HelpCircle,
} from 'lucide-react';

interface SidebarProps {
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  onStartVoiceClone?: () => void;
  onStartAudition?: () => void;
}

export default function Sidebar({ activeCategory, onCategoryChange, onStartVoiceClone, onStartAudition }: SidebarProps) {
  const navItems = [
    { id: 'radio', icon: Mic2, label: '情感电台' },
    { id: 'stories', icon: BookOpen, label: '童话故事' },
    { id: 'history', icon: Castle, label: '战争与历史' },
    { id: 'knowledge', icon: GraduationCap, label: '学科知识' },
  ];

  return (
    <aside className="fixed left-0 top-0 w-64 flex flex-col py-8 z-40 bg-white/40 backdrop-blur-2xl rounded-r-[2.5rem] h-[calc(100vh-2rem)] my-4 ml-4 shadow-2xl shadow-pink-100/50 mt-24">
      <div className="px-7 mb-6">
        <h2 className="text-xl font-black text-primary font-headline mb-1">梦幻故事馆</h2>
        <p className="text-sm text-secondary opacity-70">编织每一个梦境…</p>
      </div>

      {/* 主导航 */}
      <nav className="flex-1 space-y-1 px-3 overflow-y-auto">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onCategoryChange(item.id)}
            className={`w-full flex items-center gap-3 py-2.5 px-5 rounded-full transition-all hover:translate-x-1 active:scale-95 ${
              activeCategory === item.id
                ? 'bg-linear-to-r from-primary to-primary-container text-white shadow-lg shadow-pink-200'
                : 'text-secondary hover:bg-pink-50/50'
            }`}
          >
            <item.icon className="w-4 h-4 shrink-0" />
            <span className="font-medium text-sm">{item.label}</span>
          </button>
        ))}

        <div className="h-px bg-primary/10 my-3 mx-2" />

        {/* 功能入口 */}
        <button
          onClick={onStartAudition}
          className="w-full flex items-center gap-3 py-2.5 px-5 rounded-full transition-all hover:translate-x-1 active:scale-95 text-secondary hover:bg-pink-50/50"
        >
          <Headphones className="w-4 h-4 shrink-0" />
          <span className="font-medium text-sm">试音工坊</span>
        </button>

        <button
          onClick={onStartVoiceClone}
          className="w-full flex items-center gap-3 py-2.5 px-5 rounded-full transition-all hover:translate-x-1 active:scale-95 text-secondary hover:bg-pink-50/50"
        >
          <Mic2 className="w-4 h-4 shrink-0" />
          <span className="font-medium text-sm">声音复刻</span>
        </button>
      </nav>

      {/* 底部工具 */}
      <div className="px-3 mt-4 pb-4 space-y-1 border-t border-primary/10 pt-4">
        <button className="w-full flex items-center gap-3 py-2.5 px-5 rounded-full text-secondary hover:bg-pink-50/50 hover:text-primary transition-all hover:translate-x-1">
          <Crown className="w-4 h-4 shrink-0 text-yellow-500" />
          <span className="text-sm font-medium">订阅套餐</span>
        </button>
        <button className="w-full flex items-center gap-3 py-2.5 px-5 rounded-full text-secondary hover:bg-pink-50/50 hover:text-primary transition-all hover:translate-x-1">
          <Settings className="w-4 h-4 shrink-0" />
          <span className="text-sm font-medium">账号设置</span>
        </button>
        <button className="w-full flex items-center gap-3 py-2.5 px-5 rounded-full text-secondary hover:bg-pink-50/50 hover:text-primary transition-all hover:translate-x-1">
          <HelpCircle className="w-4 h-4 shrink-0" />
          <span className="text-sm font-medium">使用帮助</span>
        </button>
      </div>
    </aside>
  );
}
