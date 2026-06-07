# Stage 1: Build the React application
FROM node:18-alpine AS build

# Set working directory inside container
WORKDIR /app

# Copy package configurations
COPY package.json package-lock.json* ./

# Install packages
RUN npm install

# Copy source code files
COPY . .

# Build React production static files
RUN npm run build

# Stage 2: Serve compiled files using Nginx
FROM nginx:alpine

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled static assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Expose Nginx port
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
