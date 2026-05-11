import React from 'react';
import MainLayout from './MainLayout';

interface SharedLayoutProps {
  children: React.ReactNode;
  showHeader?: boolean;
}

export default function SharedLayout({ children, showHeader = true }: SharedLayoutProps) {
  return (
    <MainLayout>
      <div className="container mx-auto py-6">
        {children}
      </div>
    </MainLayout>
  );
}
