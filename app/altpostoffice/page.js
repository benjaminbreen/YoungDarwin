'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Shortcut for testing the alternate Post Office Bay map:
// localhost:3004/altpostoffice -> /three?zone=ALT_POST_OFFICE_BAY
export default function AltPostOfficePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/three?zone=ALT_POST_OFFICE_BAY');
  }, [router]);
  return null;
}
