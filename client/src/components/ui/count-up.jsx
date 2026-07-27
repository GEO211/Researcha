import { useEffect, useRef, useState } from 'react';
import { useInView } from 'framer-motion';

function easeOutCubic(progress) {
  return 1 - (1 - progress) ** 3;
}

export function CountUp({
  to,
  from = 0,
  duration = 1.6,
  delay = 0,
  suffix = '',
  prefix = '',
  className,
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });
  const [value, setValue] = useState(from);

  useEffect(() => {
    if (!isInView) return undefined;

    let frame;
    const timeout = setTimeout(() => {
      const startTime = performance.now();

      const tick = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / (duration * 1000), 1);
        const next = Math.round(from + (to - from) * easeOutCubic(progress));
        setValue(next);
        if (progress < 1) frame = requestAnimationFrame(tick);
      };

      frame = requestAnimationFrame(tick);
    }, delay * 1000);

    return () => {
      clearTimeout(timeout);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [delay, duration, from, isInView, to]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {value}
      {suffix}
    </span>
  );
}
