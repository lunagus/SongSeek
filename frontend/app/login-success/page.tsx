"use client"

import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle, XCircle, Loader2, Music, Apple, Cloud, Play, Headphones } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import type { JSX } from "react/jsx-runtime"

export default function LoginSuccess() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading")
  const [platform, setPlatform] = useState<string>("")
  const [progress, setProgress] = useState(0)
  const [countdown, setCountdown] = useState(3)
  const searchParams = useSearchParams()
  const router = useRouter()

  const platformIcons = {
    Spotify: <Music className="h-8 w-8 text-green-500" />,
    YouTube: <Play className="h-8 w-8 text-red-500" />,
    Deezer: <Headphones className="h-8 w-8 text-[#9F47FF]" />,
    "Apple Music": <Apple className="h-8 w-8 text-gray-900 dark:text-white" />,
    Tidal: <Headphones className="h-8 w-8 text-cyan-500" />,
    "Amazon Music": <Music className="h-8 w-8 text-orange-500" />,
  }

  const platformGradients = {
    Spotify: "from-green-300 to-green-400",
    YouTube: "from-red-300 to-red-400",
    Deezer: "from-[#9F47FF] to-[#7C2AE8]",
    "Apple Music": "from-gray-300 to-gray-400",
    Tidal: "from-cyan-300 to-cyan-400",
    "Amazon Music": "from-orange-300 to-orange-400",
  }

  useEffect(() => {
    // Accept both 'session' and 'spotify_session' for Spotify
    const spotifySession = searchParams.get("spotify_session") || searchParams.get("session");
    const ytSession = searchParams.get("yt_session") || searchParams.get("youtube_session");
    const deezerSession = searchParams.get("deezer_session");
    const appleSession = searchParams.get("apple_session");

    let detectedPlatform = "";
    let sessionKey = "";

    // Only set in localStorage if a new session is provided
    if (spotifySession) {
      detectedPlatform = "Spotify";
      sessionKey = "spotify_session";
      if (localStorage.getItem(sessionKey) !== spotifySession) {
        localStorage.setItem(sessionKey, spotifySession);
      }
    } else if (ytSession) {
      detectedPlatform = "YouTube";
      sessionKey = "yt_session";
      if (localStorage.getItem(sessionKey) !== ytSession) {
        localStorage.setItem(sessionKey, ytSession);
      }
    } else if (deezerSession) {
      detectedPlatform = "Deezer";
      sessionKey = "deezer_session";
      if (localStorage.getItem(sessionKey) !== deezerSession) {
        localStorage.setItem(sessionKey, deezerSession);
      }
    } else if (appleSession) {
      detectedPlatform = "Apple Music";
      sessionKey = "apple_session";
      if (localStorage.getItem(sessionKey) !== appleSession) {
        localStorage.setItem(sessionKey, appleSession);
      }
    }

    if (detectedPlatform) {
      setPlatform(detectedPlatform);

      // Animate progress
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            clearInterval(progressInterval);
            setStatus("success");
            return 100;
          }
          return prev + 10;
        });
      }, 100);

      // Countdown and redirect
      setTimeout(() => {
        const countdownInterval = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(countdownInterval);
              router.push("/");
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }, 1500);
    } else {
      setStatus("error");
    }
  }, [searchParams, router]);

  const handleManualRedirect = () => {
    router.push("/")
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-2xl border-0 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm">
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-6">
            {status === "loading" && (
              <div className="relative">
                <div className="p-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full">
                  <Loader2 className="h-8 w-8 animate-spin text-white" />
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full animate-ping opacity-20"></div>
              </div>
            )}
            {status === "success" && (
              <div className="relative">
                <div className={`p-4 bg-gradient-to-r ${platformGradients[platform as keyof typeof platformGradients]} rounded-full`}>
                  {platformIcons[platform as keyof typeof platformIcons]}
                </div>
                <div className="absolute -top-1 -right-1 p-1 bg-green-500 rounded-full">
                  <CheckCircle className="h-4 w-4 text-white" />
                </div>
              </div>
            )}
            {status === "error" && (
              <div className="p-4 bg-gradient-to-r from-red-500 to-red-600 rounded-full">
                <XCircle className="h-8 w-8 text-white" />
              </div>
            )}
          </div>

          <CardTitle className="text-2xl">
            {status === "loading" && "Connecting..."}
            {status === "success" && "Successfully Connected!"}
            {status === "error" && "Connection Failed"}
          </CardTitle>

          <CardDescription className="text-base">
            {status === "loading" && `Establishing connection with ${platform}...`}
            {status === "success" && `You're now connected to ${platform}. Redirecting you back to SongSeek...`}
            {status === "error" && "Unable to establish connection. Please try again."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {status === "loading" && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Setting up connection...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {status === "success" && (
            <div className="text-center space-y-4">
              <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center justify-center gap-2 text-green-700 dark:text-green-300">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Connection Established</span>
                </div>
                <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                  You can now convert playlists to and from {platform}
                </p>
              </div>

              <div className="text-sm text-muted-foreground">
                Redirecting in <span className="font-bold text-blue-600">{countdown}</span> seconds...
              </div>

              <Button
                onClick={handleManualRedirect}
                className={`w-full bg-gradient-to-r ${platformGradients[platform as keyof typeof platformGradients]} hover:opacity-90 transition-opacity`}
              >
                Continue to SongSeek
              </Button>
            </div>
          )}

          {status === "error" && (
            <div className="text-center space-y-4">
              <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800">
                <div className="flex items-center justify-center gap-2 text-red-700 dark:text-red-300">
                  <XCircle className="h-5 w-5" />
                  <span className="font-medium">Connection Failed</span>
                </div>
                <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                  Please check your credentials and try again
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={handleManualRedirect} className="flex-1 bg-transparent">
                  Back to SongSeek
                </Button>
                <Button onClick={() => window.location.reload()} className="flex-1">
                  Try Again
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
