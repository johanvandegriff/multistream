FROM tiangolo/nginx-rtmp
#FROM johanvandegriff/nginx-rtmp-arm64v8:latest

#https://nodejs.org/en/docs/guides/nodejs-docker-webapp/
# Create app directory
WORKDIR /var/www

#livestream data will be put here
RUN mkdir -p /var/www/live

#nginx settings for rtmp stream forwarding
COPY nginx.conf /etc/nginx/nginx.conf

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

#a hack for now to get new enough libc for owncast
RUN echo 'deb http://deb.debian.org/debian buster main non-free contrib' > /etc/apt/sources.list.d/buster.list \
     && apt-get update -yq \
     && apt-get install -yq libc6

# to get rtmps to work:
# https://dev.to/lax/rtmps-relay-with-stunnel-12d3
RUN apt-get install -yq stunnel4
RUN cat <<EOF > /etc/stunnel/stunnel.conf
setuid = stunnel4
setgid = stunnel4
pid=/tmp/stunnel.pid
output = /var/log/stunnel4/stunnel.log
include = /etc/stunnel/conf.d
debug = 7
EOF
RUN echo 'ENABLE=1' >> /etc/default/stunnel4
# add kick rtmp->rtmps proxy
RUN mkdir /etc/stunnel/conf.d/
RUN cat <<EOF > /etc/stunnel/conf.d/kick.conf
[kick]
client = yes
accept = 127.0.0.1:19350
connect = fa723fc1b171.global-contribute.live-video.net:443
verifyChain = no
verifyChain = yes
CApath = /etc/ssl/certs/
EOF
RUN service stunnel4 restart

# https://stackoverflow.com/questions/77021471/deprecation-warning-when-installing-nodejs-on-docker-container-using-nodesource
RUN set -uex; \
    apt-get update; \
    apt-get install -y ca-certificates curl gnupg; \
    mkdir -p /etc/apt/keyrings; \
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
     | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg; \
    NODE_MAJOR=18; \
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" \
     > /etc/apt/sources.list.d/nodesource.list; \
    apt-get -qy update; \
    apt-get -qy install nodejs;

RUN npm install
# If you are building your code for production
# RUN npm ci --only=production

# Bundle app source
COPY . .

EXPOSE 8080
EXPOSE 8081

#the script contains both the commands below
CMD ["/var/www/cmd.sh"]
#CMD ["node", "server.js"]
#CMD ["nginx", "-g", "daemon off;"]
