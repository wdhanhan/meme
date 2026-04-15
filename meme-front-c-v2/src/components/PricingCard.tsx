import { motion } from 'motion/react';
import { CheckCircle2, Verified, Star } from 'lucide-react';
import { PricingPlan } from '../types';

interface PricingCardProps {
  key?: string | number;
  plan: PricingPlan;
  onJoin: () => void;
}

export default function PricingCard({ plan, onJoin }: PricingCardProps) {
  return (
    <motion.div
      whileHover={{ y: -8 }}
      className={`relative p-8 rounded-xl flex flex-col gap-6 overflow-hidden transition-all ${
        plan.isBestValue
          ? 'bg-white premium-card-shadow border-2 border-primary-container scale-105 z-10'
          : 'bg-surface-container-low border border-primary/10'
      }`}
    >
      {plan.isBestValue && (
        <div className="absolute top-4 right-[-35px] bg-primary-container text-on-primary-container px-12 py-1 rotate-45 text-[10px] font-bold tracking-widest uppercase">
          Best Value
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h4 className={`text-xl font-bold font-headline ${plan.isBestValue ? 'text-primary text-2xl' : 'text-secondary'}`}>
            {plan.name}
          </h4>
          {plan.isBestValue && <Star className="w-5 h-5 text-primary fill-primary" />}
        </div>
        <div className="flex items-baseline gap-1">
          <span className={`font-extrabold text-primary ${plan.isBestValue ? 'text-4xl' : 'text-3xl'}`}>
            {plan.price}
          </span>
          <span className="text-secondary/60 text-sm">{plan.period}</span>
        </div>
      </div>

      <p className="text-sm text-secondary/80">{plan.description}</p>

      <ul className="space-y-4 my-4">
        {plan.features.map((feature, index) => (
          <li key={index} className="flex items-center gap-3 text-sm text-on-surface">
            {plan.isBestValue ? (
              <Verified className="w-5 h-5 text-primary fill-primary" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-primary" />
            )}
            {feature}
          </li>
        ))}
      </ul>

      <button
        onClick={onJoin}
        className={`w-full py-4 font-bold rounded-full transition-all active:scale-95 ${
          plan.isBestValue
            ? 'bg-linear-to-r from-primary to-primary-container text-white shadow-lg shadow-primary/20 hover:opacity-90'
            : 'bg-surface-container-highest text-primary hover:bg-primary-container/20'
        }`}
      >
        Join Now
      </button>
    </motion.div>
  );
}
