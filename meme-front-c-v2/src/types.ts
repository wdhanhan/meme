export type Page = 'landing' | 'login' | 'dashboard';

export interface Voice {
  id: string;
  name: string;
  avatarUrl: string;
  status: 'ready' | 'processing';
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
