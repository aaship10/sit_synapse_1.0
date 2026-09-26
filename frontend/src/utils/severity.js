// Shared severity styling + copy. Full class strings so Tailwind can see them.
export const SEVERITY = {
  critical: {
    label: 'Critical',
    headline: 'Do not operate',
    text: 'text-severity-critical',
    bg: 'bg-severity-critical-bg',
    dot: 'bg-severity-critical',
  },
  warning: {
    label: 'Warning',
    headline: 'Service soon — limited operation',
    text: 'text-severity-warning',
    bg: 'bg-severity-warning-bg',
    dot: 'bg-severity-warning',
  },
  safe: {
    label: 'Safe',
    headline: 'Safe to operate — schedule service',
    text: 'text-severity-safe',
    bg: 'bg-severity-safe-bg',
    dot: 'bg-severity-safe',
  },
};

export const SEVERITY_LEVELS = Object.keys(SEVERITY);
