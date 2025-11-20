"use client"

import { useState, useEffect, useCallback, Suspense, lazy, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import {
  Music,
  Copy,
  Loader2,
  CheckCircle,
  XCircle,
  Moon,
  Sun,
  RefreshCw,
  Apple,
  Cloud,
  AlertTriangle,
  HelpCircle,
  Play,
  Headphones,
  Radio,
  Send,
  Settings,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import { PlatformBadge } from "@/components/platform-badge"
import { DragDropZone } from "@/components/drag-drop-zone"
import { TrackResultDisplay } from "@/components/track-result-display"
import { MusicWaveAnimation } from "@/components/music-wave-animation"
import { FeedbackModal } from "@/components/feedback-modal"
import { trackEvent, trackConversion, trackError } from "@/lib/analytics"
import type { JSX } from "react/jsx-runtime"
import { getOAuthUrl, convertDeezerToSpotify, convertSpotifyToYouTube, convertSpotifyToDeezer, convertYouTubeToSpotify, convertYouTubeToDeezer, listenToProgress, getConversionResults, convertTrack, convertWebPlaylist, validateDeezerARL, exportSpotifyAccount, importSpotifyAccount } from "@/lib/api";
import {
  SpotifyIcon,
  YouTubeMusicIcon,
  DeezerIcon,
  AppleMusicIcon,
  TidalIcon,
  AmazonMusicIcon,
  GitHubIcon,
  BuyMeACoffeeIcon,
} from "@/components/platform-icons"

// Lazy load heavy components for better performance
const ConversionProgress = lazy(() =>
  import("@/components/conversion-progress").then((m) => ({ default: m.ConversionProgress })),
)
const ConversionResults = lazy(() =>
  import("@/components/conversion-results").then((m) => ({ default: m.ConversionResults })),
)
const OnboardingFlow = lazy(() => import("@/components/onboarding-flow").then((m) => ({ default: m.OnboardingFlow })))

interface LoginStatus {
  spotify: boolean
  youtube: boolean
  deezer: boolean
  appleMusic: boolean
}

interface ConversionResult {
  matched: Array<{ title: string; artist: string; status: "success" }>
  skipped: Array<{ title: string; artist: string; reason: string }>
  mismatched: Array<{
    title: string
    artist: string
    suggestions: Array<{ title: string; artist: string; id: string }>
  }>
}

interface TrackConversionResult {
  sourceTrack: {
    title: string
    artist: string
  }
  targetUrl: string
  targetPlatform: string
}

// Loading fallback component
function ComponentLoader() {
  return (
    <div className="flex items-center justify-center p-8">
      <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
    </div>
  )
}

export default function SongSeekApp() {
  const [trackLink, setTrackLink] = useState("")
  const [playlistLink, setPlaylistLink] = useState("")
  const [trackTarget, setTrackTarget] = useState("deezer")
  const [playlistTarget, setPlaylistTarget] = useState("spotify")
  const [loginStatus, setLoginStatus] = useState<LoginStatus>({
    spotify: false,
    youtube: false,
    deezer: false,
    appleMusic: false,
  })
  const [isConverting, setIsConverting] = useState(false)
  const [feedback, setFeedback] = useState("")
  const [feedbackType, setFeedbackType] = useState<"error" | "warning" | "info">("error")
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [isFirstVisit, setIsFirstVisit] = useState(false)
  const [currentSession, setCurrentSession] = useState<string | undefined>(undefined)
  const [mounted, setMounted] = useState(false)
  const trackResultRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()
  const { theme, setTheme } = useTheme()
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const progressClosedRef = useRef(false)
  const [conversionResults, setConversionResults] = useState<ConversionResult | null>(null)
  const [showProgress, setShowProgress] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [trackConversionResult, setTrackConversionResult] = useState<TrackConversionResult | null>(null)
  const [backupData, setBackupData] = useState<any | null>(null)
  const [backupFileName, setBackupFileName] = useState<string | null>(null)
  const [backupSummary, setBackupSummary] = useState<{ playlists: number; tracks: number } | null>(null)
  const [isBackupProcessing, setIsBackupProcessing] = useState(false)
  const router = useRouter()

  // Check session validity with backend
  async function checkSessionValidity(platform: string, sessionKey: string) {
    if (!sessionKey) return false;
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL!;
    try {
      const res = await fetch(`${backendUrl}/api/check-session?platform=${platform}&session=${sessionKey}`, {
        credentials: 'include'
      });
      if (res.ok) {
        return true;
      } else {
        // Session invalid, remove from localStorage (this is normal behavior)
        localStorage.removeItem(`${platform}_session`);
        console.log(`[INFO] Session validation failed for ${platform} - session removed from localStorage`);
        return false;
      }
    } catch (err) {
      // On error, assume session is invalid (this is normal behavior)
      localStorage.removeItem(`${platform}_session`);
      console.log(`[INFO] Session validation error for ${platform} - session removed from localStorage`);
      return false;
    }
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    // Track page view
    trackEvent("page_view", {
      page: "home",
      timestamp: new Date().toISOString(),
      user_agent: navigator.userAgent,
      screen_resolution: `${window.screen.width}x${window.screen.height}`,
      viewport_size: `${window.innerWidth}x${window.innerHeight}`,
    })

    // Check if this is the user's first visit
    const hasVisited = localStorage.getItem("songseek_visited")
    const hasCompletedOnboarding = localStorage.getItem("songseek_onboarding_completed")

    if (!hasVisited) {
      setIsFirstVisit(true)
      localStorage.setItem("songseek_visited", "true")
      trackEvent("first_visit", {
        timestamp: new Date().toISOString(),
        referrer: document.referrer,
      })
    }

    if (!hasCompletedOnboarding && !hasVisited) {
      // Show onboarding after a brief delay for first-time users
      setTimeout(() => {
        setShowOnboarding(true)
        trackEvent("onboarding_started", {
          trigger: "automatic",
          timestamp: new Date().toISOString(),
        })
      }, 1000)
    }

    // Check login status from localStorage, but verify with backend
    const sessions = {
      spotify: localStorage.getItem("spotify_session"),
      youtube: localStorage.getItem("yt_session"),
      deezer: localStorage.getItem("deezer_session"),
      appleMusic: localStorage.getItem("apple_session"),
    }

    // Validate sessions with backend
    async function validateSessions() {
      const spotifyValid = await checkSessionValidity("spotify", sessions.spotify || "");
      const youtubeValid = await checkSessionValidity("youtube", sessions.youtube || "");
      const deezerValid = await checkSessionValidity("deezer", sessions.deezer || "");
      const appleValid = await checkSessionValidity("apple", sessions.appleMusic || "");
    setLoginStatus({
        spotify: spotifyValid,
        youtube: youtubeValid,
        deezer: deezerValid,
        appleMusic: appleValid,
      });
    }
    validateSessions();

    // Track connected platforms
    const connectedPlatforms = Object.entries(sessions)
      .filter(([_, session]) => !!session)
      .map(([platform, _]) => platform)

    if (connectedPlatforms.length > 0) {
      trackEvent("platforms_connected", {
        platforms: connectedPlatforms,
        count: connectedPlatforms.length,
      })
    }
  }, [])

  const platforms = [
    {
      id: "spotify",
      name: "Spotify",
      icon: "spotify",
      color: "bg-green-600",
      hoverColor: "hover:bg-green-700",
      badgeColor: "bg-green-500/20 text-green-700 border-green-300/50",
      darkBadgeColor: "dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/30",
    },
    {
      id: "ytmusic",
      name: "YouTube Music",
      icon: "youtube",
      color: "bg-red-600",
      hoverColor: "hover:bg-red-700",
      badgeColor: "bg-red-500/20 text-red-700 border-red-300/50",
      darkBadgeColor: "dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30",
    },
    {
      id: "deezer",
      name: "Deezer",
      icon: "deezer",
      color: "bg-[#9F47FF]",
      hoverColor: "hover:bg-[#8a2be2]",
      badgeColor: "bg-[#9F47FF]/20 text-[#9F47FF] border-[#9F47FF]/30",
      darkBadgeColor: "dark:bg-[#9F47FF]/10 dark:text-[#9F47FF] dark:border-[#9F47FF]/30",
    },
    {
      id: "applemusic",
      name: "Apple Music",
      icon: "apple",
      color: "bg-gray-900",
      hoverColor: "hover:bg-gray-800",
      badgeColor: "bg-gray-500/20 text-gray-700 border-gray-300/50",
      darkBadgeColor: "dark:bg-gray-500/10 dark:text-gray-300 dark:border-gray-500/30",
    },
    {
      id: "tidal",
      name: "Tidal",
      icon: "tidal",
      color: "bg-cyan-600",
      hoverColor: "hover:bg-cyan-700",
      badgeColor: "bg-cyan-500/20 text-cyan-700 border-cyan-300/50",
      darkBadgeColor: "dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/30",
    },
    {
      id: "amazonmusic",
      name: "Amazon Music",
      icon: "amazonmusic",
      color: "bg-orange-500",
      hoverColor: "hover:bg-orange-600",
      badgeColor: "bg-orange-500/20 text-orange-700 border-orange-300/50",
      darkBadgeColor: "dark:bg-orange-500/10 dark:text-orange-300 dark:border-orange-500/30",
    },
  ]

  /**
   * Detect the music platform based on a given URL
   */
  const detectPlatform = (link: string): string | null => {
    // Extract URL from text that might contain additional content
    const extractUrlFromText = (text: string): string | null => {
      if (!text || typeof text !== 'string') {
        return null;
      }

      // Trim whitespace
      text = text.trim();

      // If the text is already a valid URL, return it
      try {
        new URL(text);
        return text;
      } catch (_) {
        // Not a valid URL, try to extract one
      }

      // Recognized platforms - same patterns as backend
      const PLATFORM_PATTERNS = {
        spotify: /https?:\/\/(?:open\.)?spotify\.com\/(?:track|album|playlist)\/[a-zA-Z0-9]+(?:\?[^\s]*)?/g,
        deezer: [
          /https?:\/\/(?:www\.)?deezer\.com\/(?:[a-z]{2}\/)?(?:track|album|playlist)\/\d+(?:\?[^\s]*)?/g,
          /https?:\/\/link\.deezer\.com\/[^\s]+/g
        ],
        youtube: [
          /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=[a-zA-Z0-9_-]+(?:\&[^\s]*)?/g,
          /https?:\/\/(?:www\.)?youtube\.com\/playlist\?list=[a-zA-Z0-9_-]+(?:\&[^\s]*)?/g,
          /https?:\/\/music\.youtube\.com\/watch\?v=[a-zA-Z0-9_-]+(?:\&[^\s]*)?/g,
          /https?:\/\/music\.youtube\.com\/playlist\?list=[a-zA-Z0-9_-]+(?:\&[^\s]*)?/g
        ],
        apple: [
          /https?:\/\/music\.apple\.com\/[a-z]{2}\/(?:album|playlist)\/[^\s]+/g,
          /https?:\/\/music\.apple\.com\/[a-z]{2}\/album\/[^\s]+\/id\d+(?:\?i=\d+)?/g
        ],
        tidal: [
          /https?:\/\/(?:www\.)?tidal\.com\/(?:browse\/)?(?:track|album|playlist)\/\d+/g,
          /https?:\/\/listen\.tidal\.com\/(?:browse\/)?(?:track|album|playlist)\/\d+/g
        ],
        amazon: [
          /https?:\/\/music\.amazon\.com\/(?:albums|playlists)\/[A-Z0-9]+(?:\?[^\s]*)?/g,
          /https?:\/\/www\.amazon\.com\/music\/player\/(?:tracks|albums|playlists)\/[A-Z0-9]+/g
        ]
      };

      // Try each platform's patterns
      for (const [platform, patterns] of Object.entries(PLATFORM_PATTERNS)) {
        const arr = Array.isArray(patterns) ? patterns : [patterns];

        for (const pattern of arr) {
          const matches = text.match(pattern);
          if (matches && matches.length > 0) {
            // Return the first match, but clean it up
            let url = matches[0];
            
            // Remove trailing punctuation that might be part of the text but not the URL
            url = url.replace(/[.,;!?]+$/, '');
            
            // Ensure the URL is properly formatted
            try {
              new URL(url);
              return url;
            } catch (_) {
              // Invalid URL, continue to next pattern
            }
          }
        }
      }

      return null;
    };

    // Extract URL from the input text
    const extractedUrl = extractUrlFromText(link);
    if (!extractedUrl) {
      return null;
    }

    // Now detect platform from the extracted URL with improved logic
    const url = extractedUrl.trim().toLowerCase();

    if (url.includes('deezer.com')) return 'deezer';
    if (url.includes('spotify.com')) return 'spotify';
    if (url.includes('music.youtube.com')) return 'ytmusic';
    if (url.includes('youtube.com/playlist')) return 'youtube';
    if (url.includes('youtube.com/watch') && url.includes('v=')) return 'youtube';
    if (url.includes('music.apple.com')) return 'applemusic';
    if (url.includes('tidal.com') || url.includes('listen.tidal.com')) return 'tidal';
    if (url.includes('music.amazon.com') || url.includes('amazon.com/music')) return 'amazonmusic';

    return null;
  }

  /**
   * Detect platform with additional type information (track, playlist, album)
   */
  const detectPlatformDetail = (link: string): { platform: string; type: string } | null => {
    // Extract URL from text that might contain additional content
    const extractUrlFromText = (text: string): string | null => {
      if (!text || typeof text !== 'string') {
        return null;
      }

      // Trim whitespace
      text = text.trim();

      // If the text is already a valid URL, return it
      try {
        new URL(text);
        return text;
      } catch (_) {
        // Not a valid URL, try to extract one
      }

      // Recognized platforms - same patterns as backend
      const PLATFORM_PATTERNS = {
        spotify: /https?:\/\/(?:open\.)?spotify\.com\/(?:track|album|playlist)\/[a-zA-Z0-9]+(?:\?[^\s]*)?/g,
        deezer: [
          /https?:\/\/(?:www\.)?deezer\.com\/(?:[a-z]{2}\/)?(?:track|album|playlist)\/\d+(?:\?[^\s]*)?/g,
          /https?:\/\/link\.deezer\.com\/[^\s]+/g
        ],
        youtube: [
          /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=[a-zA-Z0-9_-]+(?:\&[^\s]*)?/g,
          /https?:\/\/(?:www\.)?youtube\.com\/playlist\?list=[a-zA-Z0-9_-]+(?:\&[^\s]*)?/g,
          /https?:\/\/music\.youtube\.com\/watch\?v=[a-zA-Z0-9_-]+(?:\&[^\s]*)?/g,
          /https?:\/\/music\.youtube\.com\/playlist\?list=[a-zA-Z0-9_-]+(?:\&[^\s]*)?/g
        ],
        apple: [
          /https?:\/\/music\.apple\.com\/[a-z]{2}\/(?:album|playlist)\/[^\s]+/g,
          /https?:\/\/music\.apple\.com\/[a-z]{2}\/album\/[^\s]+\/id\d+(?:\?i=\d+)?/g
        ],
        tidal: [
          /https?:\/\/(?:www\.)?tidal\.com\/(?:browse\/)?(?:track|album|playlist)\/\d+/g,
          /https?:\/\/listen\.tidal\.com\/(?:browse\/)?(?:track|album|playlist)\/\d+/g
        ],
        amazon: [
          /https?:\/\/music\.amazon\.com\/(?:albums|playlists)\/[A-Z0-9]+(?:\?[^\s]*)?/g,
          /https?:\/\/www\.amazon\.com\/music\/player\/(?:tracks|albums|playlists)\/[A-Z0-9]+/g
        ]
      };

      // Try each platform's patterns
      for (const [platform, patterns] of Object.entries(PLATFORM_PATTERNS)) {
        const arr = Array.isArray(patterns) ? patterns : [patterns];

        for (const pattern of arr) {
          const matches = text.match(pattern);
          if (matches && matches.length > 0) {
            // Return the first match, but clean it up
            let url = matches[0];
            
            // Remove trailing punctuation that might be part of the text but not the URL
            url = url.replace(/[.,;!?]+$/, '');
            
            // Ensure the URL is properly formatted
            try {
              new URL(url);
              return url;
            } catch (_) {
              // Invalid URL, continue to next pattern
            }
          }
        }
      }

      return null;
    };

    // Extract URL from the input text
    const extractedUrl = extractUrlFromText(link);
    if (!extractedUrl) {
      return null;
    }

    const url = extractedUrl.trim().toLowerCase();

    const result = {
      platform: null as string | null,
      type: null as string | null
    };

    if (url.includes('spotify.com')) {
      result.platform = 'spotify';
      if (url.includes('/playlist/')) result.type = 'playlist';
      else if (url.includes('/album/')) result.type = 'album';
      else if (url.includes('/track/')) result.type = 'track';
    } else if (url.includes('deezer.com') || url.includes('link.deezer.com')) {
      result.platform = 'deezer';
      if (url.includes('/track/')) result.type = 'track';
      else if (url.includes('/album/')) result.type = 'album';
      else if (url.includes('/playlist/')) result.type = 'playlist';
    } else if (url.includes('music.youtube.com') || url.includes('youtube.com')) {
      result.platform = url.includes('music.youtube.com') ? 'ytmusic' : 'youtube';
      if (url.includes('/playlist?')) result.type = 'playlist';
      else if (url.includes('/watch?')) result.type = 'track';
    } else if (url.includes('music.apple.com')) {
      result.platform = 'applemusic';
      if (url.includes('/playlist/')) result.type = 'playlist';
      else if (url.includes('/album/')) result.type = 'album'; // might be track if `?i=`
    } else if (url.includes('tidal.com') || url.includes('listen.tidal.com')) {
      result.platform = 'tidal';
      if (url.includes('/track/')) result.type = 'track';
      else if (url.includes('/album/')) result.type = 'album';
      else if (url.includes('/playlist/')) result.type = 'playlist';
    } else if (url.includes('music.amazon.com') || url.includes('amazon.com/music')) {
      result.platform = 'amazonmusic';
      if (url.includes('/albums/')) result.type = 'album';
      else if (url.includes('/playlists/')) result.type = 'playlist';
      else if (url.includes('/tracks/')) result.type = 'track';
    }

    return result.platform ? result as { platform: string; type: string } : null;
  }

  const getDetailedError = (error: string, platform?: string) => {
    const errorMap: Record<string, { message: string; suggestion: string; type: "error" | "warning" | "info" }> = {
      private_playlist: {
        message: "This playlist is private and cannot be accessed",
        suggestion: "Make sure the playlist is public or you have the correct permissions",
        type: "error",
      },
      track_not_found: {
        message: "Track not found on the target platform",
        suggestion: "Try converting to a different platform or check if the track is available",
        type: "warning",
      },
      login_expired: {
        message: `Your ${platform} login has expired`,
        suggestion: "Please log in again to continue",
        type: "error",
      },
      rate_limited: {
        message: "Too many requests - please wait a moment",
        suggestion: "Try again in a few minutes",
        type: "warning",
      },
      invalid_link: {
        message: "Invalid or unsupported link format",
        suggestion: "Make sure you're using a valid playlist or track link",
        type: "error",
      },
      deezer_unavailable: {
        message: "Deezer playlist creation requires authentication.",
        suggestion: "Please login to Deezer using your ARL token to create playlists.",
        type: "warning",
      },
    }

    return (
      errorMap[error] || {
        message: "An unexpected error occurred",
        suggestion: "Please try again or contact support if the problem persists",
        type: "error" as const,
      }
    )
  }

  const showDetailedFeedback = (errorCode: string, platform?: string, canRetry = true) => {
    const error = getDetailedError(errorCode, platform)
    setFeedback(error.message)
    setFeedbackType(error.type)

    // Track error
    trackError(errorCode, {
      platform,
      error_type: error.type,
      can_retry: canRetry,
      timestamp: new Date().toISOString(),
    })

    if (canRetry) {
      toast({
        title: error.message,
        description: error.suggestion,
        action: (
          <Button size="sm" onClick={() => retryConversion()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Retry
          </Button>
        ),
      })
    }
  }

  const retryConversion = () => {
    setFeedback("")
    trackEvent("conversion_retry", {
      type: showProgress ? "playlist" : "track",
      timestamp: new Date().toISOString(),
    })

    if (showProgress) {
      handlePlaylistConvert()
    } else {
      handleTrackConvert()
    }
  }

  const pasteFromClipboard = async (setter: (value: string) => void) => {
    try {
      const text = await navigator.clipboard.readText()
      setter(text)

      const platform = detectPlatform(text)
      trackEvent("clipboard_paste", {
        has_valid_link: !!platform,
        detected_platform: platform,
        link_type: text.includes("playlist") ? "playlist" : "track",
        timestamp: new Date().toISOString(),
      })

      toast({
        description: "Link pasted from clipboard",
      })
    } catch (err) {
      trackError("clipboard_paste_failed", {
        error: err instanceof Error ? err.message : "Unknown error",
        timestamp: new Date().toISOString(),
      })

      toast({
        variant: "destructive",
        description: "Failed to paste from clipboard",
      })
    }
  }

  const handleDrop = useCallback((content: string, type: "link" | "file") => {
    trackEvent("drag_drop", {
      type,
      has_content: !!content,
      timestamp: new Date().toISOString(),
    })

    if (type === "link") {
      const platform = detectPlatform(content)
      if (platform) {
        if (content.includes("playlist")) {
          setPlaylistLink(content)
          toast({ description: "Playlist link added!" })
        } else {
          setTrackLink(content)
          toast({ description: "Track link added!" })
        }

        trackEvent("link_added", {
          platform,
          link_type: content.includes("playlist") ? "playlist" : "track",
          method: "drag_drop",
          timestamp: new Date().toISOString(),
        })
      } else {
        toast({
          variant: "destructive",
          description: "Invalid link format",
        })
      }
    } else {
      const links = content.split("\n").filter((line) => line.trim() && detectPlatform(line.trim()))
      if (links.length > 0) {
        setPlaylistLink(links[0])
        toast({ description: `Found ${links.length} valid link(s)` })

        trackEvent("file_processed", {
          links_found: links.length,
          method: "drag_drop",
          timestamp: new Date().toISOString(),
        })
      }
    }
  }, [])

  const handleTrackConvert = async () => {
    if (!trackLink.trim()) {
      showDetailedFeedback("invalid_link")
      return
    }

    const sourcePlatform = detectPlatform(trackLink)
    if (!sourcePlatform) {
      showDetailedFeedback("invalid_link")
      return
    }

    // Check if target platform is supported for track conversion
    const supportedPlatforms = ["spotify", "deezer", "ytmusic", "applemusic", "tidal", "amazonmusic"]
    if (!supportedPlatforms.includes(trackTarget)) {
      showDetailedFeedback("invalid_link")
      toast({
        variant: "destructive",
        title: "Unsupported Platform",
        description: `Track conversion to ${trackTarget} is not yet supported. Please use Spotify, Deezer, YouTube Music, Apple Music, Tidal, or Amazon Music.`,
      })
      return
    }

    setFeedback("")
    setIsConverting(true)
    setTrackConversionResult(null) // Clear previous results

    // Track conversion start
    const conversionId = `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    trackConversion("started", {
      conversion_id: conversionId,
      type: "track",
      source_platform: sourcePlatform,
      target_platform: trackTarget,
      timestamp: new Date().toISOString(),
    })

    try {
      const result = await convertTrack(trackLink, trackTarget, currentSession || '')
      
      setIsConverting(false)

      if (result && result.targetUrl) {
        // Track successful conversion
        trackConversion("completed", {
          conversion_id: conversionId,
          type: "track",
          source_platform: sourcePlatform,
          target_platform: trackTarget,
          success_rate: 100,
          timestamp: new Date().toISOString(),
        })

        // Store the conversion result
        setTrackConversionResult({
          sourceTrack: result.sourceTrack,
          targetUrl: result.targetUrl,
          targetPlatform: trackTarget
        })
        
        console.log('[DEBUG] Track conversion result set:', {
          sourceTrack: result.sourceTrack,
          targetUrl: result.targetUrl,
          targetPlatform: trackTarget
        })

        // Scroll to the results after a brief delay to ensure the component is rendered
        setTimeout(() => {
          trackResultRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          })
        }, 100)
      } else {
        throw new Error("Conversion failed: No success response received")
      }
    } catch (err: any) {
      setIsConverting(false)

      // Track failed conversion
      trackConversion("failed", {
        conversion_id: conversionId,
        error: err.message,
        source_platform: sourcePlatform,
        target_platform: trackTarget,
        timestamp: new Date().toISOString(),
      })

      // Show appropriate error message
      if (err.message.includes("No match found")) {
        showDetailedFeedback("track_not_found", trackTarget)
      } else if (err.message.includes("Unsupported")) {
        showDetailedFeedback("invalid_link")
      } else {
        setFeedback(err.message || "Error during track conversion")
        setFeedbackType("error")
        
        toast({
          variant: "destructive",
          title: "Track Conversion Failed",
          description: err.message || "An error occurred during conversion",
        })
      }
    }
  }

  const handlePlaylistConvert = async (mode: "quick" | "advanced" = "quick") => {
    if (!playlistLink.trim()) {
      showDetailedFeedback("invalid_link");
      return;
    }
    const sourcePlatform = detectPlatform(playlistLink);
    if (!sourcePlatform) {
      showDetailedFeedback("invalid_link");
      return;
    }
    if (sourcePlatform === playlistTarget && sourcePlatform !== "spotify") {
      setFeedback("Source and target platforms are the same. Please choose a different target platform.");
      setFeedbackType("warning");
      toast({
        variant: "destructive",
        title: "Invalid Conversion",
        description: `Conversion from ${sourcePlatform} to ${playlistTarget} is not necessary. Please select a different target platform.`,
      });
      return;
    }
    const targetPlatformKey = playlistTarget === "ytmusic" ? "youtube" : (playlistTarget as keyof LoginStatus);
    // Check authentication for all platforms including Deezer
    if (!loginStatus[targetPlatformKey]) {
      showDetailedFeedback("login_expired", playlistTarget, false);
      return;
    }
    setFeedback("");
    setIsConverting(true);
    setShowProgress(true); // Always show progress modal

    // Robustly get the session for the target platform
    let session: string | undefined = undefined;
    if (playlistTarget === "spotify") session = localStorage.getItem("spotify_session") || undefined;
    else if (playlistTarget === "ytmusic") session = localStorage.getItem("yt_session") || undefined;
    else if (playlistTarget === "deezer") session = localStorage.getItem("deezer_session") || undefined;
    else if (playlistTarget === "applemusic") session = localStorage.getItem("apple_session") || undefined;
    // fallback: try all
    if (!session) session = localStorage.getItem("spotify_session") || localStorage.getItem("yt_session") || localStorage.getItem("deezer_session") || localStorage.getItem("apple_session") || undefined;
    if (!session) {
      setIsConverting(false);
      setShowProgress(false);
      showDetailedFeedback("login_expired", playlistTarget, false);
      return;
    }
    setCurrentSession(session); // Always set currentSession

    // Track conversion start
    const conversionId = `playlist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    trackConversion("started", {
      conversion_id: conversionId,
      type: "playlist",
      source_platform: sourcePlatform,
      target_platform: playlistTarget,
      timestamp: new Date().toISOString(),
    });
    
    try {
      let conversionResponse: any = null;
      let eventSource: EventSource | null = null;

      // Deezer to Spotify conversion
      if (sourcePlatform === "deezer" && playlistTarget === "spotify") {
        const session = localStorage.getItem("spotify_session");
        if (!session) throw new Error("No Spotify session found. Please login to Spotify first.");
        
        setCurrentSession(session);
        
        eventSource = listenToProgress(session, (progress) => {
          // Progress updates handled by ConversionProgress component
        });
        
        conversionResponse = await convertDeezerToSpotify(playlistLink, session);
      }
      // Spotify to YouTube conversion
      else if (sourcePlatform === "spotify" && playlistTarget === "ytmusic") {
        const ytSession = localStorage.getItem("yt_session");
        const spToken = localStorage.getItem("spotify_session");
        
        if (!ytSession) throw new Error("No YouTube session found. Please login to YouTube first.");
        if (!spToken) throw new Error("No Spotify session found. Please login to Spotify first.");
        
        setCurrentSession(ytSession);
        
        // Extract playlist ID from Spotify URL
        const playlistIdMatch = playlistLink.match(/playlist\/([a-zA-Z0-9]+)/);
        if (!playlistIdMatch) throw new Error("Invalid Spotify playlist URL");
        const playlistId = playlistIdMatch[1];
        
        eventSource = listenToProgress(ytSession, (progress) => {
          // Progress updates handled by ConversionProgress component
        });
        
        conversionResponse = await convertSpotifyToYouTube(playlistId, ytSession, spToken);
      }
      // YouTube to Spotify conversion
      else if (sourcePlatform === "ytmusic" && playlistTarget === "spotify") {
        const session = localStorage.getItem("spotify_session");
        if (!session) throw new Error("No Spotify session found. Please login to Spotify first.");
        
        setCurrentSession(session);
        
        eventSource = listenToProgress(session, (progress) => {
          // Progress updates handled by ConversionProgress component
        });
        
        conversionResponse = await convertYouTubeToSpotify(playlistLink, session);
      }
      // Apple Music playlist conversion
      else if (sourcePlatform === "applemusic" && playlistTarget === "spotify") {
        const session = localStorage.getItem("spotify_session");
        if (!session) throw new Error("No Spotify session found. Please login to Spotify first.");
        
        setCurrentSession(session);
        
        eventSource = listenToProgress(session, (progress) => {
          // Progress updates handled by ConversionProgress component
        });
        
        conversionResponse = await convertWebPlaylist(playlistLink, "spotify", session);
        // Always use the session you passed in for polling
        setCurrentSession(conversionResponse.session || session);
      }
      // Spotify playlist cloning (Spotify -> Spotify)
      else if (sourcePlatform === "spotify" && playlistTarget === "spotify") {
        const session = localStorage.getItem("spotify_session") || undefined;
        if (!session) throw new Error("No Spotify session found. Please login to Spotify first.");
        setCurrentSession(session);
        eventSource = listenToProgress(session, (progress) => {
          // Progress updates handled by ConversionProgress component
        });
        conversionResponse = await convertWebPlaylist(playlistLink, "spotify", session);
        // Always use the session you passed in for polling
        setCurrentSession(conversionResponse.session || session);
      }
      // Apple Music to YouTube Music conversion
      else if (sourcePlatform === "applemusic" && playlistTarget === "ytmusic") {
        const ytSession = localStorage.getItem("yt_session");
        if (!ytSession) throw new Error("No YouTube session found. Please login to YouTube first.");
        
        setCurrentSession(ytSession);
        
        eventSource = listenToProgress(ytSession, (progress) => {
          // Progress updates handled by ConversionProgress component
        });
        
        conversionResponse = await convertWebPlaylist(playlistLink, "ytmusic", ytSession);
        setCurrentSession(conversionResponse.session || ytSession);
      }
      // Apple Music to Deezer conversion
      else if (sourcePlatform === "applemusic" && playlistTarget === "deezer") {
        const deezerSession = localStorage.getItem("deezer_session");
        if (!deezerSession) throw new Error("No Deezer session found. Please login to Deezer first.");
        setCurrentSession(deezerSession);
        eventSource = listenToProgress(deezerSession, (progress) => {
          // Progress updates handled by ConversionProgress component
        });
        conversionResponse = await convertWebPlaylist(playlistLink, "deezer", deezerSession);
        setCurrentSession(conversionResponse.session || deezerSession);
      }
      // Spotify to Deezer conversion
      else if (sourcePlatform === "spotify" && playlistTarget === "deezer") {
        const deezerSession = localStorage.getItem("deezer_session");
        if (!deezerSession) throw new Error("No Deezer session found. Please login to Deezer first.");
        setCurrentSession(deezerSession);
        eventSource = listenToProgress(deezerSession, (progress) => {
          // Progress updates handled by ConversionProgress component
        });
        conversionResponse = await convertWebPlaylist(playlistLink, "deezer", deezerSession);
        setCurrentSession(conversionResponse.session || deezerSession);
      }
      // YouTube to Deezer conversion
      else if (sourcePlatform === "ytmusic" && playlistTarget === "deezer") {
        const deezerSession = localStorage.getItem("deezer_session");
        if (!deezerSession) throw new Error("No Deezer session found. Please login to Deezer first.");
        setCurrentSession(deezerSession);
        eventSource = listenToProgress(deezerSession, (progress) => {
          // Progress updates handled by ConversionProgress component
        });
        conversionResponse = await convertWebPlaylist(playlistLink, "deezer", deezerSession);
        setCurrentSession(conversionResponse.session || deezerSession);
      }
      // Amazon Music to Spotify conversion
      else if (sourcePlatform === "amazonmusic" && playlistTarget === "spotify") {
        const session = localStorage.getItem("spotify_session") || undefined;
        if (!session) throw new Error("No Spotify session found. Please login to Spotify first.");
        setCurrentSession(session);
        eventSource = listenToProgress(session, (progress) => {
          // Progress updates handled by ConversionProgress component
        });
        conversionResponse = await convertWebPlaylist(playlistLink, "spotify", session);
        // Always use the session you passed in for polling
        setCurrentSession(conversionResponse.session || session);
      }
      // Amazon Music to YouTube Music conversion
      else if (sourcePlatform === "amazonmusic" && playlistTarget === "ytmusic") {
        const ytSession = localStorage.getItem("yt_session") || undefined;
        if (!ytSession) throw new Error("No YouTube session found. Please login to YouTube first.");
        setCurrentSession(ytSession);
        eventSource = listenToProgress(ytSession, (progress) => {
          // Progress updates handled by ConversionProgress component
        });
        conversionResponse = await convertWebPlaylist(playlistLink, "ytmusic", ytSession);
        setCurrentSession(conversionResponse.session || ytSession);
      }
      // Amazon Music to Deezer conversion
      else if (sourcePlatform === "amazonmusic" && playlistTarget === "deezer") {
        const deezerSession = localStorage.getItem("deezer_session");
        if (!deezerSession) throw new Error("No Deezer session found. Please login to Deezer first.");
        setCurrentSession(deezerSession);
        eventSource = listenToProgress(deezerSession, (progress) => {
          // Progress updates handled by ConversionProgress component
        });
        conversionResponse = await convertWebPlaylist(playlistLink, "deezer", deezerSession);
        setCurrentSession(conversionResponse.session || deezerSession);
      }
      // Tidal to Spotify conversion
      else if (sourcePlatform === "tidal" && playlistTarget === "spotify") {
        const session = localStorage.getItem("spotify_session") || undefined;
        if (!session) throw new Error("No Spotify session found. Please login to Spotify first.");
        setCurrentSession(session);
        eventSource = listenToProgress(session, (progress) => {
          // Progress updates handled by ConversionProgress component
        });
        conversionResponse = await convertWebPlaylist(playlistLink, "spotify", session);
        setCurrentSession(conversionResponse.session || session);
      }
      // Tidal to YouTube Music conversion
      else if (sourcePlatform === "tidal" && playlistTarget === "ytmusic") {
        const ytSession = localStorage.getItem("yt_session") || undefined;
        if (!ytSession) throw new Error("No YouTube session found. Please login to YouTube first.");
        setCurrentSession(ytSession);
        eventSource = listenToProgress(ytSession, (progress) => {
          // Progress updates handled by ConversionProgress component
        });
        conversionResponse = await convertWebPlaylist(playlistLink, "ytmusic", ytSession);
        setCurrentSession(conversionResponse.session || ytSession);
      }
      // Tidal to Deezer conversion
      else if (sourcePlatform === "tidal" && playlistTarget === "deezer") {
        const deezerSession = localStorage.getItem("deezer_session");
        if (!deezerSession) throw new Error("No Deezer session found. Please login to Deezer first.");
        setCurrentSession(deezerSession);
        eventSource = listenToProgress(deezerSession, (progress) => {
          // Progress updates handled by ConversionProgress component
        });
        conversionResponse = await convertWebPlaylist(playlistLink, "deezer", deezerSession);
        setCurrentSession(conversionResponse.session || deezerSession);
      }
      else {
        throw new Error(`Conversion from ${sourcePlatform} to ${playlistTarget} is not yet implemented.`);
      }

      // Close progress listener
      if (eventSource) {
        eventSource.close();
      }

      setIsConverting(false);
      setShowProgress(false);

      if (conversionResponse && conversionResponse.success) {
        // Track successful conversion
      trackConversion("completed", {
        conversion_id: conversionId,
        type: "playlist",
        source_platform: sourcePlatform,
        target_platform: playlistTarget,
          success_rate: 100,
        timestamp: new Date().toISOString(),
        });

        // Fetch conversion results
        // If the backend returns a new session, update currentSession
        if (conversionResponse.session && conversionResponse.session !== currentSession) {
          setCurrentSession(conversionResponse.session);
        }
        // Robust session selection for results
        let sessionToUse = conversionResponse.session || currentSession;
        if (!sessionToUse && playlistTarget === "deezer") {
          sessionToUse = localStorage.getItem("deezer_session") || undefined;
        }
        if (!sessionToUse) {
          setFeedback("Session expired or missing. Please log in to Deezer again.");
          setFeedbackType("error");
          setIsConverting(false);
          setShowProgress(false);
          return;
        }
        if (mode === "advanced") {
          router.push(
            `/advanced?session=${encodeURIComponent(sessionToUse)}&source=${encodeURIComponent(
              sourcePlatform,
            )}&target=${encodeURIComponent(playlistTarget)}`,
          )
        } else {
          setCurrentSession(sessionToUse);
          const results = await getConversionResults(sessionToUse);
          setConversionResults(results);
          console.log('[DEBUG] setConversionResults for session', sessionToUse, results);
          setShowResults(true);
        }

        // Show success message
        toast({
          title: "Conversion Successful! 🎉",
          description: "Review your conversion results below.",
        });
      } else {
        throw new Error("Conversion failed: No success response received");
      }
    } catch (err: any) {
      setIsConverting(false);
      setShowProgress(false);
      
      // Track failed conversion
      trackConversion("failed", {
        conversion_id: conversionId,
        error: err.message,
      timestamp: new Date().toISOString(),
      });

      // Handle authentication requirement errors
      if (err.requiresAuth && err.platform) {
        const platformName = err.platform === 'spotify' ? 'Spotify' : err.platform;
        setFeedback(`${platformName} login required: ${err.message}`);
        setFeedbackType("error");
        
        toast({
          variant: "destructive",
          title: `${platformName} Login Required`,
          description: err.message || `Please log in to ${platformName} to access this playlist`,
        });
        return;
      }

      // Check if this is a resolver error with debug information
      if (err.message && err.message.includes('No tracks found')) {
        setFeedback(`Amazon Music playlist error: ${err.message}. This usually means the playlist is private, empty, or Amazon Music has changed their page structure. Try using a public playlist with tracks.`);
      } else {
        setFeedback(err.message || "Error during conversion");
      }
      setFeedbackType("error");
      
      toast({
        variant: "destructive",
        title: "Conversion Failed",
        description: err.message || "An error occurred during conversion",
      });
    }
  };

  const handleLogin = (platform: string) => {
    // Check if Deezer is selected and show appropriate message
    if (platform === "deezer") {
      console.log('[DEBUG] Deezer login initiated');
      
      // For Deezer, we'll use ARL token instead of OAuth
      const arl = prompt("Please enter your Deezer ARL token:\n\nTo get your ARL token:\n1. Go to https://www.deezer.com and log in\n2. Open Developer Tools (F12)\n3. Go to Application → Cookies → https://www.deezer.com\n4. Copy the value of the 'arl' cookie\n\nNote: Use a test account for safety");
      
      if (arl && arl.trim()) {
        console.log('[DEBUG] Starting ARL validation...');
        
        // Validate the ARL token
        validateDeezerARL(arl.trim())
          .then((result: any) => {
            console.log('[DEBUG] ARL validation successful:', result);
            
            if (result.success) {
              console.log('[DEBUG] Storing Deezer session:', result.session);
              localStorage.setItem("deezer_session", result.session);
              setLoginStatus(prev => ({ ...prev, deezer: true }));
      toast({
                title: "Deezer Connected! 🎉",
                description: `Welcome, ${result.user.USERNAME || 'User'}!`,
              });
            } else {
              console.error('[DEBUG] ARL validation returned success: false:', result);
              toast({
                variant: "destructive",
                title: "Deezer Connection Failed",
                description: result.error || "Invalid ARL token",
              });
            }
          })
          .catch((error: any) => {
            console.error('[DEBUG] ARL validation failed with error:', error);
            
            toast({
              variant: "destructive",
              title: "Deezer Connection Failed",
              description: error.message || "Invalid ARL token",
      });
          });
      } else {
        console.log('[DEBUG] No ARL provided or empty ARL');
      }
      return;
    }
    
    trackEvent("login_attempt", {
      platform,
      timestamp: new Date().toISOString(),
    });
    window.location.href = getOAuthUrl(platform);
  };

  const handlePlatformChange = (newPlatform: string, type: "track" | "playlist") => {
    trackEvent("platform_changed", {
      type,
      new_platform: newPlatform,
      previous_platform: type === "track" ? trackTarget : playlistTarget,
      timestamp: new Date().toISOString(),
    })

    if (type === "track") {
      setTrackTarget(newPlatform)
    } else {
      setPlaylistTarget(newPlatform)
    }
  }

  const platformIcons = {
    spotify: SpotifyIcon,
    ytmusic: YouTubeMusicIcon,
    deezer: DeezerIcon,
    applemusic: AppleMusicIcon,
    tidal: TidalIcon,
    amazonmusic: AmazonMusicIcon,
  }

  const getPlatformIcon = (platform: string) => {
    const Icon = platformIcons[platform as keyof typeof platformIcons]
    return Icon ? <Icon className="h-4 w-4" /> : null
  }

  const getSelectedPlatform = () => {
    return platforms.find((p) => p.id === playlistTarget)
  }

  const getLoginStatusForPlatform = (platformId: string) => {
    const platformKey = platformId === "ytmusic" ? "youtube" : (platformId as keyof LoginStatus)
    return loginStatus[platformKey]
  }

  const handleOnboardingComplete = () => {
    localStorage.setItem("songseek_onboarding_completed", "true")
    trackEvent("onboarding_completed", {
      timestamp: new Date().toISOString(),
    })

    toast({
      title: "Welcome to SongSeek! 🎉",
      description: "You're ready to start converting playlists. Try pasting a playlist link to get started!",
    })
  }

  const showOnboardingManually = () => {
    setShowOnboarding(true)
    trackEvent("onboarding_started", {
      trigger: "manual",
      timestamp: new Date().toISOString(),
    })
  }

  const handleThemeChange = (isDark: boolean) => {
    setTheme(isDark ? "dark" : "light")
    trackEvent("theme_changed", {
      theme: isDark ? "dark" : "light",
      timestamp: new Date().toISOString(),
    })
  }

  const getLoginPlatformKey = (platformId: string) => {
    if (platformId === "ytmusic") return "youtube";
    return platformId;
  };

  const handleDeezerLogin = async () => {
    const arl = prompt("Please enter your Deezer ARL token:");
    if (!arl || arl.trim() === "") {
      console.log('[DEBUG] No ARL provided or empty ARL');
      return;
    }

    try {
      console.log('[DEBUG] Starting ARL validation...');
      const result = await validateDeezerARL(arl);
      
      if (result.success) {
        console.log('[DEBUG] ARL validation successful:', result);
        localStorage.setItem("deezer_session", result.session);
        console.log('[DEBUG] Storing Deezer session:', result.session);
        setLoginStatus(prev => ({ ...prev, deezer: true }));
        toast({
          title: "Login Successful",
          description: `Connected to Deezer as ${result.user.name}`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Login Failed",
          description: result.error || "Failed to validate ARL token",
        });
      }
    } catch (error) {
      console.error('Deezer login error:', error);
      toast({
        variant: "destructive",
        title: "Login Failed",
        description: error instanceof Error ? error.message : "Failed to connect to Deezer",
      });
    }
  };

  const handleSpotifyExport = async () => {
    const session = localStorage.getItem("spotify_session") || undefined;
    if (!session) {
      toast({
        variant: "destructive",
        title: "Spotify Not Connected",
        description: "Please connect your Spotify account first.",
      });
      return;
    }
    try {
      setIsBackupProcessing(true);
      const backup = await exportSpotifyAccount(session);
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const timestamp = new Date();
      const fileName = `songseek-spotify-backup-${timestamp.getFullYear()}_${
        timestamp.getMonth() + 1
      }_${timestamp.getDate()}.json`;
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: "Spotify Backup Exported",
        description: "Your Spotify account backup has been downloaded.",
      });
    } catch (error) {
      console.error("Spotify export error:", error);
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export Spotify account.",
      });
    } finally {
      setIsBackupProcessing(false);
    }
  };

  const handleBackupFileChange = async (event: any) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBackupFileName(file.name);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const playlists = Array.isArray(data.playlists) ? data.playlists.length : 0;
      const tracks = Array.isArray(data.playlists)
        ? data.playlists.reduce((sum: number, p: any) => sum + (Array.isArray(p.tracks) ? p.tracks.length : 0), 0)
        : 0;
      const savedTracks = Array.isArray(data.savedTracks) ? data.savedTracks.length : 0;
      setBackupData(data);
      setBackupSummary({ playlists, tracks: tracks + savedTracks });
      toast({
        title: "Backup File Loaded",
        description: `Playlists: ${playlists}, Tracks (including saved): ${tracks + savedTracks}`,
      });
    } catch (error) {
      console.error("Backup file parse error:", error);
      setBackupData(null);
      setBackupSummary(null);
      toast({
        variant: "destructive",
        title: "Invalid Backup File",
        description: "Please select a valid SongSeek Spotify backup JSON file.",
      });
    }
  };

  const handleSpotifyImport = async () => {
    if (!backupData) {
      toast({
        variant: "destructive",
        title: "No Backup Loaded",
        description: "Please select a backup JSON file first.",
      });
      return;
    }
    const session = localStorage.getItem("spotify_session") || undefined;
    if (!session) {
      toast({
        variant: "destructive",
        title: "Spotify Not Connected",
        description: "Please connect your Spotify account first.",
      });
      return;
    }
    try {
      setIsBackupProcessing(true);
      await importSpotifyAccount(session, backupData);
      toast({
        title: "Spotify Backup Imported",
        description: "Your Spotify playlists and saved tracks are being restored.",
      });
    } catch (error) {
      console.error("Spotify import error:", error);
      toast({
        variant: "destructive",
        title: "Import Failed",
        description: error instanceof Error ? error.message : "Failed to import Spotify account.",
      });
    } finally {
      setIsBackupProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 transition-colors duration-300">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 max-w-6xl">
        {/* Main Header Content - Centered */}
        <div className="text-center mb-8 sm:mb-12 relative min-h-[200px] sm:min-h-[250px]">
          {/* Controls - Overlay on top-right (Desktop Only) */}
          <div className="absolute top-0 right-0 hidden md888:flex items-center gap-3 sm:gap-4 z-20">
            {/* Help Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={showOnboardingManually}
              className="gap-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-gray-200/50 hover:bg-white dark:hover:bg-gray-800 transition-all duration-200"
            >
              <HelpCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Help</span>
            </Button>

            {/* Dark Mode Toggle */}
            <div className="flex items-center gap-2 p-2 rounded-lg bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50">
              <Sun className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              {mounted && (
              <Switch checked={theme === "dark"} onCheckedChange={handleThemeChange} />
              )}
              <Moon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </div>
          </div>

          {/* Enhanced Title */}
          <div className="space-y-4 sm:space-y-6 pt-4 relative z-10">
            <div className="relative max-w-4xl mx-auto px-4">
              {/* Music Wave Animation - Behind Title */}
              <MusicWaveAnimation className="z-0" />
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent leading-tight pb-2 sm:pb-4 relative z-10">
                SongSeek
              </h1>
            </div>
            <div className="space-y-2 sm:space-y-3">
              <p className="text-lg sm:text-xl lg:text-2xl text-gray-500 dark:text-gray-400 font-medium">
                Convert your music between platforms seamlessly
              </p>
            </div>
          </div>

          {/* Enhanced Platform Badges - Properly Centered */}
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mt-6 sm:mt-8 relative z-10">
            {platforms.map((platform) => (
              <PlatformBadge key={platform.id} platform={platform} />
            ))}
          </div>
        </div>

        {/* First Visit Welcome Banner */}
        {isFirstVisit && !localStorage.getItem("songseek_onboarding_completed") && (
          <Alert className="mb-6 sm:mb-8 border-blue-200 bg-blue-50/80 dark:bg-blue-950/20 backdrop-blur-sm">
            <CheckCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <span>
                <strong>Welcome to SongSeek!</strong> New here? Take our quick tutorial to get started.
              </span>
              <Button size="sm" onClick={showOnboardingManually} className="w-fit">
                Start Tutorial
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Main Content Grid */}
        <div className="space-y-6 sm:space-y-8">
          {/* Main Playlist Conversion - Hero Section */}
          <Card className="shadow-2xl border-0 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm overflow-hidden">
            <CardHeader className="pb-6 sm:pb-8 px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl shadow-lg">
                  <Music className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white">
                    Convert Playlist
                  </CardTitle>
                  <CardDescription className="text-base sm:text-lg text-gray-600 dark:text-gray-300 mt-2 sm:mt-3">
                    Transform entire music collections between platforms with intelligent matching
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-8 sm:space-y-10 px-4 sm:px-6 lg:px-8 pb-8 sm:pb-10">
              {/* Playlist Link Input */}
              <div className="space-y-4 sm:space-y-5">
                <Label
                  htmlFor="playlist-link"
                  className="text-lg font-semibold text-gray-900 dark:text-white"
                >
                  Playlist Link
                </Label>
                <div className="flex gap-3">
                  <Input
                    id="playlist-link"
                    placeholder="Paste your playlist link here..."
                    value={playlistLink}
                    onChange={(e) => setPlaylistLink(e.target.value)}
                    className="flex-1 h-12 sm:h-14 lg:h-16 text-base sm:text-lg px-4 sm:px-6 rounded-xl border-2 border-gray-200 dark:border-gray-700 focus:border-purple-500 dark:focus:border-purple-400 transition-colors"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => pasteFromClipboard(setPlaylistLink)}
                    className="shrink-0 h-12 w-12 sm:h-14 sm:w-14 lg:h-16 lg:w-16 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-purple-500 dark:hover:border-purple-400 transition-colors"
                  >
                    <Copy className="h-5 w-5 sm:h-6 sm:w-6" />
                  </Button>
                </div>
              </div>

              {/* Platform Selection and Login */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-10">
                <div className="space-y-4 sm:space-y-5">
                  <Label
                    htmlFor="playlist-target"
                    className="text-lg font-semibold text-gray-900 dark:text-white"
                  >
                    Convert to
                  </Label>
                  <Select value={playlistTarget} onValueChange={(value) => handlePlatformChange(value, "playlist")}>
                    <SelectTrigger className="h-12 sm:h-14 lg:h-16 text-base sm:text-lg rounded-xl border-2 border-gray-200 dark:border-gray-700 focus:border-purple-500 dark:focus:border-purple-400">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {platforms.filter(platform => ["spotify", "ytmusic", "deezer"].includes(platform.id)).map((platform) => (
                        <SelectItem 
                          key={platform.id} 
                          value={platform.id} 
                          className="text-base sm:text-lg py-3"
                        >
                          <div className="flex items-center gap-3">
                            {getPlatformIcon(platform.id)}
                            <span>{platform.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-4 sm:space-y-5">
                  <Label className="text-lg font-semibold text-gray-900 dark:text-white">
                    Platform Access
                  </Label>
                  {(() => {
                    const selectedPlatform = getSelectedPlatform()
                    const isLoggedIn = getLoginStatusForPlatform(playlistTarget)

                    if (!selectedPlatform) return null

                    // Special handling for Deezer
                    if (selectedPlatform.id === "deezer") {
                    return (
                      <Button
                          onClick={() => handleLogin(getLoginPlatformKey(selectedPlatform.id))}
                          disabled={isLoggedIn}
                          className={`w-full h-12 sm:h-14 lg:h-16 text-base sm:text-lg font-semibold rounded-xl ${selectedPlatform.color} ${selectedPlatform.hoverColor} text-white transition-all duration-200 shadow-lg hover:shadow-xl ${
                            isLoggedIn ? "opacity-90" : ""
                          }`}
                        >
                          <div className="flex items-center justify-center gap-3">
                            {getPlatformIcon(selectedPlatform.id)}
                            <span>{isLoggedIn ? "Connected" : `Connect to ${selectedPlatform.name}`}</span>
                          </div>
                        </Button>
                      )
                    }

                    // Standard OAuth flow for other platforms
                    return (
                      <Button
                        onClick={() => handleLogin(getLoginPlatformKey(selectedPlatform.id))}
                        disabled={isLoggedIn}
                        className={`w-full h-12 sm:h-14 lg:h-16 text-base sm:text-lg font-semibold rounded-xl ${selectedPlatform.color} ${selectedPlatform.hoverColor} text-white transition-all duration-200 shadow-lg hover:shadow-xl ${
                          isLoggedIn ? "opacity-90" : ""
                        }`}
                      >
                        <div className="flex items-center justify-center gap-3">
                          {getPlatformIcon(selectedPlatform.id)}
                          <span>{isLoggedIn ? "Connected" : `Connect to ${selectedPlatform.name}`}</span>
                        </div>
                      </Button>
                    )
                  })()}
                </div>
              </div>

              {/* Convert Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={() => handlePlaylistConvert("quick")}
                  disabled={isConverting || !playlistLink.trim()}
                  className="flex-1 h-12 sm:h-14 lg:h-16 text-base sm:text-lg font-semibold bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isConverting ? (
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin" />
                      <span>Quick Conversion...</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <Music className="h-5 w-5 sm:h-6 sm:w-6" />
                      <span>Quick Conversion</span>
                    </div>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handlePlaylistConvert("advanced")}
                  disabled={isConverting || !playlistLink.trim()}
                  className="flex-1 h-12 sm:h-14 lg:h-16 text-base sm:text-lg font-semibold border-2 border-purple-400 text-purple-700 dark:text-purple-300 bg-white dark:bg-gray-900 hover:bg-purple-50 dark:hover:bg-gray-800 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center gap-3">
                    <Settings className="h-5 w-5 sm:h-6 sm:w-6" />
                    <span>Advanced Conversion</span>
                  </div>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Backup & Restore (Spotify) */}
          <Card className="shadow-xl border-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
            <CardHeader className="px-4 sm:px-6 lg:px-8">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-r from-indigo-600 to-blue-600 rounded-lg">
                  <Cloud className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                    Backup &amp; Restore
                  </CardTitle>
                  <CardDescription className="text-sm sm:text-base text-gray-600 dark:text-gray-300">
                    Export your music library to JSON or restore it on another account or device
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 sm:space-y-8 px-4 sm:px-6 lg:px-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label className="text-lg font-semibold text-gray-900 dark:text-white">Export Account</Label>

                  {/* Platform Access for Spotify */}
                  <Button
                    onClick={() => handleLogin("spotify")}
                    disabled={loginStatus.spotify}
                    className={`w-full h-11 sm:h-12 text-base font-semibold rounded-xl bg-green-600 hover:bg-green-700 text-white shadow-md hover:shadow-lg transition-all duration-200 ${
                      loginStatus.spotify ? "opacity-90" : ""
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <SpotifyIcon className="h-5 w-5" />
                      <span>Connect to Spotify</span>
                    </div>
                  </Button>

                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Download a JSON backup of all your playlists and saved tracks.
                  </p>

                  <Button
                    onClick={handleSpotifyExport}
                    disabled={isBackupProcessing}
                    className="w-full h-11 sm:h-12 text-base font-semibold bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white rounded-xl shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-60"
                  >
                    {isBackupProcessing ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Processing...</span>
                      </div>
                    ) : (
                      <span>Export as JSON</span>
                    )}
                  </Button>
                </div>

                <div className="space-y-3">
                  <Label className="text-lg font-semibold text-gray-900 dark:text-white">Import Backup</Label>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Restore playlists and saved tracks from a previously exported backup file.
                  </p>
                  <div className="space-y-3">
                    <Input
                      type="file"
                      accept="application/json"
                      onChange={handleBackupFileChange}
                      className="h-11 sm:h-12 text-sm rounded-lg border-2 border-gray-200 dark:border-gray-700 cursor-pointer"
                    />
                    {backupFileName && (
                      <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 space-y-1">
                        <div className="font-medium break-all">File: {backupFileName}</div>
                        {backupSummary && (
                          <div>
                            Playlists: {backupSummary.playlists} · Tracks (incl. saved): {backupSummary.tracks}
                          </div>
                        )}
                      </div>
                    )}
                    <Button
                      onClick={handleSpotifyImport}
                      disabled={isBackupProcessing || !backupData}
                      className="w-full h-11 sm:h-12 text-base font-semibold bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-60"
                    >
                      {isBackupProcessing ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Importing...</span>
                        </div>
                      ) : (
                        <span>Import Backup</span>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Track Conversion - Secondary */}
          <Card className="shadow-xl border-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
            <CardHeader className="px-4 sm:px-6 lg:px-8">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg">
                  <Music className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                    Convert Track
                  </CardTitle>
                  <CardDescription className="text-sm sm:text-base text-gray-600 dark:text-gray-300">
                    Quick conversion for individual songs
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 sm:space-y-8 px-4 sm:px-6 lg:px-8">
              <div className="space-y-4 sm:space-y-5">
                <Label htmlFor="track-link" className="text-lg font-semibold text-gray-900 dark:text-white">
                  Track Link
                </Label>
                <div className="flex gap-2 sm:gap-3">
                  <Input
                    id="track-link"
                    placeholder="Paste a music track link..."
                    value={trackLink}
                    onChange={(e) => setTrackLink(e.target.value)}
                    className="flex-1 h-12 sm:h-14 text-base rounded-lg border-2 border-gray-200 dark:border-gray-700 focus:border-blue-500 dark:focus:border-blue-400"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => pasteFromClipboard(setTrackLink)}
                    className="shrink-0 h-12 w-12 sm:h-14 sm:w-14 rounded-lg border-2 border-gray-200 dark:border-gray-700"
                  >
                    <Copy className="h-4 w-4 sm:h-5 sm:w-5" />
                  </Button>
                </div>
              </div>

              <div className="space-y-4 sm:space-y-5">
                <Label htmlFor="track-target" className="text-lg font-semibold text-gray-900 dark:text-white">
                  Convert to
                </Label>
                <Select value={trackTarget} onValueChange={(value) => handlePlatformChange(value, "track")}>
                  <SelectTrigger 
                    className={`h-12 sm:h-14 text-base rounded-lg border-2 transition-all duration-200 ${
                      (() => {
                        const selectedPlatform = platforms.find(p => p.id === trackTarget)
                        if (!selectedPlatform) return "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                        
                        // Map platform colors to background and border colors
                        const colorMap: Record<string, string> = {
                          spotify: "border-green-300 dark:border-green-600 focus:border-green-500 dark:focus:border-green-400 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300",
                          ytmusic: "border-red-300 dark:border-red-600 focus:border-red-500 dark:focus:border-red-400 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300",
                          deezer: "border-[#9F47FF] dark:border-[#9F47FF] focus:border-[#9F47FF] dark:focus:border-[#9F47FF] bg-[#9F47FF]/10 dark:bg-[#9F47FF]/20 text-[#9F47FF] dark:text-[#9F47FF]",
                          applemusic: "border-gray-400 dark:border-gray-500 focus:border-gray-600 dark:focus:border-gray-400 bg-gray-50 dark:bg-gray-950/20 text-gray-700 dark:text-gray-300",
                          tidal: "border-cyan-300 dark:border-cyan-600 focus:border-cyan-500 dark:focus:border-cyan-400 bg-cyan-50 dark:bg-cyan-950/20 text-cyan-700 dark:text-cyan-300",
                          amazonmusic: "border-orange-300 dark:border-orange-500 focus:border-orange-400 dark:focus:border-orange-300 bg-orange-50 dark:bg-orange-950/20 text-orange-600 dark:text-orange-300",
                        }
                        return colorMap[trackTarget] || "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                      })()
                    }`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {platforms.map((platform) => (
                      <SelectItem 
                        key={platform.id} 
                        value={platform.id} 
                        className={`text-base py-2 transition-all duration-200 ${
                          platform.id === trackTarget ? 
                            `${platform.badgeColor} ${platform.darkBadgeColor} font-semibold` : 
                            (() => {
                              // Platform-specific hover colors
                              const hoverColorMap: Record<string, string> = {
                                spotify: "hover:bg-green-100 dark:hover:bg-green-900/30 hover:text-green-700 dark:hover:text-green-300",
                                ytmusic: "hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-300",
                                deezer: "hover:bg-[#9F47FF]/20 dark:hover:bg-[#9F47FF]/30 hover:text-[#9F47FF] dark:hover:text-[#9F47FF]",
                                applemusic: "hover:bg-gray-100 dark:hover:bg-gray-900/30 hover:text-gray-700 dark:hover:text-gray-300",
                                tidal: "hover:bg-cyan-100 dark:hover:bg-cyan-900/30 hover:text-cyan-700 dark:hover:text-cyan-300",
                                amazonmusic: "hover:bg-orange-100 dark:hover:bg-orange-900/30 hover:text-orange-600 dark:hover:text-orange-300",
                              }
                              return hoverColorMap[platform.id] || "hover:bg-gray-100 dark:hover:bg-gray-700"
                            })()
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {getPlatformIcon(platform.id)}
                          {platform.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Convert Button */}
              <Button
                onClick={handleTrackConvert}
                className={`w-full h-12 sm:h-14 text-base sm:text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 hover:brightness-110 ${
                  (() => {
                    const selectedPlatform = platforms.find(p => p.id === trackTarget)
                    if (!selectedPlatform) return "bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
                    
                    // Map platform colors to button gradients
                    const buttonColorMap: Record<string, string> = {
                      spotify: "bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800",
                      ytmusic: "bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800",
                      deezer: "bg-gradient-to-r from-[#9F47FF] to-[#7C2AE8] hover:from-[#7C2AE8] hover:to-[#9F47FF]",
                      applemusic: "bg-gradient-to-r from-gray-800 to-gray-900 hover:from-gray-900 hover:to-black",
                      tidal: "bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800",
                      amazonmusic: "bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700",
                    }
                    return buttonColorMap[trackTarget] || "bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
                  })()
                }`}
                disabled={isConverting}
              >
                {isConverting ? (
                  <>
                    <Loader2 className="mr-2 sm:mr-3 h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                    Converting...
                  </>
                ) : (
                  <>
                    Convert Track
                  </>
                )}
              </Button>

              {/* Track Conversion Results Display */}
              <TrackResultDisplay 
                ref={trackResultRef}
                result={trackConversionResult} 
                className="mt-6 sm:mt-8" 
              />
            </CardContent>
          </Card>
        </div>

        {/* Feedback */}
        {feedback && (
          <Alert variant={feedbackType === "error" ? "destructive" : "default"} className="mt-6 sm:mt-8">
            {feedbackType === "error" ? (
              <XCircle className="h-4 w-4" />
            ) : feedbackType === "warning" ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            <AlertDescription className="text-sm sm:text-base">{feedback}</AlertDescription>
          </Alert>
        )}

        {/* Lazy Loaded Components */}
        <Suspense fallback={<ComponentLoader />}>
          {showProgress && (
            <ConversionProgress 
              isOpen={showProgress} 
              onClose={() => {
                setShowProgress(false);
                setCurrentSession(undefined);
                progressClosedRef.current = false; // Reset for next conversion
              }} 
              session={currentSession
                || localStorage.getItem("spotify_session") || undefined
                || localStorage.getItem("yt_session") || undefined
                || localStorage.getItem("deezer_session") || undefined
                || localStorage.getItem("apple_session") || undefined}
              onProgressUpdate={(progress) => {
                if (progressClosedRef.current) return;
                // If progress contains an error, stop polling and show error
                if (progress && progress.error) {
                  progressClosedRef.current = true;
                  setShowProgress(false);
                  setCurrentSession(undefined);
                  setFeedback(progress.error);
                  setFeedbackType("error");
                  return;
                }
                // If progress is empty or indicates done, stop polling
                if (!progress || Object.keys(progress).length === 0 || progress.stage === "Done") {
                  progressClosedRef.current = true;
                  setShowProgress(false);
                  setCurrentSession(undefined);
                  return;
                }
                // Progress updates handled silently by ConversionProgress component
              }}
              onViewResults={() => {
                setShowProgress(false);
                setCurrentSession(undefined);
                progressClosedRef.current = false; // Reset for next conversion
                // The results should already be set by handlePlaylistConvert
                if (conversionResults) {
                  setShowResults(true);
                }
              }}
            />
          )}
        </Suspense>

        <Suspense fallback={<ComponentLoader />}>
          {showResults && (
            <ConversionResults 
              isOpen={showResults} 
              onClose={() => setShowResults(false)} 
              results={conversionResults}
              session={currentSession}
              targetPlatform={playlistTarget}
            />
          )}
        </Suspense>

        <Suspense fallback={<ComponentLoader />}>
          {showOnboarding && (
            <OnboardingFlow
              isOpen={showOnboarding}
              onClose={() => setShowOnboarding(false)}
              onComplete={handleOnboardingComplete}
            />
          )}
        </Suspense>

        {/* Feedback Modal */}
        <FeedbackModal
          isOpen={showFeedbackModal}
          onClose={() => setShowFeedbackModal(false)}
        />
      </div>

      {/* Footer */}
      <footer className="border-t bg-gradient-to-r from-gray-50/50 to-gray-100/50 dark:from-gray-900/50 dark:to-gray-800/50 py-8 text-sm text-gray-600 dark:text-gray-400 text-center mt-12 sm:mt-16">
        {/* Mobile Controls */}
        <div className="flex items-center justify-center gap-3 mb-6 md888:hidden">
          {/* Help Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={showOnboardingManually}
            className="gap-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border-gray-200/60 hover:bg-white dark:hover:bg-gray-800 transition-all duration-200 shadow-sm"
          >
            <HelpCircle className="h-4 w-4" />
            <span>Help</span>
          </Button>

          {/* Dark Mode Toggle */}
          <div className="flex items-center gap-2 p-2 rounded-lg bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border border-gray-200/60 dark:border-gray-700/60 shadow-sm">
            <Sun className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            {mounted && (
            <Switch checked={theme === "dark"} onCheckedChange={handleThemeChange} />
            )}
            <Moon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
          </div>
        </div>

        {/* Footer Links */}
        <div className="flex flex-row flex-nowrap items-center justify-center gap-2 sm:gap-6 px-2 overflow-x-auto w-full max-w-full">
          {/* GitHub Link */}
          <a 
            href="https://github.com/lunagus" 
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-2 px-4 py-2 min-w-[120px] rounded-lg bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 hover:bg-white dark:hover:bg-gray-800 transition-all duration-200 shadow-sm hover:shadow-md justify-center"
          >
            <GitHubIcon className="h-4 w-4 text-gray-600 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-200 transition-colors" />
            <span className="font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">
              lunagus
            </span>
          </a>

          {/* Divider */}
          <div className="hidden sm:block w-px h-6 bg-gray-300 dark:bg-gray-600" />

          {/* Feedback Button */}
          <button 
            onClick={() => setShowFeedbackModal(true)}
            className="group flex items-center gap-2 px-4 py-2 min-w-[120px] rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 backdrop-blur-sm border border-blue-200/50 dark:border-blue-700/50 hover:from-blue-100 hover:to-indigo-100 dark:hover:from-blue-800/30 dark:hover:to-indigo-800/30 transition-all duration-200 shadow-sm hover:shadow-md justify-center"
          >
            <Send className="h-4 w-4 text-blue-600 dark:text-blue-400 group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors" />
            <span className="font-medium text-blue-700 dark:text-blue-300 group-hover:text-blue-800 dark:group-hover:text-blue-200 transition-colors">
              Send Feedback
            </span>
          </button>

          {/* Divider */}
          <div className="hidden sm:block w-px h-6 bg-gray-300 dark:bg-gray-600" />

          {/* Donate Link */}
          <a 
            href="https://coff.ee/lunagus" 
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-2 px-4 py-2 min-w-[120px] rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 backdrop-blur-sm border border-amber-200/50 dark:border-amber-700/50 hover:from-amber-100 hover:to-orange-100 dark:hover:from-amber-800/30 dark:hover:to-orange-800/30 transition-all duration-200 shadow-sm hover:shadow-md justify-center"
          >
            <BuyMeACoffeeIcon className="h-4 w-4 text-amber-600 dark:text-amber-400 group-hover:text-amber-700 dark:group-hover:text-amber-300 transition-colors" />
            <span className="font-medium text-amber-700 dark:text-amber-300 group-hover:text-amber-800 dark:group-hover:text-amber-200 transition-colors">
              Donate
            </span>
          </a>
        </div>

        {/* Copyright */}
        <div className="mt-6 pt-4 border-t border-gray-200/50 dark:border-gray-700/50">
          <p className="text-xs text-gray-500 dark:text-gray-500">
            © 2025 💜 SongSeek 
          </p>
        </div>
      </footer>
    </div>
  )
}
