# Waghmare Digital Solutions — setup guide

This is a frontend starter connected to Supabase. The website can accept authenticated customer requests, upload private project files, display a UPI QR for a quoted amount, collect a UPI transaction reference, and provide an admin workspace.

## 1. Create the Supabase project
1. Create a project at https://supabase.com/.
2. Open **Project Settings → API** (or API Keys).
3. Copy the Project URL and the publishable key (or legacy anon key).
4. Open `app.js` and replace:
   - `YOUR_SUPABASE_PROJECT_URL`
   - `YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY`
5. Never put a `service_role` / secret key in browser JavaScript.

## 2. Create the database
1. In Supabase, open **SQL Editor → New query**.
2. Paste all of `supabase/schema.sql` and run it.
3. The SQL creates tables, row-level security policies and a private `project-files` bucket.

## 3. Create the admin account securely
1. In Supabase Dashboard, open **Authentication → Users** and create/invite the admin email account.
2. Confirm the email if email confirmation is enabled.
3. Copy that user's UUID from the Authentication users list.
4. In SQL Editor run the following, replacing the UUID:
   `insert into public.admin_users(user_id) values ('YOUR_ADMIN_USER_UUID');`
5. Open the website's Admin link and sign in with that Supabase Auth email/password.

The admin password is managed by Supabase Auth. Do not hardcode a password in HTML/JS, commit it to GitHub, or share it. If you previously planned a simple fixed password, do not reuse it as a frontend password.

## 4. Configure authentication
In **Authentication → URL Configuration**, set your local/deployed site URL and add any preview URLs to the redirect allow-list. For a simple email/password flow, use Authentication → Providers → Email. Decide whether email confirmation should be enabled.

## 5. Run locally
Because the site uses JavaScript modules/CDNs and browser auth, run it from a local web server rather than opening the HTML as a file:
- VS Code: install Live Server, right-click `index.html`, choose **Open with Live Server**.
- Or use any static web host.

## 6. Deploy
Upload `index.html`, `style.css`, `app.js`, and `supabase/` to your static hosting/GitHub repository. Add your production domain to Supabase Auth URL configuration.

## 7. UPI payments — important
The configured UPI ID is `8329461513@axl`. The QR is generated in the browser using the confirmed order amount. This is a **payment instruction QR**, not a payment gateway integration. The site cannot independently know whether money arrived. Admin must verify the UPI reference against the bank/UPI app before marking a payment verified.

For automatic payment confirmation, integrate a compliant payment gateway (for example Razorpay) using server-side functions/webhooks. Never trust a screenshot or a customer-submitted reference alone.

## Current starter limitations / recommended next steps
- Admin access is protected by Supabase Auth plus an `admin_users` allow-list and RLS.
- Customers must sign in before submitting orders.
- Quote values are set by the admin; no public customer can change them.
- Files are private in Supabase Storage and limited to 10 MB per file.
- Add email notifications, signed download links, invoice generation and payment gateway webhooks before treating this as a production commerce system.
- The admin dashboard currently lists orders and payment references. Keep admin membership changes in the Supabase dashboard/SQL editor only.
