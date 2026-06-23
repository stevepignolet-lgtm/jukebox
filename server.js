const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

let accessToken = null;
let refreshToken = null;

// Page de login (toi uniquement)
app.get('/login', (req, res) => {
  const scopes = 'user-modify-playback-state user-read-playback-state';
  const url = `https://accounts.spotify.com/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(scopes)}`;
  res.redirect(url);
});

// Callback Spotify
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  try {
    const response = await axios.post('https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    accessToken = response.data.access_token;
    refreshToken = response.data.refresh_token;
    res.redirect('/');
  } catch (e) {
    console.error('Erreur callback:', e.response?.data || e.message);
    res.send('Erreur: ' + JSON.stringify(e.response?.data || e.message));
  }
});

// Rafraîchir le token
async function refreshAccessToken() {
  const response = await axios.post('https://accounts.spotify.com/api/token',
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  accessToken = response.data.access_token;
}

// Recherche de musiques
app.get('/search', async (req, res) => {
  if (!accessToken) return res.status(401).json({ error: 'Non connecté' });
  const q = req.query.q;
  try {
    const response = await axios.get(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=8`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const tracks = response.data.tracks.items.map(t => ({
      id: t.id,
      name: t.name,
      artist: t.artists[0].name,
      album: t.album.name,
      image: t.album.images[1]?.url,
      uri: t.uri
    }));
    res.json(tracks);
  } catch (e) {
    await refreshAccessToken();
    res.status(500).json({ error: 'Erreur de recherche' });
  }
});

// Ajout à la file d'attente
app.post('/queue', async (req, res) => {
  if (!accessToken) return res.status(401).json({ error: 'Non connecté' });
  const { uri } = req.body;
  try {
    await axios.post(`https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(uri)}`, {}, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    res.json({ success: true });
  } catch (e) {
    await refreshAccessToken();
    res.status(500).json({ error: "Erreur d'ajout à la file" });
  }
});

// Chanson en cours
app.get('/now-playing', async (req, res) => {
  if (!accessToken) return res.status(401).json({ error: 'Non connecté' });
  try {
    const response = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.data || !response.data.item) return res.json(null);
    const t = response.data.item;
    res.json({
      name: t.name,
      artist: t.artists[0].name,
      album: t.album.name,
      image: t.album.images[1]?.url,
      progress: response.data.progress_ms,
      duration: t.duration_ms,
      is_playing: response.data.is_playing
    });
  } catch (e) {
    await refreshAccessToken();
    res.status(500).json({ error: 'Erreur' });
  }
});

// File d'attente
app.get('/queue-list', async (req, res) => {
  if (!accessToken) return res.status(401).json({ error: 'Non connecté' });
  try {
    const response = await axios.get('https://api.spotify.com/v1/me/player/queue', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const tracks = response.data.queue.slice(0, 20).map(t => ({
      name: t.name,
      artist: t.artists[0].name,
      image: t.album.images[2]?.url
    }));
    res.json(tracks);
  } catch (e) {
    await refreshAccessToken();
    res.status(500).json({ error: 'Erreur' });
  }
});

// Page principale (invités)
app.get('/', (req, res) => {
  if (!accessToken) {
    return res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h2>🎵 Jukebox non connecté</h2>
        <p>Le propriétaire doit d'abord se connecter via <a href="/login">/login</a></p>
      </body></html>
    `);
  }
  res.sendFile(__dirname + '/public/index.html');
});

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur lancé sur le port ${PORT}`));
