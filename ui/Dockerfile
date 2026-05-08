FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* /app/
RUN npm install

COPY . /app

EXPOSE 4200

ENV CHOKIDAR_USEPOLLING=true

CMD ["npm", "run", "start", "--", "--host", "0.0.0.0", "--port", "4200", "--poll", "2000"]

