import { MotionReveal, popUp } from '@/components/ui/motion';

const SOFTWARE = [
  { name: 'Cursor IDE', detail: 'AI-assisted development environment' },
  { name: 'Node.js', detail: 'Runtime for the CareLink API' },
  { name: 'Express.js', detail: 'Backend REST API framework' },
  { name: 'React', detail: 'Frontend user interface library' },
  { name: 'Vite', detail: 'Frontend build and development tooling' },
  { name: 'Tailwind CSS', detail: 'Utility-first styling framework' },
  { name: 'PostgreSQL (Supabase)', detail: 'Cloud database for CareLink records' },
  { name: 'Vercel', detail: 'Frontend hosting and serverless API deploy' },
  { name: 'Google Chrome', detail: 'Primary browser for testing and demo' },
  { name: 'Framer Motion & GSAP', detail: 'Landing page motion and interactions' },
  { name: 'Python (FastAPI)', detail: 'Optional AI insights microservice' },
  { name: 'UniSMS', detail: 'SMS notifications for patients' },
];

export function SoftwareUsed() {
  return (
    <section id="software-used" className="border-y border-slate-200/80 bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <MotionReveal className="mb-10 max-w-2xl" variant={popUp}>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">Technology</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Software Used</h2>
          <p className="mt-3 text-slate-600">
            Tools and platforms used to design, build, host, and test the CareLink smart health referral system.
          </p>
        </MotionReveal>

        <MotionReveal variant={popUp}>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SOFTWARE.map((item) => (
              <li
                key={item.name}
                className="rounded-2xl border border-slate-200/90 bg-slate-50/80 px-5 py-4"
              >
                <p className="font-semibold text-slate-950">{item.name}</p>
                <p className="mt-1 text-sm text-slate-500">{item.detail}</p>
              </li>
            ))}
          </ul>
        </MotionReveal>
      </div>
    </section>
  );
}
