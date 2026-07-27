import { BookOpen, Code2, FileText, Terminal } from 'lucide-react';
import { ContainerScroll } from '@/components/ui/container-scroll-animation';

const team = [
  {
    name: 'GEO',
    image: '/images/geo.jpg',
    role: 'Programmer',
    focus: 'Designed and built the CareLink application',
    icon: Terminal,
    itemIcon: Code2,
    contributions: [
      'Full-stack development (Node.js, React, MySQL)',
      'Referral, queue, patient, and admin modules',
      'API, authentication, notifications, and UI implementation',
    ],
  },
  {
    name: 'MIKO',
    image: '/images/miko.jpg',
    role: 'Research & Documentation',
    focus: 'Research paper and project documentation',
    icon: BookOpen,
    itemIcon: FileText,
    contributions: [
      'Research paper writing and structure',
      'System requirements and study documentation',
      'Project background and methodology support',
    ],
  },
  {
    name: 'LOUMER',
    image: '/images/loumer.jpg',
    role: 'Research & Documentation',
    focus: 'Research paper and project documentation',
    icon: FileText,
    itemIcon: FileText,
    contributions: [
      'Research paper writing and review',
      'Documentation of features and workflows',
      'Supporting materials for project presentation',
    ],
  },
];

export function WebDevelopers() {
  return (
    <section className="overflow-hidden bg-slate-50">
      <ContainerScroll
        titleComponent={(
          <>
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.25em] text-cyan-700">
              Project Team
            </p>
            <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl md:text-5xl">
              Built for CareLink by
              <br />
              <span className="mt-2 block text-4xl font-bold leading-none text-cyan-700 md:text-[4.5rem]">
                our project team
              </span>
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-base text-slate-600 sm:text-lg">
              GEO developed the system. MIKO and LOUMER contributed to the research paper and documentation.
            </p>
          </>
        )}
      >
        <div className="mx-auto grid h-full max-w-5xl gap-4 md:grid-cols-3 md:gap-5">
          {team.map((member) => {
            const Icon = member.icon;
            const ItemIcon = member.itemIcon;
            return (
              <article
                key={member.name}
                className="flex h-full flex-col items-center rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm"
              >
                <img
                  src={member.image}
                  alt={member.name}
                  className="mx-auto h-24 w-24 rounded-full border-4 border-cyan-100 object-cover shadow-md"
                />
                <h3 className="mt-4 text-lg font-bold text-slate-950">{member.name}</h3>
                <p className="mt-1 text-sm font-medium text-cyan-700">{member.role}</p>

                <div className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-50 p-3 text-sm text-cyan-900">
                  <Icon className="h-4 w-4 shrink-0 text-cyan-700" />
                  <span>{member.focus}</span>
                </div>

                <ul className="mt-4 w-full space-y-2 text-left">
                  {member.contributions.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-slate-600">
                      <ItemIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-600" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </ContainerScroll>
    </section>
  );
}
