FROM jrottenberg/ffmpeg:5-alpine as ffmpeg

FROM node:16-alpine

WORKDIR /usr/lolisafe
COPY package.json yarn.lock ./

RUN apk add --update \
&& apk add --no-cache ca-certificates expat \
&& apk add --no-cache vidstab-dev --repository=http://dl-cdn.alpinelinux.org/alpine/edge/community \
&& apk add --no-cache --virtual .build-deps git curl build-base python3 g++ make \
&& yarn install --production \
&& yarn cache clean \
&& apk del .build-deps

COPY --from=ffmpeg /usr/local /usr/local

ADD config.sample.js config.js
ADD views/_globals.sample.njk views/_globals.njk

COPY . .
RUN mkdir uploads && mkdir database

CMD ["sh", "-c", "yarn migrate && yarn start"]
