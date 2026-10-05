import { motion } from 'framer-motion';

const MotionDiv = motion.div;

export const viewport = { once: true, amount: 0 };

export const easeOut = [0.22, 1, 0.36, 1];

export const fadeUp = {
  hidden: { opacity: 0, y: 36 },
  visible: { opacity: 1, y: 0 },
};

export const popUp = {
  hidden: { opacity: 0, scale: 0.88, y: 24 },
  visible: { opacity: 1, scale: 1, y: 0 },
};

export const fadeLeft = {
  hidden: { opacity: 0, x: -40 },
  visible: { opacity: 1, x: 0 },
};

export const fadeRight = {
  hidden: { opacity: 0, x: 40 },
  visible: { opacity: 1, x: 0 },
};

export const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12, delayChildren: 0.05 },
  },
};

export function MotionReveal({
  children,
  className,
  variant = fadeUp,
  delay = 0,
  duration = 0.6,
  as = 'div',
}) {
  const Component = motion[as] || MotionDiv;

  return (
    <Component
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={viewport}
      variants={variant}
      transition={{ duration, delay, ease: easeOut }}
    >
      {children}
    </Component>
  );
}

export function MotionHero({
  children,
  className,
  delay = 0,
}) {
  return (
    <MotionDiv
      className={className}
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      transition={{ delayChildren: delay }}
    >
      {children}
    </MotionDiv>
  );
}

export function MotionHeroItem({
  children,
  className,
  variant = fadeUp,
}) {
  return (
    <MotionDiv
      className={className}
      variants={variant}
      transition={{ duration: 0.65, ease: easeOut }}
    >
      {children}
    </MotionDiv>
  );
}

export function MotionStagger({
  children,
  className,
  stagger = 0.1,
  delayChildren = 0,
  replay = false,
}) {
  const motionProps = replay
    ? { initial: 'hidden', animate: 'visible' }
    : { initial: 'hidden', whileInView: 'visible', viewport: viewport };

  return (
    <MotionDiv
      className={className}
      {...motionProps}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger, delayChildren } },
      }}
    >
      {children}
    </MotionDiv>
  );
}

export function MotionItem({
  children,
  className,
  variant = popUp,
}) {
  return (
    <MotionDiv
      className={className}
      variants={variant}
      transition={{ duration: 0.55, ease: easeOut }}
    >
      {children}
    </MotionDiv>
  );
}
