import { Voice, Story, PricingPlan } from './types';

export const VOICES: Voice[] = [
  {
    id: '1',
    name: '妈妈的声音',
    avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAe9YPZfeNjnpHYsZf4wvV1FPOfBkIwaisw9CZv8TCYU3h_HumYq7Ab7gmRLp1SVZ3OaAeVz8CXgS_ZaX0eQPAmpREWkuc4nbwB31I8NM2uewnz4xfT3ohBv2j0rbdcYSIiYM8l-diweqJD4GjPzslTv_kxwJ_g-QSetSjJ7Cmu4kA7aMAoaeCJzTVCkCJMyaRQzs6b0WrxMTLHo-_NqaVWTlO1t0VEOn6ZMa_mvJDrScsY3-8wOP7AsNv9CbDDDdp_f6Eb1oTIxOA',
    status: 'ready',
    referenceId: 'mom_voice_001',
  },
  {
    id: '2',
    name: '爸爸的声音',
    avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCy4igoxanNR2EgkcgUzAmR8VscrkFkypPooHMddNXvszdzuceb8xBOko8fGfifCaBGpxeRb1PMvMg1Uhk-PAvHSs0Eg8KAyDEdtgJeQbSOpDh0ZojubAWcCJqOWFj-7M6RbHQzGKy0nI1imsaKYwUF0NC6qBwaGM0S4UKmLRif8ZM-57yF78Vi2R82qtBNLdiipnrEomtXZoA8dZN0qNowvKItflqLkzBFLyMbSse16S8MKSszFnuXkH2x2Hxe2uG-XPIpcExs53U',
    status: 'ready',
    referenceId: 'dad_voice_001',
  },
];

export const STORIES: Story[] = [
  {
    id: '1',
    title: '小王子的星际旅行',
    duration: '15:00',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDd5gSGNX20D2d1_5HZcS-J-OuxgOzi2dOqyjcU5MhaWl3xr6aW-Fb2Rv5hMcuhLUD1Ke3Uo4PO1RFEjrEbUm8FtpRcwTiKnR5K6UmiAi2u3atCeiHov6LEWYbHGMpd4nXE_oGx4wd0Bzx8zQtOO6DosQacnQKKQZ2bSNJzr84ETM8Iw2Zd1BGA8veXAm9nqyC3W6h8WRp3xejD3TUBfnTxJWRL_p8AaZcsb-oVo14Yuv803VNygA7zoGclG_5FpGhPjCe1c8CNvf4',
  },
  {
    id: '2',
    title: '穿靴子的猫',
    duration: '12:30',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCbSqk6-4YL0iugNLvEN6nCBrbrPWK7gZ4YD4-yB03fwbA6klI2J-usHIUtcbKOwgonnWEuBWpz2jeer2_Mds8r9xexHpquRz3WAb3ypPYoKikUoKlMjm7xg197gLJ3MSCuHd6hKFKZquTHaZsu4dMiqYs6pz-xj6xEFEboo8lsFVq3e0v0-ZpcVQr7-gts_TuniOsxyXiGWQ3FlQIVcY52NiB9kE8vp6Rh0pIDE_R090zeP0-fTFQxaZltCs2h7dP2U6R91Qj8WOc',
  },
  {
    id: '3',
    title: '丑小鸭的蜕变',
    duration: '18:45',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBwCKOyVJGCErdgTryWXjMT702XT_j57J3DPTqZfox2Yk2kww35m_OJG_ShnlMG6CJtsdb4v-zzZYv0UAiGJ5nYeVAoRK_kd_uRrYeZeltY1D50lwxIrwEhGOf14-aleuKeTTNUpMaem6yWdVjbfTCwa-isACGAlry7OpmpLEO_HcJ1JheEErjtIAlwfAb-sc_cSqS-CEXkMYvxD6vuYSk8z8BVzt-v6kyrzKWlPRUGhQqs24zf0G7DXIVNcMuiPmwC-BEBfzrVmBg',
  },
  {
    id: '4',
    title: '灰姑娘的水晶鞋',
    duration: '22:15',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAmUdOfGlZ_FrPqcZbSkc-t72Yj2V6z8WcHcTHiWW5nLDGrIwAUhOotkb9uc3wE-7jH1icOXS_LyCdrvVNAwtJdOKX0QR5akKinploYJY8Ga7Orns1Hg91xTag7SUjGeogfRElTICa9ustSEtg-4O3rsSAD4bEIgAb-OfwMIJ8IV0jdpk-QGfAC1zGzgLIYZDytun0uwihs7wz0yJw801z1OBpiPCITymUYAILD5IaQEvrdX8o7jgvCVAuA8H5r99MWhSqvHPZTp0s',
  },
  {
    id: '5',
    title: '卖火柴的小女孩',
    duration: '10:20',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBc3HjDfTHBev0ScjefU7RliHHx-y8Ym8M-tIy5wK6J1MXK1gwpoZ_rq83wft1LF2I9jHRFz1oAO6L_nYPKPh2NescQaLALlzGYeDtFHAJPuFfgXapARwSEvJJAnN3y0D2QzzTv1kpSjUL_vWLXsFNstdpToe_8O1CMn2fN4FsDN92kIWWddtkc6exqUTS6UMIp7a33jmhWFrueAST471Oxpcw7OBB7I-TYUbI-uBIegbbz8LBrI1qmZCsNIzawvQzwpgCaFG3lvxw',
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
