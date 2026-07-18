import type { ReactNode } from 'react';

export default function SimulatorPageShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen"
      style={{
        color: '#171511',
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        fontSize: 14,
        lineHeight: 1.45,
        borderTop: '6px solid #11100E',
        backgroundColor: '#FBFAF7',
        backgroundImage:
          'linear-gradient(rgba(150,119,86,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(150,119,86,.055) 1px,transparent 1px)',
        backgroundSize: '42px 42px',
      }}
    >
      <div className="mx-auto" style={{ maxWidth: 1180, padding: '18px 20px 48px' }}>
        {children}
      </div>
    </div>
  );
}
