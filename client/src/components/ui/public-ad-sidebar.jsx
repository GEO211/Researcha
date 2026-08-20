import { ExternalLink, Megaphone } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Edit these slots to show your own ads on the Live Queue page.
 * Set imageUrl + href for clickable banners, or leave null for placeholders.
 */
export const LIVE_QUEUE_AD_SLOTS = [
  {
    id: 'sidebar-top',
    label: 'Ad slot 1',
    title: 'Your banner here',
    description: 'Recommended: 300×250 or 336×280',
    imageUrl: null,
    href: null,
    variant: 'square',
  },
  {
    id: 'sidebar-mid',
    label: 'Ad slot 2',
    title: 'Partner / sponsor',
    description: 'Clinic promo, pharmacy, or local service',
    imageUrl: null,
    href: null,
    variant: 'banner',
  },
  {
    id: 'sidebar-bottom',
    label: 'Ad slot 3',
    title: 'Community notice',
    description: 'Health drive, vaccination, or event',
    imageUrl: null,
    href: null,
    variant: 'card',
  },
];

function AdSlot({ slot }) {
  const isLinked = Boolean(slot.href);
  const Wrapper = isLinked ? 'a' : 'div';
  const wrapperProps = isLinked
    ? { href: slot.href, target: '_blank', rel: 'noopener noreferrer' }
    : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        'group relative block overflow-hidden rounded-2xl border border-dashed border-slate-200/90 bg-white/70 transition duration-300',
        isLinked && 'hover:border-cyan-200 hover:shadow-md hover:shadow-cyan-900/5',
        slot.variant === 'banner' ? 'min-h-[100px]' : 'min-h-[220px]',
      )}
    >
      {slot.imageUrl ? (
        <img
          src={slot.imageUrl}
          alt={slot.title || slot.label}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full min-h-[inherit] flex-col items-center justify-center px-4 py-8 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400 transition group-hover:bg-cyan-50 group-hover:text-cyan-600">
            <Megaphone className="h-5 w-5" />
          </div>
          <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            {slot.label}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-700">{slot.title}</p>
          <p className="mt-1 max-w-[220px] text-xs leading-relaxed text-slate-500">{slot.description}</p>
          {isLinked ? (
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-cyan-700">
              Learn more
              <ExternalLink className="h-3 w-3" />
            </span>
          ) : (
            <span className="mt-3 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-500">
              Add imageUrl &amp; href in public-ad-sidebar.jsx
            </span>
          )}
        </div>
      )}
    </Wrapper>
  );
}

export function PublicAdSidebar({ slots = LIVE_QUEUE_AD_SLOTS, className }) {
  if (!slots.length) return null;

  return (
    <aside className={cn('space-y-4', className)}>
      <div className="rounded-2xl border border-slate-200/70 bg-white/60 px-4 py-3 backdrop-blur-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Sponsored</p>
        <p className="mt-1 text-xs text-slate-500">Local partners &amp; community notices</p>
      </div>

      {slots.map((slot) => (
        <AdSlot key={slot.id} slot={slot} />
      ))}
    </aside>
  );
}
