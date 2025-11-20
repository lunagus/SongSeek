"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Music,
  GripVertical,
  Search,
  Globe,
  Lock,
  Plus,
  Download,
  Settings,
  Eye,
  ExternalLink,
  X,
  Check,
  AlertCircle,
  FileText,
  AlertTriangle,
  Users,
  Twitter,
  Facebook,
  Link,
  Upload,
  FileJson,
  FileSpreadsheet,
  FileType,
} from "lucide-react"
import { getConversionResults, searchTracks, applyPlaylistFixes } from "@/lib/api"

interface AdvancedPlaylistCreatorProps {
  session: string
  sourcePlatform: string
  targetPlatform: string
  initialPlaylistName?: string
}

const mapTargetPlatformToApi = (id: string) => {
  switch (id) {
    case "apple-music":
      return "applemusic"
    case "youtube-music":
      return "ytmusic"
    case "amazon-music":
      return "amazonmusic"
    default:
      return id
  }
}

export default function AdvancedPlaylistCreator({
  session,
  sourcePlatform,
  targetPlatform: initialTargetPlatform,
  initialPlaylistName,
}: AdvancedPlaylistCreatorProps) {
  const [playlistName, setPlaylistName] = useState(initialPlaylistName || "Transferred Playlist")
  const [playlistDescription, setPlaylistDescription] = useState("")
  const [selectedSongs, setSelectedSongs] = useState<number[]>([])
  const [songs, setSongs] = useState<any[]>([])
  const [isPublic, setIsPublic] = useState(true)
  const [sortBy, setSortBy] = useState("manual")
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedSong, setExpandedSong] = useState<number | null>(null)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [targetPlatform, setTargetPlatform] = useState(initialTargetPlatform || "spotify")
  const [draggedItem, setDraggedItem] = useState<number | null>(null)
  const [customSearchQuery, setCustomSearchQuery] = useState("")
  const [showBatchUpload, setShowBatchUpload] = useState(false)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exportType, setExportType] = useState<"failed" | "missing" | "all">("failed")
  const [isLoading, setIsLoading] = useState(true)
  const [playlistUrl, setPlaylistUrl] = useState<string | null>(null)
  const [isApplyingFixes, setIsApplyingFixes] = useState(false)

  useEffect(() => {
    const loadConversionResults = async () => {
      try {
        const results: any = await getConversionResults(session)

        const tracksSource: any[] = Array.isArray(results.tracks)
          ? results.tracks
          : []

        const mappedSongs = tracksSource.map((t, index) => ({
          id: index + 1,
          title: t.title,
          artist: t.artist,
          duration: t.duration || "3:00",
          originalPlatform: sourcePlatform,
          matchConfidence:
            typeof t.matchConfidence === "number"
              ? t.matchConfidence
              : t.status === "matched"
              ? 95
              : t.status === "needs_review"
              ? 60
              : 0,
          status: t.status || (t.found === false ? "not_found" : "matched"),
          isDuplicate: false,
          replacement: null,
        }))

        setSongs(mappedSongs)
        setSelectedSongs(mappedSongs.map((song) => song.id))

        if (results.playlistName && !initialPlaylistName) {
          setPlaylistName(results.playlistName)
        }

        if (results.playlistUrl) {
          setPlaylistUrl(results.playlistUrl)
        }
      } catch (error) {
        console.error("Failed to load conversion results:", error)
      } finally {
        setIsLoading(false)
      }
    }
    loadConversionResults()
  }, [session, sourcePlatform, initialPlaylistName])

  const handleSongSelect = (songId: number) => {
    setSelectedSongs((prev) => (prev.includes(songId) ? prev.filter((id) => id !== songId) : [...prev, songId]))
  }

  const handleSelectAll = () => {
    setSelectedSongs(songs.map((song) => song.id))
  }

  const handleDeselectAll = () => {
    setSelectedSongs([])
  }

  const handleRemoveDuplicates = () => {
    const uniqueSongs = songs.filter(
      (song, index, self) =>
        index ===
        self.findIndex(
          (s) =>
            s.title.toLowerCase() === song.title.toLowerCase() && s.artist.toLowerCase() === song.artist.toLowerCase(),
        ),
    )
    setSongs(uniqueSongs)
    setSelectedSongs((prev) => prev.filter((id) => uniqueSongs.some((song) => song.id === id)))
  }

  const handleSearchExpand = async (songId: number) => {
    if (expandedSong === songId) {
      setExpandedSong(null)
      setCustomSearchQuery("")
      return
    }

    const song = songs.find((s) => s.id === songId)
    setExpandedSong(songId)
    setCustomSearchQuery("")

    if (!song) return

    try {
      const query = `${song.title} ${song.artist}`
      const apiPlatform = mapTargetPlatformToApi(targetPlatform)
      const results = await searchTracks(apiPlatform, query, 5, session)
      setSearchResults(results || [])
    } catch (error) {
      console.error("Failed to search alternative matches:", error)
      setSearchResults([])
    }
  }

  const handleReplaceSong = (originalId: number, newSong: any) => {
    setSongs((prev) =>
      prev.map((song) =>
        song.id === originalId
          ? {
              ...song,
              title: newSong.title,
              artist: newSong.artist,
              duration: newSong.duration,
              matchConfidence: newSong.confidence,
              status: "matched",
              replacement: newSong,
            }
          : song,
      ),
    )
    setExpandedSong(null)
  }

  const handleDragStart = (e: React.DragEvent, songId: number) => {
    setDraggedItem(songId)
    e.dataTransfer.effectAllowed = "move"
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  }

  const handleDrop = (e: React.DragEvent, targetId: number) => {
    e.preventDefault()
    if (draggedItem === null) return

    const draggedIndex = songs.findIndex((song) => song.id === draggedItem)
    const targetIndex = songs.findIndex((song) => song.id === targetId)

    if (draggedIndex === -1 || targetIndex === -1) return

    const newSongs = [...songs]
    const [draggedSong] = newSongs.splice(draggedIndex, 1)
    newSongs.splice(targetIndex, 0, draggedSong)

    setSongs(newSongs)
    setDraggedItem(null)
  }

  const getExportData = () => {
    let dataToExport = []
    switch (exportType) {
      case "failed":
        dataToExport = songs.filter((song) => song.status === "not_found" || song.matchConfidence < 60)
        break
      case "missing":
        dataToExport = songs.filter((song) => song.status === "not_found")
        break
      case "all":
        dataToExport = selectedSongs.map((id) => songs.find((song) => song.id === id)).filter(Boolean)
        break
    }
    return dataToExport
  }

  const exportData = (format: "csv" | "json" | "txt") => {
    const data = getExportData()
    let content = ""
    let filename = ""
    let mimeType = ""

    switch (format) {
      case "csv":
        content =
          "Title,Artist,Duration,Original Platform,Match Confidence,Status\n" +
          data
            .map(
              (song) =>
                `"${song.title}","${song.artist}","${song.duration}","${song.originalPlatform}","${song.matchConfidence}%","${song.status}"`,
            )
            .join("\n")
        filename = `${playlistName}_${exportType}_songs.csv`
        mimeType = "text/csv"
        break
      case "json":
        content = JSON.stringify(data, null, 2)
        filename = `${playlistName}_${exportType}_songs.json`
        mimeType = "application/json"
        break
      case "txt":
        content = data.map((song) => `${song.title} - ${song.artist} (${song.duration})`).join("\n")
        filename = `${playlistName}_${exportType}_songs.txt`
        mimeType = "text/plain"
        break
    }

    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    setExportModalOpen(false)
  }

  const handleStartTransfer = async () => {
    if (!playlistUrl) {
      console.error("No playlistUrl from conversion results; cannot apply fixes.")
      return
    }

    const replacements = songs
      .filter((song) => song.replacement)
      .map((song) => ({
        originalTrack: {
          title: song.title,
          artist: song.artist,
        },
        newTrack: {
          id: song.replacement.id,
          title: song.replacement.title,
          artist: song.replacement.artist,
        },
        skip: false,
      }))

    if (replacements.length === 0) {
      console.log("No manual replacements to apply.")
      return
    }

    try {
      setIsApplyingFixes(true)
      const response = await applyPlaylistFixes(session, playlistUrl, replacements, {
        playlistName,
        playlistDescription: playlistDescription || undefined,
        isPublic,
      })
      console.log("Apply playlist fixes result:", response)
    } catch (error) {
      console.error("Failed to apply playlist fixes:", error)
    } finally {
      setIsApplyingFixes(false)
    }
  }

  const shareToSocial = (platform: string) => {
    const successRate =
      Math.round((selectedSongsList.filter((song) => song.status === "matched").length / selectedSongsList.length) * 100) || 0
    const text = `Just transferred my "${playlistName}" playlist with ${successRate}% success rate using SongSeek! 🎵`
    const url = window.location.href

    let shareUrl = ""
    switch (platform) {
      case "twitter":
        shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
        break
      case "facebook":
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}`
        break
    }

    if (shareUrl) {
      window.open(shareUrl, "_blank", "width=600,height=400")
    }
  }

  const copyShareLink = () => {
    const successRate =
      Math.round((selectedSongs.filter((song) => song.status === "matched").length / selectedSongs.length) * 100) || 0
    const text = `Check out my playlist transfer: "${playlistName}" - ${successRate}% success rate! ${window.location.href}`
    navigator.clipboard.writeText(text)
  }

  const getStatusColor = (status: string, confidence: number) => {
    if (status === "matched" && confidence >= 80) return "text-green-600"
    if (status === "matched" && confidence >= 60) return "text-yellow-600"
    if (status === "needs_review") return "text-orange-600"
    return "text-red-600"
  }

  const getStatusIcon = (status: string, confidence: number) => {
    if (status === "matched" && confidence >= 80) return <Check className="h-4 w-4 text-green-600" />
    if (status === "matched" && confidence >= 60) return <AlertCircle className="h-4 w-4 text-yellow-600" />
    if (status === "needs_review") return <AlertCircle className="h-4 w-4 text-orange-600" />
    return <X className="h-4 w-4 text-red-600" />
  }

  const filteredSongs = songs.filter((song) => {
    const matchesSearch =
      song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      song.artist.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch
  })

  const selectedSongsList = songs.filter((song) => selectedSongs.includes(song.id))
  const totalDuration = selectedSongsList.reduce((acc, song) => {
    const [minutes, seconds] = song.duration.split(":").map(Number)
    return acc + minutes * 60 + seconds
  }, 0)

  const matchedSongs = selectedSongsList.filter((song) => song.status === "matched").length
  const needsReviewSongs = selectedSongsList.filter((song) => song.status === "needs_review").length
  const notFoundSongs = selectedSongsList.filter((song) => song.status === "not_found").length
  const duplicateSongs = selectedSongsList.filter((song) => song.isDuplicate).length

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hours > 0) {
      return `${hours}h ${mins}m ${secs}s`
    }
    return `${mins}m ${secs}s`
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 transition-colors duration-300">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 max-w-6xl">
        {/* Header Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-8 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            Advanced Playlist Transfer
          </h1>
        </div>

        <Tabs defaultValue="settings" className="space-y-8">
          <TabsList className="grid w-full grid-cols-3 h-14 p-1 bg-white/90 dark:bg-gray-900/80 shadow-sm rounded-xl">
            <TabsTrigger value="settings" className="text-base font-medium">
              Transfer Settings
            </TabsTrigger>
            <TabsTrigger value="songs" className="text-base font-medium">
              Song Management
            </TabsTrigger>
            <TabsTrigger value="preview" className="text-base font-medium">
              Preview & Export
            </TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-8">
            {/* Main Settings Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              {/* Playlist Information - Takes 2 columns */}
              <div className="xl:col-span-2 space-y-6">
                <Card className="shadow-sm border-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-3 text-xl text-gray-900 dark:text-gray-100">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Settings className="h-5 w-5 text-blue-600" />
                      </div>
                      Playlist Information
                    </CardTitle>
                    <CardDescription className="text-base text-gray-600 dark:text-gray-300">
                      Configure your transferred playlist details
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <Label htmlFor="playlist-name" className="text-base font-medium text-gray-900 dark:text-gray-100">
                          Playlist Name
                        </Label>
                        <Input
                          id="playlist-name"
                          value={playlistName}
                          onChange={(e) => setPlaylistName(e.target.value)}
                          placeholder="Enter playlist name"
                          className="h-12 text-base"
                        />
                      </div>
                      <div className="space-y-3">
                        <Label htmlFor="target-platform" className="text-base font-medium text-gray-900 dark:text-gray-100">
                          Target Platform
                        </Label>
                        <Select value={targetPlatform} onValueChange={setTargetPlatform}>
                          <SelectTrigger className="h-12 text-base">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="spotify">Spotify</SelectItem>
                            <SelectItem value="apple-music">Apple Music</SelectItem>
                            <SelectItem value="youtube-music">YouTube Music</SelectItem>
                            <SelectItem value="deezer">Deezer</SelectItem>
                            <SelectItem value="tidal">Tidal</SelectItem>
                            <SelectItem value="amazon-music">Amazon Music</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <Label
                        htmlFor="playlist-description"
                        className="text-base font-medium text-gray-900 dark:text-gray-100"
                      >
                        Description
                      </Label>
                      <Textarea
                        id="playlist-description"
                        value={playlistDescription}
                        onChange={(e) => setPlaylistDescription(e.target.value)}
                        placeholder="Describe your playlist..."
                        rows={4}
                        className="text-base resize-none"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Batch Processing */}
                <Card className="shadow-sm border-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-3 text-xl text-gray-900 dark:text-gray-100">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <Upload className="h-5 w-5 text-green-600" />
                      </div>
                      Batch Processing
                    </CardTitle>
                    <CardDescription className="text-base text-gray-600 dark:text-gray-300">
                      Upload multiple playlists at once for batch conversion
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between p-4 bg-gradient-to-r from-green-50 to-blue-50 rounded-xl">
                      <div className="space-y-1">
                        <Label className="text-base font-medium text-gray-900 dark:text-gray-100">
                          Enable Batch Mode
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Process multiple playlist URLs simultaneously
                        </p>
                      </div>
                      <Switch checked={showBatchUpload} onCheckedChange={setShowBatchUpload} />
                    </div>

                    {showBatchUpload && (
                      <div className="space-y-4 p-6 bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl border">
                        <Label className="text-base font-medium">Playlist URLs (one per line)</Label>
                        <Textarea
                          placeholder={`https://open.spotify.com/playlist/...
https://music.apple.com/playlist/...
https://music.youtube.com/playlist/...`}
                          rows={5}
                          className="font-mono text-sm resize-none"
                        />
                        <Button className="w-full h-12 text-base font-medium">
                          <Upload className="h-5 w-5 mr-2" />
                          Process Batch Upload
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Privacy Settings - Takes 1 column */}
              <div className="space-y-6">
                <Card className="shadow-sm border-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-3 text-xl text-gray-900 dark:text-gray-100">
                      <div className="p-2 bg-purple-100 rounded-lg">
                        <Globe className="h-5 w-5 text-purple-600" />
                      </div>
                      Privacy Settings
                    </CardTitle>
                    <CardDescription className="text-base text-gray-600 dark:text-gray-300">
                      Control playlist visibility on the target platform
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="p-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl border">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2">
                          <Label className="text-base font-medium text-gray-900 dark:text-gray-100">
                            Playlist Visibility
                          </Label>
                          <p className="text-sm text-muted-foreground dark:text-gray-500 leading-relaxed">
                            {isPublic
                              ? "Anyone can find and listen to this playlist"
                              : "Only you can access this playlist"}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 ml-4">
                          {isPublic ? (
                            <Globe className="h-5 w-5 text-green-600" />
                          ) : (
                            <Lock className="h-5 w-5 text-gray-600" />
                          )}
                          <Switch checked={isPublic} onCheckedChange={setIsPublic} />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="songs" className="space-y-8">
            <Card className="shadow-sm border-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
              <CardHeader className="pb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-3 text-2xl text-gray-900 dark:text-gray-100">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Music className="h-6 w-6 text-blue-600" />
                      </div>
                      Song Management
                    </CardTitle>
                    <CardDescription className="text-base mt-2 text-gray-600 dark:text-gray-300">
                      Review, reorder, and fix song matches before transfer
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="px-3 py-1 text-sm">
                      {selectedSongs.length} selected
                    </Badge>
                    <Badge variant="outline" className="px-3 py-1 text-sm">
                      {formatDuration(totalDuration)} total
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-8">
                {/* Enhanced Statistics Dashboard */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 p-6 bg-gradient-to-r from-blue-50 via-purple-50 to-pink-50 dark:from-gray-800 dark:via-gray-800 dark:to-gray-800 rounded-2xl border border-gray-200/70 dark:border-gray-700/70">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-600 mb-1">{matchedSongs}</div>
                    <div className="text-sm font-medium text-muted-foreground">Matched</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-orange-600 mb-1">{needsReviewSongs}</div>
                    <div className="text-sm font-medium text-muted-foreground">Needs Review</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-red-600 mb-1">{notFoundSongs}</div>
                    <div className="text-sm font-medium text-muted-foreground">Not Found</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-purple-600 mb-1">{duplicateSongs}</div>
                    <div className="text-sm font-medium text-muted-foreground">Duplicates</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-600 mb-1">
                      {Math.round((matchedSongs / selectedSongs.length) * 100) || 0}%
                    </div>
                    <div className="text-sm font-medium text-muted-foreground">Success Rate</div>
                  </div>
                </div>

                {/* Duplicate Detection Alert */}
                {duplicateSongs > 0 && (
                  <div className="flex items-center justify-between p-6 bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-xl">
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-yellow-100 rounded-lg">
                        <AlertTriangle className="h-6 w-6 text-yellow-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-yellow-800 text-base">
                          {duplicateSongs} duplicate song{duplicateSongs > 1 ? "s" : ""} detected
                        </p>
                        <p className="text-sm text-yellow-700 mt-1">
                          These songs appear multiple times in your playlist
                        </p>
                      </div>
                    </div>
                    <Button variant="outline" onClick={handleRemoveDuplicates} className="h-10 px-6 bg-transparent">
                      Remove Duplicates
                    </Button>
                  </div>
                )}

                {/* Search and Controls */}
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input
                        placeholder="Search songs or artists..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-12 h-12 text-base"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger className="w-[160px] h-12">
                        <SelectValue placeholder="Sort by" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual Order</SelectItem>
                        <SelectItem value="original">Original Order</SelectItem>
                        <SelectItem value="title">Title A-Z</SelectItem>
                        <SelectItem value="artist">Artist A-Z</SelectItem>
                        <SelectItem value="confidence">Match Quality</SelectItem>
                        <SelectItem value="status">Status</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={handleSelectAll} className="h-10 px-6 bg-transparent">
                      Select All
                    </Button>
                    <Button variant="outline" onClick={handleDeselectAll} className="h-10 px-6 bg-transparent">
                      Deselect All
                    </Button>
                  </div>
                  <p className="text-muted-foreground">
                    Showing {filteredSongs.length} of {songs.length} songs
                  </p>
                </div>

                {/* Enhanced Song Cards */}
                <div className="space-y-4 max-h-[600px] overflow-y-auto px-2 py-4 -mx-2">
                  {filteredSongs.map((song, index) => (
                    <div key={song.id}>
                      <Card
                        className={`transition-all duration-200 hover:shadow-lg ${
                          selectedSongs.includes(song.id) ? "ring-2 ring-blue-500 shadow-md" : ""
                        } ${draggedItem === song.id ? "opacity-50" : ""} ${
                          song.status === "not_found" ? "border-red-200 bg-red-50/50" : ""
                        } ${song.status === "needs_review" ? "border-orange-200 bg-orange-50/50" : ""} ${
                          song.isDuplicate ? "border-purple-200 bg-purple-50/50" : ""
                        } border-0 shadow-sm bg-white/90 backdrop-blur`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, song.id)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, song.id)}
                      >
                        <CardContent className="p-6">
                          <div className="flex items-center gap-6">
                            {/* Selection and Drag Controls */}
                            <div className="flex items-center gap-4">
                              <Checkbox
                                checked={selectedSongs.includes(song.id)}
                                onCheckedChange={() => handleSongSelect(song.id)}
                                className="h-5 w-5"
                              />
                              <div className="text-lg font-semibold text-muted-foreground w-12 text-center">
                                #{index + 1}
                              </div>
                              <GripVertical className="h-6 w-6 text-muted-foreground cursor-grab hover:text-foreground transition-colors" />
                            </div>

                            {/* Song Information */}
                            <div className="flex-1 min-w-0 space-y-2">
                              <div className="flex items-center gap-3">
                                <h4 className="text-lg font-semibold truncate">{song.title}</h4>
                                <Badge variant="outline" className="text-xs">
                                  {song.originalPlatform}
                                </Badge>
                                {song.isDuplicate && (
                                  <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700">
                                    Duplicate
                                  </Badge>
                                )}
                              </div>
                              <p className="text-muted-foreground truncate text-base">{song.artist}</p>
                            </div>

                            {/* Match Quality and Duration */}
                            <div className="hidden sm:flex items-center gap-8">
                              <div className="text-center">
                                <div
                                  className={`text-xl font-bold ${getStatusColor(song.status, song.matchConfidence)}`}
                                >
                                  {song.matchConfidence}%
                                </div>
                                <div className="text-xs text-muted-foreground">match quality</div>
                              </div>
                              <div className="text-center">
                                <div className="text-lg font-medium text-muted-foreground">{song.duration}</div>
                                <div className="text-xs text-muted-foreground">duration</div>
                              </div>
                            </div>

                            {/* Status and Actions */}
                            <div className="flex items-center gap-4">
                              <div className="flex flex-col items-center gap-2">
                                {getStatusIcon(song.status, song.matchConfidence)}
                                <span className="text-xs text-muted-foreground capitalize">
                                  {song.status.replace("_", " ")}
                                </span>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleSearchExpand(song.id)}
                                className={`h-10 w-10 ${expandedSong === song.id ? "bg-muted" : ""} hover:bg-muted`}
                                disabled={song.status === "matched" && song.matchConfidence >= 90}
                              >
                                <Search className="h-5 w-5" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Expanded Search Results */}
                      {expandedSong === song.id && (
                        <Card className="ml-18 mt-4 border-l-4 border-l-blue-500 shadow-sm bg-white/95 backdrop-blur">
                          <CardHeader className="pb-4">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-lg">
                                Alternative Matches on{" "}
                                {targetPlatform.replace("-", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                              </CardTitle>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setExpandedSong(null)}
                                className="h-8 w-8"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                            <CardDescription>
                              Choose from the next 3 best matches found by our algorithm
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="pt-0">
                            <div className="space-y-3">
                              {searchResults.map((result, idx) => (
                                <div
                                  key={result.id}
                                  className="flex items-center justify-between p-4 rounded-xl border hover:bg-muted cursor-pointer transition-all hover:shadow-sm"
                                  onClick={() => handleReplaceSong(song.id, result)}
                                >
                                  <div className="flex-1 min-w-0 space-y-1">
                                    <p className="font-semibold truncate">{result.title}</p>
                                    <p className="text-sm text-muted-foreground truncate">{result.artist}</p>
                                    <p className="text-sm text-blue-600 font-medium">{result.reason}</p>
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <div className="text-center">
                                      <div className="text-lg font-bold text-green-600">{result.confidence}%</div>
                                      <div className="text-xs text-muted-foreground">confidence</div>
                                    </div>
                                    <span className="text-sm text-muted-foreground min-w-[3rem]">
                                      {result.duration}
                                    </span>
                                    <Badge variant="secondary" className="text-xs">
                                      #{idx + 1}
                                    </Badge>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <Separator className="my-6" />
                            <div className="flex gap-3">
                              <Input
                                placeholder={`Search ${targetPlatform.replace("-", " ")} for alternatives...`}
                                className="text-sm h-10"
                                value={customSearchQuery}
                                onChange={(e) => setCustomSearchQuery(e.target.value)}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-10 px-6 bg-transparent"
                                onClick={async () => {
                                  if (!customSearchQuery.trim()) return
                                  try {
                                    const apiPlatform = mapTargetPlatformToApi(targetPlatform)
                                    const results = await searchTracks(apiPlatform, customSearchQuery.trim(), 5, session)
                                    setSearchResults(results || [])
                                  } catch (error) {
                                    console.error("Failed to search alternative matches:", error)
                                    setSearchResults([])
                                  }
                                }}
                              >
                                <Search className="h-4 w-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preview" className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Preview Section - Takes 2 columns */}
              <div className="lg:col-span-2">
                <Card className="shadow-sm border-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
                  <CardHeader className="pb-6">
                    <CardTitle className="flex items-center gap-3 text-2xl text-gray-900 dark:text-gray-100">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <Eye className="h-6 w-6 text-green-600" />
                      </div>
                      Transfer Preview
                    </CardTitle>
                    <CardDescription className="text-base text-gray-600 dark:text-gray-300">
                      Review your playlist before transferring
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border">
                        <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                          <Music className="h-6 w-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-bold mb-1">{playlistName}</h3>
                          <p className="text-muted-foreground text-sm mb-1">
                            {selectedSongs.length} songs • {formatDuration(totalDuration)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Transferring to{" "}
                            <Badge variant="secondary" className="ml-1 text-xs">
                              {targetPlatform.replace("-", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                            </Badge>
                          </p>
                          {playlistDescription && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{playlistDescription}</p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3 max-h-80 overflow-y-auto">
                        {selectedSongsList.map((song, index) => (
                          <div key={song.id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted">
                            <span className="text-sm text-muted-foreground w-8 text-center">{index + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{song.title}</p>
                              <p className="text-sm text-muted-foreground truncate">{song.artist}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              {getStatusIcon(song.status, song.matchConfidence)}
                              <Badge variant="outline" className="text-xs">
                                {song.originalPlatform}
                              </Badge>
                              <span className="text-sm text-muted-foreground">{song.duration}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Actions and Summary - Takes 1 column */}
              <div className="space-y-6">
                {/* Transfer Actions */}
                <Card className="shadow-sm border-0 bg-white/80 backdrop-blur">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-3 text-xl">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <ExternalLink className="h-5 w-5 text-blue-600" />
                      </div>
                      Transfer Actions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="relative">
                      <Button
                        className="w-full h-16 text-lg font-bold bg-gradient-to-r from-green-500 via-blue-500 to-purple-500 hover:from-green-600 hover:via-blue-600 hover:to-purple-600 text-white shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300 border-0"
                        disabled={notFoundSongs > 0 || isApplyingFixes}
                        onClick={handleStartTransfer}
                      >
                        <div className="flex items-center justify-center gap-3">
                          <div className="p-2 bg-white/20 rounded-full">
                            <Plus className="h-6 w-6" />
                          </div>
                          <span>Start Transfer Now!</span>
                          <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full animate-pulse"></div>
                        </div>
                      </Button>
                      {!notFoundSongs && (
                        <div className="absolute -inset-1 bg-gradient-to-r from-green-400 via-blue-400 to-purple-400 rounded-lg blur opacity-30 animate-pulse"></div>
                      )}
                    </div>
                    {notFoundSongs > 0 && (
                      <p className="text-sm text-red-600 text-center">
                        Fix {notFoundSongs} unmatched song{notFoundSongs > 1 ? "s" : ""} before transferring
                      </p>
                    )}

                    <Separator />

                    {/* Export Options */}
                    <div className="space-y-3">
                      <Dialog open={exportModalOpen} onOpenChange={setExportModalOpen}>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full h-10 bg-transparent"
                            onClick={() => setExportType("all")}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Export Playlist
                          </Button>
                        </DialogTrigger>
                      </Dialog>

                      <Dialog open={exportModalOpen} onOpenChange={setExportModalOpen}>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full h-10 bg-transparent"
                            onClick={() => setExportType("failed")}
                            disabled={needsReviewSongs + notFoundSongs === 0}
                          >
                            <AlertTriangle className="h-4 w-4 mr-2" />
                            Export Failed Matches
                          </Button>
                        </DialogTrigger>
                      </Dialog>

                      <Dialog open={exportModalOpen} onOpenChange={setExportModalOpen}>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full h-10 bg-transparent"
                            onClick={() => setExportType("missing")}
                            disabled={notFoundSongs === 0}
                          >
                            <X className="h-4 w-4 mr-2" />
                            Export Missing Songs
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden">
                          <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                              <FileText className="h-5 w-5" />
                              Export{" "}
                              {exportType === "all"
                                ? "Playlist"
                                : exportType === "failed"
                                  ? "Failed Matches"
                                  : "Missing Songs"}
                            </DialogTitle>
                            <DialogDescription>
                              Choose your preferred export format for {getExportData().length} song
                              {getExportData().length !== 1 ? "s" : ""}.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 overflow-y-auto max-h-60">
                            <div className="p-4 bg-muted rounded-lg">
                              <h4 className="font-medium mb-2">Preview:</h4>
                              <div className="text-sm text-muted-foreground space-y-1">
                                {getExportData()
                                  .slice(0, 3)
                                  .map((song, idx) => (
                                    <div key={idx} className="truncate">
                                      {song.title} - {song.artist}
                                    </div>
                                  ))}
                                {getExportData().length > 3 && <div>... and {getExportData().length - 3} more</div>}
                              </div>
                            </div>
                          </div>
                          <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-4">
                            <Button variant="outline" onClick={() => exportData("csv")} className="w-full sm:w-auto">
                              <FileSpreadsheet className="h-4 w-4 mr-2" />
                              CSV
                            </Button>
                            <Button variant="outline" onClick={() => exportData("json")} className="w-full sm:w-auto">
                              <FileJson className="h-4 w-4 mr-2" />
                              JSON
                            </Button>
                            <Button variant="outline" onClick={() => exportData("txt")} className="w-full sm:w-auto">
                              <FileType className="h-4 w-4 mr-2" />
                              TXT
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardContent>
                </Card>

                {/* Social Sharing */}
                <Card className="shadow-sm border-0 bg-white/80 backdrop-blur">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-3 text-xl">
                      <div className="p-2 bg-pink-100 rounded-lg">
                        <Users className="h-5 w-5 text-pink-600" />
                      </div>
                      Share Results
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button
                      variant="outline"
                      className="w-full h-10 bg-transparent"
                      onClick={() => shareToSocial("twitter")}
                    >
                      <Twitter className="h-4 w-4 mr-2" />
                      Share on Twitter
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full h-10 bg-transparent"
                      onClick={() => shareToSocial("facebook")}
                    >
                      <Facebook className="h-4 w-4 mr-2" />
                      Share on Facebook
                    </Button>
                    <Button variant="outline" className="w-full h-10 bg-transparent" onClick={copyShareLink}>
                      <Link className="h-4 w-4 mr-2" />
                      Copy Share Link
                    </Button>
                  </CardContent>
                </Card>

                {/* Transfer Summary */}
                <Card className="shadow-sm border-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-xl text-gray-900 dark:text-gray-100">Transfer Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Total Songs:</span>
                      <span className="font-semibold">{selectedSongs.length}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Duration:</span>
                      <span className="font-semibold">{formatDuration(totalDuration)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Success Rate:</span>
                      <span className="font-semibold text-green-600">
                        {Math.round((matchedSongs / selectedSongs.length) * 100) || 0}%
                      </span>
                    </div>
                    <Separator />
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Source:</span>
                      <Badge variant="outline">Spotify</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Target:</span>
                      <Badge variant="secondary">
                        {targetPlatform.replace("-", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Privacy:</span>
                      <span className="font-semibold">{isPublic ? "Public" : "Private"}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
