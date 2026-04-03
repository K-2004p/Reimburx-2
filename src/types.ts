export type Role = 'Admin' | 'Manager' | 'Employee';
export type ExpenseStatus = 'Pending' | 'Approved' | 'Rejected';

export interface User {
  uid: string;
  email: string;
  name: string;
  role: Role;
  companyId: string;
  managerId?: string;
  currency: string;
}

export interface Company {
  id: string;
  name: string;
  baseCurrency: string;
  country: string;
  adminId: string;
}

export interface ApprovalStep {
  type: 'Manager' | 'SpecificUser' | 'Role';
  value: string; // User ID or Role name
}

export interface ConditionalRuleConfig {
  enabled: boolean;
  percentageApproval: number;
  specificApproverOverride?: string;
  logic: 'AND' | 'OR';
}

export interface ApprovalRule {
  id: string;
  companyId: string;
  sequence: ApprovalStep[];
  percentageThreshold?: number;
  specificApproverId?: string;
  isManagerFirst?: boolean;
  conditionalRules?: ConditionalRuleConfig;
}

export interface Approval {
  approverId: string;
  status: 'Approved' | 'Rejected';
  comment: string;
  timestamp: string;
}

export interface Expense {
  id: string;
  userId: string; // Added userId
  employeeId: string;
  companyId: string;
  amount: number;
  currency: string;
  category: string;
  merchant?: string; // Added merchant
  description: string;
  date: string;
  status: ExpenseStatus; // Use ExpenseStatus type
  receiptUrl?: string;
  ocrData?: any;
  currentApproverId: string; // Legacy primary approver
  pendingApprovers?: string[]; // Array of eligible uids for group logic
  currentApproverIndex: number;
  approvalChain: string[]; // Added approvalChain
  approvals: Approval[];
  createdAt: number; // Added createdAt
}
