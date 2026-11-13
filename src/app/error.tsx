'use client';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-4 px-6 text-center" role="alert">
      <h1 className="text-2xl text-white">Something went wrong</h1>
      <p className="text-[15px] text-[#b4b4be]">The app hit an unexpected problem. Your progress is safe on this phone.</p>
      <button type="button" className="pill-primary min-h-12" onClick={reset}>Try again</button>
      <button type="button" className="pill min-h-12" onClick={() => window.location.reload()}>Restart the app</button>
    </main>
  );
}
