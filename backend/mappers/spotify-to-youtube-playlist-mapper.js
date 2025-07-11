import resolveSpotifyPlaylist from '../resolvers/spotify-playlist-resolver.js';
import { searchYouTube, createYouTubePlaylist, addVideoToPlaylist } from '../services/youtube-service.js';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function convertSpotifyToYouTubePlaylist(accessToken, ytToken, playlistLink, progressCb) {
  const { name, tracks } = await resolveSpotifyPlaylist(playlistLink);
  const playlist = await createYouTubePlaylist(name, ytToken);
  console.log('YouTube playlist creation response:', playlist);
  if (!playlist.id) throw new Error('Failed to create YouTube playlist: ' + JSON.stringify(playlist));

  const skipped = [];
  let processed = 0;
  
  for (const track of tracks) {
    const videoId = await searchYouTube(track.title, track.artist, ytToken);
    if (videoId) {
      try {
        await addVideoToPlaylist(playlist.id, videoId, ytToken);
        console.log(`Added: ${track.title} - ${track.artist} (videoId: ${videoId})`);
        if (progressCb) progressCb(processed + 1, { title: track.title, artist: track.artist, found: true });
      } catch (err) {
        console.warn(`FAILED TO ADD: ${track.title} - ${track.artist} (videoId: ${videoId})`, err);
        skipped.push({ ...track, reason: 'Insert failed', error: err.message });
        if (progressCb) progressCb(processed + 1, { title: track.title, artist: track.artist, found: false });
      }
      await delay(400); // Throttle to avoid rate limits
    } else {
      console.warn(`NOT FOUND: ${track.title} - ${track.artist}`);
      skipped.push({ ...track, reason: 'Not found' });
      if (progressCb) progressCb(processed + 1, { title: track.title, artist: track.artist, found: false });
    }
    processed++;
  }

  if (skipped.length > 0) {
    console.warn('Skipped tracks:', skipped);
  }

  return `https://www.youtube.com/playlist?list=${playlist.id}`;
} 