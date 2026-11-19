// @polsia:user-owned — Dayweft's public home page.
import type { Metadata } from 'next';
import { DayweftLanding } from '@/components/custom/dayweft-landing';
import { siteDescription, siteName } from '@/lib/brand';

export const metadata: Metadata = {
  title: { absolute: siteName },
  description: siteDescription,
  alternates: { canonical: '/' },
};

export default function HomePage() {
  return <DayweftLanding />;
}
