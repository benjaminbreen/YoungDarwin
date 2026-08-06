import { ThreeLaunchShell } from '../../three-game/ui/ThreeLaunchShell';

const title = 'Play as Darwin — Young Darwin';
const description =
  'Begin a naturalist expedition ashore on Floreana in September 1835: observe, collect, travel, and record.';
const image = '/assets/ui/splash-background-1672.webp';

// A server component so the deep link carries its own share card. The shell it
// renders is a client component; nothing here needs to run in the browser.
export const metadata = {
  title,
  description,
  openGraph: { title, description, siteName: 'Young Darwin', type: 'website', images: [{ url: image }] },
  twitter: { card: 'summary_large_image', title, description, images: [image] },
};

export default function DarwinModePage() {
  return <ThreeLaunchShell initialModeId="darwin" />;
}
