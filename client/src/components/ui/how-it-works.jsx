import { useRef, useState } from 'react';
import {
  motion,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion';
import { Check, ClipboardList, HeartPulse, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const defaultSteps = [
  {
    icon: Users,
    title: 'Register the patient',
    description:
      'Barangay staff captures patient details, contact info, address, and medical classification at the local health center.',
    benefits: [
      'Complete patient registry with search and filters',
      'Senior, pregnant, PWD, child, infant, IP, and solo parent classification',
      'SMS and email contact for appointment reminders',
    ],
    tint: 'from-slate-50 via-cyan-50/40 to-white',
    accent: 'text-cyan-700',
  },
  {
    icon: ClipboardList,
    title: 'Submit the referral',
    description:
      'Send the referral to the city health center with clinical urgency, reason, and receiving facility selection.',
    benefits: [
      'Automatic priority scoring and queue assignment',
      'Instant tracking code for the patient',
      'SMS notification on submission',
    ],
    tint: 'from-white via-teal-50/50 to-slate-50',
    accent: 'text-teal-700',
  },
  {
    icon: HeartPulse,
    title: 'Track and complete care',
    description:
      'City staff review referrals, manage the queue, and patients track status online until care is completed.',
    benefits: [
      'Public tracking without an account',
      '30-minute appointment reminders',
      'Finish, cancel, or manage queue from city side',
    ],
    tint: 'from-slate-50 via-emerald-50/40 to-white',
    accent: 'text-emerald-700',
  },
];

function CinematicStepScene({ step, index, total, scrollYProgress }) {
  const segment = 1 / total;
  const start = index * segment;
  const end = (index + 1) * segment;
  const crossfade = segment * 0.22;

  const opacity = useTransform(
    scrollYProgress,
    [
      Math.max(0, start - 0.001),
      start + crossfade,
      end - crossfade,
      Math.min(1, end),
    ],
    [
      index === 0 ? 1 : 0,
      1,
      1,
      index === total - 1 ? 1 : 0,
    ],
  );

  const y = useTransform(
    scrollYProgress,
    [
      Math.max(0, start - 0.001),
      start + crossfade,
      end - crossfade,
      Math.min(1, end),
    ],
    [
      index === 0 ? 0 : 48,
      0,
      0,
      index === total - 1 ? 0 : -48,
    ],
  );

  const scale = useTransform(
    scrollYProgress,
    [
      Math.max(0, start - 0.001),
      start + crossfade,
      end - crossfade,
      Math.min(1, end),
    ],
    [
      index === 0 ? 1 : 0.94,
      1,
      1,
      index === total - 1 ? 1 : 0.96,
    ],
  );

  const Icon = step.icon;

  return (
    <>
      <motion.div
        style={{ opacity }}
        className={cn('absolute inset-0 bg-gradient-to-br', step.tint)}
        aria-hidden
      />
      <motion.div
        style={{ opacity, y, scale }}
        className="absolute inset-0 flex flex-col justify-between p-8 sm:p-10 lg:p-12"
      >
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/80 bg-white/80 shadow-sm backdrop-blur-sm">
          <Icon className={cn('h-6 w-6', step.accent)} strokeWidth={1.75} />
        </div>
        <span className="text-sm font-medium tabular-nums tracking-widest text-slate-400">
          {String(index + 1).padStart(2, '0')}
          <span className="mx-1.5 text-slate-300">/</span>
          {String(total).padStart(2, '0')}
        </span>
      </div>

      <div className="my-auto max-w-lg">
        <h3 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl lg:text-4xl">
          {step.title}
        </h3>
        <p className="mt-4 text-base leading-relaxed text-slate-500 sm:text-lg">
          {step.description}
        </p>
      </div>

      <ul className="grid gap-2 sm:grid-cols-3 sm:gap-3">
        {step.benefits.map((benefit) => (
          <li
            key={benefit}
            className="flex items-start gap-2 rounded-xl border border-white/70 bg-white/60 px-3 py-2.5 text-xs leading-snug text-slate-600 backdrop-blur-sm sm:text-sm"
          >
            <Check className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', step.accent)} strokeWidth={2.5} />
            <span>{benefit}</span>
          </li>
        ))}
      </ul>
      </motion.div>
    </>
  );
}

function ProgressRail({ steps, activeIndex, scrollYProgress }) {
  const fillHeight = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);

  return (
    <div className="relative flex flex-col gap-0 py-1">
      <div className="absolute bottom-2 left-[11px] top-2 w-px bg-slate-200" />
      <motion.div
        style={{ height: fillHeight }}
        className="absolute left-[11px] top-2 w-px origin-top bg-gradient-to-b from-cyan-500 to-teal-500"
      />

      {steps.map((step, index) => {
        const isActive = index === activeIndex;
        const isPast = index < activeIndex;

        return (
          <div key={step.title} className="relative flex items-center gap-4 py-4">
            <motion.div
              animate={{
                scale: isActive ? 1.15 : 1,
                backgroundColor: isActive || isPast ? 'rgb(8 145 178)' : 'rgb(255 255 255)',
                borderColor: isActive || isPast ? 'rgb(8 145 178)' : 'rgb(226 232 240)',
              }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                'relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold',
                isActive || isPast ? 'text-white' : 'text-slate-400',
              )}
            >
              {index + 1}
            </motion.div>
            <motion.p
              animate={{
                opacity: isActive ? 1 : 0.45,
                x: isActive ? 0 : -2,
              }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                'hidden text-sm font-medium sm:block',
                isActive ? 'text-slate-900' : 'text-slate-500',
              )}
            >
              {step.title}
            </motion.p>
          </div>
        );
      })}
    </div>
  );
}

function HowItWorks({
  className,
  title = 'How it works',
  subtitle = 'A clear path from barangay registration to city health services — built for Koronadal and surrounding communities.',
  steps = defaultSteps,
  ...props
}) {
  const containerRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 28,
    restDelta: 0.001,
  });

  useMotionValueEvent(smoothProgress, 'change', (latest) => {
    const next = Math.min(steps.length - 1, Math.floor(latest * steps.length));
    setActiveIndex((current) => (current === next ? current : next));
  });

  return (
    <section
      id="how-it-works"
      ref={containerRef}
      className={cn('relative bg-white', className)}
      style={{ height: `${steps.length * 100}vh` }}
      {...props}
    >
      <div className="sticky top-0 flex h-screen items-center overflow-hidden border-t border-slate-100">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(6,182,212,0.06),transparent_60%)]" />

        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,340px)_1fr] lg:gap-16">
          <div className="lg:pr-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-600">
              Process
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              {title}
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-500 sm:text-base">
              {subtitle}
            </p>

            <div className="mt-10 hidden lg:block">
              <ProgressRail
                steps={steps}
                activeIndex={activeIndex}
                scrollYProgress={smoothProgress}
              />
            </div>

            <div className="mt-8 flex items-center gap-3 lg:hidden">
              {steps.map((_, index) => (
                <div
                  key={`mobile-dot-${index}`}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-500',
                    index === activeIndex ? 'w-8 bg-cyan-600' : 'w-1.5 bg-slate-200',
                  )}
                />
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="pointer-events-none absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-cyan-200/30 via-transparent to-teal-200/20 blur-2xl" />

            <div className="relative overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-[0_32px_80px_rgba(15,23,42,0.08)]">
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-slate-900/[0.03] to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t from-slate-900/[0.03] to-transparent" />

              <div className="relative aspect-[4/3] min-h-[360px] sm:min-h-[420px] lg:min-h-[480px]">
                {steps.map((step, index) => (
                  <CinematicStepScene
                    key={step.title}
                    step={step}
                    index={index}
                    total={steps.length}
                    scrollYProgress={smoothProgress}
                  />
                ))}
              </div>

              <div className="flex items-center justify-between border-t border-slate-100/80 bg-white/70 px-5 py-3 backdrop-blur-sm">
                <p className="text-xs font-medium text-slate-400">Scroll to continue</p>
                <div className="flex items-center gap-2">
                  <div className="h-1 w-24 overflow-hidden rounded-full bg-slate-100">
                    <motion.div
                      style={{ scaleX: smoothProgress, transformOrigin: 'left' }}
                      className="h-full w-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-500"
                    />
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-slate-500">
                    {activeIndex + 1}/{steps.length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export { HowItWorks };
