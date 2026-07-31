import type { ReactNode } from 'react';

export default function SimulatorPageShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen"
      style={{
        color: '#1D1C19',
        fontFamily: "var(--font-inter), Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        fontSize: 14,
        lineHeight: 1.45,
        backgroundColor: '#F4F3EF',
      }}
    >
      <div className="mx-auto" style={{ maxWidth: 1280, padding: '24px 24px 56px' }}>
        {children}
      </div>
    </div>
  );
}
