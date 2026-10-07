# 💰 MyBudget — Personal Budget Manager

MyBudget is a local-first personal budget web app. It runs on your computer with a React frontend, a Flask backend and a local SQLite database.

**Your budget data stays on your computer.** The application does not require an account, a remote database or a hosted backend.

## 🚀 Quick start

### Windows — recommended

Double-click **`Avvia-MyBudget.bat`**.

The launcher automatically:

1. downloads a portable Python into `.runtime\\python` if needed;
2. installs the Python dependencies (Flask);
3. checks the frontend and rebuilds it when the source code has changed;
4. uses Node.js from the system when a suitable version is available, otherwise downloads a portable copy into `.runtime\\node`;
5. starts the local server on `http://localhost:5000`;
6. opens the browser automatically.

No administrator rights are required and the system Python/Node installations are not modified.

The launcher also stops a previous MyBudget server instance before starting the current version, so an updated checkout does not keep serving an old backend/frontend.

To stop MyBudget:

```bat
Avvia-MyBudget.bat stop
```

Useful local files:

- **Database:** `data\\mybudget.db`
- **Setup/build log:** `.runtime\\setup.log`
- **Server log:** `data\\server.log`
- **Server error log:** `data\\server.log.err`

### Linux / macOS

The included `start.sh` installs the Python dependencies, builds the frontend when `npm` is available, and starts the Flask server.

```bash
chmod +x start.sh
./start.sh
```

The browser opens at:

`http://localhost:5000`

With this startup method, the default SQLite database is created locally under `backend/mybudget.db`.

### Manual startup

For development or when you prefer to start the components yourself:

```bash
# Python dependencies
python3 -m pip install -r backend/requirements.txt

# Frontend dependencies and production build
npm install
npm run build

# Start the application
python3 backend/app.py
```

On Windows PowerShell, the equivalent final command is:

```powershell
python backend/app.py
```

The Flask server serves the built React application and opens `http://localhost:5000` automatically.

## 🏗️ Architecture

```
┌──────────────────────────────────────────┐
│ React + TypeScript + Tailwind CSS       │
│                 ↓                       │
│           Flask REST API                │
│                 ↓                       │
│        SQLite database on disk          │
└──────────────────────────────────────────┘
```

- **Frontend:** React + TypeScript + Tailwind CSS + Vite
- **Backend:** Python + Flask
- **Database:** SQLite, stored locally on disk
- **API:** REST/JSON, used by the frontend to read and write local data

## ✨ Features

### 📊 Configuration

- Editable payday
- Monthly base salary
- Salary override for individual future months
- Manual **Savings** amount, persisted in the local database
- Italian / English interface
- Configurable display currency

### 💵 Income management

- Add extra income
- Custom income categories
- Edit and delete entries
- Income is stored locally in SQLite

### 💶 Expense management

Supports five expense types:

- **One-off**
- **Subscription**
- **Installment**
- **Savings**
- **PAC** (recurring investment plan)

Additional functionality:

- Custom expense categories
- Installment counters
- Optional end dates for recurring expenses
- Future recurring expenses start from their configured month
- Filters by month and type
- **Accantonamento** / savings movements are treated as savings rather than normal consumption for the financial-health calculations

### 🏦 Savings

The Home dashboard shows **Total Savings**, combining:

- the manually configured amount in **Settings → Savings**;
- amounts accumulated through **Savings/PAC** movements;
- movements whose category is **Accantonamento** (or the default savings category).

The same local data is used by the dashboard and financial-health calculations.

### 📈 Dashboard and financial health

- Responsive dashboard that adapts to the available browser width
- Navigation tabs that expand/shrink with the viewport
- Income, expenses and balance summary
- Correct expense/income percentage
- Financial-health indicator and composite score
- Recommended daily budget
- Payday countdown
- Top expense categories
- Automatic tips
- Upcoming trips

### 📊 Reports

- Monthly financial breakdown
- Income vs expenses charts
- Balance trend
- Expenses by category and type
- Detailed financial-health report with monthly trend and score

### ✈️ Trips

- Dedicated trip budgets
- Trip-specific currency
- Individual trip costs
- Spent / remaining / over-budget tracking

### 📤 Export and backup

#### Excel

The Excel export offers fixed periods:

- **Current month**
- **Last 3 months**
- **Last 6 months**
- **Last 12 months**
- **All time**

The workbook contains summary, detailed expenses, extra income and category breakdowns.

#### JSON backup

- Export the full local database content to JSON
- Restore a previous JSON backup
- Backups are generated as local files downloaded by your browser

## 🗄️ Local database and privacy

MyBudget is designed to be **local-first**:

- No user account is required
- No remote application server is required
- The SQLite database stays on the machine where MyBudget is running
- The Windows portable launcher stores the runtime database in `data\\mybudget.db`
- Manual Linux/macOS development normally uses `backend/mybudget.db`
- Excel and JSON exports are created locally
- No personal budget data is intentionally uploaded by the application

### Recommended backups

You can back up your data in either of these ways:

1. Use **Export/Backup → Full Backup (JSON)** inside the app.
2. Copy the local `.db` file while MyBudget is stopped.

Keep personal database files and backup exports outside the source repository.

## 📦 Distribution

The project is intended to be distributed from Git without distributing personal budget data.

The repository contains the application source and startup scripts; runtime data such as SQLite databases, logs, local dependencies and other generated files should remain outside Git.

For an eventual public release, repository-level GitHub settings should also protect the official branch and restrict write access to trusted maintainers. A public Git repository can always be cloned, forked and modified in a user's own copy.

## 📁 Project structure

```
mybudget/
├── backend/
│   ├── app.py              # Flask server
│   ├── database.py         # SQLite management
│   ├── requirements.txt    # Python dependencies
│   └── ...                 # backend modules
├── src/
│   ├── App.tsx             # main React application
│   ├── components/         # application panels
│   └── db.ts               # REST API client
├── dist/                   # generated frontend build
├── Avvia-MyBudget.bat      # Windows launcher
├── MyBudget.ps1            # Windows launcher logic
├── start.sh                # Linux/macOS launcher
├── package.json            # frontend dependencies/scripts
└── README.md
```

## 🛠️ Development

### Frontend development mode

Start the backend in one terminal:

```bash
python3 backend/app.py
```

Start Vite in another terminal:

```bash
npm run dev
```

Vite serves the development frontend on:

`http://localhost:5173`

The frontend uses the local Flask API on port `5000`.

### Production build

```bash
npm install
npm run build
```

### Changing the backend port

Linux/macOS:

```bash
PORT=3000 python3 backend/app.py
```

Windows:

```bat
set PORT=3000
python backend/app.py
```

When you change the port manually, the frontend/API configuration must point to the same backend port.

## 🐞 Troubleshooting

| Problem | Solution |
|---|---|
| `Avvia-MyBudget.bat` reports a build error | Check `.runtime\\setup.log`; the launcher will rebuild the frontend from the current source tree |
| `ModuleNotFoundError: flask` | Run `python3 -m pip install -r backend/requirements.txt` |
| Port 5000 is already in use | Stop the old MyBudget instance or start Flask on another port |
| Frontend changes do not appear | Restart MyBudget so the launcher can rebuild the frontend |
| Database seems empty after moving the project | Check that you are using the expected local DB path (`data\\mybudget.db` on Windows launcher) |
| Database corruption is suspected | Stop the app, make a copy of the DB first, then restore a JSON backup if available |

## 🔧 Technical notes

- SQLite uses WAL mode for improved local performance
- Flask serves both the REST API and the built SPA
- The Windows launcher uses portable runtimes when needed
- Frontend rebuild detection uses a content fingerprint rather than filesystem timestamps
- The backend binds to `127.0.0.1` when started by the Windows portable launcher, keeping the local runtime accessible only from the same PC
- CORS is enabled for development

## 📄 License

No open-source license has been selected yet. Before publishing the repository as an open-source project, choose and add an explicit license (for example MIT, Apache-2.0 or GPL) that matches the intended use.

---

**Happy saving! 💰**
