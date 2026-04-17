import { X } from 'lucide-react';
import type { ElementType } from 'react';
import {
  Radio, BookOpen, Castle, GraduationCap,
  Headphones, Mic2, Layers, Crown, Settings, HelpCircle,
} from 'lucide-react';

interface SidebarProps {
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

const mainNav = [
  { id: 'radio',     icon: Radio,         label: '情感电台' },
  { id: 'stories',   icon: BookOpen,       label: '童话故事' },
  { id: 'history',   icon: Castle,         label: '战争与历史' },
  { id: 'knowledge', icon: GraduationCap,  label: '学科知识' },
];

const featureNav = [
  { id: 'voice-audition', icon: Headphones, label: '试音工坊' },
  { id: 'workshop',       icon: Layers,     label: '批量工坊' },
  { id: 'voice-clone',    icon: Mic2,       label: '声音复刻' },
];

const utilNav = [
  { id: 'pricing',  icon: Crown,      label: '订阅套餐' },
  { id: 'settings', icon: Settings,   label: '账号设置' },
  { id: 'help',     icon: HelpCircle, label: '使用帮助' },
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

export default function Sidebar({ activeCategory, onCategoryChange, mobileOpen, onMobileClose }: SidebarProps) {
  function handleNav(cat: string) {
    onCategoryChange(cat);
    onMobileClose(); // 移动端选完自动收起
  }

  return (
    <>
      {/* 移动端遮罩层 */}
      <div
        className={`fixed inset-0 bg-black/30 backdrop-blur-sm z-30 transition-opacity duration-300 md:hidden ${
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onMobileClose}
        aria-hidden
      />

      {/* 侧边栏本体 */}
      <aside
        className={`
          fixed left-0 top-0 z-40 flex flex-col
          w-[min(17rem,82vw)] h-screen
          bg-white/92 md:bg-white/85 backdrop-blur-sm
          shadow-2xl shadow-pink-100/50 rounded-r-[2.5rem]
          transition-transform duration-300 ease-in-out
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0 md:w-64 md:h-[calc(100vh-7rem)] md:ml-4 md:mt-24
        `}
      >
        {/* 顶部：标题 + 移动端关闭按钮 */}
        <div className="flex items-start justify-between px-7 pt-8 pb-5 shrink-0">
          <div>
            <h2 className="text-xl font-black text-primary font-headline mb-1">梦幻故事馆</h2>
            <p className="text-sm text-secondary opacity-70">编织每一个梦境…</p>
          </div>
          <button
            onClick={onMobileClose}
            className="md:hidden mt-1 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors"
            aria-label="关闭菜单"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 主导航（可滚动） */}
        <nav className="flex-1 space-y-1 px-3 overflow-y-auto">
          {mainNav.map((item) => (
            <NavBtn
              key={item.id} id={item.id} icon={item.icon} label={item.label}
              active={activeCategory === item.id}
              onClick={() => handleNav(item.id)}
            />
          ))}

          <div className="h-px bg-primary/10 my-3 mx-2" />

          {featureNav.map((item) => (
            <NavBtn
              key={item.id} id={item.id} icon={item.icon} label={item.label}
              active={activeCategory === item.id}
              onClick={() => handleNav(item.id)}
            />
          ))}
        </nav>

        {/* 底部工具区（固定，不随 nav 滚动） */}
        <div className="shrink-0 px-3 pt-3 pb-6 border-t border-primary/10 space-y-1">
          {utilNav.map((item) => (
            <NavBtn
              key={item.id} id={item.id} icon={item.icon} label={item.label}
              active={activeCategory === item.id}
              onClick={() => handleNav(item.id)}
            />
          ))}
        </div>
      </aside>
    </>
  );
}
