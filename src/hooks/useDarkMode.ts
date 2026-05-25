import { useState, useEffect } from 'react';

function getInitialTheme(): boolean {
  const saved = localStorage.getItem('wc2026_theme');
  if (saved) return saved === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function useDarkMode() {
  const [dark, setDark] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem('wc2026_theme', dark ? 'dark' : 'light');
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', dark ? '#0d0f1a' : '#f0f4ff');
  }, [dark]);

  return [dark, () => setDark(d => !d)] as const;
}
