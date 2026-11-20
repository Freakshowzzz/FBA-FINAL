# Comprehensive Guide to the 3-Tier Business Analytics Pipeline
## TitanMotor Logistics — Enterprise Freight Optimization System

---

## 📌 Executive Architecture Overview

The **TitanMotor Logistics Analytics Platform** implements a sequential, end-to-end **3-Tier Business Analytics Framework** to address an industrial crisis: **minimizing heavy electric motor freight shipping costs**. 

The architecture bridges a 5-entity relational SQLite database with mathematical modeling to progress systematically from retrospective diagnosis to predictive simulation and prescriptive action:

```
[ SQLite Relational Database (5 Tables, 320+ Records) ]
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. DESCRIPTIVE ANALYTICS  ("What Happened?")                │
│    • 6 Aggregate Operational KPIs                           │
│    • 4 Dynamic Chart.js Visualizations                      │
│    • Identifies cost spikes, lane delays, & carrier splits  │
└───────────────────────────┬─────────────────────────────────┘
                            │ (Informs feature engineering & parameters)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. PREDICTIVE ANALYTICS   ("What Will Happen?")             │
│    • Multiple Linear Regression (OLS Model)                 │
│    • Interactive What-If Scenario Simulator                │
│    • Held-out R² = 0.977 | MAE ≈ $119.59 USD (20% test set) │
│    • Forecasts freight expense & transit lead time          │
└───────────────────────────┬─────────────────────────────────┘
                            │ (Feeds cost coefficients & constraints)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. PRESCRIPTIVE ANALYTICS ("What Should We Do?")            │
│    • Constrained Transportation Problem Linear Program      │
│    • Vogel's Approximation start + MODI optimality (exact)  │
│    • Optimal Unit Allocation Matrix & Dispatch Schedule     │
│    • $66,366 (27.99%) saving vs. historical dispatch mix    │
└─────────────────────────────────────────────────────────────┘
```

---

# 1. Descriptive Analytics ("What Happened?")

### 1.1 Business Objective
The Descriptive Analytics module inspects the historical shipping log (**120 dispatches**, 3 May to 27 October 2026) over a 6-month operational window. The data is seeded for this case study (TitanMotor is a hypothetical company), so the figures quoted in this guide describe the bundled database and will change if it is re-seeded. Its primary purpose is to aggregate raw logistics transactions into diagnostic KPIs and visual trends, answering:
* *Where was capital spent?*
* *Which carriers handled the most freight?*
* *Where did transit bottlenecks and delivery delays occur?*

### 1.2 The 6 Enterprise KPIs

Every KPI on Tab 1 is calculated directly in SQLite via SQL aggregations in `controllers/descriptiveController.js`:

| KPI Name | Displayed Metric | Underlying SQL Query | Business Function |
|---|---|---|---|
| **Total Freight Spend** | Cumulative Dollar Cost | `ROUND(SUM(freight_cost_usd), 2)` | Tracks total historical capital expended on shipping heavy motors. |
| **Total Shipments** | Discrete Dispatch Count | `COUNT(*)` | Measures total volume of logistical dispatches executed. |
| **Motors Shipped** | Total Cargo Units | `SUM(units_shipped)` | Calculates unit motor throughput delivered across all assembly plants. |
| **Avg Cost / Shipment** | Average Dispatch Ticket | `ROUND(AVG(freight_cost_usd), 2)` | Establishes the historical cost benchmark for a single freight delivery. |
| **Avg Transit Time** | Transit Duration (Days) | `ROUND(AVG(transit_days), 1)` | Measures average supply chain lead time from warehouse dispatch to hub arrival. |
| **Transit Delay Rate** | Operational Bottleneck % | `ROUND(AVG(delay_flag) * 100, 1)` | Quantifies the percentage of shipments experiencing unexpected carrier delays. |

### 1.3 The 4 Interactive Visualizations

```
┌──────────────────────────────────────┬──────────────────────────────────────┐
│ Chart 1: Spend by Destination Hubs   │ Chart 2: Carrier Volume & Allocation │
│ (Bar Chart)                          │ (Doughnut Chart)                     │
│ Pinpoints the costliest client hubs  │ Illustrates vendor market share splits│
├──────────────────────────────────────┼──────────────────────────────────────┤
│ Chart 3: Monthly Spend Trends        │ Chart 4: Carrier Delays vs. Transit  │
│ (Line Chart)                         │ (Dual Comparison Bar Chart)          │
│ Unveils 6-month budget volatility    │ Evaluates vendor delivery reliability│
└──────────────────────────────────────┴──────────────────────────────────────┘
```

#### Chart 1: Freight Cost & Inflow by Destination Hubs (Bar Chart)
* **SQL Query:**
  ```sql
  SELECT h.hub_name, h.city, COUNT(s.shipment_id) as shipment_count,
         ROUND(SUM(s.freight_cost_usd), 2) as total_freight_cost,
         SUM(s.units_shipped) as units_received
  FROM customer_hubs h
  LEFT JOIN shipment_transactions s ON h.hub_id = s.destination_hub_id
  GROUP BY h.hub_id ORDER BY shipment_count DESC LIMIT 8;
  ```
* **Analytical Meaning:** Ranks the highest-volume client assembly plants. Identifies destinations consuming disproportionate freight budgets due to distance or high motor intake.

#### Chart 2: Carrier Volume & Spend Allocation (Doughnut Chart)
* **SQL Query:**
  ```sql
  SELECT carrier_name, COUNT(*) as shipment_count,
         ROUND(SUM(freight_cost_usd), 2) as total_cost
  FROM shipment_transactions GROUP BY carrier_name ORDER BY total_cost DESC;
  ```
* **Analytical Meaning:** Breaks down freight contract distribution between internal fleets (*Titan Logistics Fleet*) and commercial partners (*NationalRail*, *ApexHaul*, *SwiftFreight*, *TransCoast*). Reveals whether the company relies excessively on premium commercial carriers.

#### Chart 3: Monthly Freight Expenditure Trends (Line Chart)
* **SQL Query:**
  ```sql
  SELECT SUBSTR(shipment_date, 1, 7) as month_label,
         ROUND(SUM(freight_cost_usd), 2) as monthly_cost,
         SUM(units_shipped) as total_units
  FROM shipment_transactions GROUP BY SUBSTR(shipment_date, 1, 7) ORDER BY month_label ASC;
  ```
* **Analytical Meaning:** Plots expenditure across the 6-month window. In the bundled data monthly spend is volatile and tracks dispatch volume rather than rising steadily: about \$30,700 (May), \$63,200 (June), \$61,200 (July), \$33,500 (August), \$65,700 (September) and \$60,100 (October), roughly \$52,400 per month on average. The swings illustrate how uneven, uncoordinated dispatching makes freight spend hard to budget.

#### Chart 4: Carrier Delay Percentage vs. Average Transit Days (Dual Comparison)
* **SQL Query:**
  ```sql
  SELECT carrier_name,
         ROUND(AVG(delay_flag) * 100, 1) as delay_pct,
         ROUND(AVG(transit_days), 1) as avg_days
  FROM shipment_transactions GROUP BY carrier_name;
  ```
* **Analytical Meaning:** Compares carrier reliability versus speed. In the bundled data *ApexHaul* has the highest delay rate (25.0%), *Titan Logistics Fleet* sits at 11.1% with a 3.2-day average transit, and *TransCoast* had no delayed shipments (0.0%, 2.8-day average). Average transit across all carriers is 3.3 days.

---

# 2. Predictive Analytics ("What Will Happen?")

### 2.1 Business Objective
Before cargo leaves a warehouse, logistics managers need to know:
* *What will this shipment cost?*
* *How many transit days should the receiving client expect?*
* *What is the delay bottleneck probability?*

The Predictive Analytics module fits a **Multiple Linear Regression (OLS) Model** to the 120 historical transactions (validated on a hold-out set, see 2.3), allowing decision-makers to simulate scenarios interactively before dispatching motors.

### 2.2 Mathematical Model Formulation

The freight shipping cost for heavy industrial motors is estimated with a multiple linear regression fitted by Ordinary Least Squares (normal equations, solved in `services/regressionService.js`):

$$\widehat{\text{Cost}} = \beta_0 + \beta_{\text{weight}} \cdot X_{\text{weight}} + \beta_{\text{dist}} \cdot X_{\text{dist}} + \delta_{\text{carrier}} + \text{HandlingFee}$$

Where the coefficients are **estimated from the data, not typed in** (values below are for the bundled database; the dashboard shows the live ones):
* **$\beta_0 \approx 158.54$ (Intercept):** Baseline cost not explained by weight, distance or carrier.
* **$X_{\text{weight}}$ (Total Cargo Weight in kg):** Computed as:
  $$X_{\text{weight}} = \text{Units Shipped} \times \text{Product Weight (kg from } \texttt{motor\_products}\text{)}$$
* **$\beta_{\text{weight}} \approx 0.0761$ USD/kg:** Marginal cost per kilogram of cargo.
* **$X_{\text{dist}}$ (Route Distance in km):** Taken from `carriers_routes` for the origin and destination cities. If that city pair has no route, `services/laneService.js` falls back to shipment history, then to a labelled network-average estimate.
* **$\beta_{\text{dist}} \approx 1.1298$ USD/km:** Marginal cost per kilometer of haul.
* **$\delta_{\text{carrier}}$ (Carrier effect, dummy variables):** a dollar offset per shipment relative to the reference carrier (`ApexHaul Trucking`, the alphabetically first, effect 0):
  * `NationalRail Cargo`: +\$6.46
  * `SwiftFreight Express`: +\$404.00 *(expedited delivery)*
  * `Titan Logistics Fleet`: -\$281.21 *(internal fleet)*
  * `TransCoast Freight`: -\$10.08
* **$\text{HandlingFee}$:** Facility staging fee charged by the origin warehouse, added on top of the regression output:
  $$\text{HandlingFee} = \text{Units Shipped} \times \texttt{handling\_fee\_per\_unit (from } \texttt{warehouses}\text{)}$$

### 2.3 Goodness of Fit & Diagnostic Metrics

To avoid judging the model on data it was fitted to, the 120 shipments are split 80/20 with a fixed random seed. The model is fitted on the 96 training rows and scored on the 24 held-out rows; the production model is then refitted on all 120.

$$R^2 = 1 - \frac{\sum (y_i - \hat{y}_i)^2}{\sum (y_i - \bar{y})^2}$$

$$\text{MAE} = \frac{1}{N} \sum_{i=1}^N |y_i - \hat{y}_i|$$

| Metric | Training (96 rows) | Held-out test (24 rows) | Full-data fit (120 rows) |
|---|---|---|---|
| $R^2$ | 0.985 | **0.977** | 0.984 |
| Adjusted $R^2$ | 0.984 | 0.969 | 0.984 |
| MAE (USD) | 102.76 | **119.59** | 106.74 |
| RMSE (USD) | 163.14 | 157.50 | 161.00 |

* **Headline $R^2 = 0.977$:** about **97.7%** of freight cost variation on unseen shipments is explained by cargo weight, distance and carrier.
* **Headline $\text{MAE} \approx \$119.59$:** on held-out shipments the forecast is off by about \$120 on average. Average shipment cost is about \$2,619, so this is roughly 4.6%.
* **Sample size:** 120 shipments in total. The test set is only 24 rows, so these held-out figures are indicative rather than precise.
* **Transit days** come from a second small OLS on distance and carrier (in-sample $R^2 \approx 0.51$, MAE about 0.8 days). **Delay risk** is the carrier's historical late-shipment rate: ApexHaul 25.0%, SwiftFreight 10.5%, Titan Logistics Fleet 11.1%, NationalRail 8.7%, TransCoast 0.0%.

### 2.4 Interactive What-If Scenario Simulator

The frontend simulator connects to `POST /api/predictive/estimate` and dynamically computes the figures below. The dashboard's $R^2$, MAE, sample size and formula are loaded from `GET /api/predictive/metrics`.
1. **Total Cargo Weight (kg):** `units * motor_weight`
2. **Total Predicted Freight Cost ($):** Computed via the regression formula.
3. **Cost per Motor Unit ($):** `Predicted Cost / Units`
4. **Cost per Kilogram ($):** `Predicted Cost / Total Weight`
5. **Estimated Transit Lead Time (Days):** From the transit-time regression on route distance and carrier.
6. **Delay Risk (%):** The selected carrier's historical share of delayed shipments.

---

# 3. Prescriptive Analytics ("What Should We Do?")

### 3.1 Business Objective
Descriptive analysis revealed *where money was lost*. Predictive modeling forecasted *individual dispatch costs*. **Prescriptive Analytics** takes the final, crucial step: it computes the **mathematically optimal distribution schedule** that allocates motors across the entire supply chain network at the **lowest possible global cost**.

### 3.2 Operations Research: The Transportation Problem

The logistics network is formulated as a classical **Constrained Transportation Linear Program (LP)**:

#### Objective Function:
$$\min Z = \sum_{i=1}^{m} \sum_{j=1}^{n} c_{ij} x_{ij}$$

Where:
* $m = 3$ Origin Warehouses (supply $S_i$ = each warehouse's `current_inventory`):
  * Warehouse 1: **Chicago Facility 1**, 4,482 units
  * Warehouse 2: **Dallas Facility 1**, 1,807 units
  * Warehouse 3: **Philadelphia Facility 1**, 3,249 units
* $n = 5$ Customer Destination Hubs:
  * Hub 1: **General Industrial Motors (Atlanta Hub)**, demand 605 units
  * Hub 2: **Vanguard EV Assembly (Denver Hub)**, demand 469 units
  * Hub 3: **Apex Heavy Machinery (Cleveland Hub)**, demand 1,192 units
  * Hub 4: **Titan Manufacturing Ltd (Charlotte Hub)**, demand 440 units
  * Hub 5: **Pinnacle Aerospace Systems (Milwaukee Hub)**, demand 405 units
* $c_{ij}$: Unit shipping cost to transport one motor from warehouse $i$ to hub $j$, calculated from lane distance and base rate per km (via `services/laneService.js`) and handling fees in `warehouses`. Of the 15 lanes, 3 have an exact route in `carriers_routes`, 3 come from shipment history and 9 are network-average estimates (marked `*` / `†` on the dashboard).
* $x_{ij}$: Decision variable representing the number of motor units shipped along lane $(i, j)$.

#### Mathematical Constraints:
1. **Warehouse Supply Constraints:**
   $$\sum_{j=1}^{n} x_{ij} \le S_i \quad \forall i \in \{1, 2, 3\}$$
   *(Shipments leaving each warehouse cannot exceed its `current_inventory`; total inventory is 9,538 units)*.

2. **Customer Hub Demand Constraints:**
   $$\sum_{i=1}^{m} x_{ij} \ge D_j \quad \forall j \in \{1, 2, 3, 4, 5\}$$
   *(Every regional assembly hub must receive its full `monthly_demand_units`; total demand is 3,111 units. If inventory were short, the shortfall is reported as unmet demand.)*

3. **Non-negativity Constraints:**
   $$x_{ij} \ge 0 \quad \forall i, j$$
   *(Physical motor shipments cannot be negative)*.

### 3.3 Algorithmic Solution Method (Vogel's Approximation + MODI)

The solver in `services/transportSolver.js` (called from `services/optimizationService.js`) is an exact method:
1. **Balance the problem.** If supply and demand differ, a zero-cost dummy row or column is added (a dummy destination absorbs unused inventory; a dummy origin represents any unmet demand).
2. **Starting solution, Vogel's Approximation Method (VAM).** For every open row and column it computes a penalty (the gap between its two cheapest open cells), picks the line with the largest penalty and fills its cheapest cell. This usually gives a near-optimal start.
3. **Optimality test, MODI (u-v) method.** It computes dual values $u_i, v_j$ for the basic cells and the reduced cost $c_{ij} - u_i - v_j$ for every unused cell. If any is negative, it pivots along the improving loop and repeats.
4. **Stop** when all reduced costs are $\ge 0$. That proves the allocation is a global cost minimum for this model. On the bundled data the VAM start costs \$195,222 and MODI improves it to \$170,766 in 2 pivots.

### 3.4 Verification of Bottom-Line Cost Savings

The system compares the historical dispatch pattern with the optimal solution, both costed with the **same unit-cost matrix**:

$$\text{Dollar Savings} = \text{Baseline Cost} - \text{Optimal Prescribed Cost}$$

$$\text{Percentage Savings} = \left( \frac{\text{Dollar Savings}}{\text{Baseline Cost}} \right) \times 100\%$$

* **Baseline (historical dispatch mix):** built from `shipment_transactions`. Each warehouse's historical share of units shipped is applied to the current hub demand, capped at current inventory. No hub has shipment history on a specific warehouse pair in the data, so the overall warehouse share is used for all five hubs.
* **Baseline cost:** **\$237,132**
* **Optimal prescribed cost:** **\$170,766** *(global minimum for the model)*
* **Total net savings:** **\$66,366 (27.99%)**

These values are computed live by `GET /api/prescriptive/optimize` for the bundled database and will change if the data changes. Because 9 of the 15 lane costs are estimates, read the savings as indicative of the size of the opportunity rather than an audited figure.

### 3.5 Actionable Implementation Directives

The Prescriptive dashboard translates the mathematical solution into two operational deliverables:
1. **The Optimal Distribution Matrix (Units Shipped):** A cross-tabulated grid showing the exact quantity of motors assigned to each warehouse-to-hub lane alongside its unit cost $[c_{ij}]$.
2. **Actionable Route Dispatch Directives:** A prioritized operational table for dispatchers detailing origin facility, destination hub, unit quotas, lane freight rates, total route expenditure, and route optimality badges.

---

# 4. Relational Database Architecture (5 Entities)

All 3 analytics tiers are continuously synchronized with the 5 relational tables in `data/titanmotor_logistics.db`:

```
┌──────────────────┐           ┌────────────────────────┐
│    warehouses    │ 1       * │ shipment_transactions  │
├──────────────────┼───────────┼────────────────────────┤
│ warehouse_id (PK)│           │ shipment_id (PK)       │
│ warehouse_code   │           │ origin_warehouse_id(FK)│◄─── warehouses.warehouse_id
│ warehouse_name   │           │ destination_hub_id (FK)│◄─── customer_hubs.hub_id
│ city, state      │           │ product_id (FK)        │◄─── motor_products.product_id
│ max_capacity     │           │ units_shipped          │
│ current_inventory│           │ total_weight_kg        │
│ handling_fee     │           │ carrier_name           │
└──────────────────┘           │ distance_km            │
                               │ transit_days           │
┌──────────────────┐ 1       * │ freight_cost_usd       │
│  customer_hubs   ├───────────┤ delay_flag             │
├──────────────────┤           └────────────────────────┘
│ hub_id (PK)      │                       ▲
│ hub_code         │                       │
│ hub_name         │           ┌────────────────────────┐
│ monthly_demand   │ 1       * │     motor_products     │
│ priority_level   │           ├────────────────────────┤
└──────────────────┘           │ product_id (PK)        │
                               │ model_code, model_name │
┌──────────────────┐           │ motor_type, weight_kg  │
│ carriers_routes  │           │ power_rating_kw        │
├──────────────────┤           │ unit_value_usd         │
│ route_id (PK)    │           └────────────────────────┘
│ carrier_name     │
│ origin_city      │
│ dest_city        │
│ distance_km      │
│ base_rate_per_km │
└──────────────────┘
```

### Table Specifications:
1. **`warehouses` (50 Records):** Manufacturing origins storing capacity, available inventory, and handling fees.
2. **`customer_hubs` (50 Records):** Assembly client locations storing monthly demand units and priority ratings.
3. **`motor_products` (50 Records):** Electric motor models storing kilowatt power ratings, unit weights (35–600+ kg), and values.
4. **`carriers_routes` (50 Records):** Transportation lanes storing origin-destination cities, distances (km), and base rates.
5. **`shipment_transactions` (120 Records):** Historical shipment audit logs storing tracking numbers, dates, units, weights, freight costs, and transit delay outcomes.

---

# 5. Summary: How the 3 Analyses Connect

| Stage | Question Answered | Statistical / Mathematical Tool | Primary Output |
|---|---|---|---|
| **Tier 1: Descriptive** | *What happened historically?* | SQL Groupings, SUM, AVG, Count, Canvas Charts | Historical spend benchmarks, delay bottlenecks, carrier market share |
| **Tier 2: Predictive** | *What will a new shipment cost?* | Multiple Linear Regression (OLS), held-out $R^2 = 0.977$ | Real-time freight cost estimates, transit days, delay risk % |
| **Tier 3: Prescriptive** | *What is the best shipping plan?* | Transportation Problem (Vogel's Approximation + MODI) | Optimal warehouse-to-hub matrix, \$66,366 (27.99%) saving vs. historical dispatch mix |
