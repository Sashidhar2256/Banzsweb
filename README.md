# ASIC Flow Workshop

Production-ready static website for **BANZS Semiconductor / Backend Physical Design Workshop** with a premium gold and black semiconductor academy theme.

## Files

- `index.html` - app shell, navigation, CSP, and page mount
- `style.css` - responsive dark/gold visual system, 3D chip, wafer, circuit grid, cards, forms
- `script.js` - single-page routing, protected routes, graded assessments, progress saving, waveform lab, 3D semiconductor explorer
- `modules.js` - ASIC module library, backend physical design topics, assignments
- `levels.js` - 100-level Explore Academy curriculum
- `firebase.js` - Firebase Auth, Firestore progress/results storage, interest forms, logout, local demo fallback

## Run locally

Use any static server from this folder:

```bash
python3 -m http.server 5173
```

Then open:

```text
http://localhost:5173
```

## Firebase setup

Create a Firebase project, enable Authentication, and enable these providers:

- Phone
- Email/password
- Google

Create a Firestore database and a collection named:

```text
interestedUsers
```

Replace the placeholders in `firebase.js`:

```js
const firebaseConfig = {
  apiKey: "VITE_FIREBASE_API_KEY",
  authDomain: "VITE_FIREBASE_AUTH_DOMAIN",
  projectId: "VITE_FIREBASE_PROJECT_ID",
  storageBucket: "VITE_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "VITE_FIREBASE_MESSAGING_SENDER_ID",
  appId: "VITE_FIREBASE_APP_ID"
};
```

No-code option:

1. Open the site.
2. Go to `Login`.
3. Paste the Firebase web config object into **Add Firebase config**.
4. Click **Save Firebase Config**.
5. The site reloads and uses real Firebase mode.

Alternative: set the same object at runtime before `script.js` loads:

```html
<script>
  window.FIREBASE_CONFIG = {
    apiKey: "...",
    authDomain: "...",
    projectId: "...",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "..."
  };
</script>
```

Add your deployment domain to Firebase Authentication authorized domains.

The app stores authenticated data under:

```text
users/{uid}/progress/{levelNumber}
users/{uid}/assignmentResults/{autoId}
interestedUsers/{autoId}
phoneLeads/{autoId}
```

If Firebase config is still placeholder text, the app runs in local demo mode so the UI can be tested. That local mode is not a production backend; add Firebase config for real cloud auth and persistence.

## Recommended Firestore security rules

Use the admin email:

```text
besthasasidhar99@gmail.com
```

Suggested rules:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() {
      return request.auth != null;
    }

    function isAdmin() {
      return isSignedIn() && request.auth.token.email == 'besthasasidhar99@gmail.com';
    }

    match /users/{userId}/progress/{levelId} {
      allow read, write: if isSignedIn() && request.auth.uid == userId;
    }

    match /users/{userId}/assignmentResults/{resultId} {
      allow read, write: if isSignedIn() && request.auth.uid == userId;
    }

    match /interestedUsers/{docId} {
      allow create: if request.resource.data.fullName is string
        && request.resource.data.email is string
        && request.resource.data.phone is string
        && request.resource.data.level in ['Beginner', 'Intermediate', 'Advanced']
        && request.resource.data.topic is string
        && request.resource.data.message is string;

      allow read, update, delete: if isAdmin();
    }

    match /phoneLeads/{docId} {
      allow create: if request.resource.data.fullName is string
        && request.resource.data.email is string
        && request.resource.data.phone is string
        && request.resource.data.consent == true;

      allow read, update, delete: if isAdmin();
    }
  }
}
```

## What was upgraded

- Email signup, login, logout, persistent Firebase sessions, and protected dashboard/admin/level routes
- Login gate redirects signed-out users before assignments, modules, labs, scenarios, and progress content render
- Mobile number capture stores follow-up leads without requiring SMS OTP
- Gmail import uses Google/Firebase OAuth with the Gmail read-only scope, lists recent messages, and stores selected email metadata under the signed-in user
- All 100 levels include MCQ, fill-in-the-blank, assessment scoring, XP, and checkpoint assessments
- Fundamentals-to-tapeout flow now has interactive circuit/waveform validation per step
- Assignment results and level progress persist to Firestore for authenticated users
- 3D semiconductor interface explains layer focus, routing density, activity, and signoff stress
- Advanced content now covers coupling, SI, IR drop, EM, UPF, ECO, AOCV/POCV, CRPR, and tapeout readiness

## Gmail import setup

The **Open / Connect Google** button requests:

```text
https://www.googleapis.com/auth/gmail.readonly
```

To make Gmail import work:

1. Firebase Console → Authentication → Sign-in method → enable **Google**.
2. Google Cloud Console for the same project → APIs & Services → Library → enable **Gmail API**.
3. Google Cloud Console → OAuth consent screen → add the Gmail read-only scope.
4. Add test users while the app is in testing mode.
5. For public production, Google may require app verification because Gmail scopes are sensitive/restricted.

Only message metadata/snippets selected by the user are saved. Full message bodies are not stored by default.

## Deployment

This app is static and can be deployed to Firebase Hosting, Netlify, Vercel, Cloudflare Pages, or any HTTPS-ready static host.

Security included:

- Content Security Policy in `index.html`
- Firebase config placeholders instead of secrets
- Input length limits and escaping before display
- Protected admin route pattern documented through Firebase rules
- No private keys or service account credentials in frontend code

## Assets

The workspace did not include the referenced uploaded PDF, logo/images, OTP screen reference, or Google Drive asset at generation time. The site is structured so those can be added later:

- Put logo/images beside these files or in an `assets/` folder.
- Replace the text logo in `index.html` with the image.
- Add PDF-derived module details into `modules.js`.
- Replace the generated OTP screen with the provided reference styling if needed.
