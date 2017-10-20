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
const base64Img = require('base64-img');

app.use(bodyParser.json({limit: "50mb"}));
app.use(bodyParser.urlencoded({limit: "50mb", extended: true, parameterLimit:50000}));

app.use(express.static('public'));
require('dotenv').config()

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


var client_id = process.env.spotify_client_id;
var client_secret = process.env.spotify_client_secret;

passport.use(new SpotifyStrategy({
    clientID: client_id,
    clientSecret: client_secret,
    callbackURL: "http://139.59.247.87:8080/callback"
  },
  function(accessToken, refreshToken, profile, done) {
  process.nextTick(function () {
     client.set(profile.username, accessToken, function(err, data) {
       if(err) {
           return console.log("Error in saving accessToken");
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
  passport.authenticate('spotify', { failureRedirect: '/home' }),
  function(req, res) { res.redirect('/login');})

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
  let havePlaylist = false;
  let location;
  let totalTime = 0;
  let yourMusicType = req.user.id + '_musicType';
  let yourSongTime = req.user.id + '_songTime';
  let recommendSongs = req.user.id+'_recSong';
  let yourSongsUri = req.user.id+'_songuri'
  let theTempList = [];
  let uriList = [];
  let yourPlaylistID = req.user.id+'_playlistID';
  client.get(req.user.id, (err, response)=>{
    if(err){
      console.log(err);
    }
    axios({
      method: 'GET',
      url: `https://api.spotify.com/v1/users/${req.user.id}/playlists`,
      headers: {Authorization: 'Bearer '+ response}
    }).then((userPlaylist)=>{
        userPlaylist.data.items.forEach((n)=>{
          if(n.name === "My Mood Now"){
            client.set(yourPlaylistID, n.id, (err,data)=>{
              if(err){console.log('CANNOt SAVE Playlist ID')}
            })
            location = n.href;
            console.log('location: '+location)
            return havePlaylist = true;
          }
        })
    }).then(()=>{
        if(!havePlaylist){
          axios({
            method: 'POST',
            url: `https://api.spotify.com/v1/users/${req.user.id}/playlists`,
            headers: {Authorization: 'Bearer '+ response},
            data: {
            'description': "My Mood Now",
            'name': "My Mood Now",
            'public': true 
            }
          })
          .then( (appPlaylist) => {
            location = appPlaylist.headers.location;
            client.set(yourPlaylistID, appPlaylist.headers.id, (err,data)=>{
              if(err){console.log('CANNOT SAVE playlist id when no playlist before')}
            })
          }).catch((err)=>{console.log(err);})
      }}).then(()=>{
            client.get(yourMusicType, (err, songCategory)=>{
            axios({
              method: "GET",
              url: `https://api.spotify.com/v1/browse/categories/${songCategory}/playlists`,
              headers: {Authorization: 'Bearer '+ response}
            }).then((categorySongList)=>{
              let playlistData = categorySongList.data.playlists.items[Math.floor(Math.random()*(categorySongList.data.playlists.items.length-1))]
              axios({
                method: "GET",
                url: `https://api.spotify.com/v1/users/${playlistData.owner.id}/playlists/${playlistData.id}/tracks`,
                headers: {Authorization: 'Bearer '+ response}
              }).then((desireTrack)=>{

                getANewSong(desireTrack);
                getANewSong(desireTrack);
                getANewSong(desireTrack);

                function getANewSong (desireTrack){
                  var randomNumber = Math.floor(Math.random()*(desireTrack.data.items.length-1));
                  var ms = desireTrack.data.items[randomNumber].track.duration_ms;
                  var min = ms / 1000 / 60;
                  var r = min % 1;
                  var sec = Math.floor(r * 60);
                  if (sec < 10) {sec = '0'+sec;}
                  min = Math.floor(min);
                  // console.log(min+':'+sec);
                  totalTime += ms;
                  let randomTrack = desireTrack.data.items[randomNumber].track.uri;
                  let trackName = desireTrack.data.items[randomNumber].track.name;
                  theTempList.push(trackName);
                  uriList.push(randomTrack);
                  let theTempSongList = theTempList;
                  let trackUrl = randomTrack.replace(':', '%3A')
                  axios({
                    method: 'POST',
                    url: `${location}/tracks?uris=${trackUrl}`,
                    headers: {Authorization: 'Bearer '+ response}
                  }).then((response)=>{
                    console.log('Success Insert')
                  }).catch((err)=>{console.log('cannot insert the songs' + err)})
                }

              }).then(()=>{
                function deleteSong(){
                    uriList.map((tracksUri)=>{
                    axios({
                      method: 'DELETE',
                      url: `${location}/tracks`,
                      headers: {Authorization: 'Bearer '+ response},
                      data: {'tracks': [{'uri': tracksUri}]}
                    }).then((response)=>{console.log('Removed Tracks')}).catch((err)=>{console.log('ERROR in deleting the song' +err)})
                    })
                  // })
                }
                client.get(yourSongTime, (err,time)=>{
                  setTimeout(deleteSong, time)
                })
                client.get(yourPlaylistID, (err,data)=>{
                  res.render('addedmusic', {'username': req.user.id, 'playlistid': data});
                })
              }).catch((err)=>{
                console.log('"ERROR in getting a track' + err);
              })
            }).catch((err)=>{console.log(err)});
            })
      }).catch((err)=>{
        console.log('listenMusic'+err);
      })
  })
})


app.get('/processingphoto', ensureAuthenticated, (req,res)=>{
  let username = 'photo_'+req.user.id+'.jpg';
  res.render('processingphoto', {'image': username})
  // res.sendFile('processingphoto.html',  { root : __dirname});
})

app.get('/processphoto', ensureAuthenticated, (req,res)=>{
  var imgLink;
  var deleteHash;
  let youPhotoName = req.user.id +'_photo';
  let musicType;
  let obj = {}
  client.get(youPhotoName, (err, photobase64)=>{
  // base64Img.base64(`./public/photo_${req.user.id}.jpg`, function(err, data) {
  //   var log = data.replace('data:image/jpg;base64,/', '/');
    axios({
    method: 'POST',
    url: 'https://api.imgur.com/3/upload',
    headers: {Authorization: `Client-ID ${process.env.imgur_client_id}`, Accept: 'application/json'},
    data: {'image': `${photobase64}`}
    }).then((response)=>{
      imgLink = response.data.data.link;
      deleteHash = response.data.data.deletehash;
      axios({
      method: "POST",
      url: 'https://westus.api.cognitive.microsoft.com/emotion/v1.0/recognize',
      host: 'westus.api.cognitive.microsoft.com',
      headers: {'Ocp-Apim-Subscription-Key': process.env.faceAPI},
      data: {'url':`${imgLink}`}
      }).then((emotion)=>{
        console.log(emotion.data[0].scores);
        let emotionData = emotion.data[0].scores;
        Object.keys(emotionData).forEach((eachData)=>{
          obj[eachData] = emotionData[eachData];
        })
        let mainEmotion = Object.keys(emotionData).reduce((first, second)=>{
          if(emotionData[first] > emotionData[second]){
            return first;
          } else {
            return second;
          }
        })
        obj.mainEmotion = mainEmotion;
        let musicYouNeed = {
          'anger': ['chill', 'jazz'],
          'contempt': ['jazz', 'rnb'],
          'disgust': ['focus', 'comedy'],
          'fear': ['soul','chill'],
          'happiness': ['party', 'travel' ],
          'neutral': ['classic', 'country', 'focus', 'sleep', 'mandopop','dinner'],
          'sadness': ['mood', 'chill', 'kpop'],
          'surprise': ['party', 'funk', 'edm_dance']
        }
        
        musicType = musicYouNeed[mainEmotion][Math.floor(Math.random()*(musicYouNeed[mainEmotion].length))]
        let yourEmotionState = req.user.id + '_emotion';
        client.set(yourEmotionState, mainEmotion, (err,data)=>{
          if(err){
            console.log('CANNOT SAVE your main emotion');
          }
        })
        let yourMusicType = req.user.id + '_musicType';
        console.log(musicType)
        obj.musicType = musicType;
        client.set(yourMusicType, musicType, function(err, data){
          if(err){
            console.log("CANNOT SAVE the musicType");
          }
        })
      }).then(()=>{
        axios({
        method: 'DELETE',
        url: `https://api.imgur.com/3/image/${deleteHash}`,
        headers: {Authorization: `Client-ID ${process.env.imgur_client_id}`}
        }).then(()=>{
          console.log("image deleted");
          // return res.redirect('/login');
          let yourEmotionState = req.user.id+ '_emotion';
          let yourMusicType = req.user.id + '_musicType';
          res.render('image', obj)
          // client.get(yourEmotionState, (err, data1)=>{
          //   client.get(yourMusicType, (err, data2)=>{
          //     res.render('image', {'emotion': data1, 'music':data2});
          //   })
          // })
        }).catch((err)=>{console.log('Err yuen mei' + err)})
      }).catch((err)=>{console.log('No FACE~~~~!!!' ); return res.render('noface')})
    }).catch((err)=>{console.log("ERROR in uploading and deleting")});
  })
})

app.get('/noface', ensureAuthenticated, (req,res)=>{
  res.render('noface');
})

//get the happiness index
app.get('/checkphoto', ensureAuthenticated, (req,res)=>{
  res.sendFile('bonobo.html',  { root : __dirname})
})

app.get('/check', ensureAuthenticated, (req,res)=>{
  // res.sendFile('capture.html',  { root : __dirname})
  res.render('/home')
})

app.post('/check', ensureAuthenticated, (req,res)=>{
  let tokenPhoto = req.body['64'].replace('data:image/png;base64,', '')
  let youPhotoName = req.user.id +'_photo'
  client.set(youPhotoName, tokenPhoto, (err,data)=>{
    if(err){
      console.log('ERROR in client set photo')
    }
  })
  res.redirect('/check');
})


//callback functions
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  else {
    res.redirect('/auth/spotify')
  }
}


app.listen(8080);