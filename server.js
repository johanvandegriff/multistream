var express = require('express');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

app.get('/', (req, res) => {res.sendFile(__dirname + '/index.html')});
app.get('/jquery.js', (req, res) => {res.sendFile(__dirname + '/node_modules/jquery/dist/jquery.js')});
app.get('/color-hash.js', (req, res) => {res.sendFile(__dirname + '/node_modules/color-hash/dist/color-hash.js')});
app.get('/video.js', (req, res) => {res.sendFile(__dirname + '/node_modules/video.js/dist/video.js')});
app.get('/video-js.css', (req, res) => {res.sendFile(__dirname + '/node_modules/video.js/dist/video-js.css')});

app.use('/static', express.static('static'));
app.use('/live', express.static('live'));

io.on('connection', (socket) => {
    console.log('a user connected');
    socket.on('disconnect', () => {
        console.log('user disconnected');
    });

    socket.on('chat message', (msg) => {
        console.log('message: ' + msg.name + ": " + msg.text);
        io.emit('chat message', msg);
        //emit the message many times for testing CSS
        // msg.text = msg.text+msg.text+msg.text+msg.text+msg.text+msg.text+msg.text+msg.text+msg.text+msg.text+msg.text+msg.text+msg.text+msg.text;
        // for (i=0; i<30; i++) {
        //     io.emit('chat message', msg);
        // }
    });
});

var default_port = 8080;
http.listen(process.env.PORT || default_port, () => {
    console.log('listening on *:' + (process.env.PORT || default_port));
});

//TODO clean up the CSS, make text look good
//TODO add cards instead of links
//TODO pull twitch chat
//TODO only change nickname when email is provided
//TODO save nickname with cookies
//TODO add a README with setup instructions
//TODO favicon
//TODO use flexbox for CSS?
