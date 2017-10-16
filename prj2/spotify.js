const express = require('express');
const app = express();
const hb = require('express-handlebars');
const bodyParser = require('body-parser');
const axios = require('axios');
const passport = require('passport');
const session = require('express-session');
const cookieParser = require('cookie-parser')
const SpotifyStrategy = require('passport-spotify').Strategy;
const redis = require('redis');
const imagesnapjs = require('imagesnapjs');
const fs = require('fs');
const client = redis.createClient({
    host: 'localhost',
    port: 6379
});
app.use(express.static('public'));
require('dotenv').config()
// const faceAPI = '6d44a36bd34a41669b0b59ce2d0fe552';

client.on('error', function(err){
    console.log(err);
});


passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

app.use(session({
    secret: 'cookie_secret',
    proxy: true,
    resave: true,
    saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());
  

app.use(bodyParser.urlencoded({ extended: false}));

app.engine('handlebars', hb({
    defaultLayout: 'main'
}));

app.set('view engine', 'handlebars');

// var client_id = '63bdfd14444845c4a3caec523cad6680'; // Your client id
// var client_secret = 'a68b21a863a44fe4b4c9be2668c94e52'; // Your secret

var client_id = process.env.client_id;
var client_secret = process.env.client_secret;

passport.use(new SpotifyStrategy({
    clientID: client_id,
    clientSecret: client_secret,
    callbackURL: "http://localhost:8000/callback"
  },
  function(accessToken, refreshToken, profile, done) {
  process.nextTick(function () {
     //store accesstoken in redis
     client.set(profile.username, accessToken, function(err, data) {
       if(err) {
           return console.log(err);
           //set the key=username, accessToken=stringOfAccessToken;
       }
     })
     return done(null, profile);
  });
  }));
  

app.get('/auth/spotify',
  passport.authenticate('spotify', 
  {scope: ['user-read-currently-playing', 'streaming', 'playlist-modify-public','playlist-modify-private', 'user-modify-playback-state', 'playlist-read-private', 'playlist-read-collaborative' ,'user-read-birthdate', 'user-read-email', 'playlist-modify-private'], 
  showDialog: true}),
  function(req, res){});

app.get('/callback',
  passport.authenticate('spotify', { failureRedirect: '/login' }),
  function(req, res) {res.redirect('/login');})

app.get('/',  (req,res)=>{
    res.render('mainpage');
  });

app.get('/home', ensureAuthenticated,  (req, res)=>{
    res.render('home');
})

app.get('/login', ensureAuthenticated, (req, res)=>{
  let obj = [];
  client.get(req.user.id, (err, response)=>{
    if(err){console.log(err);}
    axios({
      method: 'GET',
      url: 'https://api.spotify.com/v1/me',
      headers: {Authorization: 'Bearer '+ response}
    }).then( (data) => {res.render('test', data.data)})
    .catch((err)=>{console.log('error occurs')})
    })
  });


//check if the user has our playlist
app.get('/listenmusic', ensureAuthenticated, (req, res)=>{
  client.get(req.user.id, (err, response)=>{
    if(err){
      console.log(err);
    }
    let havePlaylist = false;
    let location = '';
    axios({
      method: 'GET',
      url: `https://api.spotify.com/v1/users/${req.user.id}/playlists`,
      headers: {Authorization: 'Bearer '+ response}
    }).then((data)=>{
        data.data.items.forEach((n)=>{
          if(n.name === "My Mood Now"){
            location += n.href;
            return havePlaylist = true;
          }
        })
        console.log(havePlaylist);
        if(!havePlaylist){
          axios({
            method: 'POST',
            url: `https://api.spotify.com/v1/users/${req.user.id}/playlists`,
            headers: {Authorization: 'Bearer '+ response},
            data: {
            'description': "My Mood Now",
            'name': "My Mood Now",
            'public': false 
            }
          })
          .then( (data) => {location += data.headers.location;}).catch((err)=>{console.log(err);})
      }}).then(()=>{
            axios({
              method: "GET",
              url: `https://api.spotify.com/v1/browse/categories/party/playlists`,
              // url: `https://api.spotify.com/v1/browse/categories/${category_id}/playlists`,
              headers: {Authorization: 'Bearer '+ response}
            }).then((data)=>{
              let playlistData = data.data.playlists.items[Math.floor(Math.random()*(data.data.playlists.items.length-1))]
              axios({
                method: "GET",
                url: `https://api.spotify.com/v1/users/${playlistData.owner.id}/playlists/${playlistData.id}/tracks`,
                headers: {Authorization: 'Bearer '+ response}
              }).then((data)=>{
                let randomTrack = data.data.items[Math.floor(Math.random()*(data.data.items.length-1))].track.uri;
                let trackUrl = randomTrack.replace(':', '%3A')
                axios({
                  method: 'POST',
                  url: `${location}/tracks?uris=${trackUrl}`,
                  headers: {Authorization: 'Bearer '+ response}
                })
              }).catch((err)=>{
                console.log('"ERROR in getting a track');
              })
            }).catch((err)=>{console.log(err)});
      }).catch((err)=>{
        console.log(err);
      })
  })
  res.render('home');
})

//take photo (1. showing, only for window // 2.not showing, only for mac)
app.post('/takephoto', ensureAuthenticated, (req,res)=>{
  res.sendFile('getusermedia.html', {root: __dirname });
  // takePhoto();
  // setTimeout(deleteImage, 20000);
  // res.render('image');
})

//get the happiness index
app.get('/checkphoto', ensureAuthenticated, (req,res)=>{
  axios({
    method: "POST",
    url: 'https://westus.api.cognitive.microsoft.com/emotion/v1.0/recognize',
    host: 'westus.api.cognitive.microsoft.com',
    headers: {'Ocp-Apim-Subscription-Key': process.env.faceAPI},
    data: './public/smile.jpg'
    // data: 'chingchow/code/prj2/photos/smile.jpg'
    // data: {"url": "http://fittedmagazine.com/wp-content/uploads/2016/03/girl-smiling-fitted-1024x681.jpg"}
  }).then((result)=>{console.log(result)}).catch((err)=>{console.log('ERROR')})
  res.redirect('http://localhost:8000/smile.jpg');
  // res.render('image'); 
})


//callback functions
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  else {res.redirect('/auth/spotify')}
}

function takePhoto (){
  imagesnapjs.capture('./photos/photo.jpg', { cliflags: '-w 2'}, function(err) {
    console.log(err ? err : 'Success!');
  });
}

function deleteImage(){
  var path = './photos/photo.jpg';
  fs.unlink(path, (err)=>{
    if(err){
      console.log(err);
    } else {
      console.log('The file is deleted');
    }
  });
}


app.listen(8000);