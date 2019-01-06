1. install nodeJS and NPM
2. run 'npm install' in the base directory
3. create your own credentials.js file with the following contents:
module.exports = {
    clientID: "<your_client_id>",
    clientSecret: "<your_client_secret",
};

You can get these by registering an application with the spotify web api:
https://developer.spotify.com/documentation/web-api/quick-start/

4. run 'nodemon app.js' from the base directory
5. go to http://localhost:8888 and click "log in with spotify"
6. the files will download to a timestamped folder on your Desktop
