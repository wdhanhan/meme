import { FormEvent, useState } from 'react';
import { motion } from 'motion/react';
import { Smartphone, Lock, Eye, Sparkles, MessageCircle, User, Fingerprint } from 'lucide-react';

interface LoginPageProps {
  onLogin: () => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [status, setStatus] = useState('');

  async function sendCode() {
    if (!phone.trim()) {
      setStatus('请先输入手机号');
      return;
    }
    setSendingCode(true);
    setStatus('验证码发送中…');
    try {
      const resp = await fetch('/api/auth/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg = [data.error, data.detail].filter(Boolean).join(' — ');
        throw new Error(msg || `HTTP ${resp.status}`);
      }
      setStatus('验证码已发送，请注意查收短信');
    } catch (e) {
      setStatus(`发送失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSendingCode(false);
    }
  }

  async function submitBySMS(e: FormEvent) {
    e.preventDefault();
    if (!phone.trim() || !smsCode.trim()) {
      setStatus('请输入手机号和验证码');
      return;
    }
    setLoggingIn(true);
    setStatus(authMode === 'login' ? '登录中…' : '进入中…');
    try {
      // 登录接口已对手机号 UPSERT：新用户自动创建，与「注册」一致，避免未建账号时走 register 其它逻辑
      const resp = await fetch('/api/auth/sms/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), code: smsCode.trim() }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg = [data.error, data.detail].filter(Boolean).join(' — ');
        throw new Error(msg || `HTTP ${resp.status}`);
      }
      if (data.token) {
        localStorage.setItem('memec_auth_token', data.token);
      }
      setStatus('登录成功');
      onLogin();
    } catch (e) {
      const action = authMode === 'login' ? '登录' : '注册';
      setStatus(`${action}失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoggingIn(false);
    }
  }

  return (
    <div className="h-screen overflow-hidden flex items-center justify-center p-3 md:p-5 bg-surface-container-low">
      <div className="w-full max-w-6xl h-full md:h-[calc(100vh-2.5rem)] grid grid-cols-1 lg:grid-cols-[1.08fr_0.92fr] bg-surface-container-lowest rounded-xl shadow-[0_30px_60px_rgba(167,41,90,0.06)] overflow-hidden">
        {/* Illustration Side */}
        <div className="hidden lg:flex relative bg-surface-container-low flex-col items-center justify-center p-10 overflow-hidden">
          <div className="absolute -top-20 -left-20 w-64 h-64 bg-primary-container/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-secondary-container/30 rounded-full blur-3xl" />
          
          <div className="relative z-10 text-center">
            <motion.div 
              initial={{ rotate: 3 }}
              whileHover={{ rotate: 0 }}
              className="mb-6 flex justify-center"
            >
              <div className="w-56 h-56 rounded-xl overflow-hidden shadow-2xl">
                <img
                  src="/assets/login-illustration.jpg"
                  alt="Dreamy Illustration"
                 
                  className="w-full h-full object-cover"
                />
              </div>
            </motion.div>
            <h1 className="font-headline font-extrabold text-3xl text-primary mb-3 tracking-tight">梦幻粉色庇护所</h1>
            <p className="font-body text-secondary text-base max-w-sm mx-auto leading-relaxed">
              在这里，我们为您克隆温暖的声音，为孩子织就最温柔的梦境。
            </p>
            <div className="mt-8 flex gap-3 justify-center">
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
        <div className="flex flex-col p-6 md:p-10 justify-center overflow-hidden">
          <div className="mb-6 lg:hidden text-center">
            <h2 className="font-headline font-bold text-2xl text-primary mb-2">梦幻粉色庇护所</h2>
          </div>

          <div className="flex p-1.5 bg-surface-container-high rounded-full mb-6 self-center md:self-start">
            <button
              type="button"
              onClick={() => setAuthMode('login')}
              className={`px-7 py-2 rounded-full text-sm font-headline transition-colors ${
                authMode === 'login'
                  ? 'font-bold bg-white text-primary shadow-sm'
                  : 'font-medium text-outline hover:text-primary'
              }`}
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => setAuthMode('register')}
              className={`px-7 py-2 rounded-full text-sm font-headline transition-colors ${
                authMode === 'register'
                  ? 'font-bold bg-white text-primary shadow-sm'
                  : 'font-medium text-outline hover:text-primary'
              }`}
            >
              注册
            </button>
          </div>

          <div className="space-y-5">
            <div>
              <h3 className="font-headline text-2xl font-bold text-on-surface mb-1">
                {authMode === 'login' ? '欢迎归家' : '欢迎加入'}
              </h3>
              <p className="font-body text-on-surface-variant">
                {authMode === 'login' ? '准备好进入梦境了吗？请登录您的账号。' : '使用手机号验证码快速创建账号。'}
              </p>
            </div>

            <form
              className="space-y-4"
              onSubmit={submitBySMS}
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
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-14 pr-6 py-3.5 bg-surface-container-high border-none rounded-full text-on-surface placeholder:text-outline/60 focus:ring-2 focus:ring-primary-container focus:bg-white transition-all duration-300 font-body outline-hidden"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center px-4">
                  <label className="block text-xs font-headline font-bold text-secondary">短信验证码</label>
                  <button
                    type="button"
                    onClick={() => void sendCode()}
                    disabled={sendingCode}
                    className="text-xs font-label font-bold text-primary hover:opacity-70 transition-opacity disabled:opacity-50"
                  >
                    {sendingCode ? '发送中…' : '发送验证码'}
                  </button>
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                    <Lock className="w-5 h-5 text-outline group-focus-within:text-primary" />
                  </div>
                  <input
                    type="text"
                    placeholder="请输入短信验证码"
                    value={smsCode}
                    onChange={(e) => setSmsCode(e.target.value)}
                    className="w-full pl-14 pr-14 py-3.5 bg-surface-container-high border-none rounded-full text-on-surface placeholder:text-outline/60 focus:ring-2 focus:ring-primary-container focus:bg-white transition-all duration-300 font-body outline-hidden"
                  />
                  <button type="button" className="absolute inset-y-0 right-5 flex items-center text-outline" disabled>
                    <Eye className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={loggingIn}
                  className="w-full dream-gradient text-white font-headline font-bold py-3.5 rounded-full shadow-[0_10px_30px_rgba(167,41,90,0.25)] hover:shadow-[0_15px_40px_rgba(167,41,90,0.35)] transition-all duration-300 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60"
                >
                  <Sparkles className="w-5 h-5 fill-current" />
                    {loggingIn ? (authMode === 'login' ? '登录中…' : '注册中…') : (authMode === 'login' ? '验证码登录' : '验证码注册')}
                </button>
              </div>
              {status && <p className="text-xs text-secondary px-3">{status}</p>}
            </form>

            <div className="relative flex py-2 items-center">
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

          <footer className="mt-5 text-center">
            <p className="text-xs text-outline font-body">
              {authMode === 'login' ? '登录' : '注册'}即代表您已同意 
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
