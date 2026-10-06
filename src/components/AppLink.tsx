import type { ReactNode } from 'react';
import { navigate } from '../lib/navigation';
import { siteHref } from '../lib/site-path';

export function AppLink({
  to,
  children,
  className = 'secondary-button inline-flex items-center justify-center',
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={siteHref(to)}
      className={className}
      onClick={(event) => {
        if (
          event.button !== 0 ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
