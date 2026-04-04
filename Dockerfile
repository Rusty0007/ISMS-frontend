FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .
ARG BACKEND_URL=http://localhost:8000
ENV BACKEND_URL=${BACKEND_URL}
RUN npm run build

EXPOSE 3000

ENV NODE_ENV=production

CMD ["npm", "start"]
