"use client";

import { useSearchParams } from "next/navigation";
import AdvancedPlaylistCreator from "@/components/advanced-playlist-creator";

export default function AdvancedPage() {
  const searchParams = useSearchParams();
  const session = searchParams.get("session") || "";
  const sourcePlatform = searchParams.get("source") || "spotify";
  const targetPlatform = searchParams.get("target") || "spotify";
  const initialPlaylistName = searchParams.get("name") || undefined;

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
