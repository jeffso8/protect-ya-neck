import express from 'express';
import http from 'http';
import cors from 'cors';
import bodyParser from 'body-parser';
import puppeteer from 'puppeteer';
import Rooms from '../models/Rooms';
import database from '../database/index';
import "regenerator-runtime/runtime.js";
import {getWords, newUser} from './utils';
import path from 'path';

const socketIO = require('socket.io');
const port = process.env.PORT || 3001;

let app = express();
let server = http.Server(app);
let io = socketIO(server);


app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client/build')));

app.options("/*", function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
  res.sendStatus(200);
});

app.all('*', function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

/*
 roomMap: {
  roomID: {
    spymasterHints: String[],
    colors: String[],
    words: String[],
    clicked: Boolean[],
    isRedTurn: Boolean,
    totalGameScore: [int, int],
    redScore: int
    blueScore: int,
    redSpy: String,
    blueSpy: String,
    users: {
      userID[]: {
        team: String,
        role: String,
        isHost: Boolean,
      }
    }
  }
 }
*/

const colors = ["red", "red", "red", "red", "red", "red", "red", "red", "blue", "blue", "blue", "blue",
"blue", "blue", "blue", "blue", "white", "white", "white", "white", "white", "white", "white", "white", "black"];

let interval;

// app.get('/', (req, res) => {
//   res.send('Hello World!');
// });

app.get('/words', async (req, res) => {
  const words = await getWords();
  return res.send(words);
});

app.post('/create-room', (req, res) => {
  return res.status(200).json({
    success: true,
    redirectUrl: `/${req.body.roomName}`
  });
});

io.on('connection', (socket) => {
  socket.on('joinRoom', (data) => {
    console.log('data', data);
    //data is an object with the roomID and the user that joined the room
    socket.join(data.roomID);
    Rooms.findOne({roomID: data.roomID}, function(err, res) {
      if (!res) {
        const newRoom = new Rooms(
          {
            roomID: data.roomID,
            users: [{
              userID: data.userID,
              team: null,
              role: null,
              isHost: true
            }]
          })
        if (err) return;
        newRoom.save();
        io.in(data.roomID).emit('updateTeams', newRoom);
      } else {
      const foundUser = res.users.find(user => user.userID === data.userID);
      if (!foundUser) {
      res.users.push({
        userID: data.userID,
        team: null,
        role: null,
        isHost: false
      })}
      if (err) return;
      res.markModified('users');
      res.save();
      io.in(data.roomID).emit('updateTeams', res);
    }
    });
  });

  socket.on('message', (data) => {
    //gives data as an object {message: what message was sent, roomId: has the given room id}
    socket.nsp.in(data.roomID).emit('newMessage', data.message);
  });

  socket.on('getWords', (data) => {
    Rooms.findOneAndUpdate({roomID: data.roomID}, {$set : {words: getWords()}}, {upsert: true, new: true}, function(err, result) {
      if (err) return;
      socket.nsp.in(data.roomID).emit('sendWords', result);
      })
  });

  socket.on('setRedTeam', (data) => {
    Rooms.findOne({roomID: data.roomID}, function(err, res) {
      const foundUser = res.users.find(user => user.userID === data.userID);
      foundUser.team = 'RED';
      foundUser.role = null;
      if (res.blueSpy == data.userID) {
        res.blueSpy = null;
      }
      res.markModified('users', 'blueSpy');
      res.save();
      socket.nsp.in(data.roomID).emit('updateTeams', res);
    })
  });

  socket.on('setBlueTeam', (data) => {
    Rooms.findOne({roomID: data.roomID}, function(err, res) {
      const foundUser = res.users.find(user => user.userID === data.userID);
      foundUser.team = 'BLUE';
      foundUser.role = null;
      if (res.redSpy == data.userID) {
        res.redSpy = null;
      }
      res.markModified('users', 'redSpy');
      res.save();
      socket.nsp.in(data.roomID).emit('updateTeams', res);
    });
  });

  socket.on('claimSpyMaster', (data) => {
    Rooms.findOne({roomID: data.roomID}, function(err, res) {
      const foundUser = res.users.find(user => user.userID === data.userID);
      foundUser.role = "MASTER";
      if (foundUser.team === "RED") {
        res.redSpy = foundUser.userID;
      } else if (foundUser.team === "BLUE") {
        res.blueSpy = foundUser.userID;
      }
      res.markModified('users', 'redSpy', 'blueSpy');
      res.save();
      socket.nsp.in(data.roomID).emit('updateTeams', res);
    });
  });

  socket.on('joinGame', (data) => {
    socket.join(data.roomID);
    Rooms.findOne({roomID: data.roomID}, function(err, res) {
      if (err) return;
      socket.nsp.in(data.roomID).emit('refreshGame', res);
    })
  });

  socket.on('redScoreChange', (data) => {
    console.log("server - handleRed", data.redScore);
    Rooms.findOneAndUpdate({roomID: data.roomID}, {$set : {redScore: data.redScore}}, {upsert: true, new: true}, function(err, res) {
      if (err) return;
      socket.nsp.in(data.roomID).emit('updateRedScore', {redScore: res.redScore});
    });
  });

  socket.on('blueScoreChange', (data) => {
    console.log("server - handleBlue", data.blueScore);
    Rooms.findOneAndUpdate({roomID: data.roomID}, {$set : {blueScore: data.blueScore}}, {upsert: true, new: true}, function(err, res) {
      if (err) return;
      socket.nsp.in(data.roomID).emit('updateBlueScore', {blueScore: res.blueScore});
    });
  });

  socket.on('flipCard', (data) => {
    Rooms.findOne({roomID: data.roomID}, function(err, res) {
      if (err) return;
      res.clicked[data.index] = true;
      res.isRedTurn = data.isRedTurn;
      res.markModified('clicked', 'isRedTurn');
      res.save();
      socket.nsp.in(data.roomID).emit('updateFlipCard', {isRedTurn: res.isRedTurn, clicked: res.clicked});
  });
});

  socket.on('hostStartGame', async (data) => {
    const colorSorted = colors.sort(() => Math.random() - 0.5);
    const words = await getWords();
    console.log('words', words);
    const clicked = new Array(25).fill(false);

    Rooms.findOneAndUpdate({roomID: data.roomID}, {$set : {colors: colorSorted, words: words, clicked: clicked, isRedTurn: true, redScore: 0, blueScore: 0}},
      {upsert:true, new:true}, function(err, res) {
        if (err) return;
        console.log("hoststartres", res);
        socket.nsp.in(data.roomID).emit('startGame', res);
    })
  });

  socket.on("disconnect", () => {
    clearInterval(interval);
  });
});

// Handle React routing, return all requests to React app
  app.get('/*', function(req, res) {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });

server.listen(port, () =>
    console.log(`Example app listening on port ${port}!`),
);