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

io.on('connection', (socket) => {
    //The .on method specifies the event 'connection' we are listening for
    
    //Increases counter and emits the userCount event
    userCount++;
    io.emit('userCount', {userCount: userCount});

    //Message to print in console when the event 'connection' occurs
    console.log('a user connected to the socket');
    //Whenever the client emits 'sendchat', this listens and executes
    socket.on('sendchat', function(data) {
        //We tell the client to execute 'updatechat' with 2 parameters.
        io.sockets.emit('updatechat', socket.username, data);
    });


    //When the client emits 'adduser', the server listens and executes below
    socket.on('adduser', function(username) {
    //First of all, we store the username in the socket session
    socket.username = username;
    // Then add the client's username to the global usernames variable
    usernames[username] = username;
    
    //Update the list of users in the chat on the client's side
    io.sockets.emit('updateusers', usernames);

    //Echo to client that they have connected
    socket.emit('updatechat', 'Server', 'you have connected');

    //Broadcast to all other clients that a user has connected
    socket.broadcast.emit('updatechat', 'Server', username + ' has connected');

    });

    //Using the .on method to listen on the 'socket' parameter passed in the callback
    //Upon the 'disconnect' event, print another message.
    socket.on('disconnect', () => {

        console.log('a user left us');

        //Remove the username from the global usernames variable
        delete usernames[socket.username];
        //Update the list of users the the chat on the client-side
        io.sockets.emit('updateusers', usernames);

        //Broadcast to all other clients that a user has left.
        socket.broadcast.emit('updatechat', 'Server', socket.username + ' has disconnected');
         
        //Decreases counter on disconnect and emits another userCount event
        userCount--;
        io.emit('userCount', { userCount: userCount });

        
    });


    //Listens for 'chat message' event and broadcasts it back to all listening sockets
    // socket.on('chat message', (msg)=>{
    //     io.emit('chat message', msg); 
    // });




});

//server side for detect typing
//   client.on("typing", function(data) {  
//     if (typeof people[client.id] !== "undefined")
//     socket.sockets.in(client.room).emit("isTyping", {isTyping: data, person: people[client.id].name});
//     client.broadcast.to(client.room).emit("isTyping", {isTyping: data, person: people[client.id].name});
// console.log("Someone is typing");
// });

http.listen(3030);
