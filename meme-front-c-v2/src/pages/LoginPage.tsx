import { motion } from 'motion/react';
import { Smartphone, Lock, Eye, Sparkles, MessageCircle, User, Fingerprint } from 'lucide-react';

interface LoginPageProps {
  onLogin: () => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-8 bg-surface-container-low">
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 bg-surface-container-lowest rounded-xl shadow-[0_30px_60px_rgba(167,41,90,0.06)] overflow-hidden">
        {/* Illustration Side */}
        <div className="hidden lg:flex relative bg-surface-container-low flex-col items-center justify-center p-12 overflow-hidden">
          <div className="absolute -top-20 -left-20 w-64 h-64 bg-primary-container/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-secondary-container/30 rounded-full blur-3xl" />
          
          <div className="relative z-10 text-center">
            <motion.div 
              initial={{ rotate: 3 }}
              whileHover={{ rotate: 0 }}
              className="mb-8 flex justify-center"
            >
              <div className="w-64 h-64 rounded-xl overflow-hidden shadow-2xl">
                <img
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuCW72h3G374CozEW98Pha_YJiQ61d-StJZvChoT6iZ-2B9tA7g-F18ja7dczANct1MgK7SXwD1I-c5wX_vATSRUOwIGhC7oM592yq9RKfy36n2p-HbxYGlXNZgdQHR8ljhRwA0KF4zzijtJNJkVe_kH6C59pI5l30KI5hlucpkB2J1wg2zWuYus2LIHgXkcRhF70E9Blzl6uwT71anX_iko3qQf3i3wVdx_5Iew_JnpvWKmNb9lX6rtH-6_5eTkNF3UmYHHjL6hquE"
                  alt="Dreamy Illustration"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            </motion.div>
            <h1 className="font-headline font-extrabold text-4xl text-primary mb-4 tracking-tight">梦幻粉色庇护所</h1>
            <p className="font-body text-secondary text-lg max-w-sm mx-auto leading-relaxed">
              在这里，我们为您克隆温暖的声音，为孩子织就最温柔的梦境。
            </p>
            <div className="mt-12 flex gap-4 justify-center">
              <div className="flex items-center gap-2 px-4 py-2 bg-white/50 backdrop-blur-md rounded-full border border-white/20">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-xs font-label font-bold text-secondary">语音克隆</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-white/50 backdrop-blur-md rounded-full border border-white/20">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-xs font-label font-bold text-secondary">助眠音乐</span>
              </div>
            </div>
          </div>
        </div>

        {/* Form Side */}
        <div className="flex flex-col p-8 md:p-16 justify-center">
          <div className="mb-10 lg:hidden text-center">
            <h2 className="font-headline font-bold text-2xl text-primary mb-2">梦幻粉色庇护所</h2>
          </div>

          <div className="flex p-1.5 bg-surface-container-high rounded-full mb-10 self-center md:self-start">
            <button className="px-8 py-2.5 rounded-full text-sm font-headline font-bold bg-white text-primary shadow-sm">
              登录
            </button>
            <button className="px-8 py-2.5 rounded-full text-sm font-headline font-medium text-outline hover:text-primary transition-colors">
              注册
            </button>
          </div>

          <div className="space-y-8">
            <div>
              <h3 className="font-headline text-3xl font-bold text-on-surface mb-2">欢迎归家</h3>
              <p className="font-body text-on-surface-variant">准备好进入梦境了吗？请登录您的账号。</p>
            </div>

            <form 
              className="space-y-6"
              onSubmit={(e) => {
                e.preventDefault();
                onLogin();
              }}
            >
              <div className="space-y-1.5">
                <label className="block text-xs font-headline font-bold text-secondary ml-4">手机号码</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                    <Smartphone className="w-5 h-5 text-outline group-focus-within:text-primary" />
                  </div>
                  <input
                    type="tel"
                    placeholder="请输入您的手机号"
                    className="w-full pl-14 pr-6 py-4 bg-surface-container-high border-none rounded-full text-on-surface placeholder:text-outline/60 focus:ring-2 focus:ring-primary-container focus:bg-white transition-all duration-300 font-body outline-hidden"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center px-4">
                  <label className="block text-xs font-headline font-bold text-secondary">登录密码</label>
                  <a href="#" className="text-xs font-label font-bold text-primary hover:opacity-70 transition-opacity">忘记密码？</a>
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                    <Lock className="w-5 h-5 text-outline group-focus-within:text-primary" />
                  </div>
                  <input
                    type="password"
                    placeholder="请输入密码"
                    className="w-full pl-14 pr-14 py-4 bg-surface-container-high border-none rounded-full text-on-surface placeholder:text-outline/60 focus:ring-2 focus:ring-primary-container focus:bg-white transition-all duration-300 font-body outline-hidden"
                  />
                  <button type="button" className="absolute inset-y-0 right-5 flex items-center text-outline">
                    <Eye className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  className="w-full dream-gradient text-white font-headline font-bold py-4 rounded-full shadow-[0_10px_30px_rgba(167,41,90,0.25)] hover:shadow-[0_15px_40px_rgba(167,41,90,0.35)] transition-all duration-300 flex items-center justify-center gap-2 active:scale-95"
                >
                  <Sparkles className="w-5 h-5 fill-current" />
                  进入梦境
                </button>
              </div>
            </form>

            <div className="relative flex py-4 items-center">
              <div className="flex-grow border-t border-surface-variant" />
              <span className="flex-shrink mx-4 text-xs font-label font-bold text-outline uppercase tracking-widest">快捷登录</span>
              <div className="flex-grow border-t border-surface-variant" />
            </div>

            <div className="flex justify-center gap-6">
              {[MessageCircle, User, Fingerprint].map((Icon, i) => (
                <button 
                  key={i}
                  className="w-14 h-14 rounded-full flex items-center justify-center bg-surface-container-high hover:bg-surface-variant transition-colors group"
                >
                  <Icon className="w-6 h-6 text-secondary group-hover:text-primary" />
                </button>
              ))}
            </div>
          </div>

          <footer className="mt-12 text-center">
            <p className="text-xs text-outline font-body">
              登录即代表您已同意 
              <a href="#" className="text-secondary font-bold hover:underline decoration-primary-container underline-offset-4 mx-1">服务协议</a> 
              与 
              <a href="#" className="text-secondary font-bold hover:underline decoration-primary-container underline-offset-4 mx-1">隐私政策</a>
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
