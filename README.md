# WC2026 Prediction Pool

This project is a web application for a "WC2026 Prediction Pool". It features a React-based frontend built with Vite and TypeScript, which connects to a Supabase backend to retrieve and store data (like wallets and matches). It is configured to be deployed on Netlify.

## Project Structure

Here is an overview of the key files and directories in this repository:

### Application Core
- **`package.json`**: Defines the project's metadata, dependencies (React, React Router, Supabase JS, React Query, Lucide React), and npm scripts (`dev`, `build`, `lint`, `preview`).
- **`vite.config.ts`**: The configuration file for Vite, which is used as the frontend build tool and development server. It uses the React plugin.
- **`tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`**: TypeScript configuration files that dictate how the TypeScript code is compiled and what rules it follows.
- **`src/`**: The main directory containing the frontend application source code. It includes:
  - `App.tsx` and `main.tsx`: The main entry points for the React application.
  - `index.css`: The primary stylesheet.
  - `components/`: Contains reusable React components.
  - `lib/`, `types/`, `assets/`: Auxiliary directories for utilities, TypeScript type definitions, and static assets.
- **`public/`**: Directory for static assets that are served directly without being processed by Vite.
- **`index.html`**: The main HTML file that serves as the entry point for the Vite application.
- **`netlify.toml`**: The configuration file for deploying the application on Netlify. It specifies the build command (`npm run build`), the publish directory (`dist`), and redirect rules for client-side routing.

### Backend Testing Scripts
There are several scripts written in JavaScript, TypeScript, and Python used to test the Supabase connection and verify that the database tables/endpoints are working correctly:

- **`test.js` & `test.ts`**: Node.js scripts using the `@supabase/supabase-js` client to connect to the database and query the `matches` table, ordering by kickoff time. They rely on a `.env` file for credentials.
- **`test_endpoints.py`**: A Python script that uses raw HTTP requests to test various Supabase REST endpoints, checking the availability of tables like `matches` and `WC26` across different schemas.
- **`test_supabase.py`**: A Python script testing the `/rest/v1/wallets` endpoint on Supabase, querying for balances, participant IDs, and participant details.
- **`test_supabase_france.py`**: A Python script that queries the `matches` endpoint to specifically look for a match between "France" and "Germany".

## Running the Application

To start the development server, run:
```bash
npm install
npm run dev
```

## Environment Variables

To run the testing scripts (`test.js` and `test.ts`), you will need an `.env` file in the root directory containing your Supabase credentials:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```
