'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Shortcut for testing the third Post Office Bay prototype:
// localhost:3000/postofficebay3 -> /three?zone=POST_OFFICE_BAY_3
export default function PostOfficeBay3Page() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/three?zone=POST_OFFICE_BAY_3');
  }, [router]);
  return null;
}
