import { ThreeLaunchShell } from '../../three-game/ui/ThreeLaunchShell';

const title = 'Play as a Finch — Young Darwin';
const description =
  'Fly Floreana as a medium ground finch: the same island of September 1835, seen from the air and lived at a bird’s scale.';
const image = '/assets/ui/splash-background-1672.webp';

// A server component so the deep link carries its own share card. The shell it
// renders is a client component; nothing here needs to run in the browser.
export const metadata = {
  title,
  description,
  openGraph: { title, description, siteName: 'Young Darwin', type: 'website', images: [{ url: image }] },
  twitter: { card: 'summary_large_image', title, description, images: [image] },
};

export default function FinchModePage() {
  return <ThreeLaunchShell initialModeId="finch" />;
}
