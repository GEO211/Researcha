import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { classNames } from '../helpers';
import { phSubscriberDigits } from '../../lib/patientValidation';
import { cn } from '@/lib/utils';
import { easeOut } from './motion';

const MotionDiv = motion.div;
const MotionTr = motion.tr;

export function Card({ title, icon: Icon, children, className }) {
  return (
    <section className={cn('rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/60 sm:rounded-3xl sm:p-5', className)}>
      <div className="mb-4 flex items-center gap-3 text-slate-900 sm:mb-5">
        {Icon ? (
          <div className="rounded-xl bg-cyan-50 p-2 text-cyan-700 sm:rounded-2xl">
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
        <h2 className="text-base font-semibold tracking-tight sm:text-lg">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function Field({ label, children, error, hint }) {
  return (
    <div className="block text-sm font-medium text-slate-700">
      <span className="mb-1 block">{label}</span>
      {children}
      {error ? <p className="mt-1 text-xs font-medium text-red-600">{error}</p> : null}
      {!error && hint ? <p className="mt-1 text-xs font-normal text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function TextInput({ className, allowNumbers = true, numericOnly = false, onChange, ...props }) {
  function handleChange(event) {
    const rawValue = event.target.value ?? '';
    let nextValue = rawValue;

    if (numericOnly) {
      nextValue = rawValue.replace(/\D/g, '');
    } else if (!allowNumbers) {
      nextValue = rawValue.replace(/\d/g, '');
    }

    if (nextValue !== rawValue && typeof onChange === 'function') {
      event.target.value = nextValue;
      onChange(event);
      return;
    }

    if (typeof onChange === 'function') {
      onChange(event);
    }
  }

  return (
    <input
      {...props}
      onChange={handleChange}
      inputMode={numericOnly ? 'numeric' : props.inputMode}
      className={cn(
        'w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2',
        props['aria-invalid']
          ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
          : 'border-slate-300 focus:border-cyan-600 focus:ring-cyan-100',
        className,
      )}
    />
  );
}

export function PhPhoneInput({ value, onChange, className, ...props }) {
  const subscriber = phSubscriberDigits(value);

  function handleChange(event) {
    const next = phSubscriberDigits(event.target.value);
    if (typeof onChange === 'function') {
      onChange({ target: { value: next ? `+63${next}` : '' } });
    }
  }

  return (
    <div
      className={cn(
        'flex w-full overflow-hidden rounded-xl border bg-white focus-within:ring-2',
        props['aria-invalid']
          ? 'border-red-400 focus-within:border-red-500 focus-within:ring-red-100'
          : 'border-slate-300 focus-within:border-cyan-600 focus-within:ring-cyan-100',
        className,
      )}
    >
      <span className="flex items-center border-r border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700">+63</span>
      <input
        {...props}
        value={subscriber}
        onChange={handleChange}
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder={props.placeholder || '9XXXXXXXXX'}
        className="w-full bg-white px-3 py-2 text-sm outline-none"
      />
    </div>
  );
}

export function SelectInput({ className, ...props }) {
  return (
    <select
      {...props}
      className={cn(
        'w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100',
        className,
      )}
    />
  );
}

export function PrimaryButton({ children, className, ...props }) {
  return (
    <button
      {...props}
      className={classNames(
        'rounded-xl bg-cyan-700 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-cyan-900/10 transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:bg-slate-400',
        className,
      )}
    >
      {children}
    </button>
  );
}

const actionButtonVariants = {
  info: 'border-cyan-200/80 bg-cyan-50 text-cyan-800 hover:border-cyan-300 hover:bg-cyan-100 focus-visible:ring-cyan-300',
  success: 'border-emerald-200/80 bg-emerald-50 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100 focus-visible:ring-emerald-300',
  warning: 'border-amber-200/80 bg-amber-50 text-amber-800 hover:border-amber-300 hover:bg-amber-100 focus-visible:ring-amber-300',
  danger: 'border-red-200/80 bg-red-50 text-red-800 hover:border-red-300 hover:bg-red-100 focus-visible:ring-red-300',
  neutral: 'border-slate-200/80 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100 focus-visible:ring-slate-300',
};

export function ActionButton({
  variant = 'info',
  icon: Icon,
  className,
  children,
  ...props
}) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold shadow-sm transition-all',
        'hover:-translate-y-px hover:shadow-md active:translate-y-0 active:shadow-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
        'disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm',
        actionButtonVariants[variant],
        className,
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function FloatingActionMenu({
  label = 'More',
  icon: Icon = null,
  align = 'right',
  disabled = false,
  triggerClassName,
  children,
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open || !triggerRef.current) return undefined;

    function updatePosition() {
      const rect = triggerRef.current.getBoundingClientRect();
      const menuWidth = menuRef.current?.offsetWidth || 176;
      const left = align === 'right' ? rect.right - menuWidth : rect.left;

      setPosition({
        top: rect.bottom + 6,
        left: Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8)),
      });
    }

    updatePosition();
    const frame = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(frame);
  }, [open, align]);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (triggerRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) {
        return;
      }
      setOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    function handleDismiss() {
      setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('resize', handleDismiss);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('resize', handleDismiss);
    };
  }, [open]);

  function close() {
    setOpen(false);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'inline-flex cursor-pointer list-none items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50',
          triggerClassName,
        )}
      >
        {label}
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      </button>
      {open ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-[200] min-w-[11rem] rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
          style={{ top: position.top, left: position.left }}
        >
          {children({ close })}
        </div>,
        document.body,
      ) : null}
    </>
  );
}

export function StatusBadge({ value }) {
  const normalized = String(value || 'unknown');
  const label = normalized === 'archived' || normalized === 'cancelled'
    ? 'cancelled'
    : normalized.replaceAll('_', ' ');
  const tone = normalized === 'expired'
    ? 'bg-amber-50 text-amber-800'
    : normalized === 'archived' || normalized === 'cancelled'
      ? 'bg-slate-100 text-slate-600'
      : normalized === 'rejected'
        ? 'bg-red-50 text-red-700'
        : normalized === 'completed'
          ? 'bg-emerald-50 text-emerald-800'
          : 'bg-cyan-50 text-cyan-800';

  return (
    <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize', tone)}>
      {label}
    </span>
  );
}

export function ReportList({ title, rows, labelKey, valueKey = 'count', suffix = '' }) {
  return (
    <MotionDiv
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.5, ease: easeOut }}
      whileHover={{ y: -2 }}
      className="rounded-2xl bg-slate-50 p-4"
    >
      <h3 className="mb-3 font-semibold">{title}</h3>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <MotionDiv
            key={`${title}-${row[labelKey]}`}
            initial={{ opacity: 0, x: 12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.38, delay: index * 0.05, ease: easeOut }}
            className="flex justify-between text-sm"
          >
            <span className="capitalize">{String(row[labelKey]).replaceAll('_', ' ')}</span>
            <strong>{row[valueKey]}{suffix}</strong>
          </MotionDiv>
        ))}
      </div>
    </MotionDiv>
  );
}

export function SimpleTable({ rows, columns, renderActions, emptyMessage = 'No records found.' }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/90">
              {columns.map((column) => (
                <th key={column} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {column.replaceAll('_', ' ')}
                </th>
              ))}
              {renderActions ? (
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Actions</th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (renderActions ? 1 : 0)}
                  className="px-4 py-10 text-center text-sm text-slate-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : rows.map((row, index) => (
              <MotionTr
                key={row.id || JSON.stringify(row)}
                initial={{ opacity: 0, x: -14 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.42, delay: index * 0.04, ease: easeOut }}
                className="transition-colors hover:bg-slate-50/70"
              >
                {columns.map((column) => (
                  <td key={column} className="max-w-[260px] truncate px-4 py-3 capitalize text-slate-800">
                    {row[column] === null || row[column] === undefined ? '-' : String(row[column]).replaceAll('_', ' ')}
                  </td>
                ))}
                {renderActions ? <td className="px-4 py-3">{renderActions(row)}</td> : null}
              </MotionTr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
