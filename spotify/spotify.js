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
const http = require('http').Server(app);
const io = require('socket.io')(http);

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

var client_id = "8fbb168b35ee49e0a618cc027b88604d";
var client_secret = "1236d263c4ec4276a3eb062c811d85fb";

// var client_id = process.env.spotify_client_id;
// var client_secret = process.env.spotify_client_secret;

passport.use(new SpotifyStrategy({
    clientID: client_id,
    clientSecret: client_secret,
    callbackURL: "http://megaexplorer.net:8000/callback"
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
            client.set(yourPlaylistID, appPlaylist.data.id, (err,data)=>{
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
              let playlistData = categorySongList.data.playlists.items[Math.floor(Math.random()*(categorySongList.data.playlists.items.length))]
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

app.get('/chatmusic', ensureAuthenticated, (req,res)=>{
  let yourPlaylistID = req.user.id+'_playlistID';
  client.get(yourPlaylistID, (err,data)=>{
    res.render('addedmusic_nonav', {'username': req.user.id, 'playlistid': data});
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
    headers: {Authorization: `Client-ID 33fe8399adb31dc`, Accept: 'application/json'},
    data: {'image': `${photobase64}`}
    }).then((response)=>{
      imgLink = response.data.data.link;
      deleteHash = response.data.data.deletehash;
      axios({
      method: "POST",
      url: 'https://westus.api.cognitive.microsoft.com/emotion/v1.0/recognize',
      host: 'westus.api.cognitive.microsoft.com',
      headers: {'Ocp-Apim-Subscription-Key': `a9ccd90199684954b1d53482133f0c4a`},
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
        Object.keys(emotionData).map((eachData)=>{
          obj[eachData] = (emotionData[eachData]*100).toFixed(1)+'%';
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
        headers: {Authorization: `Client-ID 33fe8399adb31dc`}
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


app.get('/chatroom', (req, res) => {

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
      if (newroom == 'anger') {
          socket.emit('updatechat', 'SERVER', "Welcome to the 'anger' chatroom, an ideal place for you to \
           let things out of your system.  Rules: No swearing and no insults to be directed at anyone. \
            Should you violate any of our rules, you will be banned.");
      }
      else if (newroom == 'contempt') {
          socket.emit('updatechat', 'SERVER', "Welcome to the 'contempt' chatroom, an ideal place for you to \
          discuss with others why you have contempt for somebody.  Rules: No swearing and no insults to be directed at anyone. \
           Should you violate any of our rules, you will be banned.");
      }
      else if (newroom == 'disgust') {
          socket.emit('updatechat', 'SERVER', "Welcome to the 'disgust' chatroom, an ideal place for you to \
          share with others why you have disgust for somebody or things that have been happening . \
           Rules: No swearing and no insults to be directed at anyone. \
           Should you violate any of our rules, you will be banned.");
      }
      else if (newroom == 'fear') {
          socket.emit('updatechat', 'SERVER', "Welcome to the 'fear' chatroom, an ideal place for you to \
          find comfort in times where you feel scared or fear that things are not going the way they should be. \
           Rules: No swearing and no insults to be directed at anyone. \
           Should you violate any of our rules, you will be banned.");
      }
      else if (newroom == 'happiness') {
          socket.emit('updatechat', 'SERVER', "Welcome to the 'happiness' chatroom, an ideal place for you to \
          have fun chatting with others and partying in this virtual world on the internet. However, \
          we strongly encourage you to visit other chatrooms and try to help people out of their negative emotional states. \
           Rules: No swearing and getting too high that you are annoying other users. \
           Should you violate any of our rules, you will be banned.");
      }
      else if (newroom == 'neutral') {
          socket.emit('updatechat', 'SERVER', "Welcome to the 'neutral' chatroom, an ideal place for you to \
          enjoy chatting with others who are also neutral and bored.  Even though you may not feel like partying, \
          we strongly encourage you elevate your mood as much as possible so that you can visit other chatrooms \
          to help people out of their negative emotional states.  Smile more and be happy! \
           Rules: No swearing and no insults to be directed at anyone. \
           Should you violate any of our rules, you will be banned.");
      }
      else if (newroom == 'sadness') {
          socket.emit('updatechat', 'SERVER', "Welcome to the 'sadness' chatroom, an ideal place for you to \
          share with others who are also on the same kind of boat as you.  We understand that every once in \
          a while, we as humans need to take some time out to let things out of our system, before we can \
          return to the happy, healthy state of mind again.  We hope that you can be happy again as soon as \
          possible so you can be a great testimony for others. Smile at the camera again soon! \
           Rules: No swearing and no insults to be directed at anyone. \
           Should you violate any of our rules, you will be banned.");
      }
      else if (newroom == 'surprise') {
          socket.emit('updatechat', 'SERVER', "Welcome to the 'surprise' chatroom, an ideal place for you to \
          share surprising things that have been happening in your life with others.  As surprises can come \
          in good and bad, we hope that people in this chatroom can still relate to each other well by \
          being a good listener to each other.  Please remember that our mission is to create an internet \
          community full of love and harmony. \
           Rules: No swearing and no insults to be directed at anyone. \
           Should you violate any of our rules, you will be banned.");
      }

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

http.listen(8000);

//app.listen(8000);