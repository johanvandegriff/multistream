const express = require('express');
const app = express();
const http = require('http');
const https = require('https');
const server = http.createServer(app);
const io = require('socket.io')(server);
const dotenv = require('dotenv'); //for storing secrets in an env file
const tmi = require('tmi.js'); //twitch chat https://dev.twitch.tv/docs/irc
const Dlive = require('dlivetv-api'); //dlive chat https://github.com/lkd70/dlivetv-api

//expose js libraries to client so they can run in the browser
app.get('/', (req, res) => {res.sendFile(__dirname + '/index.html')});
app.get('/jquery.js', (req, res) => {res.sendFile(__dirname + '/node_modules/jquery/dist/jquery.js')});
app.get('/color-hash.js', (req, res) => {res.sendFile(__dirname + '/node_modules/color-hash/dist/color-hash.js')});
app.get('/video.js', (req, res) => {res.sendFile(__dirname + '/node_modules/video.js/dist/video.js')});
app.get('/video-js.css', (req, res) => {res.sendFile(__dirname + '/node_modules/video.js/dist/video-js.css')});

//expose the static dir with CSS and images
app.use('/static', express.static('static'));
//expose the live dir that will be populated by nginx when streaming
app.use('/live', express.static('live'));

//use socket.io to make a simple live chatroom
io.on('connection', (socket) => {
    console.log('a user connected');
    socket.on('disconnect', () => {
        console.log('user disconnected');
    });

    socket.on('chat message', (msg) => {
        iosend(msg.name, msg.text)
        handleCommand(msg.text);
    });
});

function iosend(name, text) {
    console.log('message: ' + name + ": " + text);
    var iomsg = {'name': name, 'text': text};
    io.emit('chat message', iomsg);
    // emit the message many times for testing CSS
    // iomsg.text = iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text+
    //              iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text;
    // for (i=0; i<30; i++) {
    //     io.emit('chat message', iomsg);
    // }
}

//twitch chat stuff
dotenv.config({ path: '/srv/secret-twitch.env' }) //bot API key and other info
//the /srv/secret-twitch.env file should look like:
//TWITCH_BOT_USERNAME=jjvantheman (or create a second account for the bot)
//TWITCH_BOT_OATH_TOKEN=oauth:blah blah blah
//TWITCH_BOT_CHANNEL=jjvantheman

// Define configuration options
const opts = {
    identity: {
        username: process.env.TWITCH_BOT_USERNAME,
        password: process.env.TWITCH_BOT_OAUTH_TOKEN
    },
    channels: [process.env.TWITCH_BOT_CHANNEL]
};

//console.log("TWITCH SECRETS " + JSON.stringify(opts));

// Create a client with our options
const client = new tmi.client(opts);
// Register our event handlers (defined below)
client.on('message', onMessageHandler);
client.on('connected', onConnectedHandler);
// Connect to Twitch:
client.connect();

// Called every time the bot connects to Twitch chat
function onConnectedHandler (addr, port) {
    console.log(`* Connected to ${addr}:${port}`);
}
// Called every time a message comes in
function onMessageHandler (target, context, msg, self) {
    console.log("TARGET " + target);
    console.log("CONTEXT " + JSON.stringify(context));
    console.log("MSG " + msg);
    console.log("SELF " + self);

    //copy twitch chat to socket chat
    iosend(context.username, msg);

    if (self) { return; } // Ignore messages from the bot
    handleCommand(msg);
}

function handleCommand(commandName1) {
    // Remove whitespace from chat message
    const commandName = commandName1.trim();

    var valid = true;
    // If the command is known, let's execute it
    if (commandName === '!dice') {
        const num = rollDice();
        //commands sent here will be echoed to the socket chat since they will be detected by onMessageHandler
        client.say(process.env.BOT_CHANNEL, `You rolled a ${num}`);
    } else if (commandName === '!boggle') {
        client.say(process.env.BOT_CHANNEL, `play boggle at https://games.johanv.xyz/boggle`);
    } else if (commandName === '!carl' || commandName === '!CARL') {
        const url = 'https://games.johanv.xyz/carl_api';
        const request = https.request(url, (response) => {
            let data = '';
            response.on('data', (chunk) => {
                data = data + chunk.toString();
            });
            response.on('end', () => {
                // const body = JSON.parse(data);
                console.log(data);
                client.say(process.env.BOT_CHANNEL, `CARL says: ${data} (https://games.johanv.xyz/carl)`);
            });
        })
        request.on('error', (error) => {
            console.log('An error', error);
        });
        request.end();
    } else {
        valid = false;
        console.log(`* Unknown command ${commandName}`);
    }

    if (valid) {
        console.log(`* Executed ${commandName} command`);
    }
}

// Function called when the "dice" command is issued
function rollDice () {
    const sides = 6;
    return Math.floor(Math.random() * sides) + 1;
}

//dlive chat stuff
dotenv.config({ path: '/srv/secret-dlive.env' }) //bot API key and other info
//the /srv/secret-dlive.env file should look like:
//DLIVE_BOT_SECRET=blah blah blah
//DLIVE_BOT_CHANNEL=jjvantheman
// console.log("DLIVE_BOT_SECRET " + process.env.DLIVE_BOT_SECRET);
// console.log("DLIVE_BOT_CHANNEL " + process.env.DLIVE_BOT_CHANNEL);
const bot = new Dlive(process.env.DLIVE_BOT_SECRET, process.env.DLIVE_BOT_CHANNEL);

// Monitor for 'ChatText' events
bot.on('ChatText', msg => {
    // Log every message recieved to the console
    console.log(`[${msg.sender.displayname}]: ${msg.content}`);

    //copy dlive chat to socket chat
    iosend(msg.sender.displayname, msg.content);

    handleCommand(msg.content);

    //TODO bot.sendMessage is broken
    // If someone says "hello" in our stream, greet then with a message
    // if (msg.content.toLowerCase() === 'hello') {
    //     bot.sendMessage(`Hi there ${msg.sender.displayname}! Welcome to the stream`);
    // }
});

//start the http server
var default_port = 8080;
server.listen(process.env.PORT || default_port, () => {
    console.log('listening on *:' + (process.env.PORT || default_port));
});

//TODO clean up the CSS, make text look good
//TODO add cards instead of links
//TODO pull youtube chat
//TODO only change nickname when email is provided
//TODO save nickname with cookies
//TODO add a README with setup instructions and change package name and version
//TODO favicon
//TODO use flexbox for CSS?
//TODO obs overlay
//TODO !carl command pass in the rest of the message to the CARL API
//TODO unify the commands
