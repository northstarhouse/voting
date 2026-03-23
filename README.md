# Board Voting

This app now uses Supabase directly from the Vite frontend for topics, votes, and attachment uploads.

## Local setup

1. Copy `.env.example` to `.env`.
2. Set either `VITE_SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY` to your project's public client key.
3. Run the SQL in [supabase/schema.sql](/c:/Users/Thewr/Claude/voting/supabase/schema.sql) in the Supabase SQL editor.
4. Start the app with `npm run dev`.

## Supabase resources used

- `public.topics` stores each voting topic.
- `public.votes` stores one vote per `(topic_id, voter)`.
- `storage` bucket `topic-attachments` stores uploaded files.

## Notes

- The app currently keeps board member names in the frontend, matching the previous behavior.
- The SQL policies in [supabase/schema.sql](/c:/Users/Thewr/Claude/voting/supabase/schema.sql) allow public read/write access with the anon key because the current app has no authentication layer.
- The old Google Apps Script files are still present in the repo, but the frontend no longer calls them.
