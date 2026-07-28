import { notFound } from 'next/navigation';
import { devRoutesEnabled } from '../devRoutes';
import SkyTestView from './SkyTestView';

export default function SkyTestPage() {
  if (!devRoutesEnabled()) notFound();
  return <SkyTestView />;
}
