'use client';

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: '#050506', color: '#fff', fontFamily: 'system-ui, sans-serif', margin: 0 }}>
        <main role="alert" style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>Something went wrong</h1>
          <p style={{ color: '#b4b4be', margin: 0 }}>Your progress is safe on this phone.</p>
          <button type="button" onClick={reset} style={{ minHeight: 48, borderRadius: 8, border: 0, background: '#fff', color: '#050506', fontWeight: 600 }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
