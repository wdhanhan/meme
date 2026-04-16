import { motion } from 'motion/react';
import { Sparkles, X, ShieldCheck, Mic2, Library, Zap, Headphones } from 'lucide-react';
import PricingCard from '../components/PricingCard';
import { PRICING_PLANS } from '../constants';

interface LandingPageProps {
  onNavigate: (page: 'login' | 'dashboard') => void;
}

export default function LandingPage({ onNavigate }: LandingPageProps) {
  const features = [
    { icon: Mic2, title: 'Unlimited Voice Cloning', desc: '无限次克隆家人亲昵的声音，让爱时刻陪伴在侧。' },
    { icon: Library, title: 'Exclusive Lullaby Collection', desc: '获取专业编排的白噪音与治愈系催眠曲库。' },
    { icon: Zap, title: 'Ad-Free Experience', desc: '纯净无干扰的体验，让入睡过程更加丝滑宁静。' },
    { icon: Headphones, title: 'HD Audio Export', desc: '高保真音频导出，在任何设备上都能聆听细腻音质。' },
  ];

  return (
    <div className="bg-surface min-h-screen text-on-surface">
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4 glass-header">
        <div className="flex items-center gap-2">
          <Sparkles className="w-8 h-8 text-primary" />
          <h1 className="text-xl font-bold text-primary font-headline tracking-tight">梦幻粉色庇护所</h1>
        </div>
        <div className="flex items-center gap-4">
          <button className="p-2 rounded-full hover:bg-pink-50 transition-colors text-primary">
            <X className="w-6 h-6" />
          </button>
        </div>
      </header>

      <main className="pt-24 pb-24 px-4 md:px-6 max-w-7xl mx-auto">
        <section className="text-center mb-12 md:mb-16 space-y-4 px-2">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl md:text-5xl font-extrabold font-headline text-primary tracking-tight leading-tight"
          >
            升级到梦境守护套餐
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-secondary text-base md:text-lg max-w-2xl mx-auto font-body opacity-80"
          >
            为您和孩子开启一段被温柔包裹的梦境旅程。克隆您的声音，编织专属的安眠曲。
          </motion.p>
        </section>

        <section className="mb-16">
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {features.map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                className="bg-surface-container-lowest p-5 md:p-8 rounded-xl premium-card-shadow flex flex-col items-center text-center gap-3 md:gap-4"
              >
                <div className="w-14 h-14 bg-primary-container/20 rounded-full flex items-center justify-center text-primary">
                  <feature.icon className="w-8 h-8" />
                </div>
                <h3 className="font-bold text-primary font-headline">{feature.title}</h3>
                <p className="text-sm text-secondary leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-8 items-end">
          {PRICING_PLANS.map((plan, i) => (
            <PricingCard key={plan.id} plan={plan} onJoin={() => onNavigate('login')} />
          ))}
        </section>

        <section className="mt-12 md:mt-20 p-5 md:p-10 bg-surface-container-lowest rounded-xl premium-card-shadow flex flex-col md:flex-row items-center gap-6 md:gap-10">
          <div className="w-full md:w-1/2">
            <img
              src="/assets/landing-safety.jpg"
              alt="Safe Child Sleeping"
             
              className="rounded-lg w-full h-64 object-cover"
            />
          </div>
          <div className="w-full md:w-1/2 space-y-4">
            <span className="text-primary font-bold text-xs tracking-widest uppercase bg-primary-container/10 px-3 py-1 rounded-full">Safety & Trust</span>
            <h3 className="text-2xl font-bold text-primary font-headline">您的声音，是我们最珍视的财产</h3>
            <p className="text-secondary leading-relaxed">
              所有语音克隆数据均经过最高等级加密处理，仅存储在本地或您的私人云端。我们承诺绝不向任何第三方分享您的个人生物识别信息。
            </p>
            <div className="flex gap-4 pt-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                <span className="text-xs font-medium">端到端加密</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                <span className="text-xs font-medium">私密克隆</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-surface-container-low mt-8 py-8 md:py-12 px-4 md:px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-5 md:gap-8 text-center md:text-left">
          <div className="flex items-center gap-2 opacity-60">
            <Sparkles className="w-6 h-6 text-primary" />
            <span className="font-headline font-bold text-primary">梦幻粉色庇护所</span>
          </div>
          <div className="flex gap-8 text-sm text-secondary/60">
            <a href="#" className="hover:text-primary transition-colors">隐私政策</a>
            <a href="#" className="hover:text-primary transition-colors">服务条款</a>
            <a href="#" className="hover:text-primary transition-colors">联系我们</a>
          </div>
          <p className="text-xs text-secondary/40 font-body">© 2024 Dreamy Pink Sanctuary. 为每一个甜美的梦而设计。</p>
        </div>
      </footer>
    </div>
  );
}
