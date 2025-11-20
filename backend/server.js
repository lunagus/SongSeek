import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import fetch from 'node-fetch';

// Robust .env loading with multiple fallback paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try multiple possible .env locations
const possibleEnvPaths = [
  path.resolve(__dirname, '.env'),                    // /backend/.env
  path.resolve(__dirname, '..', '.env'),             // /.env (project root)
  path.resolve(process.cwd(), '.env'),                // Current working directory
  path.resolve(process.cwd(), 'backend', '.env'),    // Current working directory + backend
];

let envLoaded = false;
for (const envPath of possibleEnvPaths) {
  try {
    const result = dotenv.config({ path: envPath });
    if (!result.error) {
      console.log(`[DEBUG] .env loaded from: ${envPath}`);
      envLoaded = true;
      break;
    }
  } catch (error) {
    console.log(`[DEBUG] Failed to load .env from: ${envPath}`);
  }
}

if (!envLoaded) {
  console.warn('[WARNING] No .env file found in any of the expected locations:');
  possibleEnvPaths.forEach(path => console.warn(`  - ${path}`));
  console.warn('[WARNING] Using environment variables from system or default values');
}

// Debug: Verify API key is loaded
console.log('[DEBUG] BROWSERLESS_API_KEY loaded as:', process.env.BROWSERLESS_API_KEY ? 'YES' : 'NO');
console.log('[DEBUG] BROWSERLESS_API_KEY length:', process.env.BROWSERLESS_API_KEY?.length || 0);
console.log('[DEBUG] BROWSERLESS_API_KEY value:', process.env.BROWSERLESS_API_KEY);
console.log('[DEBUG] BROWSERLESS_API_KEY first 10 chars:', process.env.BROWSERLESS_API_KEY?.substring(0, 10));
console.log('[DEBUG] BROWSERLESS_API_KEY last 10 chars:', process.env.BROWSERLESS_API_KEY?.substring(-10));
console.log('[DEBUG] All environment variables starting with BROWSERLESS:', Object.keys(process.env).filter(key => key.startsWith('BROWSERLESS')));

if (!process.env.BROWSERLESS_API_KEY) {
  console.error('[ERROR] BROWSERLESS_API_KEY not found in environment variables!');
  console.error('[ERROR] Make sure your .env file exists and contains:');
  console.error('[ERROR] BROWSERLESS_API_KEY=your_key_here');
  console.error('[ERROR] Expected .env locations:');
  possibleEnvPaths.forEach(path => console.error(`  - ${path}`));
}

import convertRouter from './routes/convert-route.js';
import searchRouter from './routes/search-route.js';
import fixRouter from './routes/fix-route.js';
import { getSpotifyLoginUrl, getTokensFromCode } from './utils/spotify-auth.js';
import { getDeezerLoginUrl, getTokensFromCode as getDeezerTokensFromCode } from './utils/deezer-auth.js';
import resolveDeezerPlaylist from './resolvers/deezer-playlist-resolver.js';
import { createSpotifyPlaylist } from './mappers/deezer-to-spotify-playlist-mapper.js';
import { createDeezerPlaylist } from './mappers/spotify-to-deezer-playlist-mapper.js';
import { createDeezerPlaylistFromYouTube } from './mappers/youtube-to-deezer-playlist-mapper.js';
import { createDeezerPlaylistFromApple } from './mappers/apple-to-deezer-playlist-mapper.js';
import { getYouTubeLoginUrl, getYouTubeTokensFromCode } from './utils/youtube-auth.js';
import { convertSpotifyToYouTubePlaylist } from './mappers/spotify-to-youtube-playlist-mapper.js';
import resolveSpotifyPlaylist from './resolvers/spotify-playlist-resolver.js';
import resolveYouTubePlaylist from './resolvers/youtube-playlist-scraper.js';
import { convertYouTubeToSpotifyPlaylist } from './mappers/youtube-to-spotify-playlist-mapper.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

const userSessions = new Map(); // key = sessionId (state), value = { accessToken, refreshToken }
const progressMap = new Map(); // key = sessionId, value = { total, current, stage, error }
const conversionResultsMap = new Map(); // key = sessionId, value = { matched, skipped, mismatched, playlistUrl }
const backupProgressMap = new Map(); // key = sessionId, value = { type, stage, playlistsCurrent, playlistsTotal, tracksCurrent, tracksTotal }

// Make userSessions globally accessible for search service
global.userSessions = userSessions;

// Middleware
app.use(cookieParser());
// Allow larger JSON bodies for operations like Spotify account import
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// CORS middleware to allow frontend requests
app.use((req, res, next) => {
  const origin = req.headers.origin;

  const allowedOrigins = [
    'https://songseek.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];

  let allowed = false;

  if (origin) {
    if (allowedOrigins.includes(origin) || origin.includes('songseek.vercel.app')) {
      res.header('Access-Control-Allow-Origin', origin);
      allowed = true;
    }
  }

  // Debug CORS decisions in production to diagnose issues like blocked import/export
  console.log('[CORS] Origin:', origin, 'Allowed:', allowed);

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

app.use('/', convertRouter);
app.use('/search', searchRouter);
app.use('/fix', fixRouter);

// 🔐 Spotify OAuth
app.get('/login', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('spotify_auth_state', state);
  const loginUrl = getSpotifyLoginUrl(state);
  res.redirect(loginUrl);
});

app.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  const storedState = req.cookies?.spotify_auth_state;

  if (!state || state !== storedState) {
    return res.status(400).send('State mismatch');
  }

  try {
    const tokens = await getTokensFromCode(code);
    userSessions.set(state, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      platform: 'spotify'
    });

    res.redirect(`https://songseek.vercel.app/login-success?session=${state}`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).send('Authentication failed');
  }
});

// YouTube OAuth login
app.get('/youtube/login', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('youtube_auth_state', state);
  const url = getYouTubeLoginUrl(state);
  res.redirect(url);
});

// YouTube OAuth callback
app.get('/youtube/callback', async (req, res) => {
  const { code, state } = req.query;
  const storedState = req.cookies?.youtube_auth_state;

  if (!state || state !== storedState) {
    return res.status(400).send('State mismatch');
  }

  try {
    const tokens = await getYouTubeTokensFromCode(code);
    userSessions.set(state, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      platform: 'youtube'
    });
    res.redirect(`https://songseek.vercel.app/login-success?youtube_session=${state}`);
  } catch (err) {
    console.error('YouTube OAuth error:', err);
    res.status(500).send('Authentication failed');
  }
});

// Deezer OAuth login
app.get('/deezer/login', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('deezer_auth_state', state);
  const url = getDeezerLoginUrl(state);
  res.redirect(url);
});

// Deezer OAuth callback
app.get('/deezer/callback', async (req, res) => {
  const { code, state } = req.query;
  const storedState = req.cookies?.deezer_auth_state;

  if (!state || state !== storedState) {
    return res.status(400).send('State mismatch');
  }

  try {
    const tokens = await getDeezerTokensFromCode(code);
    userSessions.set(state, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      platform: 'deezer'
    });
    res.redirect(`https://songseek.vercel.app/login-success?deezer_session=${state}`);
  } catch (err) {
    console.error('Deezer OAuth error:', err);
    res.status(500).send('Authentication failed');
  }
});

// Deezer ARL validation endpoint
app.post('/deezer/validate-arl', async (req, res) => {
  console.log('[DEBUG] /deezer/validate-arl endpoint called');
  console.log('[DEBUG] Request body:', JSON.stringify(req.body, null, 2));
  
  const { arl } = req.body;
  
  if (!arl) {
    console.error('[DEBUG] ARL validation failed: Missing ARL token in request body');
    return res.status(400).json({ 
      success: false,
      error: 'ARL token is required' 
    });
  }

  console.log('[DEBUG] ARL token received, length:', arl.length);
  console.log('[DEBUG] ARL token preview:', arl.substring(0, 10) + '...');

  try {
    console.log('[DEBUG] Importing validateDeezerARL function...');
    const { validateDeezerARL } = await import('./mappers/deezer-playlist-mapper.js');
    console.log('[DEBUG] Function imported successfully');
    
    console.log('[DEBUG] Calling validateDeezerARL...');
    const validation = await validateDeezerARL(arl);
    console.log('[DEBUG] Validation result:', JSON.stringify(validation, null, 2));
    
    if (validation.valid) {
      console.log('[DEBUG] ARL validation successful, creating session...');
      
      // Generate a session ID for the ARL token
      const sessionId = `deezer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Store the ARL token in the session
      userSessions.set(sessionId, { 
        arlToken: arl,
        user: validation.user,
        platform: 'deezer'
      });
      
      console.log('[DEBUG] Stored Deezer ARL session:', sessionId);
      console.log('[DEBUG] Session data:', JSON.stringify(userSessions.get(sessionId), null, 2));
      
      res.json({ 
        success: true, 
        session: sessionId,
        user: validation.user 
      });
    } else {
      console.error('[DEBUG] ARL validation failed:', validation.error);
      res.status(401).json({ 
        success: false, 
        error: validation.error 
      });
      playlistsProcessed += 1;
    }
  } catch (error) {
    console.error('[DEBUG] Unexpected error in /deezer/validate-arl endpoint:');
    console.error('[DEBUG] Error name:', error.name);
    console.error('[DEBUG] Error message:', error.message);
    console.error('[DEBUG] Error stack:', error.stack);
    console.error('[DEBUG] Full error object:', error);
    
    // Return more detailed error information for debugging
    res.status(500).json({ 
      success: false, 
      error: error?.message || 'Unknown server error during ARL validation',
      details: process.env.NODE_ENV === 'development' ? {
        name: error?.name,
        stack: error?.stack
      } : undefined
    });
  }
});

// Deezer search endpoint for manual review/fix
app.post('/deezer/search', async (req, res) => {
  const { query, session } = req.body;
  if (!query || !session) {
    return res.status(400).json({ error: 'Missing query or session' });
  }
  const user = userSessions.get(session);
  if (!user?.arlToken) {
    return res.status(401).json({ error: 'Deezer ARL token required' });
  }
  try {
    const { DeezerAPI } = await import('@krishna2206/deezer-api');
    const deezer = new DeezerAPI({ language: 'en', country: 'US' });
    await deezer.initialize(user.arlToken);
    const results = await deezer.search(query);
    res.json({
      tracks: results.tracks || [],
      albums: results.albums || [],
      artists: results.artists || [],
      playlists: results.playlists || []
    });
  } catch (error) {
    console.error('[DEBUG] Deezer search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Deezer add-to-playlist endpoint for manual review/fix
app.post('/deezer/add-to-playlist', async (req, res) => {
  const { session, playlistId, trackId } = req.body;
  if (!session || !playlistId || !trackId) {
    return res.status(400).json({ error: 'Missing session, playlistId, or trackId' });
  }
  const user = userSessions.get(session);
  if (!user?.arlToken) {
    return res.status(401).json({ error: 'Deezer ARL token required' });
  }
  try {
    const { DeezerAPI } = await import('@krishna2206/deezer-api');
    const deezer = new DeezerAPI({ language: 'en', country: 'US' });
    await deezer.initialize(user.arlToken);
    await deezer.addToPlaylist(trackId, playlistId);
    res.json({ success: true });
  } catch (error) {
    console.error('[DEBUG] Deezer add-to-playlist error:', error);
    res.status(500).json({ error: error.message });
  }
});

// SSE endpoint for progress
app.get('/progress/:session', (req, res) => {
  const session = req.params.session;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendProgress = () => {
    const progress = progressMap.get(session) || {};
    res.write(`data: ${JSON.stringify(progress)}\n\n`);
  };

  // Send initial progress
  sendProgress();
  const interval = setInterval(sendProgress, 1000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

// SSE endpoint for backup/import progress
app.get('/backup-progress/:session', (req, res) => {
  const session = req.params.session;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendProgress = () => {
    const progress = backupProgressMap.get(session) || {};
    res.write(`data: ${JSON.stringify(progress)}\n\n`);
  };

  sendProgress();
  const interval = setInterval(sendProgress, 1000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

// Get conversion results
app.get('/conversion-results/:session', (req, res) => {
  const session = req.params.session;
  const results = conversionResultsMap.get(session);
  
  if (!results) {
    return res.status(404).json({ error: 'No conversion results found for this session' });
  }
  
  res.json(results);
});

// Convert single track between platforms (POST, for frontend compatibility)
app.post('/convert-track', async (req, res) => {
  const { sourceUrl, targetPlatform, session } = req.body;

  if (!sourceUrl || !targetPlatform) {
    return res.status(400).json({ error: 'Missing "sourceUrl" or "targetPlatform" in request body' });
  }

  console.log(`Converting track (POST): ${sourceUrl} to ${targetPlatform}`);

  try {
    // Extract URL from text that might contain additional content
    const { extractUrlFromText } = await import('./utils/url-extractor.js');
    const extractedUrl = extractUrlFromText(sourceUrl);
    
    if (!extractedUrl) {
      return res.status(400).json({ 
        error: 'No valid music platform URL found in the provided text',
        providedText: sourceUrl
      });
    }

    console.log(`Extracted URL: ${extractedUrl}`);

    // Resolve metadata from extracted URL
    const { resolveMetadata } = await import('./resolvers/resolvers.js');
    const metadata = await resolveMetadata(extractedUrl);
    
    console.log(`Resolved metadata: ${metadata.title} - ${metadata.artist}`);
    
    // Map to target platform
    const { mapToPlatform } = await import('./mappers/mappers.js');
    const targetUrl = await mapToPlatform(metadata, targetPlatform);

    console.log(`[DEBUG] Mapper result for ${targetPlatform}:`, targetUrl);
    console.log(`[DEBUG] Mapper result type:`, typeof targetUrl);

    if (!targetUrl) {
      console.log(`No match found on ${targetPlatform} for: ${metadata.title} - ${metadata.artist}`);
      return res.status(404).json({ 
        error: 'No match found on target platform',
        sourceTrack: metadata
      });
    }

    console.log(`Successfully converted to: ${targetUrl}`);

    res.json({
      success: true,
      sourceTrack: metadata,
      targetUrl: targetUrl,
      targetPlatform: targetPlatform
    });
  } catch (err) {
    console.error('Track conversion error (POST):', err);
    res.status(500).json({ 
      error: 'Error converting track',
      message: err.message 
    });
  }
});

// 🎵 Playlist conversion route
app.get('/convert-playlist', async (req, res) => {
  const { link, session } = req.query;
  const user = userSessions.get(session);
  let token = user?.accessToken;
  let refreshToken = user?.refreshToken;

  if (!token) {
    return res.status(401).send('Missing or invalid session token.');
  }

  try {
    // Extract URL from text that might contain additional content
    const { extractUrlFromText } = await import('./utils/url-extractor.js');
    const extractedUrl = extractUrlFromText(link);
    
    if (!extractedUrl) {
      return res.status(400).json({ 
        error: 'No valid music platform URL found in the provided text',
        providedText: link
      });
    }

    console.log(`Extracted playlist URL: ${extractedUrl}`);

    progressMap.set(session, { 
      stage: 'Fetching Deezer playlist...', 
      current: 0, 
      total: 0,
      tracks: []
    });
    const { name, tracks } = await resolveDeezerPlaylist(extractedUrl);
    
    // Initialize tracks with pending status
    const trackProgress = tracks.map(track => ({
      title: track.title,
      artist: track.artist,
      status: 'pending'
    }));
    
    progressMap.set(session, { 
      stage: 'Searching tracks on Spotify...', 
      current: 0, 
      total: tracks.length,
      tracks: trackProgress
    });

    // Step 1: Get user profile
    const { createSpotifyPlaylist } = await import('./mappers/deezer-to-spotify-playlist-mapper.js');
    
    // Step 2: Create playlist and add tracks (handled in mapper, but we update progress here)
    progressMap.set(session, { 
      stage: 'Adding tracks to Spotify playlist...', 
      current: 0, 
      total: tracks.length,
      tracks: trackProgress
    });
    const result = await createSpotifyPlaylist(
      token,
      name,
      tracks,
      (added, trackInfo) => {
        if (trackInfo) {
          // Update specific track status
          const trackIndex = trackProgress.findIndex(t => 
            t.title === trackInfo.title && t.artist === trackInfo.artist
          );
          if (trackIndex !== -1) {
            trackProgress[trackIndex].status = trackInfo.found ? 'success' : 'failed';
          }
        } else {
          // Update track statuses based on what was added
          for (let i = 0; i < added && i < trackProgress.length; i++) {
            trackProgress[i].status = 'success';
          }
        }
        progressMap.set(session, { 
          stage: 'Adding tracks to Spotify playlist...', 
          current: added, 
          total: tracks.length,
          tracks: trackProgress
        });
      },
      refreshToken,
      (newAccessToken, newRefreshToken) => {
        userSessions.set(session, { accessToken: newAccessToken, refreshToken: newRefreshToken });
        token = newAccessToken;
        refreshToken = newRefreshToken;
        console.log('Updated session tokens after refresh.');
      }
    );
    progressMap.set(session, { 
      stage: 'Done', 
      current: tracks.length, 
      total: tracks.length,
      tracks: trackProgress
    });
    // Store the full result from createSpotifyPlaylist
    console.log('[DEBUG] SET conversionResultsMap', session, JSON.stringify(result, null, 2));
    conversionResultsMap.set(session, result);
    
    // Clean up progress data after 1 min, but keep results for 5 minutes
    setTimeout(() => progressMap.delete(session), 60000);
    setTimeout(() => conversionResultsMap.delete(session), 300000);
    
    res.json({ success: true, session, message: 'Conversion completed successfully' });
  } catch (err) {
    console.error(err);
    progressMap.set(session, { 
      stage: 'Error', 
      error: err.message,
      tracks: []
    });
    res.status(500).send('Error converting playlist');
  }
});

// Alias route for compatibility
app.get('/convert-spotify-to-youtube', (req, res) => {
  res.redirect(307, `/convert-to-youtube?${new URLSearchParams(req.query).toString()}`);
});

// Convert Spotify playlist to YouTube playlist
app.get('/convert-to-youtube', async (req, res) => {
  const { playlistId, ytSession, spToken } = req.query;
  const sessionData = userSessions.get(ytSession);

  if (!sessionData?.accessToken) {
    return res.status(401).send('User not authenticated with YouTube');
  }

  try {
    progressMap.set(ytSession, { 
      stage: 'Fetching Spotify playlist...', 
      current: 0, 
      total: 0,
      tracks: []
    });
    
    // Resolve Spotify playlist to get tracks
    const resolveSpotifyPlaylist = (await import('./resolvers/spotify-playlist-resolver.js')).default;
    const { name, tracks } = await resolveSpotifyPlaylist(playlistId);
    
    // Initialize tracks with pending status
    const trackProgress = tracks.map(track => ({
      title: track.title,
      artist: track.artist,
      status: 'pending'
    }));
    
    progressMap.set(ytSession, { 
      stage: 'Searching tracks on YouTube...', 
      current: 0, 
      total: tracks.length,
      tracks: trackProgress
    });

    const youtubeUrl = await convertSpotifyToYouTubePlaylist(
      spToken, // Spotify token
      sessionData.accessToken, // YouTube token
      playlistId,
      (current, trackInfo) => {
        if (trackInfo) {
          // Update specific track status
          const trackIndex = trackProgress.findIndex(t => 
            t.title === trackInfo.title && t.artist === trackInfo.artist
          );
          if (trackIndex !== -1) {
            trackProgress[trackIndex].status = trackInfo.found ? 'success' : 'failed';
          }
        } else {
          // Update track statuses based on what was processed
          for (let i = 0; i < current && i < trackProgress.length; i++) {
            trackProgress[i].status = 'success';
          }
        }
        progressMap.set(ytSession, { 
          stage: 'Adding tracks to YouTube playlist...', 
          current, 
          total: tracks.length,
          tracks: trackProgress
        });
      }
    );
    
    progressMap.set(ytSession, { 
      stage: 'Done', 
      current: tracks.length, 
      total: tracks.length,
      tracks: trackProgress
    });
    
    // Store conversion results
    const matched = trackProgress.filter(track => track.status === 'success').map(track => ({
      title: track.title,
      artist: track.artist,
      status: 'success'
    }));
    
    const skipped = trackProgress.filter(track => track.status === 'failed').map(track => ({
      title: track.title,
      artist: track.artist,
      reason: 'Not found on target platform'
    }));
    
    const conversionResults = {
      matched,
      skipped,
      mismatched: [], // No mismatched tracks for this conversion type
      playlistUrl: youtubeUrl,
      tracks: trackProgress
    };
    
    console.log('[DEBUG] SET conversionResultsMap', ytSession, JSON.stringify(conversionResults, null, 2));
    conversionResultsMap.set(ytSession, conversionResults);
    
    // Clean up progress data after 1 min, but keep results for 5 minutes
    setTimeout(() => progressMap.delete(ytSession), 60000);
    setTimeout(() => conversionResultsMap.delete(ytSession), 300000);
    
    res.json({ success: true, session: ytSession, message: 'Conversion completed successfully' });
  } catch (err) {
    console.error(err);
    progressMap.set(ytSession, { 
      stage: 'Error', 
      error: err.message,
      tracks: []
    });
    res.status(500).send('Error converting playlist to YouTube');
  }
});

// Convert YouTube playlist to Spotify playlist
app.get('/convert-youtube-playlist', async (req, res) => {
  const { link, session } = req.query;
  const user = userSessions.get(session);
  let token = user?.accessToken;
  let refreshToken = user?.refreshToken;

  if (!token) {
    return res.status(401).send('Missing or invalid session token.');
  }

  try {
    // Extract URL from text that might contain additional content
    const { extractUrlFromText } = await import('./utils/url-extractor.js');
    const extractedUrl = extractUrlFromText(link);
    
    if (!extractedUrl) {
      return res.status(400).json({ 
        error: 'No valid music platform URL found in the provided text',
        providedText: link
      });
    }

    console.log(`Extracted YouTube playlist URL: ${extractedUrl}`);

    progressMap.set(session, { 
      stage: 'Fetching YouTube playlist...', 
      current: 0, 
      total: 0,
      tracks: []
    });
    const { name, tracks } = await resolveYouTubePlaylist(extractedUrl);
    
    // Initialize tracks with pending status
    const trackProgress = tracks.map(track => ({
      title: track.title,
      artist: track.artist,
      status: 'pending'
    }));
    
    progressMap.set(session, { 
      stage: 'Searching tracks on Spotify...', 
      current: 0, 
      total: tracks.length,
      tracks: trackProgress
    });

    // Step 1: Create playlist and add tracks
    const result = await convertYouTubeToSpotifyPlaylist(
      token,
      name,
      tracks,
      (added) => {
        // Update track statuses based on what was added
        for (let i = 0; i < added && i < trackProgress.length; i++) {
          trackProgress[i].status = 'success';
        }
        progressMap.set(session, { 
          stage: 'Adding tracks to Spotify playlist...', 
          current: added, 
          total: tracks.length,
          tracks: trackProgress
        });
      },
      refreshToken,
      (newAccessToken, newRefreshToken) => {
        userSessions.set(session, { accessToken: newAccessToken, refreshToken: newRefreshToken });
        token = newAccessToken;
        refreshToken = newRefreshToken;
        console.log('Updated session tokens after refresh.');
      }
    );
    progressMap.set(session, { 
      stage: 'Done', 
      current: tracks.length, 
      total: tracks.length,
      tracks: trackProgress
    });
    
    // Store conversion results (now using matched, mismatched, skipped from result)
    const { matched = [], mismatched = [], skipped = [], playlistUrl = result.playlistUrl, tracks: resultTracks = [] } = result;
    const conversionResults = {
      matched,
      mismatched,
      skipped,
      playlistUrl,
      tracks: resultTracks.length > 0 ? resultTracks : trackProgress
    };
    
    conversionResultsMap.set(session, conversionResults);
    
    // Clean up progress data after 1 min, but keep results for 5 minutes
    setTimeout(() => progressMap.delete(session), 60000);
    setTimeout(() => conversionResultsMap.delete(session), 300000);
    
    res.json({ success: true, session, message: 'Conversion completed successfully' });
  } catch (err) {
    progressMap.set(session, { 
      stage: 'Error', 
      error: err.message,
      tracks: []
    });
    res.status(500).send('Error converting YouTube playlist to Spotify: ' + err.message);
  }
});

// Convert Spotify playlist to Deezer playlist
app.get('/convert-spotify-to-deezer', async (req, res) => {
  const { playlistId, spSession } = req.query;
  const sessionData = userSessions.get(spSession);

  if (!sessionData?.accessToken) {
    return res.status(401).send('User not authenticated with Spotify');
  }

  try {
    progressMap.set(spSession, { 
      stage: 'Fetching Spotify playlist...', 
      current: 0, 
      total: 0,
      tracks: []
    });
    
    // Resolve Spotify playlist to get tracks
    const resolveSpotifyPlaylist = (await import('./resolvers/spotify-playlist-resolver.js')).default;
    const { name, tracks } = await resolveSpotifyPlaylist(playlistId);
    
    // Initialize tracks with pending status
    const trackProgress = tracks.map(track => ({
      title: track.title,
      artist: track.artist,
      status: 'pending'
    }));
    
    progressMap.set(spSession, { 
      stage: 'Searching tracks on Deezer...', 
      current: 0, 
      total: tracks.length,
      tracks: trackProgress
    });

    const deezerUrl = await createDeezerPlaylist(
      sessionData.accessToken,
      name,
      tracks,
      (added, trackInfo) => {
        if (trackInfo) {
          // Update specific track status
          const trackIndex = trackProgress.findIndex(t => 
            t.title === trackInfo.title && t.artist === trackInfo.artist
          );
          if (trackIndex !== -1) {
            trackProgress[trackIndex].status = trackInfo.found ? 'success' : 'failed';
          }
        } else {
          // Update track statuses based on what was added
          for (let i = 0; i < added && i < trackProgress.length; i++) {
            trackProgress[i].status = 'success';
          }
        }
        progressMap.set(spSession, { 
          stage: 'Adding tracks to Deezer playlist...', 
          current: added, 
          total: tracks.length,
          tracks: trackProgress
        });
      },
      sessionData.refreshToken,
      (newAccessToken, newRefreshToken) => {
        userSessions.set(spSession, { accessToken: newAccessToken, refreshToken: newRefreshToken });
        sessionData.accessToken = newAccessToken;
        sessionData.refreshToken = newRefreshToken;
        console.log('Updated session tokens after refresh.');
      }
    );
    
    progressMap.set(spSession, { 
      stage: 'Done', 
      current: tracks.length, 
      total: tracks.length,
      tracks: trackProgress
    });
    
    // Store conversion results
    const matched = trackProgress.filter(track => track.status === 'success').map(track => ({
      title: track.title,
      artist: track.artist,
      status: 'success'
    }));
    
    const skipped = trackProgress.filter(track => track.status === 'failed').map(track => ({
      title: track.title,
      artist: track.artist,
      reason: 'Not found on target platform'
    }));
    
    const conversionResults = {
      matched,
      skipped,
      mismatched: [], // No mismatched tracks for this conversion type
      playlistUrl: deezerUrl,
      tracks: trackProgress
    };
    
    console.log('[DEBUG] SET conversionResultsMap', spSession, JSON.stringify(conversionResults, null, 2));
    conversionResultsMap.set(spSession, conversionResults);
    
    // Clean up progress data after 1 min, but keep results for 5 minutes
    setTimeout(() => progressMap.delete(spSession), 60000);
    setTimeout(() => conversionResultsMap.delete(spSession), 300000);
    
    res.json({ success: true, session: spSession, message: 'Conversion completed successfully' });
  } catch (err) {
    progressMap.set(spSession, { 
      stage: 'Error', 
      error: err.message,
      tracks: []
    });
    res.status(500).send('Error converting Spotify playlist to Deezer: ' + err.message);
  }
});

// Convert YouTube playlist to Deezer playlist
app.get('/convert-youtube-to-deezer', async (req, res) => {
  const { playlistId, ytSession } = req.query;
  const sessionData = userSessions.get(ytSession);

  if (!sessionData?.accessToken) {
    return res.status(401).send('User not authenticated with YouTube');
  }

  try {
    progressMap.set(ytSession, { 
      stage: 'Fetching YouTube playlist...', 
      current: 0, 
      total: 0,
      tracks: []
    });
    
    // Resolve YouTube playlist to get tracks
    const resolveYouTubePlaylist = (await import('./resolvers/youtube-playlist-scraper.js')).default;
    const { name, tracks } = await resolveYouTubePlaylist(playlistId);
    
    // Initialize tracks with pending status
    const trackProgress = tracks.map(track => ({
      title: track.title,
      artist: track.artist,
      status: 'pending'
    }));
    
    progressMap.set(ytSession, { 
      stage: 'Searching tracks on Deezer...', 
      current: 0, 
      total: tracks.length,
      tracks: trackProgress
    });

    const deezerUrl = await createDeezerPlaylistFromYouTube(
      sessionData.accessToken,
      name,
      tracks,
      (added, trackInfo) => {
        if (trackInfo) {
          // Update specific track status
          const trackIndex = trackProgress.findIndex(t => 
            t.title === trackInfo.title && t.artist === trackInfo.artist
          );
          if (trackIndex !== -1) {
            trackProgress[trackIndex].status = trackInfo.found ? 'success' : 'failed';
          }
        } else {
          // Update track statuses based on what was added
          for (let i = 0; i < added && i < trackProgress.length; i++) {
            trackProgress[i].status = 'success';
          }
        }
        progressMap.set(ytSession, { 
          stage: 'Adding tracks to Deezer playlist...', 
          current: added, 
          total: tracks.length,
          tracks: trackProgress
        });
      },
      sessionData.refreshToken,
      (newAccessToken, newRefreshToken) => {
        userSessions.set(ytSession, { accessToken: newAccessToken, refreshToken: newRefreshToken });
        sessionData.accessToken = newAccessToken;
        sessionData.refreshToken = newRefreshToken;
        console.log('Updated session tokens after refresh.');
      }
    );
    
    progressMap.set(ytSession, { 
      stage: 'Done', 
      current: tracks.length, 
      total: tracks.length,
      tracks: trackProgress
    });
    
    // Store conversion results
    const matched = trackProgress.filter(track => track.status === 'success').map(track => ({
      title: track.title,
      artist: track.artist,
      status: 'success'
    }));
    
    const skipped = trackProgress.filter(track => track.status === 'failed').map(track => ({
      title: track.title,
      artist: track.artist,
      reason: 'Not found on target platform'
    }));
    
    const conversionResults = {
      matched,
      skipped,
      mismatched: [], // No mismatched tracks for this conversion type
      playlistUrl: deezerUrl,
      tracks: trackProgress
    };
    
    console.log('[DEBUG] SET conversionResultsMap', ytSession, JSON.stringify(conversionResults, null, 2));
    conversionResultsMap.set(ytSession, conversionResults);
    
    // Clean up progress data after 1 min, but keep results for 5 minutes
    setTimeout(() => progressMap.delete(ytSession), 60000);
    setTimeout(() => conversionResultsMap.delete(ytSession), 300000);
    
    res.json({ success: true, session: ytSession, message: 'Conversion completed successfully' });
  } catch (err) {
    progressMap.set(ytSession, { 
      stage: 'Error', 
      error: err.message,
      tracks: []
    });
    res.status(500).send('Error converting YouTube playlist to Deezer: ' + err.message);
  }
});

// Convert Apple Music, Amazon Music, and Tidal playlists to other platforms
app.get('/convert-web-playlist', async (req, res) => {
  const { link, targetPlatform, session } = req.query;
  
  if (!link || !targetPlatform) {
    return res.status(400).json({ error: 'Missing "link" or "targetPlatform" query parameter' });
  }

  // Extract URL from text that might contain additional content
  const { extractUrlFromText } = await import('./utils/url-extractor.js');
  const extractedUrl = extractUrlFromText(link);
  
  if (!extractedUrl) {
    return res.status(400).json({ 
      error: 'No valid music platform URL found in the provided text',
      providedText: link
    });
  }

  console.log(`Extracted web playlist URL: ${extractedUrl}`);

  // Detect the source platform from the extracted URL
  let sourcePlatform = 'unknown';
  if (extractedUrl.includes('open.spotify.com') || extractedUrl.includes('spotify.com')) {
    sourcePlatform = 'spotify';
  } else if (extractedUrl.includes('music.amazon.com') && extractedUrl.includes('playlist')) {
    sourcePlatform = 'amazonmusic';
  } else if (extractedUrl.includes('tidal.com') && extractedUrl.includes('playlist')) {
    sourcePlatform = 'tidal';
  } else if (extractedUrl.includes('music.apple.com') && extractedUrl.includes('playlist')) {
    sourcePlatform = 'applemusic';
  } else if (extractedUrl.includes('deezer.com') && extractedUrl.includes('playlist')) {
    sourcePlatform = 'deezer';
  } else if (extractedUrl.includes('music.youtube.com') && extractedUrl.includes('playlist')) {
    sourcePlatform = 'ytmusic';
  } else if (extractedUrl.includes('youtube.com/playlist') || extractedUrl.includes('m.youtube.com/playlist')) {
    sourcePlatform = 'youtube';
  }

  console.log(`Converting ${sourcePlatform} playlist: ${extractedUrl} to ${targetPlatform}`);

  // Validate source platform
  if (sourcePlatform === 'unknown') {
    return res.status(400).json({ 
      error: 'Unsupported source platform',
      message: 'The provided URL is not from a supported music platform',
      providedUrl: extractedUrl
    });
  }

  try {
    // Set initial progress state for all platforms
    progressMap.set(session, {
      stage: `Fetching ${sourcePlatform} playlist...`,
      current: 0,
      total: 0,
      tracks: []
    });
    // Check if target platform requires authentication
    if (targetPlatform === 'spotify' || targetPlatform === 'ytmusic' || targetPlatform === 'deezer') {
      const user = userSessions.get(session);
      if (targetPlatform === 'deezer') {
        // For Deezer, check for arlToken
        if (!user?.arlToken) {
          return res.status(401).json({ error: 'Deezer ARL token required for playlist creation' });
        }
        
        // Note: Spotify session check removed - we now handle public vs private playlists
        // in the resolver logic above, so we don't need to require Spotify authentication here
      } else {
        // For other platforms, check for accessToken
      if (!user?.accessToken) {
        return res.status(401).json({ error: 'Authentication required for target platform' });
        }
      }
    }

    // Resolve playlist based on source platform
    let result;
    if (sourcePlatform === 'spotify') {
      // For Spotify, first check if we have a user session with Spotify access token
      let spotifyAccessToken = null;
      let spotifySessionId = null;
      
      // Look for a Spotify session in userSessions
      for (const [sessionId, sessionData] of userSessions.entries()) {
        if (sessionData.accessToken && sessionData.platform === 'spotify') {
          spotifyAccessToken = sessionData.accessToken;
          spotifySessionId = sessionId;
          break;
        }
      }
      
      console.log('[DEBUG] Spotify session found:', !!spotifyAccessToken);
      console.log('[DEBUG] Spotify session ID:', spotifySessionId);
      
      if (spotifyAccessToken) {
        // Use authenticated access with user's token
        console.log('[DEBUG] Using authenticated Spotify access');
        const { resolveSpotifyPlaylistWithToken } = await import('./resolvers/spotify-playlist-resolver.js');
        result = await resolveSpotifyPlaylistWithToken(extractedUrl, spotifyAccessToken);
      } else {
        // No Spotify session found, try public access
        console.log('[DEBUG] No Spotify session found, trying public access');
        const { resolveSpotifyPlaylistPublic } = await import('./resolvers/spotify-playlist-resolver.js');
        result = await resolveSpotifyPlaylistPublic(extractedUrl);
        
        // If public access fails with 404, it might be a private playlist
        if (result.error && result.error.includes('Playlist not found or is private')) {
          console.log('[DEBUG] Public access failed, playlist might be private');
          result.error = 'This Spotify playlist appears to be private. Please log in with Spotify to access it.';
          result.requiresAuth = true;
        }
      }
    } else if (sourcePlatform === 'applemusic') {
      // Special handling for Apple Music playlists
      console.log('[DEBUG] Processing Apple Music playlist:', extractedUrl);
      const { resolvePlaylist } = await import('./resolvers/resolvers.js');
      result = await resolvePlaylist(extractedUrl);
      console.log('[DEBUG] Apple Music playlist resolution result:', {
        success: !result.error,
        trackCount: result.tracks?.length || 0,
        error: result.error
      });
    } else {
      // For other platforms, use the standard resolver
      const { resolvePlaylist } = await import('./resolvers/resolvers.js');
      result = await resolvePlaylist(extractedUrl);
    }
    
    const { name, tracks, error: resolverError, debug, requiresAuth } = result;
    
    if (resolverError) {
      console.warn(`[${sourcePlatform}] Playlist resolver error:`, resolverError);
      
      // Update progress to show error state
      progressMap.set(session, {
        stage: 'Error',
        error: resolverError,
        current: 0,
        total: 0,
        tracks: []
      });
      
      // If authentication is required, return 401 status
      if (requiresAuth) {
        return res.status(401).json({
          error: resolverError,
          requiresAuth: true,
          platform: 'spotify',
          debug,
          playlistName: name,
          sourcePlatform,
          totalTracks: tracks ? tracks.length : 0
        });
      }
      
      return res.status(200).json({
        error: resolverError,
        debug,
        playlistName: name,
        sourcePlatform,
        totalTracks: tracks ? tracks.length : 0
      });
    }

    console.log(`Resolved ${sourcePlatform} playlist: ${name} with ${tracks.length} tracks`);

    if (!tracks || tracks.length === 0) {
      // Update progress to show error state
      progressMap.set(session, {
        stage: 'Error',
        error: `No tracks found in ${sourcePlatform} playlist`,
        current: 0,
        total: 0,
        tracks: []
      });
      
      return res.status(200).json({ 
        error: `No tracks found in ${sourcePlatform} playlist`,
        playlistName: name,
        sourcePlatform,
        debug
      });
    }

    let playlistUrl = null;
    let conversionResults = null;

    // Convert to target platform
    if (targetPlatform === 'spotify') {
      const user = userSessions.get(session);
      let mappingResult;
      let playlistDescription = '';
      if (sourcePlatform === 'amazonmusic') {
        playlistDescription = '(Converted from Amazon Music using SongSeek)';
      } else if (sourcePlatform === 'deezer') {
        playlistDescription = '(Converted from Deezer using SongSeek)';
      } else if (sourcePlatform === 'applemusic') {
        playlistDescription = '(Converted from Apple Music using SongSeek)';
      } else if (sourcePlatform === 'tidal') {
        playlistDescription = '(Converted from Tidal using SongSeek)';
      }
      // Prepare track progress for progress bar
      const trackProgress = tracks.map(track => ({
        title: track.title,
        artist: track.artist,
        status: 'pending'
      }));
      progressMap.set(session, {
        stage: `Searching tracks on Spotify...`,
        current: 0,
        total: tracks.length,
        tracks: trackProgress
      });
      // Dynamically select the correct mapping function for each source platform
      if (sourcePlatform === 'deezer' || sourcePlatform === 'applemusic' || sourcePlatform === 'amazonmusic' || sourcePlatform === 'tidal' || sourcePlatform === 'ytmusic') {
        // For now, use createSpotifyPlaylist for all, but this is where you would swap in the correct mapper for each
        const { createSpotifyPlaylist } = await import('./mappers/deezer-to-spotify-playlist-mapper.js');
        mappingResult = await createSpotifyPlaylist(
        user.accessToken,
        name,
        tracks,
        (added, trackInfo) => {
          if (trackInfo) {
            const trackIndex = trackProgress.findIndex(t =>
              t.title === trackInfo.title && t.artist === trackInfo.artist
            );
            if (trackIndex !== -1) {
              trackProgress[trackIndex].status = trackInfo.found ? 'success' : 'failed';
            }
          } else {
            for (let i = 0; i < added && i < trackProgress.length; i++) {
              trackProgress[i].status = 'success';
            }
          }
          progressMap.set(session, {
            stage: 'Adding tracks to Spotify playlist...',
            current: added,
            total: tracks.length,
            tracks: trackProgress
          });
        },
        user.refreshToken,
        (newAccessToken, newRefreshToken) => {
          userSessions.set(session, { accessToken: newAccessToken, refreshToken: newRefreshToken });
        },
          playlistDescription
        );
      } else {
        // fallback: treat as Deezer for now
        const { createSpotifyPlaylist } = await import('./mappers/deezer-to-spotify-playlist-mapper.js');
        mappingResult = await createSpotifyPlaylist(
          user.accessToken,
          name,
          tracks,
          (added, trackInfo) => {
            if (trackInfo) {
              const trackIndex = trackProgress.findIndex(t =>
                t.title === trackInfo.title && t.artist === trackInfo.artist
              );
              if (trackIndex !== -1) {
                trackProgress[trackIndex].status = trackInfo.found ? 'success' : 'failed';
              }
            } else {
              for (let i = 0; i < added && i < trackProgress.length; i++) {
                trackProgress[i].status = 'success';
              }
            }
            progressMap.set(session, {
              stage: 'Adding tracks to Spotify playlist...',
              current: added,
              total: tracks.length,
              tracks: trackProgress
            });
          },
          user.refreshToken,
          (newAccessToken, newRefreshToken) => {
            userSessions.set(session, { accessToken: newAccessToken, refreshToken: newRefreshToken });
          },
          playlistDescription
        );
      }
      progressMap.set(session, {
        stage: 'Done',
        current: tracks.length,
        total: tracks.length,
        tracks: trackProgress
      });
      // Store and return the categorized results (only once, no fallback/duplicate)
      const { matched, mismatched, skipped, playlistUrl } = mappingResult;
      const conversionResults = { matched, mismatched, skipped, playlistUrl };
      console.log('[DEBUG] Storing conversionResults for session', session, JSON.stringify(conversionResults, null, 2));
      conversionResultsMap.set(session, conversionResults);
      setTimeout(() => conversionResultsMap.delete(session), 300000);
      res.json({
        success: true,
        session,
        playlistName: name,
        sourcePlatform: sourcePlatform,
        targetPlatform: targetPlatform,
        playlistUrl: playlistUrl,
        totalTracks: tracks.length,
        message: `${sourcePlatform} playlist converted successfully`
      });
      return;
    } else if (targetPlatform === 'ytmusic') {
      const user = userSessions.get(session);
      const { convertSpotifyToYouTubePlaylist } = await import('./mappers/spotify-to-youtube-playlist-mapper.js');
      
      // Create a temporary playlist name for YouTube
      const youtubePlaylist = await convertSpotifyToYouTubePlaylist(
        null, // No Spotify token needed for this conversion
        user.accessToken,
        name,
        (current) => {
          console.log(`Processed ${current} tracks for YouTube`);
        }
      );
      
      playlistUrl = youtubePlaylist;
    } else if (targetPlatform === 'deezer') {
      const user = userSessions.get(session);
      
      // Initialize progress tracking for Deezer
      const trackProgress = tracks.map(track => ({
        title: track.title,
        artist: track.artist,
        status: 'pending'
      }));
      
      progressMap.set(session, {
        stage: 'Creating Deezer playlist...',
        current: 0,
        total: tracks.length,
        tracks: trackProgress
      });
      
      const { createDeezerPlaylistWithAPI } = await import('./mappers/deezer-playlist-mapper.js');
      
      const result = await createDeezerPlaylistWithAPI(
        user.arlToken,
        name,
        tracks,
        (successful, trackInfo) => {
          if (trackInfo) {
            const trackIndex = trackProgress.findIndex(t =>
              t.title === trackInfo.title && t.artist === trackInfo.artist
            );
            if (trackIndex !== -1) {
              trackProgress[trackIndex].status = trackInfo.found ? 'success' : 'failed';
            }
          }
          progressMap.set(session, {
            stage: 'Adding tracks to Deezer playlist...',
            current: successful,
            total: tracks.length,
            tracks: trackProgress
          });
        }
      );
      
      playlistUrl = result.playlistUrl;
      
      // Store conversion results for Deezer
      // Deezer mapper returns { matched, mismatched, skipped, playlistUrl, tracks }
      // This matches the Spotify mapper structure and frontend expectations
      const conversionResults = {
        matched: result.matched || [],
        skipped: result.skipped || [],
        mismatched: result.mismatched || [],
        playlistUrl: result.playlistUrl,
        tracks: result.tracks || []
      };
      
      conversionResultsMap.set(session, conversionResults);
      setTimeout(() => conversionResultsMap.delete(session), 300000);
      
      progressMap.set(session, {
        stage: 'Done',
        current: tracks.length,
        total: tracks.length,
        tracks: trackProgress
      });
    } else {
      return res.status(400).json({ error: 'Unsupported target platform' });
    }

    res.json({
      success: true,
      playlistName: name,
      sourcePlatform: sourcePlatform,
      targetPlatform: targetPlatform,
      playlistUrl: playlistUrl,
      totalTracks: tracks.length,
      message: `${sourcePlatform} playlist converted successfully`
    });

  } catch (err) {
    console.error(`${sourcePlatform} playlist conversion error:`, err);
    
    // Update progress to show error state
    progressMap.set(session, {
      stage: 'Error',
      error: err.message,
      current: 0,
      total: 0,
      tracks: [],
    });
    res.status(500).json({ 
      error: `Error converting ${sourcePlatform} playlist`,
      message: err.message 
    });
  }
});

// Feedback endpoint
app.post('/feedback', async (req, res) => {
  const { name, email, subject, message } = req.body;

  // Basic validation
  if (!name || !email || !subject || !message) {
    return res.status(400).json({ 
      error: 'Missing required fields',
      message: 'Name, email, subject, and message are required' 
    });
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ 
      error: 'Invalid email format',
      message: 'Please provide a valid email address' 
    });
  }

  try {
    // For now, we'll log the feedback and store it in memory
    // In a production environment, you'd want to store this in a database
    // or send it to an email service like SendGrid, Mailgun, etc.
    
    const feedback = {
      id: Date.now().toString(),
      name: name.trim(),
      email: email.trim(),
      subject: subject.trim(),
      message: message.trim(),
      timestamp: new Date().toISOString(),
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.connection.remoteAddress
    };

    // Log the feedback (in production, you'd store this in a database)
    console.log('📝 New feedback received:', {
      id: feedback.id,
      name: feedback.name,
      email: feedback.email,
      subject: feedback.subject,
      message: feedback.message.substring(0, 100) + (feedback.message.length > 100 ? '...' : ''),
      timestamp: feedback.timestamp
    });

    // TODO: In production, implement one of these:
    // 1. Store in database (MongoDB, PostgreSQL, etc.)
    // 2. Send to email service (SendGrid, Mailgun, etc.)
    // 3. Send to notification service (Slack, Discord, etc.)
    // 4. Store in file system for backup

    res.json({ 
      success: true, 
      message: 'Feedback received successfully',
      id: feedback.id
    });

  } catch (error) {
    console.error('Error processing feedback:', error);
    res.status(500).json({ 
      error: 'Failed to process feedback',
      message: 'Please try again later' 
    });
  }
});

// Session validity check endpoint
app.get('/api/check-session', (req, res) => {
  const { platform, session } = req.query;
  if (!platform || !session) {
    return res.status(400).json({ error: 'Missing platform or session parameter' });
  }
  const user = userSessions.get(session);
  
  if (platform === 'deezer') {
    // For Deezer, check if we have an ARL token
    if (user?.arlToken) {
      return res.status(200).json({ valid: true });
    } else {
      return res.status(401).json({ valid: false });
    }
  } else {
    // For other platforms, check for accessToken
  if (user?.accessToken) {
    return res.status(200).json({ valid: true });
  } else {
    return res.status(401).json({ valid: false });
    }
  }
});

// Spotify account export (playlists + saved tracks)
app.get('/spotify/export-account', async (req, res) => {
  const { session } = req.query;
  if (!session) {
    return res.status(400).json({ error: 'Missing session parameter' });
  }

  const user = userSessions.get(session);
  if (!user?.accessToken) {
    return res.status(401).json({ error: 'Spotify session not found or expired' });
  }

  const accessToken = user.accessToken;

  async function spotifyGet(url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Spotify GET ${url} failed: ${response.status} ${text}`);
    }
    return response.json();
  }

  try {
    const me = await spotifyGet('https://api.spotify.com/v1/me');

    // Fetch all playlists (paginated)
    const playlists = [];
    let playlistsUrl = 'https://api.spotify.com/v1/me/playlists?limit=50';
    while (playlistsUrl) {
      const page = await spotifyGet(playlistsUrl);
      if (Array.isArray(page.items)) playlists.push(...page.items);
      playlistsUrl = page.next;
    }

    backupProgressMap.set(session, {
      type: 'export',
      stage: 'Fetching playlists',
      playlistsCurrent: 0,
      playlistsTotal: playlists.length,
      tracksCurrent: 0,
      tracksTotal: 0,
    });

    // Fetch tracks for each playlist
    const playlistsWithTracks = [];
    let playlistsProcessed = 0;
    let tracksProcessed = 0;
    for (const p of playlists) {
      const tracks = [];
      let tracksUrl = `https://api.spotify.com/v1/playlists/${p.id}/tracks?limit=100`;
      while (tracksUrl) {
        const page = await spotifyGet(tracksUrl);
        if (Array.isArray(page.items)) {
          for (const item of page.items) {
            const t = item.track;
            if (!t) continue;
            tracks.push({
              id: t.id,
              name: t.name,
              artists: (t.artists || []).map((a) => a.name),
              album: t.album?.name,
            });
            tracksProcessed += 1;
            backupProgressMap.set(session, {
              type: 'export',
              stage: 'Exporting playlists',
              playlistsCurrent: playlistsProcessed,
              playlistsTotal: playlists.length,
              tracksCurrent: tracksProcessed,
              tracksTotal: 0, // will be updated once saved tracks are known
            });
          }
        }
        tracksUrl = page.next;
      }
      playlistsWithTracks.push({
        id: p.id,
        name: p.name,
        description: p.description,
        public: p.public,
        collaborative: p.collaborative,
        tracks,
      });
    }

    // Fetch saved tracks (paginated)
    const savedTracks = [];
    let savedUrl = 'https://api.spotify.com/v1/me/tracks?limit=50';
    while (savedUrl) {
      const page = await spotifyGet(savedUrl);
      if (Array.isArray(page.items)) {
        for (const item of page.items) {
          const t = item.track;
          if (!t) continue;
          savedTracks.push({
            id: t.id,
            name: t.name,
            artists: (t.artists || []).map((a) => a.name),
            album: t.album?.name,
          });
        }
      }
      savedUrl = page.next;
    }

    backupProgressMap.set(session, {
      type: 'export',
      stage: 'Finalizing export',
      playlistsCurrent: playlistsProcessed,
      playlistsTotal: playlists.length,
      tracksCurrent: tracksProcessed + savedTracks.length,
      tracksTotal: tracksProcessed + savedTracks.length,
    });

    const backup = {
      exportedAt: new Date().toISOString(),
      user: {
        id: me.id,
        display_name: me.display_name,
        email: me.email,
        country: me.country,
      },
      playlists: playlistsWithTracks,
      savedTracks,
    };

    res.json(backup);
  } catch (err) {
    console.error('Spotify export-account error:', err);
    res.status(500).json({ error: 'Failed to export Spotify account', message: err.message });
  }
});

// Spotify account import (create playlists + saved tracks)
app.post('/spotify/import-account', async (req, res) => {
  const { session } = req.query;
  if (!session) {
    return res.status(400).json({ error: 'Missing session parameter' });
  }

  const user = userSessions.get(session);
  if (!user?.accessToken) {
    return res.status(401).json({ error: 'Spotify session not found or expired' });
  }

  const accessToken = user.accessToken;
  const backup = req.body;
  if (!backup || typeof backup !== 'object') {
    return res.status(400).json({ error: 'Missing or invalid backup JSON in request body' });
  }

  async function spotifyGet(url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Spotify GET ${url} failed: ${response.status} ${text}`);
    }
    return response.json();
  }

  async function spotifyPost(url, body) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Spotify POST ${url} failed: ${response.status} ${text}`);
    }
    return response.json();
  }

  async function spotifyPut(url, body) {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Spotify PUT ${url} failed: ${response.status} ${text}`);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  try {
    const me = await spotifyGet('https://api.spotify.com/v1/me');

    let playlistsImported = 0;
    let savedTracksImported = 0;

    const playlists = Array.isArray(backup.playlists) ? backup.playlists : [];
    const totalPlaylists = playlists.length;
    const savedTracks = Array.isArray(backup.savedTracks) ? backup.savedTracks : [];
    const savedIds = savedTracks.map((t) => t.id).filter(Boolean);

    backupProgressMap.set(session, {
      type: 'import',
      stage: 'Creating playlists',
      playlistsCurrent: 0,
      playlistsTotal: totalPlaylists,
      tracksCurrent: 0,
      tracksTotal: savedIds.length,
    });

    for (const p of playlists) {
      const created = await spotifyPost(`https://api.spotify.com/v1/users/${me.id}/playlists`, {
        name: p.name || 'Imported playlist',
        description: p.description || 'Imported with SongSeek',
        public: typeof p.public === 'boolean' ? p.public : false,
        collaborative: !!p.collaborative,
      });

      const trackIds = (p.tracks || [])
        .map((t) => t.id)
        .filter(Boolean);

      for (let i = 0; i < trackIds.length; i += 100) {
        const chunk = trackIds.slice(i, i + 100);
        if (chunk.length === 0) continue;
        await spotifyPost(`https://api.spotify.com/v1/playlists/${created.id}/tracks`, {
          uris: chunk.map((id) => `spotify:track:${id}`),
        });
      }

      playlistsImported += 1;
      backupProgressMap.set(session, {
        type: 'import',
        stage: 'Creating playlists',
        playlistsCurrent: playlistsImported,
        playlistsTotal: totalPlaylists,
        tracksCurrent: savedTracksImported,
        tracksTotal: savedIds.length,
      });
    }

    backupProgressMap.set(session, {
      type: 'import',
      stage: 'Restoring saved tracks',
      playlistsCurrent: playlistsImported,
      playlistsTotal: totalPlaylists,
      tracksCurrent: 0,
      tracksTotal: savedIds.length,
    });
    for (let i = 0; i < savedIds.length; i += 50) {
      const chunk = savedIds.slice(i, i + 50);
      if (chunk.length === 0) continue;
      await spotifyPut('https://api.spotify.com/v1/me/tracks', {
        ids: chunk,
      });
      savedTracksImported += chunk.length;
      backupProgressMap.set(session, {
        type: 'import',
        stage: 'Restoring saved tracks',
        playlistsCurrent: playlistsImported,
        playlistsTotal: totalPlaylists,
        tracksCurrent: savedTracksImported,
        tracksTotal: savedIds.length,
      });
    }

    res.json({
      success: true,
      playlistsImported,
      savedTracksImported,
    });
  } catch (err) {
    console.error('Spotify import-account error:', err);
    res.status(500).json({ error: 'Failed to import Spotify account', message: err.message });
  }
});

app.listen(port, () => {
  console.log(`✅ Listening on http://localhost:${port}`);
});
