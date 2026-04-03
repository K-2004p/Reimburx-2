# 🚀 Reimbursement Management System

A professional **enterprise-grade SaaS application** for managing employee expense reimbursements with OCR, multi-level approvals, and multi-currency support.

---

## 🧰 Tech Stack

### 🔹 Frontend

* React 18 (Vite)
* Tailwind CSS

### 🔹 Backend

* Express.js (Node.js)

### 🔹 Database & Authentication

* Firebase (Firestore + Firebase Auth)

### 🔹 Additional Tools

* OCR: Tesseract.js (Client-side)
* Animations: Framer Motion
* Icons: Lucide React
* Currency API: exchangerate-api

---

## ✨ Features

### 🧠 Smart Onboarding

* Automatically detects and sets company base currency.

### 📸 OCR-Based Expense Submission

* Extracts:

  * Merchant Name
  * Date
  * Amount
    from uploaded receipts using OCR.

### 🔁 Advanced Approval Workflow

* Multi-step approval system
* Role-based approval hierarchy
* Percentage-based approval rules
* Auto-approval support

### 👥 Role-Based Access Control

* **Employee** → Submit & track expenses
* **Manager** → Approvals & review
* **Admin** → Full system control

### 💱 Multi-Currency Support

* Real-time currency conversion via API

---

## 🔥 Firebase Setup

### 1️⃣ Create Firebase Project

1. Go to https://console.firebase.google.com
2. Click **"Add Project"**
3. Enable:

   * **Firestore Database**
   * **Authentication (Email/Password)**

---

### 2️⃣ Firestore Database Structure

Create the following collections:

#### 📁 `companies`

* id
* name
* base_currency

#### 📁 `users`

* uid
* email
* full_name
* role (employee / manager / admin)
* company_id

#### 📁 `expenses`

* id
* employee_id
* amount
* currency
* converted_amount
* status (pending / approved / rejected)
* current_step
* receipt_url
* created_at

#### 📁 `approval_rules`

* id
* company_id
* step_number
* approver_role
* required_percentage
* is_auto_approve

---

### 3️⃣ Enable Security Rules

* Use Firebase Security Rules to restrict access based on roles
* Ensure:

  * Users can only access their own data
  * Managers/Admins have elevated permissions

---

## 🔐 Environment Variables

Create a `.env` file in the root:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

VITE_EXCHANGERATE_API_KEY=your_exchange_rate_api_key
```

---

## ⚙️ Installation & Setup

### 1️⃣ Clone the Repository

```bash
git clone https://github.com/your-username/reimbursement-system.git
cd reimbursement-system
```

### 2️⃣ Install Dependencies

```bash
npm install
```

---

## ▶️ Running the Application

### 🔹 Development Mode

```bash
npm run dev
```

* Starts:

  * Express backend
  * Vite frontend

---

### 🔹 Production Build

```bash
npm run build
npm start
```

---

## 📂 Project Structure

```
reimbursement-system/
│
├── client/               # React Frontend
├── server/               # Express Backend
├── public/
├── src/
├── firebase/             # Firebase config & services
├── .env
├── package.json
└── README.md
```

---

## 📊 Future Enhancements

* 📱 Mobile App Integration
* 🤖 AI Fraud Detection (Gemini API)
* 🔔 Real-time Notifications
* 📈 Advanced Analytics Dashboard
* 🌍 Multi-language Support

---

## 🤝 Contributing

Contributions are welcome!
Feel free to fork this repo and submit a pull request.

---

## 📜 License

This project is licensed under the MIT License.

---

## 👨‍💻 Author

Developed by **Spectrum**

---

## ⭐ Support

If you like this project, give it a ⭐ on GitHub!
