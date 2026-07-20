# Deploy version 2

1. In Supabase SQL Editor, run `supabase-v2-patch.sql` or rerun the complete `supabase-schema.sql`.
2. Copy this folder over the GitHub repository without copying `node_modules` or another `.git` directory.
3. Commit and push the branch.
4. Deploy that branch in Railway.
5. On the phone, open the PWA while online, close it, and reopen it once so the new service worker takes control.
6. Test one Glucose, one Food and one Event record, then close and reopen the PWA and confirm all three remain.
