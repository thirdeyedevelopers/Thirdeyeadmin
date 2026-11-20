# Third Eye Admin

Admin dashboard for the Third Eye app. It shows users, live activity, feature usage and service health, read from Firestore project `third-eye-teja-9a22c`.

Live site: https://thirdeyedevelopers.github.io/Thirdeyeadmin/

## Where the data comes from

The Android app stores nothing itself. Each Third Eye Cloud Function records a small usage entry when it runs. Photos, text, questions and locations are never recorded.

| Collection | Contents |
|---|---|
| `usage/{id}` | One entry per request: uid, feature, function, action, ok, ms, errCode, at. Deleted after 90 days. |
| `users/{uid}` | firstSeen, lastSeen, lastFeature, calls, errors, and a count per feature |
| `daily/{YYYY-MM-DD}` | Daily totals in India time: calls, errors, activeUsers, msTotal, `f.<feature>`, `h.<hour>` |
| `admins/{email}` | Who can sign in to this dashboard |

The `adminSummary` callable function returns the total number of app sign-ins from Firebase Auth.

Cash Reader runs offline, so its use is not counted.

## Access

- Sign-in is with Google.
- Only emails that have a document in `admins/` get in. Use the lowercase email as the document ID.
- Firestore rules block every write from the browser, and allow reads only for admins.

## One-time setup

1. In Firebase console, add a **Web app** called "Third Eye Admin". Paste its config into `src/firebaseConfig.ts`.
2. Under Authentication → Sign-in method, enable **Google**.
3. Under Authentication → Settings → Authorized domains, add `thirdeyedevelopers.github.io`.
4. In Firestore, create the collection `admins` with a document named after your email, containing `role: "owner"`.
5. In the GitHub repo, go to Settings → Pages → Source and choose **GitHub Actions**.

## Develop

```
npm install
npm run dev
```

Every push to `main` builds the site and publishes it to GitHub Pages.
