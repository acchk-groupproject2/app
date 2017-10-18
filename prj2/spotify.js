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
const http = require('http').Server(app);
const io = require('socket.io')(http);

const client = redis.createClient({
    host: 'localhost',
    port: 6379
});
const base64Img = require('base64-img');

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

var client_id = "8fbb168b35ee49e0a618cc027b88604d";

var client_secret = "1236d263c4ec4276a3eb062c811d85fb";

// var client_id = process.env.spotify_client_id;
// var client_secret = process.env.spotify_client_secret;

passport.use(new SpotifyStrategy({
    clientID: client_id,
    clientSecret: client_secret,
    callbackURL: "http://megaexplorer.net:3000/callback"
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
  client.get(req.user.id, (err, response)=>{
    if(err){
      console.log(err);
    }
    let havePlaylist = false;
    let location;
    axios({
      method: 'GET',
      url: `https://api.spotify.com/v1/users/${req.user.id}/playlists`,
      headers: {Authorization: 'Bearer '+ response}
    }).then((userPlaylist)=>{
        userPlaylist.data.items.forEach((n)=>{
          if(n.name === "My Mood Now"){
            location = n.href;
            return havePlaylist = true;
          }
        })
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
          .then( (appPlaylist) => {location = appPlaylist.headers.location;}).catch((err)=>{console.log(err);})
      }}).then(()=>{
            let yourEmotionState = req.user.id + '_emotion';
            client.get(yourEmotionState, (err, songCategory)=>{
            
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
                let totalTime = 0;
                let yourSongTime = req.user.id + '_songTime';
                let theTempList = [];
                // let theTempListDetail = req.user.id + '_tempList';
                getANewSong(desireTrack);
                getANewSong(desireTrack);
                getANewSong(desireTrack);
                setTimeout(deleteSong, totalTime)

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
                  // theTempList += (randomTrack + ',');
                  theTempList.push(randomTrack)
                  let trackUrl = randomTrack.replace(':', '%3A')
                  axios({
                    method: 'POST',
                    url: `${location}/tracks?uris=${trackUrl}`,
                    headers: {Authorization: 'Bearer '+ response}
                  })
                }

                function deleteSong(){
                  axios({
                    method: 'DELETE',
                    url: `${location}/tracks`,
                    headers: {Authorization: 'Bearer '+ response},
                    data: {'tracks': [{'uri': theTempList[0], 'positions':[0]}, {'uri': theTempList[1], 'positions':[1]}, {'uri': theTempList[2], 'positions':[2]}]}
                  }).then((response)=>{console.log('Removed Tracks')}).catch((err)=>{console.log('ERROR is deleting the song')})
                }

                client.set(yourSongTime, totalTime, (err,data)=>{
                  if(err){
                    console.log('ERROR is saving songTime');
                  }
                })
              }).catch((err)=>{
                console.log('"ERROR in getting a track');
              })
            }).catch((err)=>{console.log(err)});
            })
      }).catch((err)=>{
        console.log(err);
      })
  })
  res.render('home');
})

//take photo (1. showing, only for window // 2.not showing, only for mac)
app.get('/takephoto', ensureAuthenticated, (req,res)=>{
  setTimeout(takePhoto, 2000);
  setTimeout(deleteImage, 23000);
  res.sendFile('takeyourphoto.html',  { root : __dirname})
})

app.get('/processingphoto', ensureAuthenticated, (req,res)=>{
  res.sendFile('processingphoto.html',  { root : __dirname});
})

app.get('/processphoto', ensureAuthenticated, (req,res)=>{
  var imgLink;
  var deleteHash;
  base64Img.base64('./public/photo.jpg', function(err, data) {
    var log = data.replace('data:image/jpg;base64,/', '/');
    axios({
    method: 'POST',
    url: 'https://api.imgur.com/3/upload',
    headers: {Authorization: `Client-ID ${process.env.imgur_client_id}`, Accept: 'application/json'},
    data: {'image': `${log}`}
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
        let mainEmotion = Object.keys(emotionData).reduce((first, second)=>{
          if(emotionData[first] > emotionData[second]){
            return first;
          } else {
            return second;
          }
        })
        let musicType;
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
        let yourEmotionState = req.user.id + '_emotion'
        client.set(yourEmotionState, musicType, function(err, data){
          if(err){
            console.log("CANNOT SAVE the emotion");
          }
        })
      }).then(()=>{
        axios({
        method: 'DELETE',
        url: `https://api.imgur.com/3/image/${deleteHash}`,
        headers: {Authorization: `Client-ID ${process.env.imgur_client_id}`}
        }).then((res)=>{console.log("image deleted")}).catch((err)=>{console.log('Err yuen mei')})
      }).catch((err)=>{console.log('ERROR in uploading image to emotion API' + err)})
    }).catch((err)=>{console.log("ERROR in uploading and deleting")});
  })
  res.render('image');
})

//get the happiness index
app.get('/checkphoto', ensureAuthenticated, (req,res)=>{
  base64Img.base64('smile.jpg', function(err, data) {
  axios({
    method: "POST",
    url: 'https://westus.api.cognitive.microsoft.com/emotion/v1.0/recognize',
    host: 'westus.api.cognitive.microsoft.com',
    headers: {'Ocp-Apim-Subscription-Key': process.env.faceAPI},
    data: {'url':`${data}`}
  }).then((result)=>{console.log(result)}).catch((err)=>{console.log('ERROR')})
  res.render('home'); 
  })
})

app.get('/check', ensureAuthenticated, (req,res)=>{
  res.sendFile('capture.html',  { root : __dirname})
})

app.post('/check', ensureAuthenticated, (req,res)=>{
  let tokenPhoto = req.body['64'].replace('data:image/png;base64,', '')
  let youPhotoName = req.user.id +'_photo'
  client.set(youPhotoName, tokenPhoto, (err,data)=>{
    if(err){
      console.log('ERROR in client set photo')
    }
    client.get(youPhotoName, (err,photoLink)=>{
      axios({
        method: 'POST',
        url: 'https://api.imgur.com/3/upload',
        headers: {Authorization: `Client-ID ${process.env.imgur_client_id}`, Accept: 'application/json'},
        data: {'image': `${photoLink}`}
      }).then((response)=>{console.log(response)}).catch((err)=>{console.log('ERROR in saving image token')})
    })
  })
  res.redirect('/check');
})


app.get('/chatroom', ensureAuthenticated, (req, res) => {
  //The server only serves one file, the index.html file.
  res.sendFile(__dirname + '/index.html');
});

var userCount = 0;
var usernames = {}; //Object variable for storing the usernames currently connected to the chat

var rooms = ['Lobby', 'anger', 'contempt', 'disgust', 'fear', 'happiness', 'neutral', 'sadness', 'surprise'];

io.on('connection', (socket) => {
  
  //Increases counter and emits the userCount event
  userCount++;
  io.emit('userCount', {userCount: userCount});

  //When the client emits 'adduser', the server listens and executes below
  socket.on('adduser', function(username) {

      //Make name unique by adding an extra '2' and change name to unique name in green bar
      while (usernames.hasOwnProperty(username)) {
          username += "2";
          socket.emit('checkname', username);
      }
  
      //First of all, we store the username in the socket session
      socket.username = username;

      //We also store the room's name in the socket session
      socket.room = 'Lobby'; 

      // Then add the client's username to the global usernames variable
      usernames[username] = username;

      //The first room to join on connecting
      socket.join('Lobby');
      
      //Update the list of users in the chat on the client's side
      io.sockets.emit('updateusers', usernames);

      //Echo to client that they have connected
      socket.emit('updatechat', 'SERVER', 'you have connected to Lobby');

      //Broadcast to all other clients that a user has connected
      socket.broadcast.to('Lobby').emit('updatechat', 'SERVER', username + ' has connected to this room');

      //Updates the room list with the current room as 'Lobby'
      socket.emit('updaterooms', rooms, 'Lobby');
  });

  //Only allows chat function to be broadcasted to each specific room
  socket.on('sendchat', function(data) {
      io.sockets["in"](socket.room).emit('updatechat', socket.username, data);
  });
  
  //Listens for 'switchRoom' event from the client then broadcasts the relevant messages and updates room list
  socket.on('switchRoom', function(newroom) {
      var oldroom;
      oldroom = socket.room;
      socket.leave(socket.room);
      socket.join(newroom);
      socket.emit('updatechat', 'SERVER', 'you have connected to ' + newroom);
      socket.broadcast.to(oldroom).emit('updatechat', 'SERVER', socket.username + ' has left this room');
      socket.room = newroom;
      socket.broadcast.to(newroom).emit('updatechat', 'SERVER', socket.username + ' has joined this room');
      socket.emit('updaterooms', rooms, newroom);
  });

  socket.on('disconnect', () => {

      //Remove the username from the global usernames variable
      delete usernames[socket.username];
      //Update the list of users the the chat on the client-side
      io.sockets.emit('updateusers', usernames);

      //Broadcast to all other clients that a user has left.
      socket.broadcast.emit('updatechat', 'SERVER', socket.username + ' has disconnected');
       
      //Decreases counter on disconnect and emits another userCount event
      userCount--;
      io.emit('userCount', { userCount: userCount });

      socket.leave(socket.room);
  });


});


//callback functions
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  else {
    // res.redirect('/callback');
    res.redirect('/auth/spotify')
  }
}

function takePhoto (){
  imagesnapjs.capture('./public/photo.jpg', { cliflags: '-w 2'}, function(err) {
    console.log(err ? err : 'Success!');
  });
}

function deleteImage(){
  var path = './public/photo.jpg';
  fs.unlink(path, (err)=>{
    if(err){
      console.log(err);
    } else {
      console.log('The file is deleted');
    }
  });
}

http.listen(3000);



//app.listen(3000);