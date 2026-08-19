FROM node:18-slim

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

WORKDIR /app/server

EXPOSE 3006

CMD ["npm", "start"]
