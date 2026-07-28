import { notFound } from 'next/navigation';
import { devRoutesEnabled } from '../devRoutes';
import LegacyGameView from './LegacyGameView';

export default function LegacyPage() {
  if (!devRoutesEnabled()) notFound();
  return <LegacyGameView />;
}
