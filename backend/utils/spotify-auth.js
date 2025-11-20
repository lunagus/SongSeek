import dotenv from 'dotenv';
import querystring from 'querystring';
import fetch from 'node-fetch';

dotenv.config();

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

export function getSpotifyLoginUrl(state) {
  // Scopes needed for full backup/restore:
  // - playlist-modify-public / playlist-modify-private: create & edit playlists
  // - playlist-read-private / playlist-read-collaborative: read all user playlists
  // - user-library-read / user-library-modify: read & restore saved tracks
  // - user-follow-read: (optional) read followed artists/shows if we support it later
  const scope = [
    'playlist-modify-public',
    'playlist-modify-private',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-library-read',
    'user-library-modify',
    'user-follow-read',
  ].join(' ');

  const params = querystring.stringify({
    response_type: 'code',
    client_id: clientId,
    scope,
    redirect_uri: redirectUri,
    state,
  });

  return `https://accounts.spotify.com/authorize?${params}`;
}

export async function getTokensFromCode(code) {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization:
        'Basic ' +
        Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: querystring.stringify({
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to exchange code for tokens');
  }

  return await response.json();
}

export async function getTokensFromRefresh(refreshToken) {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization:
        'Basic ' +
        Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: querystring.stringify({
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh tokens');
  }

  return await response.json();
}

export async function getSpotifyAccessToken() {
  console.log('[DEBUG] getSpotifyAccessToken called');
  console.log('[DEBUG] Client ID configured:', !!clientId);
  console.log('[DEBUG] Client Secret configured:', !!clientSecret);
  
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  
  console.log('[DEBUG] Token request response status:', response.status);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[DEBUG] Token request failed:', errorText);
    throw new Error(`Failed to get Spotify access token: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  console.log('[DEBUG] Token request successful, token type:', data.token_type);
  console.log('[DEBUG] Token expires in:', data.expires_in, 'seconds');
  
  return data.access_token;
}
