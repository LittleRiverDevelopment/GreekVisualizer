import { useEffect, useState } from 'react';

export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

export function useWebGL(): boolean {
  const [ok, setOk] = useState(true);
  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      setOk(Boolean(gl));
    } catch {
      setOk(false);
    }
  }, []);
  return ok;
}

export function useTheme(): { theme: 'light' | 'dark'; toggle: () => void } {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  );
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('greekvisualizer.theme', theme);
    } catch {
      /* storage may be blocked; the class still updates */
    }
  }, [theme]);
  return {
    theme,
    toggle: () => setTheme((current) => (current === 'dark' ? 'light' : 'dark')),
  };
}
