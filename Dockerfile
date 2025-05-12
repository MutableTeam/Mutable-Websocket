FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Copy TypeScript configuration
COPY tsconfig.json ./

# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build

# Expose the port your app runs on
EXPOSE 8080

# Command to run the application
CMD ["node", "dist/server.js"]
