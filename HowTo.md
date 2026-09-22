This project hits the ideal balance for a high-visibility portfolio piece: it showcases full-stack architecture, third-party integrations, and real-time state management, while remaining practically useful for driving revenue as an independent tutor.

To keep the development scope realistic while maximizing showcase potential, leverage **managed infrastructure** for high-complexity domains like WebRTC video streams and payment webhooks.

---

### Architectural Blueprint (MVP)

A modular, full-stack setup leverages modern, developer-friendly primitives:

* **Frontend:** Next.js (React) + TypeScript. Provides server-side rendering for landing pages (SEO) and client-side dynamic routes for student dashboards.
* **Database & Auth:** Supabase (PostgreSQL). Offers built-in auth, row-level security (RLS) for privacy, and instantaneous setup.
* **Video Engine:** Daily.co API (`@daily-co/daily-react`). Managed WebRTC eliminates the need to build a custom Selective Forwarding Unit (SFU) from scratch while retaining full control over custom UI layouts.
* **Scheduling & Payments:** Stripe Billing + Webhooks. Charge for session packages, generate checkout sessions, and gate room creation on payment status.
* **Interactive Math Workspace:** Desmos Graphing Calculator API (`Desmos.GraphingCalculator`). Embeds directly into the session component.

---

### Implementation & Setup Roadmap

#### 1. Setup the GitHub Repository & Environment

Establish clean repository discipline early so prospective employers immediately see structured commit history and professional README scaffolding.

* Initialize repository: `npx create-next-app@latest math-tutoring-platform --typescript --tailwind --app`
* Set up `.env.local` for local secrets (Stripe Keys, Supabase URL/Anon key, Daily.co API Key).
* Add a detailed `README.md` containing an architecture block diagram, setup instructions, and trade-off decisions.

#### 2. Configure the Interactive Math Canvas (Desmos Integration)

Embed the Desmos API directly within a client component inside your video room route.

```tsx
// components/MathCanvas.tsx
"use client";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    Desmos: any;
  }
}

export default function MathCanvas() {
  const calculatorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load Desmos Script dynamically
    const script = document.createElement("script");
    script.src = "https://www.desmos.com/api/v1.9/calculator.js?apiKey=dcb31709b452b149dc269b578d5367f0";
    script.async = true;
    script.onload = () => {
      if (calculatorRef.current && window.Desmos) {
        window.Desmos.GraphingCalculator(calculatorRef.current, {
          expressions: true,
          settingsMenu: false,
        });
      }
    };
    document.head.appendChild(script);
  }, []);

  return <div ref={calculatorRef} className="w-full h-[500px] rounded-lg shadow-md" />;
}

```

#### 3. Integrate Daily.co Managed Video

Wrap your session room using Daily React hooks. Handle dynamic room creation server-side to prevent exposing your private API key to the browser.

* **Backend API Route (`/api/create-room/route.ts`):**
Executes a `POST` request to `[https://api.daily.co/v1/rooms](https://api.daily.co/v1/rooms)` when a session is verified/paid, returning a secure `room_url`.
* **Frontend Component (`components/VideoRoom.tsx`):**
Use `<DailyProvider>` and `useParticipantIds()` to mount streams alongside your `<MathCanvas/>`.

#### 4. Booking & Payment Pipeline

Use Stripe Checkout to avoid complex token handling and compliance:

```
[Student selects time slot] 
       │
       ▼
[Next.js API creates Stripe Checkout Session]
       │
       ▼
[Student pays via Stripe] ─────(Webhook: checkout.session.completed)────► [Database records booking & creates Daily.co room URL]
                                                                                │
                                                                                ▼
  [Email notification sent to student & tutor]

### Key Portfolio & Hiring Strategy

When showcasing this repository on your GitHub profile or referencing it in technical interviews:

* **Highlight Architectural Trade-offs:** In the project README, explicitly document *why* you chose a managed service (Daily.co) over raw WebRTC implementations (cost, browser compatibility, connection retry logic) and *how* state synchronization operates across the Desmos canvas.
* **Demonstrate System Resilience:** Include explicit error handling for webhook failures (idempotency checks) and disconnection recovery strategies.
* **Emphasize Enterprise Concepts:** Structure the code modularly—isolating database calls, payment webhooks, and third-party UI widgets into distinct modules.


Go to GitHub.com and sign in.

In the top right corner, click the + icon and select New repository.

Fill in the initial setup details:

Repository name: math-tutoring-platform (or your preferred name).

Description: "End-to-end online tutoring platform featuring real-time video, interactive math workspace (Desmos), scheduling, and payments."

Visibility: Choose Public (so prospective employers can see your code and architecture).

Initialize this repository with:

Check Add a README file (this gives Codespaces something to anchor to immediately).

.gitignore template: Select Node.

License: Select MIT License (standard for open-source portfolio pieces).

Click Create repository.

On your newly created repository page, click the green <> Code button.

Select the Codespaces tab in the dropdown.

Click Create codespace on main.

Delete README and .gitignore (npx will create them)
In IDE terminal:
npx create-next-app@latest . --typescript --tailwind --app --eslint --src-dir --import-alias "@/*"

# 3. Stage and push your newly created files to GitHub
git add .
git commit -m "feat: initialize Next.js app with TypeScript and Tailwind CSS"
git push origin main

UI icons and layout utilities:
npm install lucide-react

Add code

npm run dev

Get API key from Desmos https://www.desmos.com/my-api

Set up Vercel:
After logging in, click the Install button inside the Import Git Repository card
Select my GitHub account
Choose Only select repositories and pick the gps-tutor repo
Click Install
(Installation did not complete)
Back in Vercel, Configure GitHub to get back to the repo selection
Click Save
Back in Vercel, gps-tutor repo comes up, click Import
Add environment variable NEXT_PUBLIC_DESMOS_API_KEY with the Desmos key
Click Deploy
Continue to Dashboard
