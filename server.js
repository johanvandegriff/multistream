const express = require('express');
const app = express();
const http = require('http');
const https = require('https');
const server = http.createServer(app);
const io = require('socket.io')(server);
const dotenv = require('dotenv'); //for storing secrets in an env file
const tmi = require('tmi.js'); //twitch chat https://dev.twitch.tv/docs/irc
const Dlive = require('dlivetv-api'); //dlive chat https://github.com/lkd70/dlivetv-api
const { LiveChat } = require("youtube-chat"); //youtube chat https://github.com/LinaTsukusu/youtube-chat#readme
const axios = require('axios');
const WebSocketClient = require('websocket').client;

//expose js libraries to client so they can run in the browser
app.get('/', (req, res) => {res.sendFile(__dirname + '/index.html')});
app.get('/chat', (req, res) => {res.sendFile(__dirname + '/chat.html')});
app.get('/chat-transparent', (req, res) => {res.sendFile(__dirname + '/chat-transparent.html')});
app.get('/jquery.js', (req, res) => {res.sendFile(__dirname + '/node_modules/jquery/dist/jquery.js')});
app.get('/color-hash.js', (req, res) => {res.sendFile(__dirname + '/node_modules/color-hash/dist/color-hash.js')});
app.get('/video.js', (req, res) => {res.sendFile(__dirname + '/node_modules/video.js/dist/video.js')});
app.get('/video-js.css', (req, res) => {res.sendFile(__dirname + '/node_modules/video.js/dist/video-js.css')});

//expose the static dir with CSS and images
app.use('/static', express.static('static'));
//expose the live dir that will be populated by nginx when streaming
app.use('/live', express.static('live'));

function startStream() {
    console.log("Setting up youtube and owncast connections...")
    connect_to_youtube_if_not_connected();
    connect_to_owncast_if_not_connected();
}

app.get('/start', (req, res) => {
    console.log("start stream triggered from /start")
    startStream();
    res.send('ok')
});

//use socket.io to make a simple live chatroom
io.on('connection', (socket) => {
    console.log('[socket.io] a user connected');
    socket.on('disconnect', () => {
        console.log('[socket.io] a user disconnected');
    });

    socket.on('chat message', (msg) => {
        console.log(`[socket.io] RECV ${msg.name}: ${msg.text}`);
        if (msg.text === "we are live!") {
            console.log("[socket.io] start stream triggered from magic chat message")
            startStream();
        }
        // iosend(msg.name, msg.text);
        owncastSend(msg.name, msg.text);
        handleCommand(msg.text);
    });
});

function iosend(name, text) {
    console.log(`[socket.io] SEND ${name}: ${text}`);
    var iomsg = {'name': name, 'text': text};
    io.emit('chat message', iomsg);
    // emit the message many times for testing CSS
    // iomsg.text = iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text+
    //              iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text+iomsg.text;
    // for (i=0; i<30; i++) {
    //     io.emit('chat message', iomsg);
    // }
}

//owncast chat stuff
dotenv.config({ path: '/srv/secret-owncast.env' }) //owncast URL
//the /srv/secret-owncast.env file should look like:
//OWNCAST_URL=https://owncast.my.site
//OWNCAST_WS=wss://owncast.my.site
console.log("OWNCAST_URL", process.env.OWNCAST_URL);
console.log("OWNCAST_WS", process.env.OWNCAST_WS);

function owncastChatConnect(name, onConnectionEstablished, onMessageReceived, onErrorOrClose) {
    axios.post(process.env.OWNCAST_URL+'/api/chat/register', {"displayName": name}).then((res) => {
        console.log(`[owncast] Status: ${res.status}`);
        console.log(`[owncast] Body: ${res.data}`);
        
        var token = res.data.accessToken;

        var client = new WebSocketClient();

        client.on('connectFailed', function(error) {
            console.log('[owncast] Connect Error: ' + error.toString());
            onErrorOrClose();
        });

        client.on('connect', function(connection) {
            console.log('[owncast] WebSocket Client Connected');
            connection.on('error', function(error) {
                console.log("[owncast] Connection Error: " + error.toString());
                onErrorOrClose();
            });
            connection.on('close', function() {
                console.log('[owncast] Connection Closed');
                onErrorOrClose();
            });
            connection.on('message', function(message) {
                if (message.type === 'utf8') {
                    // console.log("Received: '" + message.utf8Data + "'");

                    //multiple json objects can be sent in the same message, separated by newlines
                    message.utf8Data.split("\n").forEach(text => onMessageReceived(JSON.parse(text)));
                }
            });

            onConnectionEstablished(connection);
        });

        client.connect(process.env.OWNCAST_WS+'/ws?accessToken='+token);

    }).catch((err) => {
        console.error("[owncast] error", err);
        onErrorOrClose();
    });
}

var owncastProtocolChatConnection;

function connect_to_owncast_if_not_connected() {
    console.log('[owncast] owncastProtocolChatConnection === undefined:', owncastProtocolChatConnection === undefined);
    if (owncastProtocolChatConnection === undefined) {
        //chat connection just for listening
        owncastChatConnect("multistream protocol droid", (connection) => {
            //connection established
            owncastProtocolChatConnection = connection;
        }, (message) => {
            //message received
            console.log("[owncast] Received: '" + JSON.stringify(message) + "'");
            //user joins:
            //Received: '{"id":"dZl60kLng","timestamp":"2022-02-27T23:37:24.330263605Z","type":"USER_JOINED","user":{"id":"_R_eAkL7g","displayName":"priceless-roentgen2","displayColor":123,"createdAt":"2022-02-27T23:37:24.250217566Z","previousNames":["priceless-roentgen2"]}}'
            //message:
            // Received: '{"body":"hello world","id":"En3e0kY7g","timestamp":"2022-02-27T23:37:28.502353829Z","type":"CHAT","user":{"id":"_R_eAkL7g","displayName":"priceless-roentgen2","displayColor":123,"createdAt":"2022-02-27T23:37:24.250217566Z","previousNames":["priceless-roentgen2"]},"visible":true}'
            
            //simplified: {"body": "hello world", "user": {"displayName": "priceless-roentgen"}}
            if ("body" in message && "user" in message && "displayName" in message.user) {
                var name = message.user.displayName;
                var text = message.body;
                iosend(name, text);
            }
        }, () => {
            //error/close
            if (owncastProtocolChatConnection != undefined) {
                owncastProtocolChatConnection.close();
                owncastProtocolChatConnection = undefined;
            }
        });
    }
    //  else {
    //     axios.post(process.env.OWNCAST_URL+'/api/status').then((res) => {
    //         console.log(`Status: ${res.status}`);
    //         console.log('Body:', res.data);
            
    //         var isOnline = res.data.online;

    //         if (!isOnline) {
    //             owncastProtocolChatConnection.close();
    //             owncastProtocolChatConnection = undefined;
    //         }
    //     }).catch((err) => {
    //         console.error(err);
    //     });
    // }
}


owncastWebSockets = {};
owncastPending = new Set();
owncastQueue = {};

function sendQueue(connection, queue) {
    while(queue.length > 0) {
        var text = queue.shift()
        connection.sendUTF(JSON.stringify({"body": text, "type":"CHAT"}));
    }
}

function owncastSend(name, text) {
    // return iosend(name, text); //for testing
    if (owncastQueue[name] == null) {
        owncastQueue[name] = [];
    }
    owncastQueue[name].push(text);

    if (name in owncastPending) {
        return;
    }

    if (name in owncastWebSockets) {
        sendQueue(owncastWebSockets[name], owncastQueue[name]);
        return;
    }

    owncastPending.add(name); //mark as pending to avoid double registration

    owncastChatConnect(name, (connection) => {
        //connection established
        owncastWebSockets[name] = connection;
        sendQueue(connection, owncastQueue[name]);
        owncastPending.delete(name);
        // connection.close();
    }, (message) => {
        //message received
    }, () => {
        //error/close
        owncastPending.delete(name);
    });
}

//twitch chat stuff
dotenv.config({ path: '/srv/secret-twitch.env' }) //bot API key and other info
//the /srv/secret-twitch.env file should look like:
//TWITCH_BOT_USERNAME=jjvanvan (or create a second account for the bot)
//TWITCH_BOT_OAUTH_TOKEN=oauth:blah blah blah
//TWITCH_BOT_CHANNEL=jjvanvan

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

console.log(`[twitch] TWITCH_ENABLE=${process.env.TWITCH_ENABLE}`)
if (process.env.TWITCH_ENABLE === 'true') {
    // Register our event handlers (defined below)
    client.on('message', onMessageHandler);
    client.on('connected', onConnectedHandler);
    // Connect to Twitch:
    client.connect();
}

// Called every time the bot connects to Twitch chat
function onConnectedHandler (addr, port) {
    console.log(`[twitch] connected to ${addr}:${port}`);
}
// Called every time a message comes in
function onMessageHandler (target, context, msg, self) {
    console.log(`[twitch] TARGET: ${target} SELF: ${self} CONTEXT: ${JSON.stringify(context)}`)
    console.log(`[twitch] ${context.username}: ${msg}`)

    // Ignore whispers
    if (context["message-type"] === "whisper") { return; }

    //copy twitch chat to owncast chat, which comes back to socket chat
    // iosend(context.username, msg);
    owncastSend(context.username, msg);

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
        client.say(process.env.TWITCH_BOT_CHANNEL, `You rolled a ${num}`);
    } else if (commandName === '!boggle') {
        client.say(process.env.TWITCH_BOT_CHANNEL, `play boggle at https://jjv.sh/boggle`);
    } else if (commandName === '!carl' || commandName === '!CARL') {
        const url = 'https://games.jjv.sh/carl_api';
        const request = https.request(url, (response) => {
            let data = '';
            response.on('data', (chunk) => {
                data = data + chunk.toString();
            });
            response.on('end', () => {
                // const body = JSON.parse(data);
                console.log("[bot] CARL: ", data);
                client.say(process.env.TWITCH_BOT_CHANNEL, `CARL says: ${data} (https://jjv.sh/carl)`);
            });
        })
        request.on('error', (error) => {
            console.log('An error', error);
        });
        request.end();
    } else {
        valid = false;
        console.log(`[bot] Unknown command ${commandName}`);
    }

    if (valid) {
        console.log(`[bot] Executed ${commandName} command`);
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
//DLIVE_BOT_CHANNEL=jjvanvan
// console.log("DLIVE_BOT_SECRET " + process.env.DLIVE_BOT_SECRET);
// console.log("DLIVE_BOT_CHANNEL " + process.env.DLIVE_BOT_CHANNEL);
const bot = new Dlive(process.env.DLIVE_BOT_CHANNEL, process.env.DLIVE_BOT_SECRET);

// Monitor for 'ChatText' events
bot.on('ChatText', msg => {
    // Log every message recieved to the console
    console.log(`[dlive] ${msg.sender.displayname}: ${msg.content}`);

    //copy dlive chat to owncast, which forwards to socket chat
    // iosend(msg.sender.displayname, msg.content);
    owncastSend(msg.sender.displayname, msg.content);

    handleCommand(msg.content);

    //TODO bot.sendMessage is broken
    // If someone says "hello" in our stream, greet then with a message
    // if (msg.content.toLowerCase() === 'hello') {
    //     bot.sendMessage(`Hi there ${msg.sender.displayname}! Welcome to the stream`);
    // }
});


//youtube live chat stuff
dotenv.config({ path: '/srv/secret-youtube.env' }) //bot API key and other info
//the /srv/secret-youtube.env file should look like:
//YOUTUBE_CHANNEL_ID=UCmrLaVZneWG3kJyPqp-RFJQ (this is my channel ID, as in https://www.youtube.com/channel/UCmrLaVZneWG3kJyPqp-RFJQ)
//YOUTUBE_API_KEY=blah blah blah
// console.log("YOUTUBE_CHANNEL_ID " + process.env.YOUTUBE_CHANNEL_ID);
// console.log("YOUTUBE_API_KEY " + process.env.YOUTUBE_API_KEY);

var yt = new LiveChat({channelId: process.env.YOUTUBE_CHANNEL_ID}) //note: does not need the API key

// Emit at start of observation chat.
// liveId: string
yt.on("start", (liveId) => {
    console.log("[youtube] chat connection started!");
    console.log(liveId);
    iosend("youtube", "connected");
})
  
// Emit at end of observation chat.
// reason: string?
yt.on("end", (reason) => {
    console.log("[youtube] chat connection ended");
    console.log(reason);
    iosend("youtube", "disconnected");
})
  
// Emit at receive chat.
// chat: ChatItem
yt.on("chat", (chatItem) => {
    // console.log(chatItem);
    var author = chatItem.author.name;
    var message = undefined;
    chatItem.message.forEach(m => {
        if (m.text !== undefined) {
            message = m.text;
            /*
            { text: 'asdf' }
            */
        } else {
            if (m.emojiText !== undefined) {
                message = m.emojiText;
            }
            /*
            {
                url: 'https://yt3.ggpht.com/m6yqTzfmHlsoKKEZRSZCkqf6cGSeHtStY4rIeeXLAk4N9GY_yw3dizdZoxTrjLhlY4r_rkz3GA=w24-h24-c-k-nd',
                alt: ':yt:',
                isCustomEmoji: true,
                emojiText: ':yt:'
            }

            OR

            {
                url: 'https://www.youtube.com/s/gaming/emoji/0f0cae22/emoji_u1f600.svg',
                alt: ':grinning_face:',
                isCustomEmoji: false,
                emojiText: '😀'
            }
            */
        }
    });

    console.log(`[youtube] ${author}: ${message}`);
    if (message !== undefined) {
        // iosend(author, message)
        owncastSend(author, message);
        handleCommand(message);
    }
})
  
// Emit when an error occurs
// err: Error or any
yt.on("error", (err) => {
    console.error("[youtube] chat connection ERROR");
    console.log(err);
    iosend("youtube", `${err}`);
})

async function connect_to_youtube_if_not_connected() {
    console.log("[youtube] trying to connect to chat...");
    iosend("youtube", "trying to connect...");

    // Stop fetch loop
    yt.stop()

    // Start fetch loop
    const ok = await yt.start()
    if (!ok) {
        console.error("[youtube] falied to connect to chat");
        iosend("youtube", "falied to connect to chat");

    }
}




//start the http server
var default_port = 8080;
server.listen(process.env.PORT || default_port, () => {
    console.log('listening on *:' + (process.env.PORT || default_port));
});

//TODO create a more robust system instead of sending messages to owncast and back
//TODO merge with owncast: twitch/youtube/dlive connection, popout/transparent chat

//TODO clean up the CSS, make text look good
//TODO add cards instead of links
//TODO only change nickname when email is provided
//TODO save nickname with cookies
//TODO add a README with setup instructions and change package name and version
//TODO favicon
//TODO use flexbox for CSS?
//TODO obs overlay
//TODO !carl command pass in the rest of the message to the CARL API
//TODO unify the commands
//TODO unify the secret keys
//TODO look at https://github.com/emad-elsaid/restreamer
//TODO look at https://openstreamingplatform.com/
//TODO look at https://github.com/owncast/owncast
