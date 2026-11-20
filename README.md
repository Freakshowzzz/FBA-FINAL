# TitanMotor Logistics | Enterprise Freight Analytics & Optimization Platform

> **Final Project — Business Analytics & Database Integration System**  
> A full-stack web application integrating a 5-entity relational database with a sequential 3-tier Business Analytics pipeline (*Descriptive*, *Predictive*, and *Prescriptive*) to minimize freight shipping costs for heavy industrial electric motors.

---

## 📌 Executive Summary & Case Problem

**TitanMotor Logistics Corp.** is a nationwide manufacturer of high-torque commercial and industrial electric motors (3-Phase Induction, DC Brushless, Heavy Servo Motors, Explosion-Proof drives). The company operates **3 primary production warehouses** (Chicago, Dallas, Philadelphia) that supply **5 major regional assembly hubs** across North America.

### The Business Challenge
> **Scenario note:** TitanMotor is a hypothetical case study. The figures below come from the bundled, seeded database (120 shipments, May to October 2026), not from a real company's accounts.

Volatile carrier rates, uncoordinated warehouse dispatching, and ad-hoc carrier selection make freight the largest controllable logistics cost for heavy motors. In the seeded history, 120 dispatches cost **\$314,330.78** in total (about **\$52,400 per month** on average, **\$2,619 per shipment**), and monthly spend swings widely, from about \$30,700 in May to about \$65,700 in September, driven by uneven dispatch volume (13 to 25 shipments per month). **10.8%** of shipments were delayed, and the delay rate ranges from 0% (TransCoast) to 25% (ApexHaul), so route and carrier choices also create delivery bottlenecks at client facilities.

### The Solution
This platform addresses the freight overhead dilemma by combining:
1. **Relational Database Management (CRUD):** 5 interconnected SQLite tables with complete foreign keys, tracking warehouses, customer hubs, motor products, carrier routes, and historical shipments (50–120+ records each).
2. **Descriptive Analytics:** Historical KPI telemetry and 4 dynamic Chart.js visualizations illustrating spending distributions, carrier share, monthly trends, and delivery bottlenecks.
3. **Predictive Analytics:** Multiple Linear Regression (OLS) model, fitted on 80% of the shipments and scored on the 20% it never saw (**held-out $R^2 = 0.977$, $\text{MAE} \approx \$119.59$**, 24 test records), with an interactive "What-If" scenario calculator for forecasting freight costs and transit lead times before cargo dispatch.
4. **Prescriptive Analytics:** Operations Research Transportation Problem solver (Vogel's Approximation Method for the starting solution, then MODI u-v iterations to prove optimality) computing the exact optimal distribution matrix. Against a baseline built from TitanMotor's own historical dispatch mix, the optimum costs **\$170,766 versus \$237,132, a saving of \$66,366 (27.99%)** on the current month's demand.

> These figures describe the bundled database. The dashboard computes them live from the API, so they will change if you re-seed or edit the data.

---

## 🚀 Key Features

- **Modern Responsive UI / UX:**
  - Dedicated **Company Landing Page** (`/`) highlighting background, case problem, step-by-step pipeline, and animated technology stack.
  - Interactive **Enterprise Dashboard** (`/dashboard`) directly accessible online for viewing analytics, charts, and mathematical simulations.
  - Native **Dark & Light Mode** toggle with `localStorage` persistence and Chart.js theme adaptation.
  - Smooth anchor-link scrolling with sticky header offset.

- **Authorized Passkey / PIN Protected Database Tab:**
  - Public visitors can freely explore all 3 Business Analytics tiers (Descriptive, Predictive, Prescriptive).
  - Tab 4 (Database Management) is safeguarded behind a security PIN gate to prevent unauthorized tampering or deletion of database records when deployed online.
  - Cryptographic session token verification powered by Node's native `node:crypto` (HMAC-SHA256).
  - Default Authorized Access PIN: **`2026`** *(Configurable in production via `DB_PASSKEY` environment variable)*.
  - Re-lock button and session timeout protection.

- **3-Tier Business Analytics Pipeline:**
  - **Tier 1 — Descriptive:** 6 enterprise KPIs + Spend by Hub (Bar), Carrier Contract Allocation (Doughnut), Monthly Expenditure Trend (Line), and Carrier Delay vs. Transit comparison.
  - **Tier 2 — Predictive:** Interactive What-If simulation form dynamically computing cargo weight, handling fees, and carrier effects using an Ordinary Least Squares (OLS) regression fitted to the shipment history. Delay risk and transit days also come from the data (per-carrier delay rate and a small transit-time regression).
  - **Tier 3 — Prescriptive:** Exact transportation-problem solver (VAM + MODI) generating optimal warehouse-to-hub unit allocation matrices and actionable dispatch route directives, supplied from each warehouse's real `current_inventory`.

- **5-Table Database CRUD Interface:**
  - Live inspection, real-time client-side search filtering, record modal editing, deletion, and addition across all 5 tables:
    - `warehouses` (50 records)
    - `customer_hubs` (50 records)
    - `motor_products` (50 records)
    - `carriers_routes` (50 records)
    - `shipment_transactions` (120 records)

---

## 🛠️ Technology Stack

| Layer | Technologies Used |
|---|---|
| **Runtime & Server** | [Node.js](https://nodejs.org/) (**v22.5 or newer**, required for `node:sqlite`), [Express.js 5](https://expressjs.com/) |
| **Database** | Embedded SQLite3 via native `node:sqlite` (Zero external binary dependency) |
| **Frontend & Styling** | HTML5, Modern Vanilla JavaScript (ES6+ modular architecture), [Tailwind CSS](https://tailwindcss.com/) (CDN), [FontAwesome 6](https://fontawesome.com/) |
| **Data Visualization** | [Chart.js 4](https://www.chartjs.org/) (Interactive HTML5 Canvas) |
| **Analytics Engines** | Custom OLS Regression (normal equations, hold-out validation) + Transportation Problem solver (Vogel's Approximation + MODI) |

---

## 📂 Project Architecture

```
FBA---Final-Project/
├── config/
│   └── database.js             # SQLite database initialization & connection helper
├── controllers/
│   ├── databaseController.js   # PIN verification + generic REST CRUD handlers
│   ├── descriptiveController.js# Aggregates KPIs and chart datasets from SQLite
│   ├── predictiveController.js # Regression options, estimate and model-metrics endpoints
│   └── prescriptiveController.js# Runs the transportation solver
├── data/
│   └── titanmotor_logistics.db # Seeded SQLite database (5 tables, 320+ rows)
├── middlewares/
│   └── dbAuthMiddleware.js     # Requires a valid PIN session token for /api/db/* (except verify-pin)
├── models/
│   └── seeder.js               # Schema creation & 5-table data seeder (npm run seed)
├── public/
│   ├── css/
│   │   └── styles.css          # Custom animations, card hover, and utility styles
│   ├── js/
│   │   ├── api.js              # Centralized fetch client for backend endpoints
│   │   ├── charts.js           # Dynamic Chart.js builders with dark/light themes
│   │   └── app.js              # Dashboard tab routing, CRUD modals, and event handlers
│   ├── dashboard.html          # 4-tab Business Analytics & Database dashboard
│   └── index.html              # Corporate landing page & technology showcase
├── routes/
│   ├── databaseRoutes.js       # /api/db/* (verify-pin, tables, GET/POST/PUT/DELETE records)
│   ├── descriptiveRoutes.js    # /api/descriptive/summary
│   ├── predictiveRoutes.js     # /api/predictive/options, /metrics, /estimate
│   └── prescriptiveRoutes.js   # /api/prescriptive/optimize
├── services/
│   ├── laneService.js          # Distance/rate lookup: exact route, then shipment history, then network-average estimate
│   ├── optimizationService.js  # Builds costs, historical baseline and inputs for the solver
│   ├── pinService.js           # PIN check and HMAC-SHA256 session tokens
│   ├── regressionService.js    # OLS cost model, transit model, delay rates, hold-out validation
│   └── transportSolver.js      # Exact transportation solver (Vogel's Approximation + MODI)
├── package.json                # Project manifest, npm scripts and Node engine requirement
├── server.js                   # Express application entry point
├── START_APP.bat               # One-click Windows startup batch script
├── BUSINESS_ANALYTICS_GUIDE.md # Detailed guide to the 3 analytics tiers
├── ROADMAP.md                  # Project roadmap and implementation progress
└── README.md                   # Project documentation
```

---

## ⚡ Quick Start & Installation

### 1. Prerequisites
Ensure **Node.js v22.5.0 or higher** is installed on your machine (the app uses the built-in `node:sqlite` module, which does not exist in older versions; `package.json` enforces this with an `engines` field).
Verify with:
```bash
node -v
```

### 2. Clone Repository
```bash
git clone https://github.com/<your-username>/FBA---Final-Project.git
cd FBA---Final-Project
```

### 3. Install Dependencies
```bash
npm install
```

### 4. (Optional) Re-Seed Database
The pre-seeded SQLite database is already bundled in `data/titanmotor_logistics.db`. If you wish to reset or re-populate with fresh randomized data:
```bash
npm run seed
```
> Re-seeding replaces the database, so every figure quoted in this README (spend totals, $R^2$, savings) will change. The dashboard always shows the live values.

### 5. Launch the Application
```bash
npm start
```
Or on Windows, simply double-click **`START_APP.bat`**.

Open your browser and navigate to:
- **Landing Page:** [http://localhost:3000](http://localhost:3000)
- **Analytics Dashboard:** [http://localhost:3000/dashboard](http://localhost:3000/dashboard)

---

## 📊 Analytics Methodology Details

### Tier 1: Descriptive Analytics
Computes aggregate metrics from 120 historical shipment dispatches (3 May to 27 October 2026):
- Total Freight Spend (\$314,330.78), Average Cost per Dispatch (\$2,619.42), Motors Shipped (5,444), Average Transit Time (3.3 days) and Delay Rate (10.8%).
- Cross-tabulated distribution across 5 destination hubs and 5 logistics carriers.
- Monthly spend ranges from about \$30,700 (May) to about \$65,700 (September); it follows shipment volume rather than a steady upward trend.

### Tier 2: Predictive Analytics (Multiple Linear Regression)
The model is fitted with Ordinary Least Squares (normal equations) on weight, distance and carrier dummy variables. `ApexHaul Trucking` is the reference carrier (alphabetical first), so every other carrier has an estimated dollar offset:
$$
\text{Freight Cost} = \beta_0 + \beta_{w} \times \text{CargoWeight (kg)} + \beta_{d} \times \text{Distance (km)} + \delta_{\text{carrier}} + \text{HandlingFee}
$$
With the bundled data: $\beta_0 \approx 158.54$, $\beta_w \approx 0.0761$ per kg, $\beta_d \approx 1.1298$ per km. Carrier offsets $\delta$ (USD per shipment, relative to ApexHaul): NationalRail +6.46, SwiftFreight +404.00, Titan Logistics Fleet -281.21, TransCoast -10.08. $\text{HandlingFee}$ is units shipped times the origin warehouse's `handling_fee_per_unit` and is added on top. The live coefficients are shown on the dashboard.

- **Validation:** the shipments are split 80/20 with a fixed seed. The model is fitted on 96 training rows and scored on 24 unseen rows, then refitted on all 120 for production use.
- **Held-out fit ($R^2$):** $0.977$ (training $R^2 = 0.985$, training adjusted $R^2 = 0.984$; full-data fit $R^2 = 0.984$)
- **Held-out Mean Absolute Error (MAE):** $\approx \$119.59\text{ USD}$ (full-data fit: \$106.74). With only 24 test rows, treat these as indicative.
- **Transit days:** a second OLS on distance and carrier (in-sample $R^2 = 0.51$, MAE about 0.8 days). **Delay risk** is each carrier's historical late-shipment rate: ApexHaul 25.0%, SwiftFreight 10.5%, Titan Logistics Fleet 11.1%, NationalRail 8.7%, TransCoast 0.0%.
- **Predictive Inputs:** Origin Warehouse, Customer Destination Hub, Motor Product Type (Unit Weight), Order Quantity, and Logistics Carrier. Route distance comes from `carriers_routes` when the city pair exists, otherwise from shipment history, otherwise from a clearly labelled network-average estimate.

### Tier 3: Prescriptive Analytics (Linear Programming Transportation Problem)
Formulated as:
$$
\min Z = \sum_{i=1}^{m} \sum_{j=1}^{n} c_{ij} x_{ij}
$$
Subject to:
$$
\sum_{j=1}^{n} x_{ij} \le S_i \quad \forall i \in \{1 \dots m\} \quad \text{(Warehouse Supply Constraints)}
$$
$$
\sum_{i=1}^{m} x_{ij} \ge D_j \quad \forall j \in \{1 \dots n\} \quad \text{(Customer Hub Demand Constraints)}
$$
$$
x_{ij} \ge 0 \quad \forall i, j
$$

- **Supply $S_i$** is each warehouse's real `current_inventory` (Chicago 4,482, Dallas 1,807, Philadelphia 3,249 = 9,538 units). **Demand $D_j$** is each hub's `monthly_demand_units` (3,111 units across the 5 hubs), so demand is fully met. If inventory were ever short, the shortfall is reported as unmet demand rather than invented supply.
- **Unit costs $c_{ij}$** are derived from lane distance, the lane's base rate per km and the origin's handling fee. Of the 15 lanes, 3 have an exact route in `carriers_routes`, 3 are taken from shipment history, and 9 are network-average estimates (flagged `*` and `†` on the dashboard), so treat lane costs as approximate.
- **Solver:** Vogel's Approximation Method builds the starting solution, then MODI (u-v) iterations improve it until every unused lane has a non-negative reduced cost, which proves the result is the global minimum for the model.
- **Baseline:** what TitanMotor did historically. Each warehouse's share of units shipped in `shipment_transactions` is applied to the current demand (capped at current inventory) and costed with the same unit-cost matrix as the optimum, so the comparison is like for like. No hub has shipment history on a specific warehouse pair in the data, so the baseline uses each warehouse's overall historical share.
- **Result (bundled data):** baseline **\$237,132** versus optimal **\$170,766**, a saving of **\$66,366 (27.99%)**.

---

## 🌐 Free Online Deployment Guide (Render, Railway, Fly.io)

This project has **zero external binary dependencies** and uses pure JavaScript with native SQLite, making it 100% compatible with free cloud platforms:

### Deploying to [Render.com](https://render.com) (Free Web Service)
1. Push your repository to GitHub.
2. Log in to Render and click **New +** &rarr; **Web Service**.
3. Select your GitHub repository `FBA---Final-Project`.
4. Configure settings:
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Under **Environment Variables** (optional):
   - `DB_PASSKEY`: your custom PIN/passkey for unlocking the Database tab (defaults to `2026`)
   - `PIN_SECRET`: a random long string for cryptographic token signing
6. Click **Deploy Web Service** &mdash; your app will be live with free automatic HTTPS!

---

## 📜 License
This project was developed for educational and academic assessment purposes under the ISC License.
