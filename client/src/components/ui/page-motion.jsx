import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MotionItem, MotionReveal, MotionStagger, easeOut, fadeUp, popUp } from './motion';

const MotionDiv = motion.div;
const MotionTr = motion.tr;

export function PageStack({ children, className = 'space-y-5', stagger = 0.1 }) {
  return (
    <MotionStagger className={className} stagger={stagger}>
      {children}
    </MotionStagger>
  );
}

export function PageBlock({ children, variant = popUp }) {
  return <MotionItem variant={variant}>{children}</MotionItem>;
}

export function AnimatedPanel({ children, className }) {
  return (
    <MotionReveal variant={popUp} className={className}>
      {children}
    </MotionReveal>
  );
}

export function AnimatedGrid({ children, className, stagger = 0.07 }) {
  return (
    <MotionStagger className={className} stagger={stagger}>
      {children}
    </MotionStagger>
  );
}

export function AnimatedGridItem({ children, variant = popUp }) {
  return (
    <MotionItem variant={variant}>
      <MotionDiv whileHover={{ y: -3, scale: 1.01 }} transition={{ duration: 0.2, ease: easeOut }}>
        {children}
      </MotionDiv>
    </MotionItem>
  );
}

export function AnimatedTableRow({ index = 0, className = 'border-t border-slate-100', children, ...props }) {
  return (
    <MotionTr
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04, ease: easeOut }}
      className={className}
      {...props}
    >
      {children}
    </MotionTr>
  );
}

export function TabPanel({ panelKey, children }) {
  return (
    <AnimatePresence mode="wait">
      <MotionDiv
        key={panelKey}
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{ duration: 0.45, ease: easeOut }}
      >
        {children}
      </MotionDiv>
    </AnimatePresence>
  );
}

export function FlashMessage({ message, type = 'error', className }) {
  const tone = type === 'success'
    ? 'rounded-xl bg-green-50 p-3 text-sm text-green-700'
    : 'rounded-xl bg-red-50 p-3 text-sm text-red-700';

  return (
    <AnimatePresence mode="wait">
      {message ? (
        <MotionDiv
          key={String(message)}
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 280, damping: 22 }}
          className={className || tone}
        >
          {message}
        </MotionDiv>
      ) : null}
    </AnimatePresence>
  );
}

export function InlineFlash({ message, type = 'success' }) {
  const isSuccess = type === 'success';

  return (
    <AnimatePresence mode="wait">
      {message ? (
        <MotionDiv
          key={String(message)}
          initial={{ opacity: 0, y: 6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.98 }}
          transition={{ duration: 0.3, ease: easeOut }}
          className={cn(
            'inline-flex max-w-full items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium shadow-sm',
            isSuccess
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-800',
          )}
        >
          {isSuccess ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
          )}
          <span className="leading-snug">{message}</span>
        </MotionDiv>
      ) : null}
    </AnimatePresence>
  );
}

export function FormActions({ children, className }) {
  return (
    <div className={cn(
      'md:col-span-2 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:flex-wrap sm:items-center',
      className,
    )}
    >
      {children}
    </div>
  );
}

export function FilterPanel({ title = 'Search & filter', description, children, footer }) {
  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50/80">
      <div className="border-b border-slate-200/60 bg-white/70 px-4 py-3">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
      </div>
      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
      {footer ? (
        <div className="flex justify-end border-t border-slate-200/60 bg-white/50 px-4 py-3">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

export function TableShell({ children, minWidth = '760px' }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" style={{ minWidth }}>
          {children}
        </table>
      </div>
    </div>
  );
}

export function TableHead({ children }) {
  return (
    <thead>
      <tr className="border-b border-slate-200 bg-slate-50/90">
        {children}
      </tr>
    </thead>
  );
}

export function TableHeadCell({ children, className }) {
  return (
    <th className={cn('px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600', className)}>
      {children}
    </th>
  );
}

export function TableBody({ children }) {
  return <tbody className="divide-y divide-slate-100 bg-white">{children}</tbody>;
}

export function ExpandPanel({ open, children, className }) {
  return (
    <AnimatePresence>
      {open ? (
        <MotionDiv
          initial={{ opacity: 0, height: 0, y: -8 }}
          animate={{ opacity: 1, height: 'auto', y: 0 }}
          exit={{ opacity: 0, height: 0, y: -8 }}
          transition={{ duration: 0.4, ease: easeOut }}
          className={className}
        >
          {children}
        </MotionDiv>
      ) : null}
    </AnimatePresence>
  );
}

export function StatTile({ children }) {
  return (
    <MotionDiv
      initial={{ opacity: 0, scale: 0.92, y: 12 }}
      whileInView={{ opacity: 1, scale: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.5, ease: easeOut }}
      whileHover={{ y: -3, scale: 1.02 }}
      className="rounded-2xl bg-slate-50 p-4"
    >
      {children}
    </MotionDiv>
  );
}

export function LoadingOverlay({ open, label = 'Loading' }) {
  return (
    <AnimatePresence>
      {open ? (
        <MotionDiv
          key="loading-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: easeOut }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-md"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label={label}
        >
          <MotionDiv
            initial={{ opacity: 0, scale: 0.9, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.3, ease: easeOut }}
            className="flex flex-col items-center gap-4 rounded-2xl border border-white/70 bg-white/95 px-10 py-7 shadow-2xl"
          >
            <span className="h-11 w-11 animate-spin rounded-full border-[3px] border-cyan-200 border-t-cyan-600" />
            <p className="text-sm font-semibold tracking-wide text-slate-800">
              {label}
              <motion.span
                animate={{ opacity: [0.2, 1, 0.2] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
              >
                ...
              </motion.span>
            </p>
          </MotionDiv>
        </MotionDiv>
      ) : null}
    </AnimatePresence>
  );
}

export { fadeUp, popUp, easeOut };
