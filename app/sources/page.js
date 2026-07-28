import { SourcesView } from '../../three-game/ui/SourcesView';

// A server component so the page carries its own metadata: this route is meant
// to be linked from a syllabus or a citation, not only reached from the menu.
export const metadata = {
  title: 'Sources & Further Reading — Young Darwin',
  description:
    'The bibliography, provenance, and methods behind Young Darwin: what is documented, what is reconstructed, what is invented, and how the generated text is produced.',
};

export default function SourcesPage() {
  return <SourcesView />;
}
