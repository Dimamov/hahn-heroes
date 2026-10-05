import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { PushSettings } from '../components/PushSettings.tsx';

export function Notifications() {
  const { backend, go } = useSession();
  return (
    <main className="screen">
      <ScreenBar title="Hero alerts" onBack={() => go('profile')} />
      <PushSettings backend={backend} role="kid" />
    </main>
  );
}
