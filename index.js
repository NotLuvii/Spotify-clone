require('dotenv').config();
const express = require('express');
const SpotifyWebAPI = require('spotify-web-api-node');
const axios = require('axios');


const app = express();
const port = 3050;

const spotifyApi = new SpotifyWebAPI({
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: process.env.REDIRECT_URL
});

app.use(express.static('public'));

let accessToken; // Define the variable to store the access token
console.log(accessToken);

app.get('/login', (req, res) => {
    const scopes = ['user-read-private', 'user-read-email', 'user-read-playback-state', 'user-modify-playback-state','playlist-read-private'];
    res.redirect(spotifyApi.createAuthorizeURL(scopes));
});

app.get('/callback', (req, res) => {
    const error = req.query.error;
    const code = req.query.code;

    if (error) {
        console.error('Error: ', error);
        res.send(`Error: ${error}`);
        return;
    }

    spotifyApi.authorizationCodeGrant(code).then(data => {
        accessToken = data.body['access_token'];
        console.log(accessToken);
        const refreshToken = data.body['refresh_token'];
        const expiresIn = data.body['expires_in'];

        spotifyApi.setAccessToken(accessToken);
        spotifyApi.setRefreshToken(refreshToken);
        console.log(accessToken, refreshToken);

        // Redirect to the root URL after successful authentication
        res.redirect('/');

        /*setInterval(async () => {
            const data = await spotifyApi.refreshAccessToken();
            const accessTokenRefreshed = data.body['access_token'];
            spotifyApi.setAccessToken(accessTokenRefreshed);
        }, (expiresIn / 2) * 1000);*/
    }).catch(error => {
        console.error('Error: ', error);
        res.send('Error getting token');
    });
});

console.log(accessToken);

app.get('/search', (req, res) => {
    const { q } = req.query;
    spotifyApi.searchTracks(q).then(searchData => {
        console.log(searchData.body); // Log the search results
        res.send(searchData.body);
    }).catch(err => {
        console.error(`Error searching: ${err}`);
        res.send(`Error searching: ${err}`);
    });
});

app.get('/play', (req, res) => {
    const { uri } = req.query;
    spotifyApi.play({ uris: [uri] }).then(() => {
        res.send('playback started');
    }).catch(err => {
        res.send(`Error playing ${err}`);
    });
});

app.get('/playpause', (req, res) => {
    spotifyApi.getMyCurrentPlaybackState().then(data => {
        if (data.body && data.body.is_playing) {
            spotifyApi.pause().then(() => {
                res.send('Playback paused');
            }).catch(err => {
                res.send(`Error pausing playback: ${err}`);
            });
        } else {
            spotifyApi.play().then(() => {
                res.send('Playback started');
            }).catch(err => {
                res.send(`Error starting playback: ${err}`);
            });
        }
    }).catch(err => {
        res.send(`Error getting playback state: ${err}`);
    });
});

app.get('/playlists', async (req, res) => {
    try {
        let playlists = [];
        let response = await spotifyApi.getUserPlaylists({ limit: 50 });
        playlists = response.body.items;

        // Log the playlists for debugging
        //console.log('Fetched playlists:', playlists);

        res.send(playlists);
    } catch (err) {
        console.error('Error fetching playlists:', err);
        res.status(500).send(`Error fetching playlists: ${err}`);
    }
});

app.get('/playlist-tracks', (req, res) => {
    const playlistId = req.query.id;
    spotifyApi.getPlaylistTracks(playlistId).then(data => {
        res.send(data.body);
    }).catch(err => {
        res.send(`Error fetching tracks: ${err}`);
    });
});

app.get('/track-duration', async (req, res) => {
    const { uri } = req.query;
    try {
        // Extract the track ID from the URI
        const trackId = uri.split(':').pop(); // Get the last part of the URI
        const track = await spotifyApi.getTrack(trackId);
        const duration_ms = track.body.duration_ms;
        res.json({ duration_ms });
    } catch (error) {
        console.error('Error fetching track duration:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/lyrics', async (req, res) => {
    const { track, artist } = req.query;
    const lyrics = await fetchLyrics(track, artist);
    res.send({ lyrics });
});

async function fetchLyrics(trackName, artistName) {
    try {
        const response = await axios.get(`https://api.lyrics.ovh/v1/${artistName}/${trackName}`);
        return response.data.lyrics;
    } catch (error) {
        console.error(`Error fetching lyrics: ${error}`);
        return "Lyrics not found.";
    }
}

app.get('/next', (req, res) => {
    spotifyApi.skipToNext().then(() => {
        res.send('Skipped to next track');
    }).catch(err => {
        res.send(`Error skipping to next track: ${err}`);
    });
});

app.get('/previous', (req, res) => {
    spotifyApi.skipToPrevious().then(() => {
        res.send('Skipped to previous track');
    }).catch(err => {
        res.send(`Error skipping to previous track: ${err}`);
    });
});

app.get('/playpause', (req, res) => {
    spotifyApi.getMyCurrentPlaybackState().then(data => {
        if (data.body && data.body.is_playing) {
            spotifyApi.pause().then(() => {
                res.json({ is_playing: false }); // Return is_playing status
            }).catch(err => {
                res.status(500).send(`Error pausing playback: ${err}`);
            });
        } else {
            spotifyApi.play().then(() => {
                res.json({ is_playing: true }); // Return is_playing status
            }).catch(err => {
                res.status(500).send(`Error starting playback: ${err}`);
            });
        }
    }).catch(err => {
        res.status(500).send(`Error getting playback state: ${err}`);
    });
});

app.get('/seek', (req, res) => {
    const position_ms = req.query.position_ms;
    spotifyApi.seek(position_ms).then(() => {
        res.send(`Seeked to position ${position_ms} ms`);
    }).catch(err => {
        res.send(`Error seeking: ${err}`);
    });
});

app.get('/current-playback-state', async (req, res) => {
    try {
        if (!accessToken) {
            throw new Error('Access token is not defined');
        }

        // Fetch the current playback state from Spotify
        const data = await spotifyApi.getMyCurrentPlaybackState();

        if (!data.body || !data.body.item) {
            return res.status(204).send(); // No content
        }

        // Extract relevant information about the currently playing track
        const isPlaying = data.body.is_playing;
        const item = data.body.item; // Information about the currently playing track
        const progress_ms = data.body.progress_ms; // Current progress of the track

        // Send the response with the current playback state
        res.json({ is_playing: isPlaying, item: item, progress_ms: progress_ms });
    } catch (error) {
        console.error('Error fetching current playback state:', error.message);
        res.status(500).json({ error: 'Failed to fetch current playback state' });
    }
});

app.listen(port, () => {
    console.log(`Listening at http://localhost:${port}`);
});