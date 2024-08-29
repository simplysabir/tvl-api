# TVL API

This API calculates and stores the Total Value Locked (TVL) of Realms, i.e., the total value of SOL and SPL tokens kept in the treasury of all the DAOs in USD value. It fetches and stores the data in a PostgreSQL database, updating it daily through a scheduled job.

## Features

- Fetches the total value of SOL and SPL tokens for DAOs.
- Stores the data in a PostgreSQL database.
- Provides endpoints to retrieve the latest TVL and trigger manual updates.
- Scheduled cron job for daily TVL updates.

## Technologies Used

- [NestJS](https://nestjs.com/): A progressive Node.js framework for building efficient and scalable server-side applications.
- [PostgreSQL](https://www.postgresql.org/): An open-source relational database management system.
- [Solana Web3.js](https://solana-labs.github.io/solana-web3.js/): A library for interacting with the Solana blockchain.
- [Axios](https://axios-http.com/): A promise-based HTTP client for the browser and Node.js.

## Prerequisites

- [Node.js](https://nodejs.org/) v14 or later
- [PostgreSQL](https://www.postgresql.org/) installed and running

## Environment Variables

Create a `.env` file in the root directory and set the following variables:

```plaintext
PORT=3000                  # API port
RPC_URL=https://api.mainnet-beta.solana.com # Solana RPC URL
HOST=localhost             # PostgreSQL host
DB_PORT=5432               # PostgreSQL port
USER=your_db_user          # PostgreSQL user
PASSWORD=your_db_password  # PostgreSQL password
DATABASE=your_db_name      # PostgreSQL database name
```

 ## Installation
### Clone the repository:

```bash
git clone https://github.com/yourusername/tvl-api.git
cd tvl-api
```
### Install dependencies:

```bash
yarn install
Run the database migration to create the necessary tables:

The tables are automatically created on the first run of the application.
```

### Start the application:

```bash
yarn start
``` 

## API Endpoints

### Base URL

```bash
The API base URL is determined by your server configuration, defaulting to http://localhost:3000.
```

### GET /tvl/latest
```bash
Retrieve the latest Total Value Locked (TVL) data from the database.

URL: /tvl/latest

Method: GET

Response:

200 OK: Returns the latest TVL data.
500 Internal Server Error: An error occurred while fetching the data.
Example Response:

{
  "totalValueUsd": 1000000.50,
  "lastUpdated": "2024-08-12T00:00:00.000Z"
}
```

### GET /tvl/update
```bash
Manually trigger the TVL update process.

URL: /tvl/update

Method: GET

Response:

200 OK: Indicates that the TVL update was initiated.
500 Internal Server Error: An error occurred while initiating the update.
Example Response:

{
  "message": "TVL update initiated"
}
```

### GET /tvl/latest/:governanceId
```bash
Gives total value associated with the governance id

URL: /tvl/latest/:governanceId

Method: GET

Response:

200 OK: Indicates that the TVL data sent
500 Internal Server Error: An error occurred while calculating.
Example Response:

{
    "daoGovernanceProgramId": "GMnke6kxYvqoAXgbFGnu84QzvNHoqqTnijWSXYYTFQbB",
    "totalValue": "130261.54"
}
```

### GET /
```bash
Basic health check endpoint to verify the API is running.

URL: /

Method: GET

Response:

200 OK: Returns a simple welcome message.
Example Response:

Hello World!
```

### GET /health
```bash
Health check endpoint to confirm API operational status.

URL: /health

Method: GET

Response:

200 OK: Returns a message confirming API health.
Example Response:

API is up and running!
```

## Scheduled Tasks
```bash
The API includes a scheduled task that automatically updates the TVL data every day at 1 AM.

Schedule: Daily at 1 AM
Configuration: Managed by @nestjs/schedule
```

## Configuration
```plaintext
The application uses a configuration service that reads environment variables to set up the database connection and other necessary settings. Ensure that your .env file is properly configured before running the application.
```

## Troubleshooting
```plaintext
If you encounter issues starting the server or connecting to the database:

Ensure PostgreSQL is running and the connection details in your .env file are correct.
Check for any error logs in the terminal where you are running the application.
Verify that your Solana RPC URL is accessible.
```