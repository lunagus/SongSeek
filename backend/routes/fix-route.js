import express from 'express';
import fetch from 'node-fetch';
const router = express.Router();

// POST /fix-playlist-tracks
router.post('/fix-playlist-tracks', async (req, res) => {
  const { session, playlistUrl, replacements, playlistName, playlistDescription, isPublic } = req.body;
  
  // Debug logging
  console.log('[DEBUG] fix-playlist-tracks received session:', session);
  const userSessions = global.userSessions || new Map();
  console.log('[DEBUG] All sessions in memory store:', Array.from(userSessions.keys()));
  
  if (!session || !playlistUrl || !replacements || !Array.isArray(replacements)) {
    console.log('[DEBUG] Missing required fields:', { session: !!session, playlistUrl: !!playlistUrl, replacements: !!replacements });
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const user = userSessions.get(session);
  console.log('[DEBUG] Retrieved user from memory store:', user ? 'Found' : 'Not found');
  
  if (!user?.accessToken) {
    console.log('[DEBUG] Session validation failed - no user or accessToken');
    return res.status(401).json({ error: 'Invalid session' });
  }
  
  console.log('[DEBUG] Session validation successful, proceeding with playlist fixes');
  console.log('[DEBUG] Received replacements:', JSON.stringify(replacements, null, 2));
  
  // Extract playlist ID from URL
  const match = playlistUrl.match(/playlist\/([a-zA-Z0-9]+)/);
  if (!match) {
    return res.status(400).json({ error: 'Invalid playlist URL' });
  }
  const playlistId = match[1];
  console.log('[DEBUG] Extracted playlist ID:', playlistId);

  // Optionally update playlist metadata (name / description / public) if provided
  try {
    const updatePayload = {};
    if (playlistName) updatePayload.name = playlistName;
    if (typeof isPublic === 'boolean') updatePayload.public = isPublic;
    if (typeof playlistDescription === 'string') updatePayload.description = playlistDescription;

    if (Object.keys(updatePayload).length > 0) {
      console.log('[DEBUG] Updating playlist metadata with payload:', updatePayload);
      const metaRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${user.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatePayload),
      });

      if (!metaRes.ok) {
        const text = await metaRes.text();
        console.log('[DEBUG] Failed to update playlist metadata:', metaRes.status, text);
      } else {
        console.log('[DEBUG] Successfully updated playlist metadata');
      }
    }
  } catch (err) {
    console.log('[DEBUG] Error updating playlist metadata:', err.message);
    // Continue with track fixes even if metadata update fails
  }
  
  let successful = 0;
  let failed = 0;
  let errors = [];
  
  for (const rep of replacements) {
    console.log('[DEBUG] Processing replacement:', JSON.stringify(rep, null, 2));
    try {
      if (rep.skip) {
        console.log('[DEBUG] Skipping track as requested');
        successful++;
        continue;
      }

      // If not skip, add the new track directly to the playlist
      if (rep.newTrack && rep.newTrack.id) {
        console.log('[DEBUG] Adding new track directly to playlist:', rep.newTrack.title, 'by', rep.newTrack.artist);
        const addRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${user.accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ uris: [`spotify:track:${rep.newTrack.id}`] })
        });
        
        if (!addRes.ok) {
          console.log('[DEBUG] Failed to add new track:', addRes.status, await addRes.text());
          failed++;
          errors.push({ originalTrack: rep.originalTrack, error: `Failed to add new track: ${addRes.status}` });
          continue;
        }
        
        console.log('[DEBUG] Successfully added new track to playlist');
        successful++;
      } else {
        console.log('[DEBUG] No new track to add (missing newTrack or id)');
        failed++;
        errors.push({ originalTrack: rep.originalTrack, error: 'No valid new track provided' });
      }
    } catch (err) {
      console.log('[DEBUG] Error processing replacement:', err.message);
      failed++;
      errors.push({ originalTrack: rep.originalTrack, error: err.message });
    }
  }
  
  console.log('[DEBUG] Final summary:', { successful, failed, errors });
  res.json({ summary: { successful, failed, errors } });
});

// Add Spotify search endpoint for manual fixes
router.get('/search/spotify', async (req, res) => {
  const { query, limit = 5, session } = req.query;
  
  // Debug logging
  console.log('[DEBUG] search/spotify received session:', session);
  const userSessions = global.userSessions || new Map();
  console.log('[DEBUG] All sessions in memory store:', Array.from(userSessions.keys()));
  
  if (!query || !session) {
    console.log('[DEBUG] Missing query or session:', { query: !!query, session: !!session });
    return res.status(400).json({ error: 'Missing query or session' });
  }
  
  const user = userSessions.get(session);
  console.log('[DEBUG] Retrieved user from memory store:', user ? 'Found' : 'Not found');
  
  if (!user?.accessToken) {
    console.log('[DEBUG] Session validation failed - no user or accessToken');
    return res.status(401).json({ error: 'Invalid session' });
  }
  
  console.log('[DEBUG] Session validation successful, proceeding with search');
  
  try {
    const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`;
    const response = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${user.accessToken}` }
    });
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Spotify API error' });
    }
    const data = await response.json();
    const results = (data.tracks?.items || []).map(track => ({
      id: track.id,
      title: track.name,
      artist: track.artists[0]?.name || '',
      album: track.album?.name || '',
      duration: track.duration_ms,
      url: track.external_urls?.spotify,
      platform: 'spotify',
      thumbnail: track.album?.images?.[0]?.url || null
    }));
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

export default router; 