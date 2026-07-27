import { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  motion,
  useInView,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion';
import { ChevronDown, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const MotionDiv = motion.div;
const MotionSpan = motion.span;

export const cinematicEase = [0.22, 1, 0.36, 1];

export const cinematicViewport = { once: false, amount: 0.12 };

const HeroCinematicContext = createContext(0);

export function useHeroReplayKey() {
  return useContext(HeroCinematicContext);
}

const cinematicWordClip = 'inline-block overflow-hidden align-bottom pb-[0.2em] -mb-[0.2em]';
const cinematicEyebrowClip = 'inline-block overflow-hidden align-bottom pb-[0.12em] -mb-[0.12em]';

const fadeUpVariants = {
  hidden: { opacity: 0, y: 32 },
  visible: (index) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.85,
      delay: 0.2 + index * 0.12,
      ease: cinematicEase,
    },
  }),
};

export function CinematicWords({ text, className, delay = 0, wordClassName }) {
  const replayKey = useHeroReplayKey();
  const words = text.split(' ');

  return (
    <span key={`${replayKey}-words`} className={className} aria-label={text}>
      {words.map((word, index) => (
        <span key={`${word}-${index}`} className={cinematicWordClip}>
          <MotionSpan
            initial={{ opacity: 0, y: '110%', filter: 'blur(12px)' }}
            animate={{ opacity: 1, y: '0%', filter: 'blur(0px)' }}
            transition={{
              duration: 0.75,
              delay: delay + index * 0.09,
              ease: cinematicEase,
            }}
            className={cn('inline-block will-change-transform', wordClassName)}
          >
            {word}
            {index < words.length - 1 ? '\u00A0' : ''}
          </MotionSpan>
        </span>
      ))}
    </span>
  );
}

function CinematicGradientWords({ text, delay = 0 }) {
  const replayKey = useHeroReplayKey();
  const words = text.split(' ');

  return (
    <MotionSpan
      key={`${replayKey}-gradient-words`}
      aria-label={text}
      animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
      transition={{ duration: 10, repeat: Number.POSITIVE_INFINITY, ease: 'linear', delay: 1.2 }}
      className="inline bg-gradient-to-r from-cyan-600 via-teal-400 via-emerald-500 to-cyan-600 bg-[length:200%_auto] bg-clip-text text-transparent"
    >
      {words.map((word, index) => (
        <span key={`${word}-${index}`} className={cinematicWordClip}>
          <MotionSpan
            initial={{ opacity: 0, y: '110%', filter: 'blur(14px)' }}
            animate={{ opacity: 1, y: '0%', filter: 'blur(0px)' }}
            transition={{
              duration: 0.8,
              delay: delay + index * 0.1,
              ease: cinematicEase,
            }}
            className="inline-block font-extrabold will-change-transform"
          >
            {word}
            {index < words.length - 1 ? '\u00A0' : ''}
          </MotionSpan>
        </span>
      ))}
    </MotionSpan>
  );
}

export function CinematicEyebrow({ text, className, delay = 0 }) {
  const replayKey = useHeroReplayKey();
  const words = text.split(' ');

  return (
    <p key={`${replayKey}-eyebrow`} className={className} aria-label={text}>
      {words.map((word, index) => (
        <span key={`${word}-${index}`} className={cinematicEyebrowClip}>
          <MotionSpan
            initial={{ opacity: 0, y: '100%', filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: '0%', filter: 'blur(0px)' }}
            transition={{
              duration: 0.65,
              delay: delay + index * 0.08,
              ease: cinematicEase,
            }}
            className="inline-block will-change-transform"
          >
            {word}
            {index < words.length - 1 ? '\u00A0' : ''}
          </MotionSpan>
        </span>
      ))}
    </p>
  );
}

export function CinematicEnter({
  children,
  className,
  delay = 0,
  duration = 0.8,
  initial = {},
  animate = {},
}) {
  const replayKey = useHeroReplayKey();

  return (
    <MotionDiv
      key={`${replayKey}-enter`}
      initial={{ opacity: 0, y: 16, filter: 'blur(6px)', ...initial }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)', ...animate }}
      transition={{ duration, delay, ease: cinematicEase }}
      className={className}
    >
      {children}
    </MotionDiv>
  );
}

function CinematicBadge({ label, delay = 0 }) {
  const replayKey = useHeroReplayKey();
  const words = label.split(' ');

  return (
    <MotionDiv
      key={`${replayKey}-badge`}
      initial={{ opacity: 0, scale: 0.88, filter: 'blur(10px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      transition={{ duration: 0.9, delay, ease: cinematicEase }}
      className="group relative mb-3 inline-flex w-fit max-w-full overflow-hidden rounded-full border border-cyan-200/60 bg-white/60 px-3 py-1.5 shadow-[0_2px_20px_rgba(14,116,144,0.08)] backdrop-blur-xl sm:mb-4 sm:px-4 sm:py-2"
    >
      <MotionDiv
        initial={{ x: '-120%', opacity: 0 }}
        animate={{ x: '220%', opacity: [0, 1, 0] }}
        transition={{ duration: 1.4, delay: delay + 0.5, ease: 'easeInOut' }}
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/70 to-transparent"
      />
      <MotionDiv
        animate={{ rotate: [0, 8, -8, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 4, delay: delay + 0.8, ease: 'easeInOut' }}
        className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-teal-500 text-white shadow-sm shadow-cyan-500/30 sm:h-6 sm:w-6"
      >
        <Sparkles className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
      </MotionDiv>
      <span className="relative ml-2 truncate text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600 sm:text-[11px] sm:tracking-[0.22em]">
        {words.map((word, index) => (
          <MotionSpan
            key={`${word}-${index}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: delay + 0.15 + index * 0.06, ease: cinematicEase }}
            className="inline-block"
          >
            {word}
            {index < words.length - 1 ? '\u00A0' : ''}
          </MotionSpan>
        ))}
      </span>
    </MotionDiv>
  );
}

function MeshOrb({ className, color, delay = 0, size = 480 }) {
  return (
    <MotionDiv
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1.4, delay, ease: cinematicEase }}
      className={cn('pointer-events-none absolute rounded-full blur-3xl', className)}
      style={{ width: size, height: size }}
    >
      <MotionDiv
        animate={{ x: [0, 30, -20, 0], y: [0, -25, 15, 0], scale: [1, 1.08, 0.96, 1] }}
        transition={{ duration: 18, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
        className={cn('h-full w-full rounded-full opacity-70', color)}
      />
    </MotionDiv>
  );
}

export function ElegantShape({
  className,
  delay = 0,
  width = 400,
  height = 100,
  rotate = 0,
  gradient = 'from-cyan-400/20',
}) {
  return (
    <MotionDiv
      initial={{ opacity: 0, y: -80, rotate: rotate - 10 }}
      animate={{ opacity: 1, y: 0, rotate }}
      transition={{
        duration: 1.8,
        delay,
        ease: cinematicEase,
        opacity: { duration: 0.8 },
      }}
      className={cn('pointer-events-none absolute', className)}
    >
      <MotionDiv
        animate={{ y: [0, 14, 0] }}
        transition={{ duration: 9, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
        style={{ width, height }}
        className="relative"
      >
        <div
          className={cn(
            'absolute inset-0 rounded-full bg-gradient-to-r to-transparent',
            gradient,
            'border border-white/40 shadow-[0_8px_32px_rgba(14,116,144,0.12)] backdrop-blur-md',
            'ring-1 ring-white/30',
          )}
        />
      </MotionDiv>
    </MotionDiv>
  );
}

export function CareLinkHero({
  badge = 'Koronadal City Health',
  title1 = 'Connecting barangay care',
  title2 = 'to city health services',
  description,
  children,
  aside,
  onScrollHint,
}) {
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { amount: 0.15, once: false });
  const [replayKey, setReplayKey] = useState(1);
  const wasInView = useRef(false);
  const hasEnteredView = useRef(false);

  useEffect(() => {
    if (!isInView) {
      wasInView.current = false;
      return;
    }
    if (wasInView.current) return;

    wasInView.current = true;
    if (hasEnteredView.current) {
      setReplayKey((key) => key + 1);
    } else {
      hasEnteredView.current = true;
    }
  }, [isInView]);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  });

  const smoothProgress = useSpring(scrollYProgress, { stiffness: 90, damping: 28 });
  const copyOpacity = useTransform(smoothProgress, [0, 0.75], [1, 0]);
  const copyY = useTransform(smoothProgress, [0, 0.75], [0, -48]);
  const copyScale = useTransform(smoothProgress, [0, 0.75], [1, 0.96]);
  const copyBlur = useTransform(smoothProgress, [0, 0.75], ['blur(0px)', 'blur(6px)']);
  const asideOpacity = useTransform(smoothProgress, [0, 0.75], [1, 0]);
  const asideY = useTransform(smoothProgress, [0, 0.75], [0, -48]);
  const asideScale = useTransform(smoothProgress, [0, 0.75], [1, 0.96]);
  const asideBlur = useTransform(smoothProgress, [0, 0.75], ['blur(0px)', 'blur(6px)']);

  return (
    <HeroCinematicContext.Provider value={replayKey}>
    <section
      ref={sectionRef}
      className="relative flex min-h-[calc(100svh-var(--header-height,4.5rem))] flex-col overflow-hidden supports-[height:100dvh]:min-h-[calc(100dvh-var(--header-height,4.5rem))]"
      aria-label="Hero"
    >
      <div className="absolute inset-0 bg-[#f8fafc]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(6,182,212,0.18),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_100%_50%,rgba(20,184,166,0.12),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_0%_80%,rgba(59,130,246,0.1),transparent_45%)]" />

      <MeshOrb
        delay={0.1}
        size={520}
        color="bg-gradient-to-br from-cyan-400/30 to-teal-300/20"
        className="-left-32 top-0 max-lg:opacity-60"
      />
      <MeshOrb
        delay={0.25}
        size={420}
        color="bg-gradient-to-br from-blue-400/25 to-cyan-300/15"
        className="-right-24 bottom-12 max-lg:opacity-60"
      />

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(14,116,144,0.15) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <div className="absolute inset-0 overflow-hidden">
        <ElegantShape
          delay={0.15}
          width={560}
          height={128}
          rotate={8}
          gradient="from-cyan-400/25"
          className="left-[-14%] top-[6%] md:left-[-8%] md:top-[10%]"
        />
        <ElegantShape
          delay={0.3}
          width={380}
          height={96}
          rotate={-12}
          gradient="from-teal-400/20"
          className="right-[-6%] top-[58%] md:right-0 md:top-[64%]"
        />
        <ElegantShape
          delay={0.4}
          width={240}
          height={64}
          rotate={-4}
          gradient="from-sky-400/18"
          className="bottom-[8%] left-[6%] md:bottom-[12%] md:left-[10%]"
        />
      </div>

      <MotionDiv
        aria-hidden
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: [0, 0.45, 0.25], scale: [0.6, 1.2, 1] }}
        transition={{ duration: 1.6, delay: 0.2, ease: cinematicEase }}
        className="pointer-events-none absolute left-[8%] top-[28%] h-48 w-48 rounded-full bg-cyan-400/15 blur-3xl lg:left-[12%] lg:top-[32%] lg:h-64 lg:w-64"
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-50 to-transparent" />

      <div className="relative mx-auto flex w-full max-w-6xl min-h-0 flex-1 flex-col justify-center px-4 py-3 sm:px-6 sm:py-4 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:gap-6 xl:gap-10 xl:py-6">
        <MotionDiv
          style={{
            opacity: copyOpacity,
            y: copyY,
            scale: copyScale,
            filter: copyBlur,
          }}
          className="relative z-10 flex min-h-0 min-w-0 flex-col justify-center"
        >
          <CinematicBadge label={badge} delay={0.1} />

          <div className="relative">
            <MotionDiv
              key={`${replayKey}-accent`}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 1.1, delay: 0.55, ease: cinematicEase }}
              className="absolute -left-3 top-2 h-[calc(100%-0.5rem)] w-0.5 origin-top bg-gradient-to-b from-cyan-500/80 via-teal-400/40 to-transparent sm:-left-4"
            />

            <h1 className="text-[clamp(1.65rem,3.2vw+0.85rem,3.25rem)] font-extrabold leading-[1.18] tracking-[-0.03em]">
              <span className="block text-slate-950">
                <CinematicWords text={title1} delay={0.35} />
              </span>
              <span className="mt-0.5 block sm:mt-1">
                <CinematicGradientWords text={title2} delay={0.72} />
              </span>
            </h1>
          </div>

          {description ? (
            <MotionDiv
              key={`${replayKey}-description`}
              initial={{ opacity: 0, y: 20, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.8, delay: 1.15, ease: cinematicEase }}
            >
              <p className="mt-3 max-w-lg text-[clamp(0.875rem,0.5vw+0.8rem,1.05rem)] leading-relaxed text-slate-500 sm:mt-4 lg:max-w-md xl:max-w-lg">
                {description}
              </p>
            </MotionDiv>
          ) : null}

          {children ? (
            <MotionDiv
              key={`${replayKey}-children`}
              custom={3}
              variants={fadeUpVariants}
              initial="hidden"
              animate="visible"
              className="min-w-0"
            >
              {children}
            </MotionDiv>
          ) : null}
        </MotionDiv>

        {aside ? (
          <MotionDiv
            style={{
              opacity: asideOpacity,
              y: asideY,
              scale: asideScale,
              filter: asideBlur,
            }}
            className="relative z-10 mt-4 flex min-h-0 min-w-0 flex-col justify-center lg:mt-0 lg:max-h-[calc(100svh-var(--header-height,4.5rem)-2rem)]"
          >
            <div className="pointer-events-none absolute -inset-px rounded-[1.65rem] bg-gradient-to-br from-cyan-400/40 via-white/20 to-teal-400/30 opacity-80 blur-sm" />
            <div className="min-h-0 flex-1 overflow-hidden">{aside}</div>
          </MotionDiv>
        ) : null}
      </div>

      <MotionDiv
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.4, duration: 0.6 }}
        className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center sm:bottom-4"
      >
        <button
          type="button"
          onClick={onScrollHint}
          className={cn(
            'pointer-events-auto flex flex-col items-center gap-1 text-[10px] font-medium uppercase tracking-[0.2em] text-slate-400 transition hover:text-cyan-700',
            !onScrollHint && 'cursor-default',
          )}
          tabIndex={onScrollHint ? 0 : -1}
          aria-label="Scroll to next section"
        >
          <span className="hidden sm:inline">Scroll</span>
          <ChevronDown className="h-4 w-4 animate-bounce" />
        </button>
      </MotionDiv>
    </section>
    </HeroCinematicContext.Provider>
  );
}

export { CareLinkHero as HeroGeometric };
