# Database Triggers Example

This example demonstrates how to listen to PostgreSQL database events (using `LISTEN` / `NOTIFY`) and automatically trigger a Jules session when an event occurs.

This pattern is highly useful for event-driven workflows, such as automatically generating or refactoring code when schema definitions change or synchronizing state with an AI agent.

## Prerequisites

- Ensure you have [Bun](https://bun.sh/) installed, or another compatible runtime like Node.js.
- Ensure you have a running PostgreSQL database (e.g., local, Supabase, or ElephantSQL).
- Ensure your `JULES_API_KEY` is set as an environment variable.

## Setup & Running the Example

1. Start your local database or get your PostgreSQL connection string. Set the environment variable if you aren't using a default local Postgres instance:

   ```bash
   export DATABASE_URL=postgres://user:password@localhost:5432/my_database
   ```

2. Install dependencies:

   ```bash
   bun install
   ```

3. Run the script:

   ```bash
   bun run index.ts
   ```

   The script will connect to the database and start listening to the `user_updates` channel.

4. Trigger a notification from PostgreSQL:

   Connect to your database via `psql` (or another SQL client) and execute the following SQL command to simulate a trigger event:

   ```sql
   NOTIFY user_updates, '{"event": "user_created", "id": 123, "email": "newuser@example.com"}';
   ```

5. The terminal running `index.ts` will capture the event, log it, and start a new Jules session.

## Notes

- In a real-world application, you would attach a PostgreSQL `TRIGGER` to a table, which calls a function that performs the `pg_notify` automatically when rows are `INSERT`, `UPDATE`, or `DELETE`.
- You can adapt the `source` in `index.ts` to attach the agent to a specific GitHub repository instead of running a Repoless session.
