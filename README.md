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

and create persistent database and survey-image volumes automatically.

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

Database data and uploaded images are stored in separate Docker volumes and persist
when containers are recreated. The application writes images to `/app/uploads`, which
must be mounted to the `tentacles-upload-data` named volume in the Compose file.

Do not use:

    docker compose down -v

unless you intentionally want to delete both the Tentacles database and uploaded images.

## Survey image storage and existing deployments

Use the current Compose file when upgrading: pulling a new application image does
not add a volume mount to an older deployment file. Docker builds require an
explicit persistent mount covering `/app/uploads` and refuse to start without it.
The upload path in Compose is fixed to match the mount. Keep the Compose project
name unchanged so updates reuse the same named volumes.

Before replacing a legacy container that has no upload mount, preserve its images:

    docker cp tentacles:/app/uploads ./survey-image-backup

Update your deployment Compose file to mount `tentacles-upload-data:/app/uploads`.
Restore the backup into that volume before starting the application:

    docker compose run --rm --no-deps --entrypoint sh --volume ./survey-image-backup:/recovery:ro tentacles -c 'cp -an /recovery/. /app/uploads/'
    docker compose up -d

This retains existing files instead of overwriting them. Keep the backup until you
have verified the surveys. Images already discarded with an old container need to
be restored from a backup or uploaded again.

Terminal/IDE runs use the local `uploads` directory by default. That directory and
a Docker volume are separate stores: when using the same database in both modes,
copy the referenced image files as part of switching modes, or configure both to
use a shared bind-mounted directory. Back up the database and image storage together.
Runtime uploads are excluded from new Git additions and Docker build contexts.

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