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
- Payment is still a demo.

## Customer email verification (new)
Customers register with name, email and password. A 6-digit code is emailed to them; the account only works after they enter it. Only verified customers can sign in and place orders.

1. Existing database: run `migration_email_verification.sql` once in Supabase (SQL Editor). New database: `schema.sql` already includes it.
2. Free email sending (works on free Render, which blocks normal SMTP): create a free account at brevo.com, add and verify your sender address (Senders), then create an API key (SMTP & API -> API Keys).
3. Render -> your service -> Environment: add `BREVO_API_KEY` (the key) and `EMAIL_FROM` (the verified sender address). Save; Render redeploys.
4. Codes expire after 10 minutes, allow 5 attempts, and can be resent after 60 seconds.
