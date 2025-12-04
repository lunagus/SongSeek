import fetch from 'node-fetch';
import { fetchAllDeezerPlaylistTracks } from '../utils/paginate-deezer.js';

export default async function resolveDeezerPlaylist(link) {
  console.log(`Resolving Deezer playlist from URL: ${link}`);
  
  const match = link.match(/deezer\.com\/(?:[a-z]{2}\/)?playlist\/(\d+)/);
  if (!match) {
    throw new Error('Invalid Deezer playlist URL');
  }
  
  const playlistId = match[1];
  console.log(`Extracted playlist ID: ${playlistId}`);
  
  // Get the access token from environment variables (optional)
  const accessToken = process.env.DEEZER_ACCESS_TOKEN;

  try {
    // Fetch playlist metadata (use access token if available, otherwise public API)
    const baseUrl = `https://api.deezer.com/playlist/${playlistId}`;
    const apiUrl = accessToken ? `${baseUrl}?access_token=${accessToken}` : baseUrl;
    console.log(`Fetching playlist metadata from: ${apiUrl}`);
    
    const response = await fetch(apiUrl, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json'
      } 
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Deezer API error: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`Failed to fetch playlist: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Handle API error responses
    if (data.error) {
      console.error('Deezer API returned an error:', data.error);
      throw new Error(`Deezer API error: ${data.error.message || 'Unknown error'}`);
    }
    
    console.log(`Fetched playlist: ${data.title} (${data.nb_tracks} tracks)`);
    
    // Fetch all tracks using the utility
    console.log('Fetching playlist tracks...');
    const tracks = await fetchAllDeezerPlaylistTracks(playlistId);
    
    if (!tracks || tracks.length === 0) {
      console.warn('No tracks found in the playlist');
    }
    
    return {
      name: data.title || 'Converted Playlist',
      description: data.description || '',
      tracks,
    };
  } catch (error) {
    console.error('Error resolving Deezer playlist:', error);
    throw error; // Re-throw to be handled by the caller
  }
}
