// API utility for SongSeek backend

const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://backend--songseek--76cv6f4p49vv.code.run";

// Type definitions
export interface TrackConversionResult {
  sourceTrack: {
    title: string;
    artist: string;
  };
  targetUrl: string;
  targetPlatform: string;
}

export interface ConversionResult {
  matched: Array<{ title: string; artist: string; status: "success" }>;
  skipped: Array<{ title: string; artist: string; reason: string }>;
  mismatched: Array<{
    title: string;
    artist: string;
    suggestions: Array<{ title: string; artist: string; id: string }>;
  }>;
  playlistUrl?: string;
  tracks?: Array<any>;
}

export function getOAuthUrl(platform: string) {
  switch (platform) {
    case "spotify":
      return `${API_BASE_URL}/login`;
    case "youtube":
    case "ytmusic":
    case "yt":
      return `${API_BASE_URL}/youtube/login`;
    case "deezer":
      return `${API_BASE_URL}/deezer/login`;
    default:
      throw new Error("Unsupported platform");
  }
}

export async function convertDeezerToSpotify(link: string, session: string) {
  const url = `${API_BASE_URL}/convert-playlist?link=${encodeURIComponent(link)}&session=${encodeURIComponent(session)}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data;
}

export async function convertSpotifyToYouTube(playlistId: string, ytSession: string, spToken: string) {
  const url = `${API_BASE_URL}/convert-to-youtube?playlistId=${encodeURIComponent(playlistId)}&ytSession=${encodeURIComponent(ytSession)}&spToken=${encodeURIComponent(spToken)}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data;
}

export async function convertSpotifyToDeezer(playlistId: string, spSession: string) {
  const url = `${API_BASE_URL}/convert-spotify-to-deezer?playlistId=${encodeURIComponent(playlistId)}&spSession=${encodeURIComponent(spSession)}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data;
}

export async function convertYouTubeToSpotify(link: string, session: string) {
  const url = `${API_BASE_URL}/convert-youtube-playlist?link=${encodeURIComponent(link)}&session=${encodeURIComponent(session)}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data;
}

export async function convertYouTubeToDeezer(playlistId: string, ytSession: string) {
  const url = `${API_BASE_URL}/convert-youtube-to-deezer?playlistId=${encodeURIComponent(playlistId)}&ytSession=${encodeURIComponent(ytSession)}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data;
}

// Convert single track between platforms
export async function convertTrack(sourceUrl: string, targetPlatform: string, session: string): Promise<TrackConversionResult> {
  const url = `${API_BASE_URL}/convert-track`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sourceUrl,
      targetPlatform,
      session
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Track conversion failed: ${errorText}`);
  }

  const data = await response.json();
  return data;
}

export async function getConversionResults(session: string): Promise<ConversionResult> {
  const url = `${API_BASE_URL}/conversion-results/${encodeURIComponent(session)}`;
  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch conversion results: ${errorText}`);
  }

  const data = await response.json();
  return data;
}

// Search functionality for mismatched tracks
export async function searchTracks(platform: string, query: string, limit: number = 5, session?: string) {
  if (platform === 'deezer') {
    return await searchDeezerTracks(query, session!);
  }
  const params = new URLSearchParams({
    query: query,
    limit: limit.toString()
  });
  
  if (session) {
    params.append('session', session);
  }
  
  const url = platform === 'spotify'
    ? `${API_BASE_URL}/fix/search/spotify?${params.toString()}`
    : `${API_BASE_URL}/search/${platform}?${params.toString()}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return Array.isArray(data) ? data : data.results;
}

export async function searchAllPlatforms(query: string, limit: number = 5, session?: string) {
  const params = new URLSearchParams({
    query: query,
    limit: limit.toString()
  });
  
  if (session) {
    params.append('session', session);
  }
  
  const url = `${API_BASE_URL}/search/all?${params.toString()}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.results;
}

// Manual fix functionality
export async function applyPlaylistFixes(
  session: string,
  playlistUrl: string,
  replacements: any[],
  options?: { playlistName?: string; playlistDescription?: string; isPublic?: boolean }
) {
  const url = `${API_BASE_URL}/fix/fix-playlist-tracks`;
  console.log('[DEBUG] applyPlaylistFixes: sending request to', url);
  console.log('[DEBUG] applyPlaylistFixes: request body', { session, playlistUrl, replacements, options });
  
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session,
      playlistUrl,
      replacements,
      // Advanced editor playlist metadata (optional)
      playlistName: options?.playlistName,
      playlistDescription: options?.playlistDescription,
      isPublic: options?.isPublic,
    })
  });
  
  console.log('[DEBUG] applyPlaylistFixes: response status', res.status);
  const responseText = await res.text();
  console.log('[DEBUG] applyPlaylistFixes: response body', responseText);
  
  if (!res.ok) throw new Error(responseText);
  const data = JSON.parse(responseText);
  return data;
}

export async function addTrackToPlaylist(session: string, playlistUrl: string, track: any, targetPlatform: string) {
  const url = `${API_BASE_URL}/fix/add-track`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session,
      playlistUrl,
      track,
      targetPlatform
    })
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data;
}

export function listenToProgress(session: string, onProgress: (progress: any) => void) {
  const url = `${API_BASE_URL}/progress/${encodeURIComponent(session)}`;
  const eventSource = new EventSource(url);
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onProgress(data);
    } catch {}
  };
  return eventSource;
} 

// Backup/import progress via SSE
export function listenToBackupProgress(session: string, onProgress: (progress: any) => void) {
  const url = `${API_BASE_URL}/backup-progress/${encodeURIComponent(session)}`;
  const eventSource = new EventSource(url);
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onProgress(data);
    } catch {}
  };
  return eventSource;
}

// Spotify account backup/export
export async function exportSpotifyAccount(session: string) {
  const url = `${API_BASE_URL}/spotify/export-account?session=${encodeURIComponent(session)}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to export Spotify account: ${errorText}`);
  }
  return await res.json();
}

// Spotify account restore/import
export async function importSpotifyAccount(session: string, backup: any) {
  const url = `${API_BASE_URL}/spotify/import-account?session=${encodeURIComponent(session)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(backup),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to import Spotify account: ${errorText}`);
  }
  return await res.json();
}

// Convert web-scraped playlists (Apple Music, Amazon Music, Tidal) to other platforms
export async function convertWebPlaylist(link: string, targetPlatform: string, session?: string) {
  const params = new URLSearchParams({
    link: link,
    targetPlatform: targetPlatform
  });
  
  if (session) {
    params.append('session', session);
  }
  
  const url = `${API_BASE_URL}/convert-web-playlist?${params.toString()}`;
  const res = await fetch(url, { method: "GET" });
  
  if (!res.ok) {
    const errorData = await res.json();
    
    // Handle 401 authentication required responses
    if (res.status === 401 && errorData.requiresAuth) {
      const authError = new Error(errorData.error || 'Authentication required');
      (authError as any).requiresAuth = true;
      (authError as any).platform = errorData.platform;
      throw authError;
    }
    
    throw new Error(errorData.message || errorData.error || await res.text());
  }
  
  const data = await res.json();
  
  // Check if the response contains an error field (even with 200 status)
  if (data.error) {
    throw new Error(data.error);
  }
  
  return data;
} 

export async function validateDeezerARL(arl: string) {
  console.log('[DEBUG] validateDeezerARL called with ARL length:', arl?.length);
  console.log('[DEBUG] ARL preview:', arl?.substring(0, 10) + '...');
  
  const url = `${API_BASE_URL}/deezer/validate-arl`;
  console.log('[DEBUG] Making request to:', url);
  
  const requestBody = { arl };
  console.log('[DEBUG] Request body:', JSON.stringify(requestBody, null, 2));
  
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody)
  });
  
  console.log('[DEBUG] Response status:', res.status);
  console.log('[DEBUG] Response headers:', Object.fromEntries(res.headers.entries()));
  
  const responseText = await res.text();
  console.log('[DEBUG] Response body:', responseText);
  
  if (!res.ok) {
    let errorData;
    try {
      errorData = JSON.parse(responseText);
    } catch (e) {
      console.error('[DEBUG] Failed to parse error response as JSON:', e);
      throw new Error(`HTTP ${res.status}: ${responseText}`);
    }
    
    console.error('[DEBUG] ARL validation failed:', errorData);
    throw new Error(errorData.error || errorData.message || 'Failed to validate ARL token');
  }
  
  let data;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    console.error('[DEBUG] Failed to parse success response as JSON:', e);
    throw new Error('Invalid JSON response from server');
  }
  
  console.log('[DEBUG] ARL validation successful:', data);
  return data;
} 

// Deezer manual search for review/fix
export async function searchDeezerTracks(query: string, session: string) {
  const res = await fetch(`${API_BASE_URL}/deezer/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, session })
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  // Return tracks array for compatibility
  return data.tracks || [];
}

// Deezer add-to-playlist for manual review/fix
export async function addDeezerTrackToPlaylist(trackId: string, playlistId: string, session: string) {
  const res = await fetch(`${API_BASE_URL}/deezer/add-to-playlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackId, playlistId, session })
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
} 