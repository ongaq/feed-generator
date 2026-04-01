# syntax = docker/dockerfile:1

# Adjust NODE_VERSION as desired
ARG NODE_VERSION=20.18.3
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Node.js"

# Node.js app lives here
WORKDIR /app

# Set production environment
ENV NODE_ENV="production"

# Enable corepack for Yarn
RUN corepack enable


# Throw-away build stage to reduce size of final image
FROM base AS build

# Install packages needed to build node modules
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3

# Install node modules
COPY .yarnrc.yml package.json yarn.lock ./
COPY .yarn ./.yarn
RUN yarn install --immutable

# Copy application code
COPY . .

# Build application
RUN yarn run build

# Note: devDependencies only contains @flydotio/dockerfile, keeping all deps for simplicity


# Final stage for app image
FROM base

# Install sqlite3 CLI for maintenance
RUN apt-get update -qq && apt-get install -y sqlite3 && rm -rf /var/lib/apt/lists/*

# yarn 4.1.0をcorepackにプリインストール（起動時のダウンロードを回避）
RUN corepack prepare yarn@4.1.0 --activate

# Copy built application
COPY --from=build /app /app

# Setup sqlite3 on a separate volume
RUN mkdir -p /data
VOLUME /data

# Start the server by default, this can be overwritten at runtime
EXPOSE 3000
CMD [ "yarn", "run", "start" ]
