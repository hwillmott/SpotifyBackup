const express = require('express'); // Express web server framework
const request = require('request'); // "Request" library
const cors = require('cors');
const lodash = require('lodash');
const fs = require('file-system');
const os = require('os');
const path = require('path');
const querystring = require('querystring');
const cookieParser = require('cookie-parser');
const credentials = require('./credentials');

const client_id = credentials.clientID; // Your client id
const client_secret = credentials.clientSecret; // Your secret
const redirect_uri = 'http://localhost:8888/callback'; // Your redirect uri

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
const generateRandomString = function(length) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

const getDirPath = function() {
  const homedir = os.homedir();
  const dateString = new Date().toISOString();
  return path.join(homedir, "Desktop/SpotifyBackup-" + dateString);
};

const getRequestOpts = function(url, limit, offset, access_token) {
  return {
    url: url,
    headers: { 'Authorization': 'Bearer ' + access_token },
    json: true,
    qs: {
      offset: offset,
      limit: limit,
    }
  };
};

const stateKey = 'spotify_auth_state';

const app = express();

app.use(express.static(__dirname + '/public'))
   .use(cors())
   .use(cookieParser());

app.get('/login', function(req, res) {

  const state = generateRandomString(16);
  res.cookie(stateKey, state);

  // your application requests authorization
  const scope = 'user-read-private user-read-email';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));
});

app.get('/callback', function(req, res) {

  // your application requests refresh and access tokens
  // after checking the state parameter

  const code = req.query.code || null;
  const state = req.query.state || null;
  const storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    const authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };

    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {
        const dirPath = getDirPath();
        fs.mkdirSync(dirPath);

        const access_token = body.access_token,
            refresh_token = body.refresh_token;

        let playlistOffset = 0;

        const playlistUrl = 'https://api.spotify.com/v1/me/playlists';
        const options = getRequestOpts(playlistUrl, 50, playlistOffset, access_token);

        // use the access token to access the Spotify Web API
        request.get(options, function(error, response, body) {
          if (!body.items || body.items.length === 0) {
            return;
          }

          body.items.forEach(function(playlist) {
            // create CSV file
            const tracksLink = playlist.tracks.href;
            const playlistName = playlist.name.replace(/ /g,'');
            const playlistPath = path.join(dirPath, playlistName + ".csv");
            console.log(playlistPath);
            const writeStream = fs.createWriteStream(playlistPath);
            writeStream.write("link, track name, artist, album\n");

            // get the tracks
            let totalTracks = playlist.tracks.total;
            let offset = 0;

            let optionsForTracks = {
              url: tracksLink,
              headers: { 'Authorization': 'Bearer ' + access_token },
              json: true,
              qs: {
                offset: offset
              }
            }
            let promises = [];
            while(offset <= totalTracks) {
              let p = new Promise(function(resolve, reject) {
                // get a page of tracks
                request.get(optionsForTracks, function(error, response, body) {

                  // write tracks to file
                  body.items.forEach(function(item) {
                    const track = item.track;
                    const trackString = item.added_at + "," + track.name + "," + track.artists[0].name + "," + track.album.name + "," + track.external_urls.spotify + "\n";
                    writeStream.write(trackString);

                  }); // end forEach

                  // resolve the promise
                  resolve("yay!");
                }); // end request
              }); // end promise

              offset += 100;
              optionsForTracks.qs.offset += 100;
              promises.push(p);
            }

            Promise.all(promises).then(function() {
              writeStream.end();
            });
          });
        });

        // we can also pass the token to the browser to make requests from there
        res.redirect('/#' +
          querystring.stringify({
            access_token: access_token,
            refresh_token: refresh_token
          }));
      } else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
});

app.get('/refresh_token', function(req, res) {

  // requesting access token from refresh token
  const refresh_token = req.query.refresh_token;
  const authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  };

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      const access_token = body.access_token;
      res.send({
        'access_token': access_token
      });
    }
  });
});

console.log('Listening on 8888');
app.listen(8888);
