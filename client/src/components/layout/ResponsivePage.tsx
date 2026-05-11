import React from "react";

interface ResponsivePageProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * ResponsivePage
 * - Mobile (default): natural flow with vertical scroll
 * - Desktop (md+): keeps the fixed container used across admin pages with sidebar/header margins
 */
export default function ResponsivePage({ children, className = "" }: ResponsivePageProps) {
  return (
    <div className={[
      // Use a full-width, height-aware container that relies on the outer
      // page-frame provided by MainLayout. Avoid fixed positioning or inline
      // margins here: those created layout conflicts with the sidebar.
      'w-full min-h-full bg-transparent',
      className,
    ].join(' ')}>
      <div className="container mx-auto px-3 py-4 md:px-4 md:py-8">
        {children}
      </div>
    </div>
  );
}
