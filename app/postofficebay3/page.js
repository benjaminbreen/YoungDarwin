import { notFound, redirect } from 'next/navigation';
import { devRoutesEnabled } from '../devRoutes';

// Shortcut for testing the third Post Office Bay prototype:
// /postofficebay3 -> /three?zone=POST_OFFICE_BAY_3
export default function PostOfficeBay3Page() {
  if (!devRoutesEnabled()) notFound();
  redirect('/three?zone=POST_OFFICE_BAY_3');
}
