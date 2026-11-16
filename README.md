# Kerala Ayurveda Store: setup (about 20 minutes)

## 1. Database (Supabase, free)
1. Create a project at supabase.com.
2. SQL Editor -> New query -> paste all of `schema.sql` -> Run. This creates the tables and loads the 100 products.
3. Project Settings -> Database -> copy the connection string (URI). Use the "Session pooler" one if offered. Replace [YOUR-PASSWORD] with your database password.

## 2. Run on your computer (optional test)
    npm install
    DATABASE_URL="<your connection string>" ADMIN_EMAILS="you@example.com" npm start
Open http://localhost:3000. Register with your admin email (see ADMIN_EMAILS below); the Admin button then appears.

## 3. Put it online (Render, free)
1. Upload this folder to a GitHub repository.
2. render.com -> New -> Web Service -> pick the repo. Build command: `npm install`. Start command: `npm start`.
3. Environment variables: `DATABASE_URL` (from step 1) and `ADMIN_EMAILS` (see below). `ADMIN_KEY` is no longer used.
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

## UPI QR payment, address, product details, offers (new)
1. Run `migration_upi_orders.sql` once in Supabase (SQL Editor). New database: run `schema.sql`, then this file.
2. Put your UPI QR image in the `public` folder named `upi-qr.png`.
3. Render -> Environment, add: `UPI_ID` (your UPI ID, e.g. name@bank), `UPI_NAME` (shop name), `OWNER_EMAIL` (where new-order emails go, optional).
4. How an order works: customer enters address -> scans your QR and pays -> enters the UPI transaction ID (UTR) -> order shows as "Awaiting verification". Check your bank/UPI app, then Admin -> Orders -> "Mark payment received". Only then can you set Packed / Shipped / Delivered. "Reject" cancels the order.
5. Admin -> Products -> "Details" lets you write each product's description and how-to-use/dosage (copy from the manufacturer's label).
6. Admin -> Coupons: code, % off, minimum order, offer text, expiry date, and "Show on store" (shows the offer as a clickable tag under the header).

## Stock, server-saved cart, real admin login, keep-alive (new)
1. Database: run `migration_all.sql` ONCE in Supabase (SQL Editor). It includes the earlier UPI/address migration and is safe to run again. Run it BEFORE you upload the new server.js. New database: run `schema.sql`, then `migration_all.sql`.
2. Admin: in Render -> Environment set `ADMIN_EMAILS` to your own email (several: separate with commas). Register on the store with that email, verify it, and the Admin button appears for that account only. Delete the old `ADMIN_KEY` variable.
3. Stock: every product has a stock number (Admin -> Products). Orders reduce it; rejecting or cancelling an order gives it back. Customers see "Only X left" / "Out of stock" and cannot add more than is available.
4. Cart: saved on the server for signed-in customers and restored on any device. Prices include 12% GST (shown as information in the cart).
5. Keep-alive (free Render sleeps after 15 minutes idle): create a free monitor at uptimerobot.com -> HTTP(s) monitor for `https://YOUR-SITE.onrender.com/api/health`, interval 5 minutes. `/health` answers without the database; `/api/health` also touches the database.
