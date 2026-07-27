import AutoScroll from 'embla-carousel-auto-scroll';
import {
  Activity,
  Building2,
  HeartPulse,
  Hospital,
  MapPin,
  Shield,
  Stethoscope,
  Users,
} from 'lucide-react';
import { Carousel, CarouselContent, CarouselItem } from '@/components/ui/carousel';

const defaultLogos = [
  { id: 'city-health', description: 'City Health Office', Icon: Hospital },
  { id: 'barangay', description: 'Barangay Health Centers', Icon: Building2 },
  { id: 'referrals', description: 'Referral Network', Icon: HeartPulse },
  { id: 'clinical', description: 'Clinical Services', Icon: Stethoscope },
  { id: 'community', description: 'Community Care', Icon: Users },
  { id: 'alerts', description: 'Patient Alerts', Icon: Activity },
  { id: 'security', description: 'Secure Records', Icon: Shield },
  { id: 'local', description: 'Koronadal Health', Icon: MapPin },
];

function LogoMark({ logo }) {
  if (logo.Icon) {
    const Icon = logo.Icon;
    return (
      <div
        className="group flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm transition hover:border-cyan-200 hover:shadow-md"
        title={logo.description}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 transition group-hover:bg-cyan-100">
          <Icon className="h-5 w-5" />
        </div>
        <span className="whitespace-nowrap text-sm font-semibold text-slate-700">{logo.description}</span>
      </div>
    );
  }

  return (
    <img
      src={logo.image}
      alt={logo.description}
      className={logo.className}
    />
  );
}

function Logos3({
  heading = 'Trusted by local health partners',
  logos = defaultLogos,
  className = '',
  variant = 'default',
}) {
  const isEmbedded = variant === 'embedded';

  return (
    <div className={className}>
      <div className={isEmbedded ? 'mb-10 text-center' : 'mx-auto flex max-w-6xl flex-col items-center px-4 text-center sm:px-6'}>
        {!isEmbedded ? (
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">Partners</p>
        ) : null}
        <h2 className={isEmbedded
          ? 'text-sm font-semibold uppercase tracking-[0.2em] text-slate-500'
          : 'my-4 text-2xl font-bold tracking-tight text-slate-950 lg:text-3xl'}
        >
          {heading}
        </h2>
      </div>

      <div className={isEmbedded ? '' : 'pt-2 md:pt-4'}>
        <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6">
          <Carousel
            opts={{ loop: true, align: 'start', dragFree: true }}
            plugins={[AutoScroll({ playOnInit: true, speed: 0.8, stopOnInteraction: false })]}
            className="w-full"
          >
            <CarouselContent className="ml-0">
              {logos.map((logo) => (
                <CarouselItem
                  key={logo.id}
                  className="flex basis-auto justify-center pl-0"
                >
                  <div className="mr-4 shrink-0">
                    <LogoMark logo={logo} />
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-white to-transparent sm:w-24" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-white to-transparent sm:w-24" />
        </div>
      </div>
    </div>
  );
}

export { Logos3 };
