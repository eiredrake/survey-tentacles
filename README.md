# Survey Tentacles

Survey Tentacles is a self-hosted survey application designed as a lightweight
alternative to hosted survey platforms.

It uses Authentik for authentication and is distributed as a Docker container.

## Features

- Authentik OIDC authentication
- Scheduling polls
- Short-text questions
- Required and optional questions
- Participant tracking
- Survey status management
- Response/results views
- Social-media and Discord link previews
- PostgreSQL persistence
- Docker deployment

## Requirements

To run Survey Tentacles you need:

- Docker with Docker Compose
- An Authentik instance with an OAuth2/OIDC provider configured
- A public URL or reverse proxy if the application will be accessed externally

## Installation

### 1. Download the deployment files

Download the contents of the `infra` directory from this repository.

You will need:

- `docker-compose.yml`
- `.env.example`

Place them together in a directory on the Docker host.

### 2. Create the environment file

Copy:

    .env.example

to:

    .env

Edit `.env` and provide the appropriate values:

    TENTACLES_USERNAME=tentacles
    TENTACLES_PASSWORD=your_database_password

    AUTHENTIK_CLIENT_ID=your_authentik_client_id
    AUTHENTIK_CLIENT_SECRET=your_authentik_client_secret
    AUTHENTIK_ISSUER_URI=https://auth.example.com/application/o/tentacles/

    TENTACLES_PUBLIC_BASE_URL=https://tentacles.example.com

`TENTACLES_PASSWORD` should be changed to a strong password.

Do not commit your `.env` file to source control.

### 3. Start Tentacles

From the directory containing `docker-compose.yml` and `.env`:

    docker compose up -d

Docker will download:

- Survey Tentacles
- PostgreSQL 17

and create the persistent database volume automatically.

Tentacles will be available on port:

    8080

For example:

    http://localhost:8080

For a public installation, configure your reverse proxy to forward requests
to port 8080.

## Updating

To download the currently configured container version:

    docker compose pull

Then recreate the containers:

    docker compose up -d

Database data is stored in a Docker volume and will persist when containers
are recreated.

Do not use:

    docker compose down -v

unless you intentionally want to delete the Tentacles database.

## Building From Source

The production Docker image is built from the Dockerfile located at:

    backend/Dockerfile

To build the application locally instead of using the published container:

    docker build -t survey-tentacles ./backend

## Container Image

The official container image is published through GitHub Container Registry:

    ghcr.io/eiredrake/survey_tentacles:v1.0.0

## License

Survey Tentacles is licensed under the Apache License 2.0.

See `LICENSE` for details.