export type Page = 'landing' | 'login' | 'dashboard' | 'voice-clone' | 'voice-audition';

/** 底部播放条在 TTS 合成/播放时的覆盖状态 */
export interface TtsPlayerBarState {
  active: boolean;
  title: string;
  subtitle: string;
  progressPct: number;
  isBusy: boolean;
}

export interface Voice {
  id: string;
  name: string;
  avatarUrl: string;
  status: 'ready' | 'processing';
  /** 传给后端的 reference_id，可选 */
  referenceId?: string;
}

export interface Story {
  id: string;
  title: string;
  duration: string;
  imageUrl: string;
}

export interface PricingPlan {
  id: string;
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  isBestValue?: boolean;
}
