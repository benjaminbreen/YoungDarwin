import { ThreeLaunchShell } from '../../three-game/ui/ThreeLaunchShell';

const title = 'Play as a Tortoise — Young Darwin';
const description =
  'Live Floreana as a Floreana giant tortoise in September 1835: slow highland grazing, and the island as a chelonian sees it.';
const image = '/assets/ui/splash-background-1672.webp';

// A server component so the deep link carries its own share card. The shell it
// renders is a client component; nothing here needs to run in the browser.
export const metadata = {
  title,
  description,
  openGraph: { title, description, siteName: 'Young Darwin', type: 'website', images: [{ url: image }] },
  twitter: { card: 'summary_large_image', title, description, images: [image] },
};

export default function TortoiseModePage() {
  return <ThreeLaunchShell initialModeId="tortoise" />;
}
