#!/bin/sh
cd /srv/owncast
./owncast -rtmpport 1936 -webserverport 8081 &
cd -
service stunnel4 start #rtmp -> rtmps proxy
nginx #runs as a daemon
node server.js
