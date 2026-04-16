import { Voice, Story, PricingPlan } from './types';

export const VOICES: Voice[] = [
  {
    id: '1',
    name: '妈妈的声音',
    avatarUrl: '/assets/voice-avatar-1.jpg',
    status: 'ready',
    referenceId: 'mom_voice_001',
  },
  {
    id: '2',
    name: '爸爸的声音',
    avatarUrl: '/assets/voice-avatar-2.jpg',
    status: 'ready',
    referenceId: 'dad_voice_001',
  },
];

export const STORIES: Story[] = [
  {
    id: '1',
    title: '小王子的星际旅行',
    duration: '15:00',
    imageUrl: '/assets/story-1.jpg',
  },
  {
    id: '2',
    title: '穿靴子的猫',
    duration: '12:30',
    imageUrl: '/assets/story-2.jpg',
  },
  {
    id: '3',
    title: '丑小鸭的蜕变',
    duration: '18:45',
    imageUrl: '/assets/story-3.jpg',
  },
  {
    id: '4',
    title: '灰姑娘的水晶鞋',
    duration: '22:15',
    imageUrl: '/assets/story-4.jpg',
  },
  {
    id: '5',
    title: '卖火柴的小女孩',
    duration: '10:20',
    imageUrl: '/assets/story-5.jpg',
  },
];

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'monthly',
    name: 'Monthly Dreamer',
    price: '¥28',
    period: '/ month',
    description: '轻盈开启，体验完整的梦境编织功能。',
    features: ['全功能访问', '每月3个新声源'],
  },
  {
    id: 'annual',
    name: 'Annual Guardian',
    price: '¥198',
    period: '/ year',
    description: '最受欢迎的选择，长期守护孩子的每一个夜晚。',
    features: ['包含所有月度特权', '节省 40% 的订阅费用', '优先体验 AI 新功能'],
    isBestValue: true,
  },
  {
    id: 'lifetime',
    name: 'Lifetime Star',
    price: '¥588',
    period: '/ once',
    description: '终身相伴，将温暖化作永恒的礼物。',
    features: ['终身无限次克隆', '全平台通用账号'],
  },
];
