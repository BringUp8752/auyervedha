# Kerala Ayurveda Store: setup (about 20 minutes)

## 1. Database (Supabase, free)
1. Create a project at supabase.com.
2. SQL Editor -> New query -> paste all of `schema.sql` -> Run. This creates the tables and loads the 100 products.
3. Project Settings -> Database -> copy the connection string (URI). Use the "Session pooler" one if offered. Replace [YOUR-PASSWORD] with your database password.

## 2. Run on your computer (optional test)
    npm install
    DATABASE_URL="<your connection string>" ADMIN_KEY="choose-a-secret" npm start
Open http://localhost:3000. Click Admin and enter your ADMIN_KEY.

## 3. Put it online (Render, free)
1. Upload this folder to a GitHub repository.
2. render.com -> New -> Web Service -> pick the repo. Build command: `npm install`. Start command: `npm start`.
3. Environment variables: `DATABASE_URL` (from step 1) and `ADMIN_KEY` (your secret).
4. Open the Render link. That is your live store.

Notes
- Everything (products, photos, coupons, orders) is stored in your Supabase database. In Supabase: Table Editor shows it, and you can export CSV for Google Drive.
- Photos are stored inside the database (shrunk to 600px).
- Free plans may sleep or pause when unused. Check each site current terms.
- Sign-in is still email-only (no password). Payment is still a demo.
