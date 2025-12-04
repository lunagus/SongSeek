import fetch from 'node-fetch';

export async function fetchAllDeezerPlaylistTracks(playlistId) {
  let allTracks = [];
  let index = 0;
  const limit = 100;
  
  // Get the access token from environment variables (optional)
  const accessToken = process.env.DEEZER_ACCESS_TOKEN;

  while (true) {
    try {
      const baseUrl = `https://api.deezer.com/playlist/${playlistId}/tracks?index=${index}&limit=${limit}`;
      const apiUrl = accessToken ? `${baseUrl}&access_token=${accessToken}` : baseUrl;
      console.log(`Fetching Deezer tracks from: ${apiUrl}`);
      
      const response = await fetch(apiUrl, { 
        headers: { 
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json'
        } 
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Deezer API error: ${response.status} ${response.statusText}`, errorText);
        throw new Error(`Deezer API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Handle API error responses
      if (data.error) {
        console.error('Deezer API returned an error:', data.error);
        throw new Error(`Deezer API error: ${data.error.message || 'Unknown error'}`);
      }
      
      if (!data.data || data.data.length === 0) {
        console.log('No more tracks found in the playlist');
        break;
      }
      
      console.log(`Fetched ${data.data.length} tracks from Deezer`);
      
      const mappedTracks = data.data.map(track => ({
        title: track.title,
        artist: track.artist?.name || 'Unknown Artist',
        duration: track.duration,
        album: track.album?.title || '',
        isrc: track.isrc
      }));
      
      allTracks = allTracks.concat(mappedTracks);
      
      if (data.data.length < limit) {
        console.log('Reached the end of the playlist');
        break;
      }
      
      index += limit;
    } catch (error) {
      console.error('Error fetching Deezer tracks:', error);
      throw error; // Re-throw to be handled by the caller
    }
  }
  
  console.log(`Total tracks fetched from Deezer: ${allTracks.length}`);
  return allTracks;
}