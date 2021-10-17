const path = require('path');
const http = require('http');
const express = require('express');
const socketio = require('socket.io');
const formatMessage = require('./utils/messages');
const { userJoin, getCurrentUser, userLeave, getRoomUsers } = require('./utils/users');
const { MongoClient } = require('mongodb');
const moment = require('moment');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

const PASSWORD = "Kimhuan2.0";
const DATABASE = "simple-chat";
const uri = `mongodb+srv://kimhuanle:${PASSWORD}@cluster0.wfupm.mongodb.net/${DATABASE}?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

// Set static folder
app.use(express.static(path.join(__dirname, 'public')));

const botName = "Chat Bot";

client.connect();
const collection = client.db("simple-chat").collection("messages");
// Run when client connect
io.on('connection', socket => {
    socket.on('joinRoom', ({ username, room }) => {
        const user = userJoin(socket.id, username, room);

        socket.join(user.room);

        // Get messages in room from database
        const query = { room: room };
        const sort = { timems: 1 }
        const cursor = collection.find(query).sort(sort);
        cursor.forEach(doc => {
            const time = moment(doc.timems).fromNow();
            message = {
                username: doc.user,
                text: doc.message,
                time: time
            }
            socket.emit('message', message);
        });

        setTimeout(() => {
            //  Welcome current user
            socket.emit('message', formatMessage(botName, `Welcome to ChatBox ${user.username}!`));
        }, 100);
        // Broadcast when a user connects
        socket.broadcast.to(user.room).emit('message', formatMessage(botName, `${user.username} has joined the chat`));

        // Send users and rooms info
        io.to(user.room).emit('roomUsers', {
            room: user.room,
            users: getRoomUsers(user.room)
        });
    });

    // Listen for chatMessage
    socket.on('chatMessage', msg => {
        const user = getCurrentUser(socket.id);
        io.to(user.room).emit('message', formatMessage(user.username, msg));
        // Update new message in room to database
        const time = new Date().getTime();
        const doc = { room: user.room, user: user.username, message: msg, timems: time };
        collection.insertOne(doc);
    });

    // Runs when a client disconnects
    socket.on('disconnect', () => {
        const user = userLeave(socket.id);

        if (user) {
            io.to(user.room).emit('message', formatMessage(botName, `${user.username} has left the chat`));

            // Send users and rooms info
            io.to(user.room).emit('roomUsers', {
                room: user.room,
                users: getRoomUsers(user.room)
            });
        }
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));