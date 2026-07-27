import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const ConfirmContext = createContext(null);

const MotionDiv = motion.div;

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);

  const confirm = useCallback((options = {}) => new Promise((resolve) => {
    setState({
      title: options.title || 'Confirm action',
      message: options.message || 'Are you sure you want to continue?',
      confirmLabel: options.confirmLabel || 'Confirm',
      cancelLabel: options.cancelLabel || 'Cancel',
      tone: options.tone || 'primary',
      resolve,
    });
  }), []);

  const close = useCallback((result) => {
    setState((current) => {
      current?.resolve(result);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!state) return undefined;

    function onKeyDown(event) {
      if (event.key === 'Escape') close(false);
    }

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [state, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AnimatePresence>
        {state ? (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <MotionDiv
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
              onClick={() => close(false)}
            />
            <MotionDiv
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-modal-title"
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', stiffness: 360, damping: 30 }}
              className="relative w-full max-w-[26rem] overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-2xl shadow-slate-900/25"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="px-6 pb-2 pt-7 text-center">
                <div
                  className={cn(
                    'mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm',
                    state.tone === 'danger'
                      ? 'bg-red-50 text-red-600 ring-1 ring-red-100'
                      : 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100',
                  )}
                >
                  {state.tone === 'danger' ? (
                    <AlertTriangle className="h-7 w-7" strokeWidth={2} />
                  ) : (
                    <HelpCircle className="h-7 w-7" strokeWidth={2} />
                  )}
                </div>
                <h3 id="confirm-modal-title" className="text-xl font-semibold tracking-tight text-slate-950">
                  {state.title}
                </h3>
                <p className="mx-auto mt-2 max-w-[18rem] text-sm leading-relaxed text-slate-600">
                  {state.message}
                </p>
              </div>

              <div className="mt-4 flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/80 px-4 py-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => close(false)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:w-auto"
                >
                  {state.cancelLabel}
                </button>
                <button
                  type="button"
                  onClick={() => close(true)}
                  className={cn(
                    'w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition sm:w-auto',
                    state.tone === 'danger'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-cyan-700 hover:bg-cyan-800 shadow-cyan-900/10',
                  )}
                >
                  {state.confirmLabel}
                </button>
              </div>
            </MotionDiv>
          </div>
        ) : null}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    throw new Error('useConfirm must be used within ConfirmProvider');
  }
  return confirm;
}
