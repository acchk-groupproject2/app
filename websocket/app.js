//server.js
const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);


app.get('/', (req, res) => {
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

        while (usernames.hasOwnProperty(username)) {
            username += "2";
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

http.listen(3030);
