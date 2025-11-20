import AdvancedPlaylistCreator from "@/components/advanced-playlist-creator";

interface AdvancedPageProps {
  searchParams?: {
    session?: string;
    source?: string;
    target?: string;
    name?: string;
  };
}

export default function AdvancedPage({ searchParams }: AdvancedPageProps) {
  const session = searchParams?.session || "";
  const sourcePlatform = searchParams?.source || "spotify";
  const targetPlatform = searchParams?.target || "spotify";
  const initialPlaylistName = searchParams?.name || undefined;

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center text-gray-700 dark:text-gray-200">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Advanced Editor</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Missing conversion session. Please run a playlist conversion first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <AdvancedPlaylistCreator
      session={session}
      sourcePlatform={sourcePlatform}
      targetPlatform={targetPlatform}
      initialPlaylistName={initialPlaylistName}
    />
  );
}
