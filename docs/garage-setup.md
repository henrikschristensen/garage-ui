# Setting Up a Garage Cluster

This guide walks you through setting up a local Garage cluster using Docker Compose for use with Garage UI.

If you already have a running Garage cluster, skip this and go straight to the [Quick Start](../README.md#quick-start).

## Prerequisites

- Docker & Docker Compose

## 1. Start Garage

From the garage-ui repository root:

```bash
docker compose up -d garage
sleep 10
```

## 2. Initialize the Cluster Layout

```bash
# Assign the node to a zone with 1GB capacity
docker compose exec garage garage layout assign -z dc1 -c 1G $(docker compose exec garage garage node id -q)

# Apply the layout
docker compose exec garage garage layout apply --version 1
```

## 3. Create an Admin Key

```bash
docker compose exec garage garage key create admin-key
```

Save the **access key** and **secret key** from the output — you'll need them for configuration.

## 4. Configure Garage UI

Copy the example config and fill in your Garage endpoints and admin token:

```bash
cp config.example.yaml config.yaml
```

The `admin_token` can be found in your `garage.toml` file. See [Garage Configuration](../README.md#garage-configuration) for the required `garage.toml` settings.

## 5. Start Garage UI

```bash
docker compose up -d garage-ui
```

Access Garage UI at http://localhost:8080

## Next Steps

- [Configuration reference](../config.example.yaml) for all available options
- [Garage official documentation](https://garagehq.deuxfleurs.fr/documentation/) for advanced Garage setup