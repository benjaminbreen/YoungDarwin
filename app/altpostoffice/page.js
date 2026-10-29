import { notFound, redirect } from 'next/navigation';
import { devRoutesEnabled } from '../devRoutes';

// Shortcut to North Cormorant Beach (opaque id ALT_POST_OFFICE_BAY; the map
// began as an alternate Post Office Bay prototype):
// /altpostoffice -> /three?zone=ALT_POST_OFFICE_BAY
export default function AltPostOfficePage() {
  if (!devRoutesEnabled()) notFound();
  redirect('/three?zone=ALT_POST_OFFICE_BAY');
}
