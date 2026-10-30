import { useEffect, useRef, useState } from 'react';

export const sections = [
  ['overview', 'grid', 'Overview'],
  ['managed', 'terminal', 'Sessions'],
  ['setup', 'plug', 'Quick setup'],
  ['registry', 'layers', 'Optimizer Registry'],
  ['optimizers', 'layers', 'Local Library'],
  ['validation', 'health', 'Validation'],
  ['profiles', 'grid', 'Profiles'],
  ['cost-usage', 'chart', 'Cost & Usage'],
  ['benchmarks', 'chart', 'Experiments'],
  ['settings', 'plug', 'Settings'],
  ['sessions', 'folder', 'Saved history'],
  ['analytics', 'chart', 'Shared analytics'],
  ['connectors', 'plug', 'Connectors'],
  ['headroom', 'layers', 'Headroom'],
  ['rtk', 'terminal', 'RTK'],
  ['serena', 'code', 'Serena'],
  ['health', 'health', 'System health'],
] as const;

export function useSectionNavigation(ready: boolean) {
  const [active, setActive] = useState<string>('overview');
  const destination = useRef<string | null>(null);
  const select = (id: string) => { destination.current = id; setActive(id); };
  useEffect(() => {
    if (!ready) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      // Compact sections near the page end cannot always align with the top.
      // Preserve an explicit anchor selection until the user scrolls again.
      if (destination.current) { setActive(destination.current); return; }
      const offset = innerWidth <= 620 ? 135 : 110;
      const current = sections.filter(([id]) => (document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) <= offset).at(-1);
      setActive(current?.[0] ?? 'overview');
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    const onUserScroll = () => { destination.current = null; onScroll(); };
    const onKey = (event: KeyboardEvent) => { if (['ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(event.key)) onUserScroll(); };
    const onHash = () => {
      const id = location.hash.slice(1);
      if (sections.some(([key]) => key === id)) { destination.current = id; setActive(id); }
    };
    const target = location.hash.slice(1);
    if (sections.some(([id]) => id === target)) {
      destination.current = target;
      document.getElementById(target)?.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
    update();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onUserScroll);
    addEventListener('wheel', onUserScroll, { passive: true });
    addEventListener('touchmove', onUserScroll, { passive: true });
    addEventListener('keydown', onKey);
    addEventListener('hashchange', onHash);
    return () => {
      cancelAnimationFrame(frame); removeEventListener('scroll', onScroll); removeEventListener('resize', onUserScroll);
      removeEventListener('wheel', onUserScroll); removeEventListener('touchmove', onUserScroll);
      removeEventListener('keydown', onKey); removeEventListener('hashchange', onHash);
    };
  }, [ready]);
  return { active, setActive: select };
}
