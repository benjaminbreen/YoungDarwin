import { notFound, redirect } from 'next/navigation';
import { devRoutesEnabled } from '../devRoutes';

// Shortcut for testing the alternate Post Office Bay map:
// /altpostoffice -> /three?zone=ALT_POST_OFFICE_BAY
export default function AltPostOfficePage() {
  if (!devRoutesEnabled()) notFound();
  redirect('/three?zone=ALT_POST_OFFICE_BAY');
}
