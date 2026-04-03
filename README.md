# Reimbursement Management System

A professional enterprise SaaS for managing expense reimbursements with OCR, multi-level approvals, and multi-currency support.

## Tech Stack
- **Frontend**: React 18 (Vite) + Tailwind CSS
- **Backend**: Express (Node.js)
- **Database/Auth**: Supabase
- **OCR**: Tesseract.js (Client-side)
- **Animations**: Motion (Framer Motion)
- **Icons**: Lucide React

## Features
- **Smart Onboarding**: Auto-detects company currency.
- **OCR Submission**: Automatically extracts merchant, date, and amount from receipts.
- **Advanced Approvals**: Supports sequential steps and percentage-based approval rules.
- **Role-Based Access**: Distinct views for Employees, Managers, and Admins.
- **Multi-Currency**: Real-time conversion using `exchangerate-api`.

## Setup Instructions

### 1. Supabase Setup
1. Create a new project at [supabase.com](https://supabase.com).
2. Create the following tables:
   - `companies` (id, name, base_currency)
   - `profiles` (id, email, full_name, role, company_id)
   - `expenses` (id, employee_id, amount, currency, converted_amount, status, current_step, etc.)
   - `approval_rules` (id, company_id, step_number, approver_role, required_percentage, is_auto_approve)
3. Enable Row Level Security (RLS) on all tables.

### 2. Environment Variables
Set the following variables in your AI Studio Secrets or `.env` file:
- `VITE_SUPABASE_URL`: Your Supabase Project URL.
- `VITE_SUPABASE_ANON_KEY`: Your Supabase Anon Key.
- `VITE_EXCHANGERATE_API_KEY`: API key from [exchangerate-api.com](https://www.exchangerate-api.com/).

### 3. Running the App
The app is configured to run as a full-stack application.
- Development: `npm run dev` (starts Express server + Vite middleware)
- Production: `npm run build` then `npm start`
