FROM tiangolo/nginx-rtmp

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

RUN apt-get update -yq \
     && apt-get -yq install curl gnupg ca-certificates apt-utils \
     && curl -L https://deb.nodesource.com/setup_12.x | bash \
     && apt-get update -yq \
     && apt-get install -yq \
         nodejs

RUN npm install
# If you are building your code for production
# RUN npm ci --only=production

# Bundle app source
COPY . .

EXPOSE 8080

#the script contains both the commands below
CMD ["/var/www/cmd.sh"]
#CMD ["node", "server.js"]
#CMD ["nginx", "-g", "daemon off;"]
