import type { ElementType } from 'react';
import {
  Radio,
  BookOpen,
  Castle,
  GraduationCap,
  Headphones,
  Mic2,
  Crown,
  Settings,
  HelpCircle,
} from 'lucide-react';

interface SidebarProps {
  activeCategory: string;
  onCategoryChange: (category: string) => void;
}

const mainNav = [
  { id: 'radio',     icon: Radio,          label: '情感电台' },
  { id: 'stories',   icon: BookOpen,        label: '童话故事' },
  { id: 'history',   icon: Castle,          label: '战争与历史' },
  { id: 'knowledge', icon: GraduationCap,   label: '学科知识' },
];

const featureNav = [
  { id: 'voice-audition', icon: Headphones, label: '试音工坊' },
  { id: 'voice-clone',    icon: Mic2,       label: '声音复刻' },
];

const utilNav = [
  { id: 'pricing',  icon: Crown,       label: '订阅套餐' },
  { id: 'settings', icon: Settings,    label: '账号设置' },
  { id: 'help',     icon: HelpCircle,  label: '使用帮助' },
];

function NavBtn({
  id, icon: Icon, label, active, onClick,
}: { id: string; icon: ElementType; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      key={id}
      onClick={onClick}
      className={`w-full flex items-center gap-3 py-2.5 px-5 rounded-full transition-all hover:translate-x-1 active:scale-95 ${
        active
          ? 'bg-linear-to-r from-primary to-primary-container text-white shadow-lg shadow-pink-200'
          : 'text-secondary hover:bg-pink-50/50'
      }`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="font-medium text-sm">{label}</span>
    </button>
  );
}

export default function Sidebar({ activeCategory, onCategoryChange }: SidebarProps) {
  return (
    <aside className="fixed left-0 top-0 w-64 flex flex-col z-40 bg-white/40 backdrop-blur-2xl rounded-r-[2.5rem] h-[calc(100vh-7rem)] ml-4 mt-24 mb-4 shadow-2xl shadow-pink-100/50">
      <div className="px-7 pt-8 pb-5 shrink-0">
        <h2 className="text-xl font-black text-primary font-headline mb-1">梦幻故事馆</h2>
        <p className="text-sm text-secondary opacity-70">编织每一个梦境…</p>
      </div>

      {/* 主导航（可滚动） */}
      <nav className="flex-1 space-y-1 px-3 overflow-y-auto">
        {mainNav.map((item) => (
          <NavBtn key={item.id} id={item.id} icon={item.icon} label={item.label} active={activeCategory === item.id} onClick={() => onCategoryChange(item.id)} />
        ))}

        <div className="h-px bg-primary/10 my-3 mx-2" />

        {featureNav.map((item) => (
          <NavBtn key={item.id} id={item.id} icon={item.icon} label={item.label} active={activeCategory === item.id} onClick={() => onCategoryChange(item.id)} />
        ))}
      </nav>

      {/* 底部工具（固定，不滚动） */}
      <div className="shrink-0 px-3 pt-3 pb-6 border-t border-primary/10 space-y-1">
        {utilNav.map((item) => (
          <NavBtn key={item.id} id={item.id} icon={item.icon} label={item.label} active={activeCategory === item.id} onClick={() => onCategoryChange(item.id)} />
        ))}
      </div>
    </aside>
  );
}
