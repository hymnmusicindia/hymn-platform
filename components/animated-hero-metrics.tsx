// Product commitments instead of unverified performance claims.
export function AnimatedHeroMetrics() {
  return <div className="mt-7 grid max-w-3xl grid-cols-2 gap-4 sm:mt-9 sm:grid-cols-3" aria-label="Why start with HYMN">{[
    ['Your rights', 'Review clear terms before submitting'],
    ['Your pace', 'Explore services before signing in'],
    ['One workspace', 'Beats, studio and distribution']
  ].map(([title, description]) => <div key={title} className="border-l border-white/25 pl-3 sm:pl-4"><p className="text-lg font-semibold text-white">{title}</p><p className="mt-2 text-sm leading-6 text-white/70">{description}</p></div>)}</div>;
}
