FROM node:18-alpine

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy app source
COPY . .

# Create logs directory
RUN mkdir -p logs

# Expose API port
EXPOSE 3001

# Start the application
CMD ["npm", "start"]

