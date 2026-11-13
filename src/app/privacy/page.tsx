import type { Metadata } from 'next';
import { PrivacyText } from '@/components/LegalText';

export const metadata: Metadata = { title: 'AstroPulse privacy policy' };

export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <h1 className="text-3xl text-white">AstroPulse privacy policy</h1>
      <PrivacyText />
    </main>
  );
}
