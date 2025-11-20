"use client"

import type React from "react"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import {
  ChevronRight,
  ChevronLeft,
  X,
  Music,
  Link,
  MousePointer,
  LogIn,
  Play,
  CheckCircle,
  Sparkles,
  ArrowDown,
  Copy,
  Upload,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { DragDropZone } from "@/components/drag-drop-zone"
import { Loader2 } from "lucide-react"

interface OnboardingStep {
  id: string
  title: string
  description: string
  content: React.ReactNode
  targetElement?: string
  position?: "center" | "top" | "bottom"
}

interface OnboardingFlowProps {
  isOpen: boolean
  onClose: () => void
  onComplete: () => void
}

export function OnboardingFlow({ isOpen, onClose, onComplete }: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)

  const demoPlaylistLink = "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"
  const demoPlatforms = [
    { id: "spotify", name: "Spotify" },
    { id: "ytmusic", name: "YouTube Music" },
    { id: "deezer", name: "Deezer" },
  ]

  const steps: OnboardingStep[] = [
    {
      id: "welcome",
      title: "Welcome to SongSeek! 🎵",
      description: "Your music, everywhere you want it",
      content: (
        <div className="text-center space-y-6">
          <div className="relative">
            <div className="p-6 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full mx-auto w-fit">
              <Music className="h-12 w-12 text-white" />
            </div>
            <div className="absolute -top-2 -right-2 p-2 bg-yellow-400 rounded-full animate-bounce">
              <Sparkles className="h-4 w-4 text-yellow-800" />
            </div>
          </div>
          <div className="space-y-4">
            <h3 className="text-2xl font-bold">Transform Your Music Collection</h3>
            <p className="text-gray-600 dark:text-gray-300 text-lg leading-relaxed">
              Convert playlists between Spotify, YouTube Music, Deezer, and more with intelligent track matching.
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              <Badge variant="secondary" className="gap-1">
                <Music className="h-3 w-3" />6 Platforms
              </Badge>
              <Badge variant="secondary" className="gap-1">
                <CheckCircle className="h-3 w-3" />
                Smart Matching
              </Badge>
              <Badge variant="secondary" className="gap-1">
                <Sparkles className="h-3 w-3" />
                Free to Use
              </Badge>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "paste-link",
      title: "Step 1: Add Your Playlist",
      description: "Paste a playlist link or drag and drop",
      content: (
        <div className="space-y-4 max-w-md mx-auto">
          <div className="text-center">
            <h3 className="text-lg font-semibold mb-2">Get Your Playlist Link</h3>
            <p className="text-gray-600 dark:text-gray-300 text-sm">
              Copy a playlist link from any supported platform and paste it here.
            </p>
          </div>
          <Input
            value={demoPlaylistLink}
            disabled
            className="h-10 text-sm px-3 rounded-md border-2 border-blue-200 bg-blue-50/50 dark:bg-blue-950/10"
          />
          <DragDropZone onDrop={() => {}} className="pointer-events-none opacity-60 scale-95" />
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 justify-center">
            <Upload className="h-3 w-3" /> Drag & drop supported
            <CheckCircle className="h-3 w-3 text-green-600 ml-4" /> All major platforms
          </div>
        </div>
      ),
    },
    {
      id: "select-platform",
      title: "Step 2: Choose Destination",
      description: "Select where you want your playlist converted",
      content: (
        <div className="space-y-4 max-w-xs mx-auto">
          <div className="text-center">
            <h3 className="text-lg font-semibold mb-2">Pick Your Platform</h3>
            <p className="text-gray-600 dark:text-gray-300 text-sm">
              Choose which music service you want to create your new playlist on.
            </p>
          </div>
          <Select value="spotify" disabled>
            <SelectTrigger className="h-10 text-sm rounded-md border-2 border-purple-200 bg-purple-50/50 dark:bg-purple-950/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {demoPlatforms.map((platform) => (
                <SelectItem key={platform.id} value={platform.id} className="text-sm">
                  {platform.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap gap-2 justify-center mt-2">
            {demoPlatforms.map((platform) => (
              <Badge key={platform.id} variant="secondary" className="text-xs px-2 py-1">
                {platform.name}
              </Badge>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: "login",
      title: "Step 3: Connect Your Account",
      description: "Login to access your music library",
      content: (
        <div className="space-y-4 max-w-xs mx-auto">
          <div className="text-center">
            <h3 className="text-lg font-semibold mb-2">Secure Authentication</h3>
            <p className="text-gray-600 dark:text-gray-300 text-sm">
              We'll securely connect to your chosen platform to create the new playlist.
            </p>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium">Platform Access</span>
            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 text-xs">Not Connected</Badge>
          </div>
          <Button className="w-full bg-green-600 hover:bg-green-700 text-white text-sm" disabled>
            <LogIn className="h-4 w-4 mr-2" /> Login to Spotify
          </Button>
          <p className="text-xs text-center text-green-600 font-medium mt-2">
            Click to authenticate with your music platform
          </p>
          <div className="bg-blue-50 dark:bg-blue-950/20 p-2 rounded-lg mt-2">
            <div className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-blue-600 mt-0.5" />
              <span className="text-xs text-blue-700 dark:text-blue-300">We only access what's needed to create your playlist. Your login stays secure.</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "convert",
      title: "Step 4: Start Converting",
      description: "Watch the magic happen in real-time",
      content: (
        <div className="space-y-4 max-w-xs mx-auto">
          <div className="text-center">
            <h3 className="text-lg font-semibold mb-2">Intelligent Conversion</h3>
            <p className="text-gray-600 dark:text-gray-300 text-sm">
              Songseek matches your tracks across platforms with high accuracy.
            </p>
          </div>
          <Button className="w-full h-10 text-sm bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white" disabled>
            <Music className="h-4 w-4 mr-2" /> Convert Playlist
          </Button>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span>Converting tracks...</span>
              <span>75%</span>
            </div>
            <Progress value={75} className="h-1" />
          </div>
          <p className="text-xs text-center text-orange-600 font-medium">
            Real-time progress with detailed track information
          </p>
          <div className="flex items-center gap-2 text-xs justify-center mt-2">
            <CheckCircle className="h-3 w-3 text-green-600" /> Smart matching
            <CheckCircle className="h-3 w-3 text-green-600 ml-4" /> Progress tracking
          </div>
        </div>
      ),
    },
    {
      id: "results",
      title: "Step 5: Review & Fix",
      description: "See results and manually fix any issues",
      content: (
        <div className="space-y-4 max-w-xs mx-auto">
          <div className="text-center">
            <h3 className="text-lg font-semibold mb-2">Conversion Complete!</h3>
            <p className="text-gray-600 dark:text-gray-300 text-sm">
              Review matched tracks and manually fix any that need attention.
            </p>
          </div>
          <Card className="border-2 border-blue-200 bg-blue-50/50 dark:bg-blue-950/10">
            <CardContent className="p-2">
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div className="text-center">
                  <div className="text-lg font-bold text-green-600">24</div>
                  <div className="text-xs text-gray-600">Matched</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-yellow-600">2</div>
                  <div className="text-xs text-gray-600">Review</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-blue-600">92%</div>
                  <div className="text-xs text-gray-600">Success</div>
                </div>
              </div>
              <p className="text-xs text-center text-blue-600 font-medium">Detailed results with manual fix options</p>
            </CardContent>
          </Card>
          <div className="bg-green-50 dark:bg-green-950/20 p-2 rounded-lg">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-green-600 mt-0.5" />
              <span className="text-xs text-green-700 dark:text-green-300">For tracks that couldn't be matched, you can search manually or choose from suggestions.</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "complete",
      title: "You're All Set! 🎉",
      description: "Ready to convert your music collection",
      content: (
        <div className="text-center space-y-6">
          <div className="relative">
            <div className="p-6 bg-gradient-to-r from-green-600 to-blue-600 rounded-full mx-auto w-fit">
              <CheckCircle className="h-12 w-12 text-white" />
            </div>
            <div className="absolute -top-2 -right-2 p-2 bg-yellow-400 rounded-full animate-pulse">
              <Sparkles className="h-4 w-4 text-yellow-800" />
            </div>
          </div>
          <div className="space-y-4">
            <h3 className="text-2xl font-bold">Ready to Go! 🚀</h3>
            <p className="text-gray-600 dark:text-gray-300 text-lg leading-relaxed">
              You now know how to convert playlists like a pro. Start with your favorite playlist and watch the magic
              happen!
            </p>
            <div className="grid grid-cols-2 gap-4 mt-6">
              <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                <Music className="h-6 w-6 text-blue-600 mx-auto mb-2" />
                <p className="text-sm font-medium">Smart Matching</p>
                <p className="text-xs text-gray-600">Powerful and robust track detection</p>
              </div>
              <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                <CheckCircle className="h-6 w-6 text-green-600 mx-auto mb-2" />
                <p className="text-sm font-medium">High Success Rate</p>
                <p className="text-xs text-gray-600">85%+ match accuracy</p>
              </div>
            </div>
          </div>
        </div>
      ),
    },
  ]

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setIsAnimating(true)
      setTimeout(() => {
        setCurrentStep(currentStep + 1)
        setIsAnimating(false)
      }, 150)
    }
  }

  const prevStep = () => {
    if (currentStep > 0) {
      setIsAnimating(true)
      setTimeout(() => {
        setCurrentStep(currentStep - 1)
        setIsAnimating(false)
      }, 150)
    }
  }

  const handleComplete = () => {
    onComplete()
    onClose()
  }

  const handleSkip = () => {
    onClose()
  }

  const progressPercentage = ((currentStep + 1) / steps.length) * 100

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-lg sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="p-4 sm:p-6 pb-4 border-b">
          <div className="flex items-center justify-between mb-4 min-w-0">
            <DialogHeader className="flex-1 min-w-0">
              <DialogTitle className="text-left truncate">{steps[currentStep].title}</DialogTitle>
              <DialogDescription className="text-left truncate">{steps[currentStep].description}</DialogDescription>
            </DialogHeader>
          </div>

          {/* Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm min-w-0">
              <span className="text-muted-foreground">
                Step {currentStep + 1} of {steps.length}
              </span>
              <span className="text-muted-foreground">{Math.round(progressPercentage)}%</span>
            </div>
            <Progress value={progressPercentage} className="h-2 w-full" />
          </div>
        </div>

        {/* Content */}
        <div className={`transition-all duration-150 ${isAnimating ? "opacity-0 scale-95" : "opacity-100 scale-100"} w-full px-2 sm:px-6 py-4 sm:py-8 min-w-0`}> 
          <div className="w-full max-w-xs sm:max-w-md mx-auto min-w-0">
            {steps[currentStep].content}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 pt-4 border-t bg-gray-50 dark:bg-gray-800/50">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 min-w-0">
            <Button variant="ghost" onClick={prevStep} disabled={currentStep === 0} className="flex items-center gap-2 w-full sm:w-auto">
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>

            <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
              <Button variant="ghost" onClick={handleSkip} className="text-muted-foreground w-full sm:w-auto">
                Skip Tutorial
              </Button>

              {currentStep === steps.length - 1 ? (
                <Button
                  onClick={handleComplete}
                  className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 w-full sm:w-auto"
                >
                  Get Started
                  <Sparkles className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button onClick={nextStep} className="flex items-center gap-2 w-full sm:w-auto">
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
