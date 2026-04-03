import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  LayoutDashboard, 
  PlusCircle, 
  History, 
  CheckCircle2, 
  Settings, 
  LogOut, 
  Upload, 
  FileText, 
  DollarSign, 
  IndianRupee,
  PieChart, 
  Clock, 
  CheckCircle, 
  XCircle, 
  ChevronRight, 
  MoreVertical, 
  User as UserIcon, 
  Building2, 
  ArrowRight, 
  Camera, 
  AlertCircle,
  GitBranch,
  GitPullRequest,
  LayoutList,
  Search,
  Filter,
  Download,
  Calendar,
  X,
  Menu,
  Bell,
  HelpCircle,
  User,
  TrendingUp,
  TrendingDown,
  Zap,
  ShieldCheck,
  CreditCard,
  Users,
  Layers,
  Eye,
  Trash2,
  MoreHorizontal,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  Sparkles,
  Scan,
  GitMerge,
  Globe,
  FileStack,
  ImagePlus,
  FileSignature,
  Store,
  Tag,
  ChevronDown,
  Database,
  ScanEye,
  FileCode,
  Mic,
  MicOff
} from 'lucide-react';
import { 
  BrowserRouter as Router, 
  Routes, 
  Route, 
  Navigate, 
  Link, 
  useLocation, 
  useNavigate 
} from 'react-router-dom';
import { motion, AnimatePresence, motionValue, useSpring, useTransform } from 'motion/react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  getDoc, 
  setDoc, 
  orderBy, 
  limit,
  Timestamp,
  serverTimestamp,
  getDocs
} from 'firebase/firestore';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart as RePieChart, 
  Pie, 
  Cell,
  AreaChart,
  Area
} from 'recharts';
import { extractReceiptData, parseVoiceCommand } from './lib/ocr';
import { Toaster, toast } from 'sonner';
import { db, auth } from './firebase';
import { useAuth } from './hooks/useAuth';
import { 
  Expense, 
  User as UserType, 
  Company, 
  ApprovalRule, 
  ApprovalStep, 
  Approval,
  Role, 
  ExpenseStatus,
  ConditionalRuleConfig
} from './types';
import { getUserLocation, getCountryCurrency, getExchangeRate } from './lib/api';
import { extractReceiptData as processReceipt } from './lib/ocr';
import { cn } from './lib/utils';

// --- Error Handling ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

const handleFirestoreError = (error: any, operationType: OperationType, path: string | null) => {
  if (error?.code === 'permission-denied' || error?.message?.includes('Missing or insufficient permissions')) {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        tenantId: auth.currentUser?.tenantId,
        providerInfo: auth.currentUser?.providerData.map(provider => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL
        })) || []
      },
      operationType,
      path
    };
    console.error('Firestore Permission Error: ', JSON.stringify(errInfo, null, 2));
    toast.error('Permission denied. Please contact your administrator.');
  } else {
    console.error('Firestore Error:', error);
    toast.error(error?.message || 'A database error occurred. Reference: ' + operationType);
  }
};

// --- Types ---


// --- Advanced Workflow Engine Core ---
export const evaluateNextApprovalGate = async (
  rule: ApprovalRule | undefined, 
  currentIndex: number, 
  employeeId: string, 
  companyId: string
): Promise<{ pendingApprovers: string[], nextIndex: number }> => {
  if (!rule) return { pendingApprovers: [], nextIndex: currentIndex };

  if (currentIndex === -1 && rule.isManagerFirst) {
    const userSnap = await getDoc(doc(db, 'users', employeeId));
    const managerId = userSnap.data()?.managerId;
    if (managerId) {
      return { pendingApprovers: [managerId], nextIndex: -1 };
    }
  }

  const targetIndex = currentIndex === -1 ? 0 : currentIndex;
  if (!rule.sequence || targetIndex >= rule.sequence.length) {
    return { pendingApprovers: [], nextIndex: targetIndex };
  }

  const step = rule.sequence[targetIndex];
  
  if (step.type === 'Manager') {
    const userSnap = await getDoc(doc(db, 'users', employeeId));
    const managerId = userSnap.data()?.managerId;
    return { pendingApprovers: managerId ? [managerId] : [], nextIndex: targetIndex };
  }
  
  if (step.type === 'SpecificUser') {
    return { pendingApprovers: [step.value], nextIndex: targetIndex };
  }
  
  if (step.type === 'Role' || step.type === ('Role Based' as any)) {
    const roleQ = query(collection(db, 'users'), where('companyId', '==', companyId), where('role', '==', step.value));
    const snap = await getDocs(roleQ);
    return { pendingApprovers: snap.docs.map(d => d.id), nextIndex: targetIndex };
  }

  return { pendingApprovers: [], nextIndex: targetIndex };
};

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center">
            <h2 className="text-xl font-bold text-slate-900 mb-2">Application Error</h2>
            <p className="text-slate-500 mb-8">{String(this.state.error)}</p>
            <button onClick={() => window.location.reload()} className="btn-primary w-full">Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Components ---

const Reveal = ({ children, delay = 0, x = 0, y = 20, key }: { children: React.ReactNode, delay?: number, x?: number, y?: number, key?: string | number }) => (
  <motion.div
    key={key}
    initial={{ opacity: 0, x, y, filter: 'blur(10px)' }}
    whileInView={{ opacity: 1, x: 0, y: 0, filter: 'blur(0px)' }}
    viewport={{ once: true, margin: "-50px" }}
    transition={{ 
      duration: 0.8, 
      delay, 
      ease: [0.16, 1, 0.3, 1] 
    }}
  >
    {children}
  </motion.div>
);

const PremiumCard = ({ children, className, delay = 0, key }: { children: React.ReactNode, className?: string, delay?: number, key?: string | number }) => {
  const x = motionValue(0);
  const y = motionValue(0);
  const mouseX = useSpring(x, { stiffness: 150, damping: 20 });
  const mouseY = useSpring(y, { stiffness: 150, damping: 20 });

  const rotateX = useTransform(mouseY, [-0.5, 0.5], ["7deg", "-7deg"]);
  const rotateY = useTransform(mouseX, [-0.5, 0.5], ["-7deg", "7deg"]);

  function handleMouse(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseXPos = event.clientX - rect.left;
    const mouseYPos = event.clientY - rect.top;
    x.set(mouseXPos / width - 0.5);
    y.set(mouseYPos / height - 0.5);
  }

  return (
    <motion.div
      key={key}
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
      onMouseMove={handleMouse}
      onMouseLeave={() => { x.set(0); y.set(0); }}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
      className={cn("card perspective-container", className)}
    >
      <div style={{ transform: "translateZ(50px)" }} className="relative z-10">
        {children}
      </div>
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none" />
    </motion.div>
  );
};

const Glow = ({ color = "rgba(0, 229, 255, 0.15)", size = "300px", className }: { color?: string, size?: string, className?: string }) => (
  <div 
    className={cn("absolute pointer-events-none blur-[100px] rounded-full", className)}
    style={{ 
      width: size, 
      height: size, 
      backgroundColor: color,
      zIndex: 0
    }}
  />
);


const Sidebar = ({ role, onLogout }: { role: Role; onLogout: () => void }) => {
  const location = useLocation();
  
  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/', roles: ['Employee', 'Manager', 'Admin'] },
    { icon: History, label: 'My Expenses', path: '/expenses', roles: ['Employee', 'Manager', 'Admin'] },
    { icon: CheckCircle2, label: 'Approvals', path: '/approvals', roles: ['Manager', 'Admin'] },
    { icon: Users, label: 'Team', path: '/team', roles: ['Employee', 'Manager', 'Admin'] },
    { icon: Settings, label: 'Settings', path: '/admin', roles: ['Admin'] },
  ];

  return (
    <aside className="w-72 bg-[#0A0A12] border-r border-white/5 flex flex-col h-screen sticky top-0 shrink-0 z-50">
      <div className="p-8 flex items-center gap-4">
        <Reveal y={-10}>
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-500/40 relative group overflow-hidden">
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
            <IndianRupee className="text-white relative z-10" size={28} />
          </div>
        </Reveal>
        <Reveal delay={0.1} x={-10} y={0}>
          <div>
            <h1 className="text-white font-black text-xl tracking-tighter leading-none">REIMBURX</h1>
            <p className="text-[10px] text-indigo-400 font-black uppercase tracking-[0.2em] mt-1.5 opacity-80">Premium SaaS</p>
          </div>
        </Reveal>
      </div>

      <nav className="flex-1 px-4 py-8 space-y-2">
        {navItems.filter(item => item.roles.includes(role)).map((item, i) => {
          const isActive = location.pathname === item.path;
          return (
            <Reveal key={item.path} delay={0.2 + i * 0.05} x={-20} y={0}>
              <Link
                to={item.path}
                className={cn(
                  "flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-500 group relative overflow-hidden",
                  isActive 
                    ? "text-white bg-white/5 border border-white/10 shadow-xl" 
                    : "text-slate-500 hover:text-slate-200"
                )}
              >
                {isActive && (
                  <motion.div 
                    layoutId="activeNavGlow"
                    className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-transparent"
                  />
                )}
                <item.icon size={22} className={cn("relative z-10 transition-colors duration-500", isActive ? "text-indigo-400" : "group-hover:text-white")} />
                <span className="font-bold text-sm relative z-10 tracking-tight">{item.label}</span>
                {isActive && (
                  <motion.div 
                    layoutId="activeNavIndicator"
                    className="absolute right-0 w-1.5 h-6 bg-indigo-500 rounded-l-full shadow-[0_0_15px_rgba(0,229,255,0.8)]"
                  />
                )}
              </Link>
            </Reveal>
          );
        })}
      </nav>

      <div className="p-6 mt-auto">
        <Reveal delay={0.6} y={10}>
          <Link 
            to="/pro-plan"
            className="block bg-indigo-500/10 rounded-3xl p-6 mb-4 border border-indigo-500/20 hover:border-indigo-400/40 hover:bg-indigo-500/15 transition-all duration-500 cursor-pointer group shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-2">
              <Sparkles size={14} className="text-indigo-400/50" />
            </div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-500">
                <Zap size={16} className="text-white" />
              </div>
              <span className="text-xs font-black text-white uppercase tracking-widest">PRO UPGRADE</span>
            </div>
            <p className="text-[10px] text-slate-400 font-bold leading-relaxed uppercase tracking-widest opacity-80">
              Save up to 12 hours monthly with AI.
            </p>
          </Link>
        </Reveal>
        
        <Reveal delay={0.7} y={10}>
          <button 
            onClick={onLogout}
            className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 transition-all duration-500 group"
          >
            <LogOut size={22} className="group-hover:rotate-12 transition-transform" />
            <span className="font-bold text-sm tracking-tight text-slate-500 group-hover:text-rose-400">Sign Out</span>
          </button>
        </Reveal>
      </div>
    </aside>
  );
};

const NotificationDropdown = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const notifications = [
    { id: 1, title: 'Expense Approved', message: 'Your travel expense has been approved.', time: '2h ago', icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { id: 2, title: 'New Request', message: 'John submitted a new expense for review.', time: '5h ago', icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50' },
    { id: 3, title: 'System Update', message: 'New OCR features are now available.', time: '1d ago', icon: Zap, color: 'text-indigo-500', bg: 'bg-indigo-50' },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute right-0 mt-3 w-80 bg-card-solid rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.5)] z-50 overflow-hidden ring-1 ring-white/10"
          >
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="font-bold text-white">Notifications</h3>
              <button className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest hover:underline">Mark all as read</button>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {notifications.map((n) => (
                <div key={n.id} className="p-4 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 cursor-pointer">
                  <div className="flex gap-3">
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", n.bg)}>
                      <n.icon size={18} className={n.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <p className="text-sm font-bold text-white truncate">{n.title}</p>
                        <span className="text-[10px] text-slate-400 font-medium">{n.time}</span>
                      </div>
                      <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">{n.message}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 bg-slate-50 text-center">
              <button className="text-xs font-bold text-slate-600 hover:text-indigo-600 transition-colors">View all notifications</button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

const TopBar = ({ user, searchQuery, setSearchQuery, onLogout }: { user: UserType, searchQuery: string, setSearchQuery: (q: string) => void, onLogout: () => void }) => {
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const location = useLocation();
  const getTitle = () => {
    switch (location.pathname) {
      case '/': return 'Analytics';
      case '/expenses': return 'Financial Ledger';
      case '/approvals': return 'Approval Gates';
      case '/admin': return 'Configurations';
      case '/submit': return 'Data Ingestion';
      case '/team': return 'Capital Allocation';
      default: return 'REIMBURX';
    }
  };

  return (
    <header className="h-24 px-12 flex items-center justify-between sticky top-0 z-40 bg-slate-100/40 backdrop-blur-3xl border-b border-white/5 shadow-2xl">
      <Reveal x={-10} y={0}>
        <div className="flex items-center gap-6">
          <div className="md:hidden">
            <Menu size={24} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(0,229,255,1)]" />
              <p className="text-[9px] text-indigo-400 font-black uppercase tracking-[0.25em] opacity-80">Operational</p>
            </div>
            <h2 className="text-2xl font-black text-white tracking-tighter">{getTitle()}</h2>
          </div>
        </div>
      </Reveal>

      <div className="flex items-center gap-10">
        <Reveal y={-10} delay={0.2}>
          <div className="hidden lg:flex items-center gap-4 px-6 py-3 bg-white/5 rounded-2xl border border-white/5 focus-within:border-indigo-500/40 transition-all duration-500 group shadow-inner">
            <Search size={18} className="text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
            <input 
              type="text" 
              placeholder="Search financials..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-sm text-white w-72 placeholder:text-slate-600 font-medium"
            />
          </div>
        </Reveal>

        <div className="flex items-center gap-8">
          <Reveal delay={0.3} y={-10}>
            <div className="relative">
              <button 
                onClick={() => setIsNotifOpen(!isNotifOpen)}
                className={cn(
                  "p-3 rounded-2xl transition-all relative border border-white/5",
                  isNotifOpen ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/40" : "text-slate-400 hover:bg-white/5 hover:text-white"
                )}
              >
                <Bell size={22} />
                <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-slate-900 shadow-[0_0_10px_rgba(244,63,94,0.5)]" />
              </button>
              <NotificationDropdown isOpen={isNotifOpen} onClose={() => setIsNotifOpen(false)} />
            </div>
          </Reveal>
          
          <div className="h-10 w-px bg-white/10 hidden sm:block" />

          <Reveal delay={0.4} x={10} y={0}>
            <div className="flex items-center gap-4 pl-2">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-black text-white leading-none mb-1.5 uppercase tracking-widest">{user.name}</p>
                <div className="flex justify-end">
                  <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded text-[8px] font-black uppercase tracking-widest border border-indigo-500/20">{user.role}</span>
                </div>
              </div>
              <div className="relative">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white font-black text-lg shadow-2xl relative z-10 ring-2 ring-white/10">
                  {user.name[0]}
                </div>
              </div>
              <button
                onClick={onLogout}
                title="Sign Out"
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white transition-all duration-300 ml-2 font-black text-xs uppercase tracking-wider"
              >
                <LogOut size={16} />
                <span className="hidden sm:block">Sign Out</span>
              </button>
            </div>
          </Reveal>
        </div>
      </div>
    </header>
  );
};

// --- Pages ---

const Dashboard = ({ user, searchQuery }: { user: UserType, searchQuery: string }) => {
  const [rawExpenses, setExpenses] = useState<Expense[]>([]);
  const navigate = useNavigate();

  const expenses = useMemo(() => {
    if (!searchQuery) return rawExpenses;
    const q = searchQuery.toLowerCase();
    return rawExpenses.filter(e => 
      e.merchant.toLowerCase().includes(q) || 
      e.category.toLowerCase().includes(q)
    );
  }, [rawExpenses, searchQuery]);

  const handleExport = () => {
    if (expenses.length === 0) {
      toast.error('No expenses to export');
      return;
    }

    const headers = ['Date', 'Merchant', 'Category', 'Amount', 'Currency', 'Status', 'Description'];
    const BOM = '\uFEFF';
    const csvContentRows = [
      headers.join(','),
      ...expenses.map(e => [
        (e.date || ''),
        `"${(e.merchant || '').replace(/"/g, '""')}"`,
        (e.category || 'Other'),
        (e.amount || 0),
        (e.currency || 'Rs.'),
        (e.status || 'Pending'),
        `"${(e.description || '').replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');

    const fileName = 'reimburx_report.csv';
    const csvData = `sep=,\n` + BOM + csvContentRows;
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8' });
    
    // Fallback for older browsers
    if ((window.navigator as any).msSaveBlob) {
      (window.navigator as any).msSaveBlob(blob, fileName);
    } else {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      
      // Essential for Chrome/Edge to verify the download target
      document.body.appendChild(link);
      link.click();
      
      // Delayed cleanup to ensure the OS has locked the file
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 200);
    }

    toast.success('Report exported successfully!');
  };

  useEffect(() => {
    const q = query(
      collection(db, 'expenses'), 
      where('employeeId', '==', user.uid)
    );
    return onSnapshot(q, (snapshot) => {
      const sorted = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Expense))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 20);
      setExpenses(sorted);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'expenses');
    });
  }, [user.uid]);

  const stats = [
    { label: 'Asset Volume', value: expenses.length, icon: Layers, color: 'text-indigo-400', bg: 'bg-indigo-500/10', trend: '+12%', trendUp: true },
    { label: 'Unverified', value: expenses.filter(e => e.status === 'Pending').length, icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10', trend: '-5%', trendUp: false },
    { label: 'Settled Capital', value: expenses.filter(e => e.status === 'Approved').length, icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10', trend: '+18%', trendUp: true },
    { label: 'Deficited', value: expenses.filter(e => e.status === 'Rejected').length, icon: XCircle, color: 'text-rose-400', bg: 'bg-rose-500/10', trend: '-2%', trendUp: false },
  ];

  const chartData = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const data = days.map(day => ({ name: day, amount: 0 }));
    
    expenses.forEach(e => {
      const date = new Date(e.date);
      const dayName = days[date.getDay()];
      const dayData = data.find(d => d.name === dayName);
      if (dayData) dayData.amount += e.amount;
    });
    
    return data;
  }, [expenses]);

  const categoryData = useMemo(() => {
    const categories: { [key: string]: number } = {};
    expenses.forEach(e => {
      categories[e.category] = (categories[e.category] || 0) + e.amount;
    });
    
    const colors = ['#00E5FF', '#10B981', '#F59E0B', '#E11D48', '#8B5CF6', '#EC4899'];
    return Object.entries(categories).map(([name, value], i) => ({
      name,
      value,
      color: colors[i % colors.length]
    }));
  }, [expenses]);

  const insights = useMemo(() => {
    const total = expenses.reduce((acc, e) => acc + e.amount, 0);
    const travelTotal = expenses.filter(e => e.category === 'Travel').reduce((acc, e) => acc + e.amount, 0);
    const travelPercent = total > 0 ? Math.round((travelTotal / total) * 100) : 0;
    
    return [
      { 
        text: total > 1000 ? `Monthly liquidity is Rs.${total.toFixed(0)}, 12% above average` : "Liquidity is within normal range this month", 
        icon: TrendingUp, 
        color: total > 1000 ? "text-rose-400" : "text-emerald-400" 
      },
      { 
        text: `${travelPercent}% of your capital is deployed in Travel`, 
        icon: Info, 
        color: "text-indigo-400" 
      },
      { 
        text: expenses.length > 5 ? `AI optimized ${expenses.length} data points automatically` : "Scan receipts to see AI automation in action", 
        icon: Sparkles, 
        color: "text-amber-400" 
      },
    ];
  }, [expenses]);

  return (
    <div className="p-12 space-y-12 max-w-[1600px] mx-auto relative overflow-hidden">
      <Glow className="top-0 left-0" />
      <Glow color="rgba(79, 70, 229, 0.1)" className="bottom-0 right-0" size="500px" />

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 relative z-10">
        <Reveal>
          <div className="flex items-center gap-4 mb-3">
            <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[8px] font-black text-indigo-400 uppercase tracking-[0.2em]">Live Overview</span>
            <div className="h-px w-12 bg-white/10" />
          </div>
          <h1 className="text-5xl font-black text-white tracking-tighter mb-2">Portfolio Overview</h1>
          <p className="text-slate-500 text-lg font-medium max-w-xl leading-relaxed">System-wide financial telemetry and pattern recognition for your expense ecosystem.</p>
        </Reveal>
        <div className="flex items-center gap-4 relative z-10">
          <Reveal delay={0.1} y={0} x={20}>
            <button 
              onClick={handleExport}
              className="btn-secondary group"
            >
              <Download size={20} className="group-hover:translate-y-0.5 transition-transform" />
              Download Report
            </button>
          </Reveal>
          <Reveal delay={0.2} y={0} x={20}>
            <button 
              onClick={() => navigate('/submit')}
              className="btn-primary group"
            >
              <PlusCircle size={20} className="group-hover:rotate-90 transition-transform duration-500" />
              Ingest Data
            </button>
          </Reveal>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 relative z-10">
        {stats.map((stat, i) => (
          <PremiumCard 
            key={stat.label}
            delay={0.1 + i * 0.1}
            className="group"
          >
            <div className="flex justify-between items-start mb-6">
              <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border border-white/5 shadow-2xl transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3", stat.bg)}>
                <stat.icon className={stat.color} size={28} />
              </div>
              <div className={cn(
                "flex items-center gap-1.5 text-[9px] font-black px-3 py-1.5 rounded-full border border-white/5 shadow-inner uppercase tracking-wider",
                stat.trendUp ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
              )}>
                {stat.trendUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {stat.trend}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">{stat.label}</p>
              <div className="flex items-baseline gap-2">
                <p className="text-4xl font-black text-white tracking-tighter">{stat.value}</p>
                <span className="text-xs font-bold text-slate-600">units</span>
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          </PremiumCard>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 relative z-10">
        <div className="lg:col-span-2 space-y-10">
          <PremiumCard delay={0.5} className="p-0 overflow-visible">
            <div className="p-8 border-b border-white/5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-white tracking-tight">Market Analytics</h2>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1 opacity-70 italic">Temporal analysis of capital outflow</p>
              </div>
              <div className="flex gap-2">
                {['Daily', 'Weekly', 'Monthly'].map((range) => (
                  <button key={range} className={cn(
                    "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    range === 'Weekly' ? "bg-indigo-600 text-white" : "bg-white/5 text-slate-500 hover:text-white"
                  )}>
                    {range}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-8 h-[400px] w-full min-h-0 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00E5FF" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#00E5FF" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 900, fill: '#4B4E63' }}
                    dy={15}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 900, fill: '#4B4E63' }}
                    dx={-10}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#12121A', 
                      borderRadius: '20px', 
                      border: '1px solid rgba(255,255,255,0.1)', 
                      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                      padding: '16px'
                    }}
                    itemStyle={{ fontSize: '14px', fontWeight: '900', color: '#FFFFFF' }}
                    labelStyle={{ fontSize: '10px', fontWeight: '900', color: '#00E5FF', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                    cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 2 }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="amount" 
                    stroke="#00E5FF" 
                    strokeWidth={4}
                    fillOpacity={1} 
                    fill="url(#colorAmount)" 
                    animationDuration={2000}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </PremiumCard>

          <PremiumCard delay={0.6} className="p-0 overflow-visible">
            <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
              <div className="flex items-center gap-3">
                <div className="w-2 h-8 bg-indigo-500 rounded-full" />
                <h2 className="text-xl font-black text-white tracking-tight">Recent Telemetry</h2>
              </div>
              <Link to="/expenses" className="text-indigo-400 text-[10px] font-black hover:text-white transition-colors flex items-center gap-2 uppercase tracking-widest bg-white/5 px-4 py-2 rounded-xl group">
                Full Database <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
            <div className="divide-y divide-white/5">
              {expenses.length > 0 ? expenses.slice(0, 6).map((expense, i) => (
                <Reveal key={expense.id} delay={0.7 + i * 0.05} y={10} x={0}>
                  <div className="p-6 flex items-center justify-between hover:bg-white/[0.03] transition-all duration-500 cursor-pointer group px-8">
                    <div className="flex items-center gap-6">
                      <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-slate-500 group-hover:bg-indigo-500/10 group-hover:text-indigo-400 transition-all duration-500 border border-white/5 group-hover:scale-110 group-hover:rotate-3 shadow-xl">
                        <FileText size={24} />
                      </div>
                      <div>
                        <p className="text-lg font-black text-white group-hover:text-indigo-400 transition-colors tracking-tight">{expense.merchant}</p>
                        <div className="flex items-center gap-3 mt-1.5 contrast-75">
                          <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/10">{expense.category}</span>
                          <span className="w-1 h-1 rounded-full bg-slate-700" />
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{new Date(expense.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-black text-white group-hover:scale-110 transition-transform origin-right tracking-tighter">Rs.{expense.amount.toFixed(2)}</p>
                      <div className="flex justify-end mt-2">
                        <span className={cn("status-badge", 
                          expense.status === 'Pending' ? 'status-pending' : 
                          expense.status === 'Approved' ? 'status-approved' : 'status-rejected'
                        )}>
                          {expense.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </Reveal>
              )) : (
                <div className="p-20 text-center opacity-40">
                  <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl">
                    <History className="text-slate-500" size={40} />
                  </div>
                  <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Awaiting primary data ingestion...</p>
                </div>
              )}
            </div>
          </PremiumCard>
        </div>

        <div className="space-y-10 relative z-10">
          <PremiumCard className="bg-gradient-to-br from-indigo-600 to-blue-700 text-white overflow-hidden shadow-[0_40px_80px_-15px_rgba(0,229,255,0.3)] border-white/20">
            <div className="absolute top-[-30%] right-[-30%] w-64 h-64 bg-white/20 blur-[80px] rounded-full animate-pulse" />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-2 bg-white/10 rounded-xl backdrop-blur-md">
                  <CreditCard size={20} className="text-white" />
                </div>
                <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-white/70">Capital Threshold</h3>
              </div>
              <div className="mb-10">
                <p className="text-5xl font-black mb-2 tracking-tighter shadow-sm">Rs.2,250.00</p>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-white/20 rounded text-[9px] font-black uppercase tracking-widest">Utilized</span>
                  <p className="text-xs text-white/60 font-black tracking-widest">/ 5,000.00 LIMIT</p>
                </div>
              </div>
              <div className="h-4 bg-black/20 rounded-full mb-6 p-1 relative overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: '45%' }}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                  className="h-full bg-gradient-to-r from-white to-indigo-100 rounded-full shadow-[0_0_20px_rgba(255,255,255,0.6)] relative z-10" 
                />
                <div className="absolute inset-0 bg-white/5 rounded-full" />
              </div>
              <div className="flex justify-between text-[11px] font-black text-white/80 uppercase tracking-widest">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                  <span>45% Consumed</span>
                </div>
                <span>Rs.2,750 Available</span>
              </div>
            </div>
          </PremiumCard>

          <PremiumCard delay={0.7}>
            <div className="flex items-center gap-3 mb-8">
              <div className="w-1 h-6 bg-indigo-500 rounded-full" />
              <h3 className="text-sm font-black text-white uppercase tracking-widest italic">Intelligent Analytics</h3>
            </div>
            <div className="space-y-6">
              {insights.map((insight, i) => (
                <Reveal key={i} delay={0.8 + i * 0.1} y={10} x={0}>
                  <div className="flex gap-4 p-5 rounded-[24px] bg-white/[0.02] border border-white/5 hover:border-indigo-500/20 hover:bg-white/[0.04] transition-all duration-500 cursor-default group relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-slate-900 shadow-2xl group-hover:scale-110 transition-transform duration-500 relative z-10 border border-white/5", insight.color)}>
                      <insight.icon size={20} />
                    </div>
                    <p className="text-xs font-bold text-slate-400 leading-relaxed relative z-10 tracking-tight group-hover:text-slate-200 transition-colors uppercase tracking-widest opacity-80">{insight.text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </PremiumCard>

          <PremiumCard delay={0.9} className="p-8">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-1 h-6 bg-indigo-500 rounded-full" />
              <h3 className="text-sm font-black text-white uppercase tracking-widest italic">Allocation Matrix</h3>
            </div>
            <div className="h-[250px] w-full min-h-0 min-w-0 relative">
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={95}
                    paddingAngle={8}
                    dataKey="value"
                    stroke="none"
                    animationDuration={2000}
                  >
                    {categoryData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.color} 
                        className="hover:opacity-80 transition-opacity cursor-pointer shadow-2xl" 
                      />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#12121A', 
                      borderRadius: '16px', 
                      border: '1px solid rgba(255,255,255,0.1)', 
                      padding: '12px',
                      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                    }}
                    itemStyle={{ fontSize: '12px', fontWeight: '900' }}
                  />
                </RePieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total</span>
                <span className="text-2xl font-black text-white tracking-tighter">100%</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-y-4 gap-x-6 mt-8">
              {categoryData.map((cat) => (
                <div key={cat.name} className="flex items-center gap-3 group cursor-default">
                  <div className="w-2.5 h-2.5 rounded-full shadow-lg group-hover:scale-125 transition-transform" style={{ backgroundColor: cat.color }} />
                  <span className="text-[10px] font-black text-slate-500 group-hover:text-slate-300 transition-colors uppercase tracking-[0.15em]">{cat.name}</span>
                </div>
              ))}
            </div>
          </PremiumCard>
        </div>
      </div>
    </div>
  );
};

const SubmitExpense = ({ user }: { user: UserType }) => {
  const [step, setStep] = useState(1);
  const [isScanning, setIsScanning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    amount: '',
    merchant: '',
    category: 'Travel',
    date: new Date().toISOString().split('T')[0],
    description: '',
    extractedText: ''
  });
  const [showExtracted, setShowExtracted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const handleVoiceSubmission = () => {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Voice Recognition not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    // Use a ref to track the live transcript (avoids React state closure stale-read bug)
    let liveTranscript = '';

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-IN'; // Optimized for Indian accents and "rupees"
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setTranscript('Listening...');
    };

    recognition.onresult = (event: any) => {
      // Accumulate all results to get the final complete sentence
      let fullText = '';
      for (let i = 0; i < event.results.length; i++) {
        fullText += event.results[i][0].transcript;
      }
      liveTranscript = fullText; // Keep live ref updated
      setTranscript(fullText);   // Update UI display
    };

    recognition.onerror = (event: any) => {
      setIsListening(false);
      const errorMsg = event.error === 'not-allowed' ? 'Microphone permission denied. Please allow it in browser settings.' :
                       event.error === 'no-speech' ? 'No speech detected. Speak louder or closer to the mic.' :
                       event.error === 'network' ? 'Network error. Try again.' :
                       `Voice error: ${event.error}`;
      toast.error(errorMsg);
    };

    recognition.onend = () => {
      setIsListening(false);
      // Use liveTranscript (not state) to avoid React stale closure
      if (liveTranscript && liveTranscript.trim().length > 0) {
        const extracted = parseVoiceCommand(liveTranscript);
        setFormData(prev => ({
          ...prev,
          amount: extracted.amount || prev.amount,
          merchant: extracted.merchant || prev.merchant,
          category: extracted.category || prev.category,
          date: extracted.date || prev.date
        }));
        toast.success(`Voice captured: "${liveTranscript}"`);
        if (step === 1) setStep(2);
      } else {
        toast.error('No speech captured. Try again.');
      }
    };

    recognition.start();
  };

  const compressImage = (base64: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = 1024;
        
        if (width > height && width > maxDim) {
          height *= maxDim / width;
          width = maxDim;
        } else if (height > maxDim) {
          width *= maxDim / height;
          height = maxDim;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const imageData = e.target?.result as string;
        const compressed = await compressImage(imageData);
        setReceiptImage(compressed);
        setIsScanning(true);
        setStep(2);
        
        try {
          const result = await extractReceiptData(file);
          setFormData(prev => ({
            ...prev,
            amount: result.amount?.toString() || '',
            merchant: result.merchant || '',
            category: result.category || 'Travel',
            date: result.date || new Date().toISOString().split('T')[0],
            description: result.description || '',
            currency: result.currency || 'Rs.',
            extractedText: result.rawText
          }));
          const currencyNote = result.currency === 'INR' && result.amount 
            ? ` (Auto-converted to ₹${result.amount})` : '';
          toast.success(`AI Pattern Recognition Complete${currencyNote}`);
        } catch (error) {
          toast.error('AI scanning failed. Manual entry required.');
        } finally {
          setIsScanning(false);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      // Fetch approval rules for the company
      const ruleRef = doc(db, 'approvalRules', `rule-${user.companyId}`);
      const ruleSnap = await getDoc(ruleRef);
      const rule = ruleSnap.data() as ApprovalRule;

      const { pendingApprovers, nextIndex } = await evaluateNextApprovalGate(
        rule,
        rule?.isManagerFirst ? -1 : 0,
        user.uid,
        user.companyId
      );

      const expense: Omit<Expense, 'id'> = {
        userId: user.uid,
        employeeId: user.uid,
        companyId: user.companyId,
        merchant: formData.merchant,
        amount: parseFloat(formData.amount || '0'),
        currency: 'Rs.',
        date: formData.date,
        category: formData.category,
        description: formData.description,
        receiptUrl: receiptImage || '',
        status: 'Pending',
        currentApproverId: pendingApprovers[0] || '', 
        pendingApprovers: pendingApprovers, 
        currentApproverIndex: nextIndex,
        approvalChain: [],
        approvals: [],
        createdAt: Date.now()
      };
      await addDoc(collection(db, 'expenses'), expense);
      toast.success('Capital Ingested Successfully');
      navigate('/');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'expenses');
    } finally {
      setIsSubmitting(false);
    }
  };

  const steps = [
    { id: 1, title: 'Data Ingest', icon: ImagePlus },
    { id: 2, title: 'Verification', icon: ShieldCheck },
    { id: 3, title: 'Commitment', icon: FileSignature },
  ];

  return (
    <div className="p-12 max-w-6xl mx-auto relative min-h-[80vh] flex flex-col">
      <Glow color="rgba(0, 229, 255, 0.1)" className="top-10 left-10" size="400px" />
      <Glow color="rgba(79, 70, 229, 0.1)" className="bottom-10 right-10" size="400px" />

      <div className="w-full mb-16 relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-10">
        <Reveal>
          <div className="flex items-center gap-4 mb-3">
            <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[8px] font-black text-indigo-400 uppercase tracking-[0.3em]">Operational Node</span>
            <div className="h-px w-12 bg-white/10" />
          </div>
          <h1 className="text-5xl font-black text-white tracking-tighter">New Ingestion</h1>
        </Reveal>
        
        <div className="flex items-center gap-10">
          {steps.map((s, i) => (
            <React.Fragment key={s.id}>
              <Reveal delay={0.1 + i * 0.1} y={0} x={-10}>
                <div className="flex flex-col items-center gap-3">
                  <div className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-700 border-2",
                    step >= s.id 
                      ? "bg-indigo-600 border-indigo-400 text-white shadow-[0_0_30px_rgba(0,229,255,0.4)]" 
                      : "bg-white/5 border-white/10 text-slate-500"
                  )}>
                    <s.icon size={26} />
                  </div>
                  <span className={cn(
                    "text-[9px] font-black uppercase tracking-[0.2em] transition-colors duration-500",
                    step >= s.id ? "text-white" : "text-slate-600"
                  )}>{s.title}</span>
                </div>
              </Reveal>
              {i < steps.length - 1 && (
                <div className={cn(
                  "h-0.5 w-16 rounded-full transition-all duration-1000",
                  step > s.id ? "bg-indigo-500/50" : "bg-white/5"
                )} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 relative z-10 flex-1">
        <div className={cn("transition-all duration-1000 ease-[0.16, 1, 0.3, 1]", step === 1 ? "lg:col-span-12" : "lg:col-span-12 xl:col-span-7")}>
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div 
                key="step1"
                initial={{ opacity: 0, x: 20, filter: 'blur(10px)' }}
                animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, x: -20, filter: 'blur(10px)' }}
                transition={{ duration: 0.8 }}
                className="h-full"
              >
                <PremiumCard delay={0.3} className="h-full min-h-[500px] flex flex-col items-center justify-center border-dashed border-2 border-white/10 hover:border-indigo-500/40 cursor-pointer group transition-all relative overflow-hidden">
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    className="hidden" 
                    accept="image/*" 
                    onChange={handleFileUpload} 
                  />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,225,255,0.05)_0%,transparent_70%)] opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                  
                  <div onClick={() => fileInputRef.current?.click()} className="relative z-10 flex flex-col items-center">
                    <div className="w-28 h-28 bg-white/5 rounded-3xl flex items-center justify-center mb-10 group-hover:scale-110 group-hover:rotate-6 transition-transform duration-700 shadow-2xl relative">
                      <div className="absolute inset-0 bg-indigo-500/20 blur-2xl rounded-full animate-pulse" />
                      <Scan className="text-indigo-400 group-hover:text-white transition-colors relative z-10" size={48} />
                    </div>
                    <h3 className="text-3xl font-black text-white tracking-tighter mb-4 text-center">Deploy Receipt Asset</h3>
                    <p className="text-slate-500 text-sm font-bold uppercase tracking-[0.2em] opacity-80 mb-12">Drag-and-drop or select manual sequence</p>
                    
                    <div className="flex gap-6 mt-12">
                      <div className="flex items-center gap-3 px-5 py-2.5 bg-white/5 rounded-2xl border border-white/5 text-[10px] font-black text-slate-400 uppercase tracking-widest shadow-inner">
                        <ShieldCheck size={14} className="text-emerald-400" />
                        Encrypted
                      </div>
                      <div className="flex items-center gap-3 px-5 py-2.5 bg-white/5 rounded-2xl border border-white/5 text-[10px] font-black text-slate-400 uppercase tracking-widest shadow-inner">
                        <Zap size={14} className="text-amber-400" />
                        AI Extraction
                      </div>
                    </div>

                    <div className="mt-16 flex flex-col items-center gap-6">
                      <div className="flex items-center gap-4 text-xs font-black text-slate-600 uppercase tracking-widest">
                        <div className="w-12 h-px bg-white/5" />
                        Or use voice
                        <div className="w-12 h-px bg-white/5" />
                      </div>

                      <button 
                        onClick={(e) => { e.stopPropagation(); handleVoiceSubmission(); }}
                        className={cn(
                          "w-20 h-20 rounded-full flex items-center justify-center transition-all duration-700 relative overflow-hidden group/mic",
                          isListening ? "bg-indigo-600 shadow-[0_0_50px_rgba(79,70,229,0.5)]" : "bg-white/5 hover:bg-white/10 border border-white/10"
                        )}
                      >
                        {isListening ? (
                          <>
                            <div className="absolute inset-0 animate-ping opacity-20 bg-white rounded-full" />
                            <MicOff size={32} className="text-white animate-pulse" />
                          </>
                        ) : (
                          <Mic size={32} className="text-indigo-400 group-hover/mic:text-white group-hover/mic:scale-110 transition-all" />
                        )}
                      </button>
                      
                      {isListening && (
                        <motion.p 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-indigo-400 text-xs font-black uppercase tracking-[0.2em] italic"
                        >
                          {transcript}
                        </motion.p>
                      )}
                    </div>
                  </div>
                </PremiumCard>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div 
                key="step2"
                initial={{ opacity: 0, x: 20, filter: 'blur(10px)' }}
                animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, x: -20, filter: 'blur(10px)' }}
                transition={{ duration: 0.8 }}
                className="space-y-10"
              >
                <Reveal>
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h3 className="text-3xl font-black text-white tracking-tighter mb-2">Verification Matrix</h3>
                      <p className="text-slate-500 text-sm font-medium">Verify AI-interpreted financials before committing to the ledger.</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => setShowExtracted(!showExtracted)}
                        className={cn(
                          "px-5 py-2.5 text-[10px] font-black rounded-xl uppercase tracking-widest transition-all duration-500 border",
                          showExtracted ? "bg-indigo-600 text-white border-indigo-400" : "bg-white/5 text-slate-400 border-white/10 hover:bg-white/10 hover:text-white"
                        )}
                      >
                        {showExtracted ? 'Close Telemetry' : 'Full Scan Data'}
                      </button>
                    </div>
                  </div>
                </Reveal>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {[
                    { label: 'Merchant Identity', name: 'merchant', icon: Store },
                    { label: 'Asset Volume (INR)', name: 'amount', icon: IndianRupee, type: 'number' },
                    { label: 'Ingestion Date', name: 'date', icon: Calendar, type: 'date' },
                    { label: 'Asset Classification', name: 'category', icon: Tag, type: 'select', options: ['Travel', 'Meals', 'Office Supplies', 'Software', 'Other'] },
                  ].map((field, i) => (
                    <Reveal key={field.name} delay={0.1 + i * 0.1} x={20} y={0}>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2 flex items-center gap-2">
                           <field.icon size={14} className="text-indigo-400" />
                           {field.label}
                        </label>
                        {field.type === 'select' ? (
                          <div className="relative group">
                            <select 
                              value={formData.category}
                              onChange={(e) => setFormData({...formData, category: e.target.value})}
                              className="input-field appearance-none cursor-pointer pr-12 transition-all duration-500 group-hover:border-indigo-500/40 focus:ring-4 focus:ring-indigo-500/10"
                            >
                              {field.options?.map(opt => <option key={opt} value={opt} className="bg-slate-900">{opt}</option>)}
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-hover:text-indigo-400 transition-colors" size={18} />
                          </div>
                        ) : (
                          <div className="relative group">
                            <input 
                              type={field.type || 'text'}
                              value={(formData as any)[field.name]}
                              onChange={(e) => setFormData({...formData, [field.name]: e.target.value})}
                              className="input-field transition-all duration-500 group-hover:border-indigo-500/40 focus:ring-4 focus:ring-indigo-500/10"
                              placeholder={`Define ${field.label}...`}
                            />
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Sparkles className="text-indigo-500/40" size={16} />
                            </div>
                          </div>
                        )}
                      </div>
                    </Reveal>
                  ))}
                </div>

                <Reveal delay={0.5} y={20}>
                  <div className="flex gap-6 pt-6">
                    <button onClick={() => setStep(1)} className="btn-secondary flex-1 py-5 uppercase tracking-widest text-[11px]">Re-Ingest Resource</button>
                    <button onClick={() => setStep(3)} className="btn-primary flex-[1.5] py-5 uppercase tracking-widest text-[11px] group">
                      Initialize Final Step
                      <ArrowRight size={20} className="group-hover:translate-x-2 transition-transform duration-500" />
                    </button>
                  </div>
                </Reveal>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div 
                key="step3"
                initial={{ opacity: 0, x: 20, filter: 'blur(10px)' }}
                animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, x: -20, filter: 'blur(10px)' }}
                transition={{ duration: 0.8 }}
                className="space-y-10"
              >
                <PremiumCard className="overflow-visible relative">
                   <div className="text-center mb-12">
                     <div className="w-24 h-24 bg-emerald-500/10 rounded-[32px] flex items-center justify-center mx-auto mb-8 border border-emerald-500/20 shadow-[0_0_50px_rgba(16,185,129,0.2)]">
                       <ShieldCheck className="text-emerald-400" size={48} />
                     </div>
                     <h2 className="text-4xl font-black text-white tracking-tighter mb-4">Confirm Ledger Entry</h2>
                     <p className="text-slate-500 text-sm font-medium">Add final annotations for capital allocation auditing.</p>
                   </div>
                   
                   <form onSubmit={handleSubmit} className="space-y-10">
                     <Reveal delay={0.1} y={20}>
                       <div className="space-y-4">
                         <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.25em] ml-2">Contextual Annotation</label>
                         <textarea 
                           rows={6}
                           value={formData.description}
                           onChange={(e) => setFormData({...formData, description: e.target.value})}
                           className="input-field resize-none py-6 px-8 leading-relaxed focus:ring-8 transition-all"
                           placeholder="Specify strategic intent for this transaction..."
                         />
                       </div>
                     </Reveal>
                     
                     <Reveal delay={0.2} y={20}>
                       <div className="p-8 bg-white/[0.02] rounded-[32px] border border-white/5 space-y-6">
                         <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] text-center">Protocol Summary</h4>
                         <div className="flex items-center justify-around gap-8">
                           <div className="text-center space-y-1">
                             <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Merchant</p>
                             <p className="text-lg font-black text-white">{formData.merchant || 'ROOT'}</p>
                           </div>
                           <div className="w-px h-10 bg-white/10" />
                           <div className="text-center space-y-1">
                             <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Capital Output</p>
                             <p className="text-2xl font-black text-indigo-400 tracking-tighter">Rs.{parseFloat(formData.amount || '0').toLocaleString()}</p>
                           </div>
                         </div>
                       </div>
                     </Reveal>

                     <div className="flex gap-6">
                       <button type="button" onClick={() => setStep(2)} className="btn-secondary flex-1 py-5 uppercase tracking-widest text-[11px]">Step Back</button>
                       <button 
                         type="submit" 
                         disabled={isSubmitting}
                         className={cn(
                           "btn-primary flex-[2] py-5 uppercase tracking-widest text-[11px] group relative overflow-hidden",
                           isSubmitting ? "brightness-75" : ""
                         )}
                       >
                         {isSubmitting ? (
                           <div className="flex items-center gap-4">
                             <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                             <span className="animate-pulse">Writing to Ledger...</span>
                           </div>
                         ) : (
                           <div className="flex items-center gap-3">
                             <Database size={22} className="group-hover:scale-125 transition-transform duration-700" />
                             Commit Transaction
                           </div>
                         )}
                       </button>
                     </div>
                   </form>
                </PremiumCard>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {step > 1 && (
          <div className="lg:col-span-12 xl:col-span-5 h-full">
            <Reveal delay={0.3} x={20} y={0}>
              <PremiumCard className="p-0 h-full flex flex-col group overflow-visible sticky top-32">
                <div className="p-8 border-b border-white/5 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-black text-white tracking-tight">{showExtracted ? 'Telemetry Feed' : 'Visual Asset'}</h3>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">Ingestion Source {isScanning ? '[PROCESSING]' : '[VALID]'}</p>
                  </div>
                  <button 
                    onClick={() => setShowExtracted(!showExtracted)}
                    className={cn("p-4 rounded-2xl transition-all duration-500 border border-white/5", showExtracted ? "bg-indigo-600 text-white shadow-lg" : "bg-white/5 text-slate-500 hover:text-white")}
                  >
                    {showExtracted ? <FileText size={20} /> : <ScanEye size={20} />}
                  </button>
                </div>
                
                <div className="flex-1 min-h-[500px] bg-[#020205] relative overflow-hidden m-4 rounded-[28px] border border-white/5 group-hover:border-white/10 transition-colors">
                  {showExtracted ? (
                    <div className="absolute inset-0 p-8 font-mono text-[11px] text-emerald-400/80 overflow-y-auto whitespace-pre-wrap leading-relaxed selection:bg-indigo-500 selection:text-white">
                      <div className="flex items-center gap-3 mb-6 animate-pulse">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="uppercase tracking-[0.2em] font-black">Scanning document sequence...</span>
                      </div>
                      {formData.extractedText || "Awaiting primary extraction cycle..."}
                    </div>
                  ) : (
                    <div className="h-full relative overflow-hidden group/image">
                      {receiptImage ? (
                        <img 
                          src={receiptImage} 
                          alt="Receipt" 
                          className="w-full h-full object-cover grayscale opacity-40 group-hover/image:grayscale-0 group-hover/image:opacity-100 transition-all duration-1000 scale-110 group-hover/image:scale-100" 
                        />
                      ) : (
                        <div className="h-full flex items-center justify-center opacity-10">
                          <ImagePlus size={80} />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#020205] via-transparent to-transparent pointer-events-none" />
                      
                      {isScanning && (
                         <motion.div 
                           className="absolute inset-0 z-10 overflow-hidden"
                           initial={{ opacity: 0 }}
                           animate={{ opacity: 1 }}
                         >
                           <motion.div 
                             className="w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent shadow-[0_0_20px_rgba(0,229,255,1)]"
                             animate={{ top: ['0%', '100%', '0%'] }}
                             transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                             style={{ position: 'absolute' }}
                           />
                           <div className="absolute inset-0 bg-indigo-500/5 animate-pulse" />
                         </motion.div>
                      )}
                    </div>
                  )}
                </div>

                <div className="p-8 mt-auto border-t border-white/5 bg-white/[0.01]">
                   <div className="flex items-start gap-4">
                     <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0 border border-indigo-500/20 shadow-inner">
                       <Info size={18} className="text-indigo-400" />
                     </div>
                     <p className="text-[11px] text-slate-500 font-bold leading-relaxed uppercase tracking-widest opacity-80">
                       Our AI detected multiple <span className="text-white">financial markers</span>. Cross-reference them with the visual asset for zero-error commitment.
                     </p>
                   </div>
                </div>
              </PremiumCard>
            </Reveal>
          </div>
        )}
      </div>

      {/* Global Telemetry Modal */}
      <AnimatePresence>
        {showExtracted && step > 2 && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-8 bg-black/60 backdrop-blur-3xl">
             <motion.div 
               initial={{ opacity: 0, scale: 0.9, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.9, y: 20 }}
               className="w-full max-w-3xl bg-[#0A0A0F] border border-white/10 rounded-[32px] overflow-hidden shadow-[0_0_150px_rgba(0,0,0,0.9)]"
             >
               <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                 <div className="flex items-center gap-4">
                   <div className="w-12 h-12 bg-indigo-600/10 rounded-2xl flex items-center justify-center border border-indigo-500/20">
                     <FileCode className="text-indigo-400" size={24} />
                   </div>
                   <div>
                     <h3 className="text-lg font-black text-white tracking-tighter leading-none">AI Extraction Telemetry</h3>
                     <p className="text-[9px] text-indigo-400 font-black uppercase tracking-widest mt-1.5 opacity-80">Raw Neural Feed</p>
                   </div>
                 </div>
                 <button onClick={() => setShowExtracted(false)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 text-slate-500 hover:text-white transition-all border border-white/5">
                   <X size={20} />
                 </button>
               </div>
               <div className="p-10 max-h-[60vh] overflow-y-auto">
                 <pre className="p-8 bg-black/40 rounded-[28px] text-[11px] font-mono text-emerald-400/70 leading-relaxed overflow-x-auto border border-white/5 shadow-inner">
                   {formData.extractedText || "Sequence is empty."}
                 </pre>
                 <div className="mt-10 flex items-center gap-4 p-6 bg-indigo-500/5 rounded-[24px] border border-indigo-500/10">
                    <Zap size={24} className="text-indigo-400 shrink-0" />
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest leading-relaxed">
                      Telemetric data helps in identifying <span className="text-white">contextual mismatches</span>. If fields are missing, the neural engine might have encountered visual noise.
                    </p>
                 </div>
               </div>
               <div className="p-8 bg-white/[0.02] border-t border-white/5">
                 <button onClick={() => setShowExtracted(false)} className="btn-secondary w-full py-5 uppercase tracking-widest text-[11px]">Close Diagnostics</button>
               </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const MyExpenses = ({ user, searchQuery }: { user: UserType, searchQuery: string }) => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [filter, setFilter] = useState<ExpenseStatus | 'All'>('All');
  const [users, setUsers] = useState<UserType[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'users'), where('companyId', '==', user.companyId));
    return onSnapshot(q, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserType)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });
  }, [user.companyId]);

  useEffect(() => {
    const q = query(collection(db, 'expenses'), where('employeeId', '==', user.uid));
    return onSnapshot(q, (snapshot) => {
      const sorted = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Expense))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setExpenses(sorted);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'expenses');
    });
  }, [user.uid]);

  const filteredExpenses = useMemo(() => {
    let result = filter === 'All' ? expenses : expenses.filter(e => e.status === filter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e => 
        e.merchant.toLowerCase().includes(q) || 
        e.category.toLowerCase().includes(q)
      );
    }
    return result;
  }, [expenses, filter, searchQuery]);

  return (
    <div className="p-12 space-y-12 max-w-7xl mx-auto relative min-h-[80vh]">
      <Glow color="rgba(0, 229, 255, 0.05)" className="top-0 left-0" size="600px" />
      <Glow color="rgba(79, 70, 229, 0.05)" className="bottom-0 right-0" size="600px" />

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-10 relative z-10">
        <Reveal>
          <div className="flex items-center gap-4 mb-3">
             <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[8px] font-black text-indigo-400 uppercase tracking-[0.3em]">Operational History</span>
             <div className="h-px w-12 bg-white/10" />
          </div>
          <h1 className="text-5xl font-black text-white tracking-tighter">My Ledger</h1>
        </Reveal>
        
        <Reveal delay={0.2} x={20} y={0}>
          <div className="flex items-center gap-2 p-1.5 bg-white/5 backdrop-blur-3xl rounded-2xl border border-white/10 shadow-2xl">
            {['All', 'Pending', 'Approved', 'Rejected'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f as any)}
                className={cn(
                  "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-500",
                  filter === f ? "bg-indigo-600 text-white shadow-[0_0_20px_rgba(79,70,229,0.4)]" : "text-slate-500 hover:text-white"
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </Reveal>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 relative z-10">
        <AnimatePresence mode="popLayout">
          {filteredExpenses.map((expense, idx) => (
            <PremiumCard 
              key={expense.id} 
              delay={idx * 0.05}
              className="group overflow-visible"
            >
              <div className="p-8 space-y-8">
                <div className="flex items-start justify-between">
                  <div className="flex gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 group-hover:bg-indigo-600 transition-all duration-700 shadow-2xl group-hover:scale-110 group-hover:rotate-3 group-hover:text-white">
                      <FileText size={26} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-white tracking-tight line-clamp-1 mb-1">{expense.merchant}</h3>
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">{expense.category}</p>
                    </div>
                  </div>
                  <div className={cn(
                    "px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest border transition-all duration-500",
                    expense.status === 'Pending' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.2)]' : 
                    expense.status === 'Approved' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 
                    'bg-rose-500/10 text-rose-500 border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.2)]'
                  )}>
                    {expense.status}
                  </div>
                </div>

                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1.5 opacity-80">Allocation</p>
                    <p className="text-4xl font-black text-white tracking-tighter">Rs.<span className="text-indigo-400">{expense.amount.toLocaleString()}</span></p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1.5 opacity-80">Temporal Node</p>
                    <p className="text-sm font-black text-slate-400">{new Date(expense.date).toLocaleDateString()}</p>
                  </div>
                </div>

                {expense.description && (
                  <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5 italic text-[11px] text-slate-500 font-medium leading-relaxed group-hover:bg-white/[0.04] group-hover:border-white/10 transition-all duration-700">
                    "{expense.description}"
                  </div>
                )}

                <div className="space-y-4 pt-4 border-t border-white/5">
                  <p className="text-[8px] font-black text-slate-600 uppercase tracking-[0.25em]">Workflow Sequence</p>
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {expense.approvals.map((a, i) => (
                        <div 
                          key={i}
                          className="w-8 h-8 rounded-full bg-slate-900 border-2 border-[#12121A] flex items-center justify-center shadow-2xl relative group/avatar"
                          title={`${a.status} by ${users.find(u => u.uid === a.approverId)?.name}`}
                        >
                           <div className="absolute -top-1 -right-1 z-10">
                              {a.status === 'Approved' ? (
                                <div className="w-3 h-3 bg-emerald-500 rounded-full border border-[#12121A] flex items-center justify-center shadow-lg">
                                  <CheckCircle size={8} className="text-white" />
                                </div>
                              ) : (
                                <div className="w-3 h-3 bg-rose-500 rounded-full border border-[#12121A] flex items-center justify-center shadow-lg">
                                  <XCircle size={8} className="text-white" />
                                </div>
                              )}
                           </div>
                           <span className="text-[10px] font-black text-indigo-400">{users.find(u => u.uid === a.approverId)?.name?.[0] || 'A'}</span>
                        </div>
                      ))}
                      {expense.status === 'Pending' && (
                         <div className="w-8 h-8 rounded-full bg-amber-500/10 border-2 border-dashed border-amber-500/30 flex items-center justify-center animate-pulse shadow-inner">
                           <Clock size={12} className="text-amber-500" />
                         </div>
                      )}
                    </div>
                    <div className="h-px flex-1 bg-white/5" />
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">
                       {expense.status === 'Pending' ? 'In Rotation' : 'Sequence Closed'}
                    </span>
                  </div>
                </div>
              </div>
            </PremiumCard>
          ))}
        </AnimatePresence>
      </div>

      {filteredExpenses.length === 0 && (
        <Reveal>
          <div className="flex flex-col items-center justify-center py-40 bg-white/[0.01] rounded-[48px] border-2 border-dashed border-white/5">
            <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-8 shadow-inner border border-white/5">
              <History className="text-slate-700" size={48} />
            </div>
            <h3 className="text-2xl font-black text-white tracking-tighter mb-2">No Archived Sequences</h3>
            <p className="text-slate-500 text-sm font-medium tracking-tight">Deployment is ready. No previous nodes detected.</p>
          </div>
        </Reveal>
      )}
    </div>
  );
};

const Approvals = ({ user, searchQuery }: { user: UserType, searchQuery: string }) => {
  const [pendingExpenses, setPendingExpenses] = useState<Expense[]>([]);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [users, setUsers] = useState<UserType[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [convertedAmount, setConvertedAmount] = useState<number | null>(null);
  const [comment, setComment] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'users'), where('companyId', '==', user.companyId));
    return onSnapshot(q, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserType)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });
  }, [user.companyId]);

  useEffect(() => {
    let q;
    if (user.role === 'Admin') {
      q = query(collection(db, 'expenses'), where('companyId', '==', user.companyId));
    } else {
      q = query(
        collection(db, 'expenses'), 
        where('pendingApprovers', 'array-contains', user.uid)
      );
    }
    return onSnapshot(q, (snapshot) => {
      const all = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
      const filtered = user.role === 'Admin' ? all : all.filter(e => e.status === 'Pending');
      setPendingExpenses(filtered);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'expenses');
    });
  }, [user.uid, user.role, user.companyId]);

  const filteredPending = useMemo(() => {
    if (!searchQuery) return pendingExpenses;
    const q = searchQuery.toLowerCase();
    return pendingExpenses.filter(e => {
      const employee = users.find(u => u.uid === e.employeeId);
      return (
        e.merchant.toLowerCase().includes(q) || 
        (employee && employee.name.toLowerCase().includes(q)) ||
        e.category.toLowerCase().includes(q)
      );
    });
  }, [pendingExpenses, searchQuery, users]);

  useEffect(() => {
    if (selectedExpense && selectedExpense.currency !== user.currency) {
      setConvertedAmount(null);
      getExchangeRate(selectedExpense.currency.replace(/[^A-Za-z]/g, '') || 'USD', user.currency.replace(/[^A-Z]/g, '') || 'USD')
        .then(rate => {
          if (rate) setConvertedAmount(selectedExpense.amount * rate);
        }).catch(() => setConvertedAmount(null));
    } else {
      setConvertedAmount(null);
    }
  }, [selectedExpense, user.currency]);

  const handleAction = async (expense: Expense, action: 'Approved' | 'Rejected') => {
    setIsProcessing(true);
    try {
      const newApproval: Approval = {
        approverId: user.uid,
        status: action,
        timestamp: new Date().toISOString(),
        comment: comment.trim() || (user.role === 'Admin' && expense.pendingApprovers?.includes(user.uid) === false ? 'Admin Override' : '')
      };
      const updatedApprovals = [...expense.approvals, newApproval];

      if (user.role === 'Admin' && !expense.pendingApprovers?.includes(user.uid)) {
         await updateDoc(doc(db, 'expenses', expense.id), {
           status: action,
           currentApproverId: '',
           pendingApprovers: [],
           approvals: updatedApprovals
         });
         toast.success(`Expense forcefully ${action.toLowerCase()} by Admin`);
         setSelectedExpense(null);
         setComment('');
         return;
      }

      if (action === 'Rejected') {
        await updateDoc(doc(db, 'expenses', expense.id), {
          status: 'Rejected',
          pendingApprovers: [],
          approvals: updatedApprovals
        });
        toast.success('Expense rejected');
        setSelectedExpense(null);
        setComment('');
        return;
      }

      const ruleSnap = await getDoc(doc(db, 'approvalRules', `rule-${expense.companyId}`));
      const rule = ruleSnap.data() as ApprovalRule;
      
      let shouldProgress = true;
      let finalStatus: ExpenseStatus = 'Pending';

      if (rule.conditionalRules?.enabled && rule.conditionalRules.specificApproverOverride === user.uid) {
        shouldProgress = true;
        finalStatus = 'Approved'; 
      } 
      else if (rule.conditionalRules?.enabled && expense.pendingApprovers && expense.pendingApprovers.length > 1) {
        const approvalCount = updatedApprovals.filter(a => 
          a.status === 'Approved' && expense.pendingApprovers?.includes(a.approverId)
        ).length;
        const totalEligible = expense.pendingApprovers.length;
        const currentPercent = (approvalCount / totalEligible) * 100;

        if (currentPercent < rule.conditionalRules.percentageApproval) {
          shouldProgress = false;
        }
      }

      if (shouldProgress) {
        const nextGate = await evaluateNextApprovalGate(
          rule, 
          expense.currentApproverIndex + 1, 
          expense.userId, 
          expense.companyId
        );

        if (nextGate.pendingApprovers.length === 0 || finalStatus === 'Approved') {
          await updateDoc(doc(db, 'expenses', expense.id), {
            status: 'Approved',
            pendingApprovers: [],
            approvals: updatedApprovals,
            currentApproverIndex: expense.currentApproverIndex + 1
          });
          toast.success('Expense fully approved!');
        } else {
          await updateDoc(doc(db, 'expenses', expense.id), {
            pendingApprovers: nextGate.pendingApprovers,
            currentApproverId: nextGate.pendingApprovers[0],
            currentApproverIndex: nextGate.nextIndex,
            approvals: updatedApprovals
          });
          toast.success('Approved! Routed to next level.');
        }
      } else {
        await updateDoc(doc(db, 'expenses', expense.id), {
          approvals: updatedApprovals
        });
        toast.info('Approval recorded. Waiting for group threshold...');
      }

      setSelectedExpense(null);
      setComment('');
    } catch (error) {
      console.error(error);
      toast.error('Failed to process approval');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="p-12 max-w-[1600px] mx-auto space-y-12 relative min-h-[85vh]">
      <Glow color="rgba(79, 70, 229, 0.03)" className="top-0 left-1/4" size="800px" />
      
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-10 relative z-10">
        <Reveal>
          <div className="flex items-center gap-4 mb-3">
             <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[8px] font-black text-indigo-400 uppercase tracking-[0.3em]">Governance Module</span>
             <div className="h-px w-12 bg-white/10" />
          </div>
          <h1 className="text-5xl font-black text-white tracking-tighter">Review Engine</h1>
        </Reveal>
        
        <Reveal delay={0.2} x={20} y={0}>
          <div className="flex items-center gap-4 px-6 py-4 bg-white/5 backdrop-blur-3xl rounded-[32px] border border-white/10 shadow-2xl group transition-all duration-700 hover:border-indigo-500/30">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(79,70,229,0.4)] group-hover:scale-110 transition-transform">
              <Zap size={20} className="text-white" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Queue Status</p>
              <p className="text-xl font-black text-white leading-none tracking-tight">{filteredPending.length} <span className="text-indigo-400">NODES</span></p>
            </div>
          </div>
        </Reveal>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 relative z-10">
        <div className={cn("transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]", selectedExpense ? "lg:col-span-12" : "lg:col-span-12")}>
          <div className="bg-white/[0.02] border border-white/5 rounded-[40px] overflow-hidden backdrop-blur-3xl shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/5 border-b border-white/5">
                    <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Entity</th>
                    <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Context</th>
                    <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Allocation</th>
                    <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-right">Interaction</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
                  <AnimatePresence mode="popLayout">
                    {filteredPending.length > 0 ? filteredPending.map((expense) => {
                      const employee = users.find(u => u.uid === expense.employeeId);
                      return (
                      <motion.tr 
                        layout
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        key={expense.id} 
                        className={cn(
                          "group hover:bg-white/[0.04] transition-all duration-300 cursor-pointer relative",
                          selectedExpense?.id === expense.id ? "bg-indigo-600/10 border-indigo-500/20" : ""
                        )}
                        onClick={() => setSelectedExpense(expense)}
                      >
                        <td className="px-8 py-7">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 text-indigo-400 flex items-center justify-center font-black text-sm uppercase group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500 group-hover:rotate-6 group-hover:scale-110">
                              {employee ? employee.name[0] : 'E'}
                            </div>
                            <div>
                              <p className="text-sm font-black text-white tracking-tight">{employee ? employee.name : 'Unknown User'}</p>
                              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{expense.category}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-7">
                          <p className="text-sm font-black text-white tracking-tight uppercase leading-none mb-1.5">{expense.merchant || 'General'}</p>
                          <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{new Date(expense.date).toLocaleDateString()}</p>
                        </td>
                        <td className="px-8 py-7">
                          <p className="text-lg font-black text-white tracking-tighter leading-none mb-1">
                             <span className="text-[10px] text-slate-600 mr-1">{expense.currency || 'Rs.'}</span>
                             {expense.amount.toLocaleString()}
                          </p>
                          <p className="text-[8px] font-black text-emerald-500/60 uppercase tracking-widest">Compliant Node</p>
                        </td>
                        <td className="px-8 py-7 text-right">
                          <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all duration-500 transform translate-x-4 group-hover:translate-x-0">
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleAction(expense, 'Rejected'); }}
                              className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500 hover:text-white transition-all duration-500 flex items-center justify-center shadow-lg"
                              title="Reject"
                            >
                              <XCircle size={18} />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleAction(expense, 'Approved'); }}
                              className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500 hover:text-white transition-all duration-500 flex items-center justify-center shadow-lg"
                              title="Approve"
                            >
                              <CheckCircle size={18} />
                            </button>
                            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-slate-400 group-hover:text-white transition-all flex items-center justify-center">
                              <ChevronRight size={18} />
                            </div>
                          </div>
                        </td>
                      </motion.tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={4} className="px-8 py-32 text-center text-slate-500">
                           <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-white/5 shadow-inner">
                             <CheckCircle2 className="text-slate-800" size={40} />
                           </div>
                           <h3 className="text-xl font-black text-white tracking-tighter mb-2">Queue Clear</h3>
                           <p className="text-sm font-medium">All governance requirements met.</p>
                        </td>
                      </tr>
                    )}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {selectedExpense && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-black/60 backdrop-blur-md">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 30 }}
                className="w-full max-w-4xl max-h-full overflow-y-auto custom-scrollbar"
              >
                <PremiumCard className="p-12 space-y-12 overflow-visible">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6">
                       <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-2xl">
                          <Eye size={26} className="text-white" />
                       </div>
                       <div>
                         <h3 className="text-3xl font-black text-white tracking-tighter leading-none mb-1">Entity Review</h3>
                         <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">ID: {selectedExpense.id.substring(0, 12)}</p>
                       </div>
                    </div>
                    <button 
                      onClick={() => setSelectedExpense(null)} 
                      className="w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all flex items-center justify-center border border-white/10 shadow-inner"
                    >
                      <X size={24} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                     <div className="space-y-8">
                        <div className="aspect-[3/4] bg-slate-900 rounded-[40px] overflow-hidden relative group border-2 border-white/10 shadow-2xl">
                          <img 
                            src={selectedExpense.receiptUrl || 'https://picsum.photos/seed/receipt/600/800'} 
                            alt="Receipt" 
                            className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
                          />
                          <div className="absolute inset-x-0 bottom-0 p-8 bg-gradient-to-t from-black/80 to-transparent">
                             <p className="text-[10px] font-black text-white/60 uppercase tracking-widest mb-1">Visual Log</p>
                             <p className="text-sm font-black text-white">Capture verified at {new Date(selectedExpense.date).toLocaleDateString()}</p>
                          </div>
                        </div>
                     </div>

                     <div className="space-y-10">
                        <div className="p-8 bg-white/[0.02] border border-white/5 rounded-[32px] space-y-8 shadow-inner">
                           <div>
                             <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Total Value Assets</p>
                             <p className="text-5xl font-black text-white tracking-tighter mb-2">
                                <span className="text-indigo-400 mr-2">{selectedExpense.currency || 'Rs.'}</span>
                                {selectedExpense.amount.toLocaleString()}
                             </p>
                             {convertedAmount !== null && (
                                <div className="px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl inline-flex items-center gap-2">
                                   <Globe size={12} className="text-indigo-400" />
                                   <p className="text-[10px] font-black text-white uppercase tracking-widest">
                                     ≈ <span className="text-indigo-300">{user.currency || 'USD'}</span> {convertedAmount.toFixed(2)}
                                   </p>
                                </div>
                             )}
                           </div>

                           <div className="grid grid-cols-2 gap-6">
                              <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                                 <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Category</p>
                                 <p className="text-xs font-black text-white uppercase tracking-widest">{selectedExpense.category}</p>
                              </div>
                              <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                                 <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Merchant</p>
                                 <p className="text-xs font-black text-white uppercase tracking-widest truncate">{selectedExpense.merchant || 'General'}</p>
                              </div>
                           </div>
                        </div>

                        <div className="space-y-6">
                          <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Audit Timeline</h4>
                          <div className="space-y-8 relative pl-6">
                            <div className="absolute left-0 top-3 bottom-0 w-px bg-white/10" />
                            
                            <div className="relative group">
                              <div className="absolute -left-7 top-1 w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] border-2 border-[#12121A] z-10" />
                              <p className="text-[11px] font-black text-white uppercase tracking-widest leading-none mb-1">System Deployment</p>
                              <p className="text-[9px] text-slate-600 font-bold">{new Date(selectedExpense.createdAt).toLocaleString()}</p>
                            </div>

                            {selectedExpense.approvals.map((approval, i) => (
                              <div key={i} className="relative">
                                <div className={cn(
                                  "absolute -left-7 top-1 w-2.5 h-2.5 rounded-full border-2 border-[#12121A] z-10",
                                  approval.status === 'Approved' ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" : "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]"
                                )} />
                                <div className="flex justify-between items-start mb-2">
                                  <div>
                                    <p className="text-[11px] font-black text-white uppercase tracking-widest leading-none mb-1">
                                      {approval.status} by {users.find(u => u.uid === approval.approverId)?.name || 'Manager'}
                                    </p>
                                    <p className="text-[9px] text-slate-600 font-bold">{new Date(approval.timestamp).toLocaleString()}</p>
                                  </div>
                                </div>
                                {approval.comment && (
                                  <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                                    <p className="text-[10px] text-slate-400 italic">"{approval.comment}"</p>
                                  </div>
                                )}
                              </div>
                            ))}

                            {selectedExpense.status === 'Pending' && (
                              <div className="relative animate-pulse">
                                <div className="absolute -left-7 top-1 w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] border-2 border-[#12121A] z-10" />
                                <p className="text-[11px] font-black text-indigo-400 uppercase tracking-widest mb-1">Awaiting Authorization</p>
                                <p className="text-[9px] text-slate-600 font-bold">In review queue...</p>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="space-y-6 pt-6 border-t border-white/5">
                          <textarea
                            placeholder="Type decision rationale..."
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-[24px] p-6 text-sm text-white focus:outline-none focus:border-indigo-500/40 focus:ring-4 focus:ring-indigo-500/10 transition-all min-h-[120px] resize-none placeholder-slate-700 font-medium"
                          />
                          <div className="grid grid-cols-2 gap-4">
                            <button
                              disabled={isProcessing}
                              onClick={() => handleAction(selectedExpense, 'Rejected')}
                              className="py-5 px-6 rounded-3xl bg-white/[0.02] border border-white/10 text-slate-500 font-black text-[11px] uppercase tracking-[0.2em] hover:bg-rose-500/10 hover:border-rose-500/20 hover:text-rose-500 transition-all active:scale-95 disabled:opacity-50"
                            >
                              Reject Node
                            </button>
                            <button
                              disabled={isProcessing}
                              onClick={() => handleAction(selectedExpense, 'Approved')}
                              className="py-5 px-6 rounded-3xl bg-indigo-600 text-white font-black text-[11px] uppercase tracking-[0.2em] shadow-[0_20px_40px_rgba(79,70,229,0.3)] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                            >
                              Authorize Deployment
                            </button>
                          </div>
                        </div>
                     </div>
                  </div>
                </PremiumCard>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const TeamPage = ({ user }: { user: UserType }) => {
  const [teamMembers, setTeamMembers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let q;
    const usersRef = collection(db, 'users');
    if (user.role === 'Admin') {
      q = query(usersRef, where('companyId', '==', user.companyId));
    } else if (user.role === 'Manager') {
      q = query(usersRef, where('companyId', '==', user.companyId), where('managerId', '==', user.uid));
    } else {
      q = query(usersRef, where('companyId', '==', user.companyId), where('managerId', '==', user.managerId || user.uid));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTeamMembers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserType)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user.companyId, user.role, user.uid, user.managerId]);

  return (
    <div className="p-12 space-y-12 max-w-7xl mx-auto relative min-h-[80vh]">
      <Glow color="rgba(79, 70, 229, 0.05)" className="top-10 left-10" size="600px" />
      
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-10 relative z-10">
        <Reveal>
          <div className="flex items-center gap-4 mb-3">
             <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[8px] font-black text-indigo-400 uppercase tracking-[0.3em]">Corporate Hierarchy</span>
             <div className="h-px w-12 bg-white/10" />
          </div>
          <h1 className="text-5xl font-black text-white tracking-tighter">The Collective</h1>
        </Reveal>

        <Reveal delay={0.2} x={20} y={0}>
           <div className="px-6 py-3 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-3 shadow-2xl backdrop-blur-3xl">
              <Users size={18} className="text-indigo-400" />
              <p className="text-xs font-black text-white uppercase tracking-widest">{teamMembers.length} ACTIVE NODES</p>
           </div>
        </Reveal>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 relative z-10">
        {loading ? (
          <div className="col-span-full py-40 text-center">
             <div className="w-16 h-16 border-4 border-white/10 border-t-indigo-600 rounded-full animate-spin mx-auto mb-6" />
             <p className="text-slate-500 font-black text-xs uppercase tracking-[0.4em]">Synchronizing Entity Data...</p>
          </div>
        ) : (
          <AnimatePresence>
            {teamMembers.map((member, idx) => (
              <PremiumCard 
                key={member.uid} 
                delay={idx * 0.05}
                className="overflow-visible group"
              >
                <div className="p-10 space-y-8">
                  <div className="flex items-center gap-6">
                    <div className="w-20 h-20 rounded-[32px] bg-white/5 border-2 border-white/10 text-indigo-400 flex items-center justify-center font-black text-3xl transition-all duration-700 group-hover:bg-indigo-600 group-hover:text-white group-hover:rotate-6 group-hover:scale-110 shadow-2xl">
                      {member.name[0]?.toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-white tracking-tighter mb-1">{member.name}</h3>
                      <div className="flex items-center gap-2">
                         <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 text-[8px] font-black uppercase tracking-widest rounded-md border border-indigo-500/20">
                           {member.role}
                         </span>
                         <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{member.currency}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-8 border-t border-white/5 flex flex-col gap-4">
                    <div className="flex items-center gap-3 text-slate-400 group-hover:text-white transition-colors">
                      <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                        <Globe size={14} />
                      </div>
                      <span className="text-xs font-bold truncate">{member.email}</span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-400">
                      <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                        <Layers size={14} />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">Context node {member.uid.substring(0, 8)}</span>
                    </div>
                  </div>

                  <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                     <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center shadow-[0_0_20px_rgba(79,70,229,0.4)]">
                        <ArrowUpRight size={18} className="text-white" />
                     </div>
                  </div>
                </div>
              </PremiumCard>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

const AdminSettings = ({ user }: { user: UserType }) => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserType[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [rule, setRule] = useState<ApprovalRule | null>(null);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', name: '', role: 'Employee' as Role, managerId: '' });
  const [activeTab, setActiveTab] = useState<'workflow' | 'users' | 'company'>('workflow');

  useEffect(() => {
    if (user.role !== 'Admin') return;

    const unsubscribeUsers = onSnapshot(query(collection(db, 'users'), where('companyId', '==', user.companyId)), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserType)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    const unsubscribeCompany = onSnapshot(doc(db, 'companies', user.companyId), (doc) => {
      setCompany(doc.data() as Company);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `companies/${user.companyId}`);
    });

    const ruleId = `rule-${user.companyId}`;
    const unsubscribeRule = onSnapshot(doc(db, 'approvalRules', ruleId), (docSnap) => {
      if (docSnap.exists()) {
        setRule(docSnap.data() as ApprovalRule);
      } else {
        const defaultRule: ApprovalRule = {
          id: ruleId,
          companyId: user.companyId,
          sequence: []
        };
        setDoc(doc(db, 'approvalRules', ruleId), defaultRule).catch(err => {
          handleFirestoreError(err, OperationType.WRITE, `approvalRules/${ruleId}`);
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `approvalRules/${ruleId}`);
    });

    return () => {
      unsubscribeUsers();
      unsubscribeCompany();
      unsubscribeRule();
    };
  }, [user.companyId, user.role]);

  if (user.role !== 'Admin') {
    return (
      <div className="p-12 flex items-center justify-center min-h-[70vh]">
        <PremiumCard className="p-12 text-center max-w-md space-y-8">
          <div className="w-20 h-20 bg-rose-500/10 border border-rose-500/20 rounded-3xl flex items-center justify-center mx-auto text-rose-500 shadow-[0_0_30px_rgba(244,63,94,0.2)]">
            <ShieldCheck size={40} />
          </div>
          <div className="space-y-3">
             <h2 className="text-3xl font-black text-white tracking-tighter">Access Denied</h2>
             <p className="text-slate-500 text-sm font-medium">You need system-level clearance to access the control plane.</p>
          </div>
          <button 
            onClick={() => navigate('/')} 
            className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/10 transition-all"
          >
            Return to Command Center
          </button>
        </PremiumCard>
      </div>
    );
  }

  const handleAddUser = async () => {
    if (!newUser.email || !newUser.name) return;
    const tempUid = `temp-${Math.random().toString(36).substr(2, 9)}`;
    const userToCreate: UserType = {
      uid: tempUid,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      companyId: user.companyId,
      managerId: newUser.managerId || undefined,
      currency: company?.baseCurrency || 'USD'
    };
    await setDoc(doc(db, 'users', tempUid), userToCreate);
    setIsAddingUser(false);
    setNewUser({ email: '', name: '', role: 'Employee', managerId: '' });
    toast.success('User added successfully');
  };

  const handleUpdateRole = async (targetUid: string, role: Role) => {
    await updateDoc(doc(db, 'users', targetUid), { role });
    toast.success('Role updated');
  };

  const handleUpdateManager = async (targetUid: string, managerId: string) => {
    await updateDoc(doc(db, 'users', targetUid), { managerId });
    toast.success('Manager updated');
  };

  const handleAddStep = async () => {
    if (!rule) return;
    const newStep: ApprovalStep = { type: 'Manager', value: '' };
    const updatedSequence = [...rule.sequence, newStep];
    await updateDoc(doc(db, 'approvalRules', rule.id), { sequence: updatedSequence });
    toast.success('Approval step added');
  };

  const handleRemoveStep = async (index: number) => {
    if (!rule) return;
    const updatedSequence = rule.sequence.filter((_, i) => i !== index);
    await updateDoc(doc(db, 'approvalRules', rule.id), { sequence: updatedSequence });
    toast.success('Approval step removed');
  };

  const handleUpdateStep = async (index: number, step: ApprovalStep) => {
    if (!rule) return;
    const updatedSequence = [...rule.sequence];
    updatedSequence[index] = step;
    await updateDoc(doc(db, 'approvalRules', rule.id), { sequence: updatedSequence });
  };

  const handleToggleManagerFirst = async (enabled: boolean) => {
    if (!rule) return;
    await updateDoc(doc(db, 'approvalRules', rule.id), { isManagerFirst: enabled });
    toast.success('Manager routing updated');
  };

  const handleUpdateConditionalRules = async (config: Partial<ConditionalRuleConfig>) => {
    if (!rule) return;
    const currentConfig = rule.conditionalRules || { enabled: false, percentageApproval: 100, logic: 'AND' };
    await updateDoc(doc(db, 'approvalRules', rule.id), { 
      conditionalRules: { ...currentConfig, ...config } 
    });
    // No toast here to avoid spamming on input changes
  };

  const handleSetupProfessionalWorkflow = async () => {
    if (!rule) return;
    const professionalRule: Partial<ApprovalRule> = {
      isManagerFirst: true,
      sequence: [
        { type: 'Role' as any, value: 'Manager' },
        { type: 'SpecificUser', value: user.uid }
      ],
      conditionalRules: {
        enabled: true,
        percentageApproval: 50,
        specificApproverOverride: user.uid,
        logic: 'OR'
      }
    };
    await updateDoc(doc(db, 'approvalRules', rule.id), professionalRule);
    toast.success('Professional enterprise workflow configured!', {
      description: 'Manager-First, Finance Group (50%), and Admin Overrides are now active.'
    });
  };

  return (
    <div className="p-12 max-w-[1600px] mx-auto space-y-16 relative min-h-[90vh]">
      <Glow color="rgba(79, 70, 229, 0.04)" className="top-20 left-1/3" size="900px" />
      
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-12 relative z-10">
        <Reveal>
          <div className="flex items-center gap-4 mb-4">
             <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[8px] font-black text-indigo-400 uppercase tracking-[0.4em]">Core Governance</span>
             <div className="h-px w-12 bg-white/10" />
          </div>
          <h1 className="text-6xl font-black text-white tracking-tighter">Control Plane</h1>
        </Reveal>

        <Reveal delay={0.2} x={20} y={0}>
          <div className="flex items-center gap-1 p-1.5 bg-white/5 backdrop-blur-3xl rounded-[24px] border border-white/10 shadow-2xl">
            {[
              { id: 'workflow', label: 'Architecture', icon: GitBranch },
              { id: 'users', label: 'Nodes', icon: Users },
              { id: 'company', label: 'Entity', icon: Building2 }
            ].map((tab) => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                   "flex items-center gap-2.5 px-6 py-3 rounded-[18px] text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-500",
                   activeTab === tab.id 
                    ? "bg-indigo-600 text-white shadow-[0_10px_20px_rgba(79,70,229,0.3)] scale-105" 
                    : "text-slate-500 hover:text-white hover:bg-white/5"
                )}
              >
                <tab.icon size={14} className={activeTab === tab.id ? "text-white" : "text-slate-600"} />
                {tab.label}
              </button>
            ))}
          </div>
        </Reveal>
      </div>

      <div className="relative z-10">
        <AnimatePresence mode="wait">
          {activeTab === 'workflow' && (
            <motion.div 
               key="workflow"
               initial={{ opacity: 0, y: 30 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: -30 }}
               className="space-y-12"
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <PremiumCard className="p-10 space-y-8 lg:col-span-1 border-indigo-500/20">
                   <div className="w-16 h-16 rounded-[24px] bg-indigo-500/10 border-2 border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-inner">
                      <ShieldCheck size={32} />
                   </div>
                   <div>
                      <h3 className="text-3xl font-black text-white tracking-tighter mb-2">Protocol Architecture</h3>
                      <p className="text-slate-500 text-sm font-medium leading-relaxed">Establish the primary consensus logic for all financial deployments within the network.</p>
                   </div>
                   <button 
                      onClick={handleSetupProfessionalWorkflow}
                      className="group w-full py-5 bg-white text-slate-950 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 transition-all shadow-2xl overflow-hidden relative"
                   >
                      <span className="relative z-10 flex items-center gap-2">
                        <Sparkles size={16} />
                        Auto-Initialize Enterprise Flow
                      </span>
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-900/5 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite]" />
                   </button>
                </PremiumCard>

                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-8">
                   <div className="p-10 bg-white/[0.02] border border-white/5 rounded-[48px] space-y-8 shadow-inner backdrop-blur-3xl group hover:border-indigo-500/20 transition-colors">
                      <div className="flex items-center justify-between">
                         <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-indigo-400">
                           <GitPullRequest size={20} />
                         </div>
                         <button 
                            onClick={() => handleToggleManagerFirst(!rule?.isManagerFirst)}
                            className={cn(
                               "relative w-16 h-8 rounded-full transition-all duration-500",
                               rule?.isManagerFirst ? "bg-indigo-600 shadow-[0_0_20px_rgba(79,70,229,0.5)]" : "bg-white/10"
                            )}
                         >
                            <div className={cn("absolute top-1.5 w-5 h-5 rounded-full bg-white transition-all duration-500 shadow-lg", rule?.isManagerFirst ? "left-9" : "left-2")} />
                         </button>
                      </div>
                      <div>
                        <h4 className="text-xl font-black text-white tracking-tight leading-none mb-2">Authority Cascade</h4>
                        <p className="text-xs text-slate-600 font-bold uppercase tracking-widest">SUB-TIER ROUTING ACTIVE</p>
                      </div>
                      <p className="text-sm text-slate-500 font-medium">Automatic node routing to direct superiors before entering the main consensus chain.</p>
                   </div>

                   <div className="p-10 bg-white/[0.02] border border-white/5 rounded-[48px] space-y-8 shadow-inner backdrop-blur-3xl group hover:border-emerald-500/20 transition-colors">
                      <div className="flex items-center justify-between">
                         <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-emerald-400">
                           <LayoutList size={20} />
                         </div>
                         <button 
                            onClick={() => handleUpdateConditionalRules({ enabled: !rule?.conditionalRules?.enabled })}
                            className={cn(
                               "relative w-16 h-8 rounded-full transition-all duration-500",
                               rule?.conditionalRules?.enabled ? "bg-emerald-600 shadow-[0_0_20px_rgba(16,185,129,0.5)]" : "bg-white/10"
                            )}
                         >
                            <div className={cn("absolute top-1.5 w-5 h-5 rounded-full bg-white transition-all duration-500 shadow-lg", rule?.conditionalRules?.enabled ? "left-9" : "left-2")} />
                         </button>
                      </div>
                      <div>
                        <h4 className="text-xl font-black text-white tracking-tight leading-none mb-2">Group Threshold</h4>
                        <p className="text-xs text-slate-600 font-bold uppercase tracking-widest">MINIMUM CONSENSUS REQUIREMENT</p>
                      </div>
                      {rule?.conditionalRules?.enabled ? (
                        <div className="flex items-end gap-4">
                           <input 
                              type="number" 
                              value={rule.conditionalRules.percentageApproval}
                              onChange={(e) => handleUpdateConditionalRules({ percentageApproval: parseInt(e.target.value) || 100 })}
                              className="w-24 bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white font-black text-2xl focus:outline-none focus:border-emerald-500/50"
                           />
                           <div className="pb-4">
                              <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">% QUORUM</p>
                           </div>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500 font-medium">Require a specific percentage of group authorization for final node validation.</p>
                      )}
                   </div>
                </div>
              </div>

              <div className="space-y-10 relative">
                 <div className="flex items-center justify-between">
                    <div>
                       <h3 className="text-4xl font-black text-white tracking-tighter">Chain Architecture</h3>
                       <p className="text-slate-500 text-sm font-medium tracking-tight">Configure chronological authorization sequence.</p>
                    </div>
                    <button 
                       onClick={handleAddStep}
                       className="group px-8 py-4 bg-white/5 border border-white/10 text-white rounded-[24px] text-[10px] font-black uppercase tracking-[0.3em] hover:bg-white hover:text-slate-950 transition-all shadow-2xl flex items-center gap-3"
                    >
                       <PlusCircle size={18} />
                       Inject Hierarchy Node
                    </button>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-10">
                    <AnimatePresence mode="popLayout">
                       {rule?.sequence.map((step, index) => (
                         <motion.div 
                           layout
                           key={index}
                           initial={{ opacity: 0, scale: 0.9, y: 20 }}
                           animate={{ opacity: 1, scale: 1, y: 0 }}
                           exit={{ opacity: 0, scale: 0.9, y: 20 }}
                           className="relative"
                         >
                           <PremiumCard className="p-10 space-y-10 border-indigo-500/10 group">
                              <div className="flex items-center justify-between">
                                 <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-xl shadow-[0_10px_20px_rgba(79,70,229,0.3)]">
                                       0{index + 1}
                                    </div>
                                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Gate Node</h4>
                                 </div>
                                 <button 
                                    onClick={() => handleRemoveStep(index)}
                                    className="w-10 h-10 rounded-xl bg-white/5 text-slate-500 hover:bg-rose-500 hover:text-white transition-all opacity-0 group-hover:opacity-100 border border-white/5 flex items-center justify-center shadow-inner"
                                 >
                                    <Trash2 size={16} />
                                 </button>
                              </div>

                              <div className="space-y-8">
                                 <div className="space-y-3">
                                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1">Logic Pattern</label>
                                    <select 
                                      value={step.type}
                                      onChange={(e) => handleUpdateStep(index, { ...step, type: e.target.value as any })}
                                      className="w-full bg-white/[0.04] border border-white/10 rounded-2xl px-5 py-4 text-xs text-white uppercase tracking-widest font-black focus:outline-none focus:border-indigo-500/50 transition-all"
                                    >
                                      <option value="Manager">Direct Hierarchy</option>
                                      <option value="SpecificUser">Individual Profile</option>
                                      <option value="Role Based">Role-Based Consensus</option>
                                    </select>
                                 </div>

                                 <div className="space-y-3">
                                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1">Pattern Assignment</label>
                                    {step.type === 'SpecificUser' ? (
                                      <select 
                                        value={step.value}
                                        onChange={(e) => handleUpdateStep(index, { ...step, value: e.target.value })}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-xs text-white font-black focus:outline-none focus:border-indigo-500/50 transition-all"
                                      >
                                        <option value="">Search Nodes...</option>
                                        {users.map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}
                                      </select>
                                    ) : step.type === 'Role Based' ? (
                                      <select 
                                        value={step.value}
                                        onChange={(e) => handleUpdateStep(index, { ...step, value: e.target.value })}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-xs text-white font-black focus:outline-none focus:border-indigo-500/50 transition-all"
                                      >
                                        <option value="">Select Level...</option>
                                        <option value="Manager">Management Group</option>
                                        <option value="Admin">Administrator Council</option>
                                      </select>
                                    ) : (
                                      <div className="px-5 py-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em] text-center italic">
                                        Inherited from request origin
                                      </div>
                                    )}
                                 </div>
                              </div>
                           </PremiumCard>
                         </motion.div>
                       ))}
                    </AnimatePresence>
                 </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'users' && (
            <motion.div 
               key="users"
               initial={{ opacity: 0, scale: 0.98 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.98 }}
               className="space-y-12"
            >
               <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-4xl font-black text-white tracking-tighter">The Collective</h3>
                    <p className="text-slate-500 text-sm font-medium tracking-tight leading-relaxed">Identity vault and permission orchestration for the entity.</p>
                  </div>
                  <button 
                    onClick={() => setIsAddingUser(true)}
                    className="group relative px-10 py-5 bg-white text-slate-950 rounded-[28px] text-[10px] font-black uppercase tracking-[0.3em] shadow-2xl hover:scale-105 active:scale-95 transition-all"
                  >
                     <span className="relative z-10 flex items-center gap-3">
                        <PlusCircle size={18} />
                        Sync New Entity
                     </span>
                  </button>
               </div>

               <div className="bg-white/[0.02] border border-white/5 rounded-[48px] overflow-hidden backdrop-blur-3xl shadow-[0_40px_100px_rgba(0,0,0,0.6)]">
                  <table className="w-full text-left border-collapse">
                     <thead>
                        <tr className="bg-white/5 border-b border-white/5">
                           <th className="px-12 py-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Node Identity</th>
                           <th className="px-12 py-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Auth Protocol</th>
                           <th className="px-12 py-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Consensus Line</th>
                           <th className="px-12 py-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] text-right">Interactive</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-white/[0.02]">
                        {users.map((member) => (
                           <tr key={member.uid} className="group hover:bg-white/[0.03] transition-all duration-300">
                              <td className="px-12 py-10">
                                 <div className="flex items-center gap-6">
                                    <div className="w-16 h-16 rounded-[24px] bg-white/5 border border-white/10 text-indigo-400 flex items-center justify-center font-black text-xl transition-all group-hover:bg-indigo-600 group-hover:text-white group-hover:rotate-6 shadow-2xl">
                                       {member.name[0]}
                                    </div>
                                    <div>
                                       <p className="text-base font-black text-white tracking-tight leading-none mb-2">{member.name}</p>
                                       <p className="text-[11px] font-bold text-slate-600 truncate max-w-[240px] uppercase tracking-widest">{member.email}</p>
                                    </div>
                                 </div>
                              </td>
                              <td className="px-12 py-10">
                                 <select 
                                   value={member.role}
                                   onChange={(e) => handleUpdateRole(member.uid, e.target.value as Role)}
                                   className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl px-5 py-3 text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] focus:outline-none transition-all group-hover:border-indigo-500/40"
                                 >
                                    <option value="Employee">Employee Node</option>
                                    <option value="Manager">Authority Node</option>
                                    <option value="Admin">Council Member</option>
                                 </select>
                              </td>
                              <td className="px-12 py-10">
                                 <select 
                                   value={member.managerId || ''}
                                   onChange={(e) => handleUpdateManager(member.uid, e.target.value)}
                                   className="bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] focus:outline-none group-hover:border-white/20 transition-all font-bold"
                                 >
                                    <option value="">Independent Path</option>
                                    {users.filter(u => u.uid !== member.uid).map(u => (
                                       <option key={u.uid} value={u.uid}>{u.name}</option>
                                    ))}
                                 </select>
                              </td>
                              <td className="px-12 py-10 text-right">
                                 <button className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 text-slate-600 hover:text-white transition-all flex items-center justify-center opacity-0 group-hover:opacity-100 shadow-inner">
                                    <ChevronRight size={20} />
                                 </button>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </motion.div>
          )}

          {activeTab === 'company' && (
            <motion.div 
               key="company"
               initial={{ opacity: 0, x: 50 }}
               animate={{ opacity: 1, x: 0 }}
               exit={{ opacity: 0, x: -50 }}
               className="max-w-4xl mx-auto"
            >
               <PremiumCard className="p-16 space-y-16 border-white/5">
                  <div className="flex items-center gap-12">
                     <div className="w-28 h-28 rounded-[48px] bg-indigo-600 flex items-center justify-center shadow-[0_40px_80px_rgba(79,70,229,0.5)] relative group cursor-pointer overflow-hidden">
                        <Building2 size={48} className="text-white relative z-10" />
                        <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent scale-150 group-hover:translate-x-full group-hover:-translate-y-full transition-transform duration-1000" />
                        <div className="absolute -bottom-3 -right-3 w-12 h-12 bg-emerald-500 rounded-[20px] border-[6px] border-[#12121A] flex items-center justify-center">
                           <ShieldCheck size={20} className="text-white" />
                        </div>
                     </div>
                     <div className="flex-1">
                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] mb-2 leading-none">Registered Entity</p>
                        <h3 className="text-5xl font-black text-white tracking-tighter mb-3 leading-none">{company?.name || 'Loading Architecture...'}</h3>
                        <p className="text-slate-600 font-bold uppercase tracking-[0.25em] text-[11px]">System Tag: {company?.id}</p>
                     </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-16 border-t border-white/5">
                     <div className="space-y-10">
                        <div>
                           <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-4 block ml-1">Corporate Nomenclature</label>
                           <input 
                              readOnly 
                              value={company?.name || ''} 
                              className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-5 text-white font-black tracking-tight focus:outline-none"
                           />
                        </div>
                        <div>
                           <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-4 block ml-1">Main Asset Base</label>
                           <div className="px-8 py-5 bg-indigo-600/10 border-2 border-indigo-600/20 rounded-[32px] flex items-center gap-5 shadow-inner">
                              <Globe size={24} className="text-indigo-400" />
                              <div className="flex flex-col">
                                 <span className="text-2xl font-black text-white leading-none mb-1">{company?.baseCurrency || 'INR'}</span>
                                 <span className="text-[9px] font-black text-indigo-400/60 uppercase tracking-widest whitespace-nowrap">Global Exchange Protocol active</span>
                              </div>
                           </div>
                        </div>
                     </div>

                     <div className="p-12 bg-white/[0.02] border border-white/5 rounded-[60px] shadow-inner flex flex-col justify-center relative group overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/5 blur-[50px] group-hover:bg-indigo-600/10 transition-colors" />
                        <div className="text-center space-y-6 relative z-10">
                           <div className="w-20 h-20 bg-white/5 rounded-[28px] flex items-center justify-center mx-auto mb-6 border border-white/10 shadow-2xl group-hover:scale-110 transition-transform duration-700">
                              <Zap size={36} className="text-indigo-500" />
                           </div>
                           <h4 className="text-2xl font-black text-white tracking-tight leading-none">License Protocol</h4>
                           <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.5em] leading-none mb-4">ENTERPRISE CLOUD ACTIVE</p>
                           <div className="pt-8">
                              <button className="group px-8 py-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] hover:text-white hover:border-white/20 transition-all flex items-center gap-3 mx-auto">
                                Manage Core Credentials
                                <ArrowUpRight size={14} className="transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
                              </button>
                           </div>
                        </div>
                     </div>
                  </div>
               </PremiumCard>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isAddingUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-black/60 backdrop-blur-md">
             <motion.div 
               initial={{ opacity: 0, scale: 0.9, y: 30 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.9, y: 30 }}
               className="w-full max-w-xl"
             >
                <PremiumCard className="p-14 space-y-12">
                   <div className="flex items-center justify-between">
                      <div>
                         <h3 className="text-4xl font-black text-white tracking-tighter leading-none mb-2">Registration</h3>
                         <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Initialize Entity Proxy Key</p>
                      </div>
                      <button 
                        onClick={() => setIsAddingUser(false)}
                        className="w-14 h-14 rounded-full bg-white/5 text-slate-500 hover:text-white transition-all flex items-center justify-center border border-white/10 shadow-inner"
                      >
                         <X size={28} />
                      </button>
                   </div>

                   <div className="space-y-8">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Entity Identifier</label>
                        <input 
                           placeholder="Enter registered name..."
                           value={newUser.name}
                           onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                           className="w-full bg-white/5 border border-white/10 rounded-[28px] px-8 py-5 text-white font-medium focus:outline-none focus:border-indigo-500/50 transition-all"
                        />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Transmission Axis</label>
                        <input 
                           placeholder="node@entity-protocol.com"
                           value={newUser.email}
                           onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                           className="w-full bg-white/5 border border-white/10 rounded-[28px] px-8 py-5 text-white font-medium focus:outline-none focus:border-indigo-500/50 transition-all"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-8">
                         <div className="space-y-3">
                           <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Permission Tier</label>
                           <select 
                              value={newUser.role}
                              onChange={(e) => setNewUser({...newUser, role: e.target.value as Role})}
                              className="w-full bg-white/5 border border-white/10 rounded-[28px] px-7 py-5 text-white font-black text-[10px] uppercase tracking-widest focus:outline-none"
                           >
                              <option value="Employee">Standard Node</option>
                              <option value="Manager">Authority Node</option>
                              <option value="Admin">Council Admin</option>
                           </select>
                         </div>
                         <div className="space-y-3">
                           <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Supervisory Link</label>
                           <select 
                              value={newUser.managerId}
                              onChange={(e) => setNewUser({...newUser, managerId: e.target.value})}
                              className="w-full bg-white/5 border border-white/10 rounded-[28px] px-7 py-5 text-white font-black text-[10px] uppercase tracking-widest focus:outline-none"
                           >
                              <option value="">Detached Path</option>
                              {users.map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}
                           </select>
                         </div>
                      </div>
                   </div>

                   <button 
                     onClick={handleAddUser}
                     className="w-full py-6 bg-indigo-600 text-white rounded-[32px] font-black text-[11px] uppercase tracking-[0.4em] shadow-[0_30px_60px_rgba(79,70,229,0.3)] hover:scale-[1.02] active:scale-95 transition-all"
                   >
                      Authorize Entity Proxy
                   </button>
                </PremiumCard>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ProPlanPage = ({ user }: { user: UserType }) => {
  const navigate = useNavigate();
  const features = [
    { 
      title: 'Advanced AI OCR', 
      desc: '99% accuracy on hand-written and faded receipts with GPT-4V infusion.', 
      icon: Scan, 
      status: 'Active',
      color: 'text-indigo-400',
      bg: 'bg-indigo-500/10'
    },
    { 
      title: 'Multi-Level Workflows', 
      desc: 'Unlimited approval layers with conditional routing and group voting.', 
      icon: GitMerge, 
      status: 'Active',
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10'
    },
    { 
      title: 'Global Compliance', 
      desc: 'Real-time currency conversion for 180+ countries with tax rule validation.', 
      icon: Globe, 
      status: 'Active',
      color: 'text-amber-400',
      bg: 'bg-amber-500/10'
    },
    { 
      title: 'Audit-Ready Reports', 
      desc: 'One-click CSV/PDF exports with full approval trail and decision comments.', 
      icon: FileStack, 
      status: 'Active',
      color: 'text-rose-400',
      bg: 'bg-rose-500/10'
    }
  ];

  return (
    <div className="p-12 max-w-[1600px] mx-auto space-y-20 relative min-h-screen">
      <Glow color="rgba(79, 70, 229, 0.05)" className="top-40 right-1/4" size="1000px" />
      
      <Reveal>
        <div className="relative overflow-hidden rounded-[48px] bg-slate-950 p-20 text-white border border-white/5 shadow-[0_40px_100px_rgba(0,0,0,0.6)]">
          <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[150%] bg-indigo-600/10 blur-[120px] rounded-full rotate-12" />
          <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-16">
            <div className="space-y-8 max-w-3xl">
              <div className="inline-flex items-center gap-3 px-4 py-1.5 bg-white/5 border border-white/10 rounded-full backdrop-blur-3xl">
                <Zap size={14} className="text-indigo-400 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-300">Enterprise Protocol Active</span>
              </div>
              <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-none">
                Infinite <span className="text-indigo-500">Liquidity</span> Control.
              </h1>
              <p className="text-slate-400 text-xl font-medium leading-relaxed max-w-2xl">
                You are currently deployed on the <strong>{user.companyId || 'Enterprise'}</strong> core network. 
                State-of-the-art finance automation and compliance nodes are now fully operational.
              </p>
            </div>
            <PremiumCard className="flex flex-col items-center gap-6 p-10 rounded-[40px] border-indigo-500/20 shrink-0 bg-white/[0.02] backdrop-blur-3xl">
              <div className="text-center">
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.4em] mb-2">Monthly Efficiency</p>
                <p className="text-5xl font-black tracking-tighter text-white">Rs. 12,450</p>
              </div>
              <div className="w-full h-px bg-white/10" />
              <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                <CheckCircle size={12} className="text-emerald-400" />
                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400">Atomic Billing Sync</span>
              </div>
            </PremiumCard>
          </div>
        </div>
      </Reveal>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {features.map((f, i) => (
          <Reveal key={i} delay={0.2 + (i * 0.1)} y={30}>
            <PremiumCard className="p-10 group h-full border-white/5 hover:border-indigo-500/20 transition-all flex flex-col">
              <div className={cn("w-16 h-16 rounded-[24px] flex items-center justify-center mb-8 shadow-inner border border-white/5", f.bg)}>
                <f.icon size={28} className={f.color} />
              </div>
              <h3 className="text-2xl font-black text-white tracking-tight mb-4 leading-none">{f.title}</h3>
              <p className="text-sm text-slate-500 font-medium leading-relaxed mb-8 flex-1">{f.desc}</p>
              <div className="flex items-center gap-2.5 text-[9px] font-black text-emerald-400 uppercase tracking-[0.3em] bg-emerald-500/10 w-fit px-4 py-1.5 rounded-full border border-emerald-500/20">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
                {f.status}
              </div>
            </PremiumCard>
          </Reveal>
        ))}
      </div>

      <Reveal delay={0.8}>
        <div className="relative group rounded-[60px] overflow-hidden">
           <div className="absolute inset-0 bg-indigo-600/5 backdrop-blur-3xl" />
           <div className="relative z-10 p-20 text-center space-y-10 border border-white/5 rounded-[60px]">
              <div className="w-20 h-20 bg-white/5 rounded-[32px] flex items-center justify-center mx-auto mb-6 border border-white/10 shadow-2xl group-hover:scale-110 transition-transform duration-700">
                 <Search size={36} className="text-indigo-400" />
              </div>
              <div className="space-y-4 max-w-3xl mx-auto">
                <h2 className="text-4xl font-black text-white tracking-tighter">Request Entity Scaling</h2>
                <p className="text-slate-500 text-lg font-medium leading-relaxed">
                  For organizations exceeding 500 nodes, our Sovereign Tier offers dedicated 
                  private cloud deployments, biometric authentication gates, and 24/7 strategic oversight.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-6 pt-6">
                <button className="px-10 py-5 bg-indigo-600 text-white rounded-[24px] text-[10px] font-black uppercase tracking-[0.3em] shadow-[0_20px_40px_rgba(79,70,229,0.3)] hover:scale-105 active:scale-95 transition-all">
                   Contact Command
                </button>
                <button onClick={() => navigate('/')} className="px-10 py-5 bg-white/5 border border-white/10 text-white rounded-[24px] text-[10px] font-black uppercase tracking-[0.3em] hover:bg-white/10 transition-all">
                   Back to System
                </button>
              </div>
           </div>
        </div>
      </Reveal>
    </div>
  );
};

// --- Auth & Onboarding ---

const AuthPage = ({ onLoginSuccess, isProcessing, error }: any) => {
  return (
    <div className="min-h-screen bg-[#050508] flex items-center justify-center p-8 relative overflow-hidden selection:bg-indigo-500/30">
      <Glow color="rgba(79, 70, 229, 0.15)" className="top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" size="1200px" />
      <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#ffffff 0.5px, transparent 0.5px)', backgroundSize: '24px 24px' }} />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-xl relative z-10"
      >
        <Reveal>
          <div className="text-center mb-16 space-y-8">
            <div className="w-24 h-24 bg-indigo-600 rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-[0_30px_60px_rgba(79,70,229,0.4)] relative group">
              <IndianRupee className="text-white relative z-10" size={40} />
              <div className="absolute inset-0 bg-white/20 rounded-[32px] scale-0 group-hover:scale-100 transition-transform duration-500" />
            </div>
            <div className="space-y-4">
              <h1 className="text-7xl font-black text-white tracking-tighter leading-none">REIMBURX</h1>
              <p className="text-slate-500 text-lg font-medium tracking-tight">Financial orchestration for the next generation.</p>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.2}>
          <PremiumCard className="p-16 space-y-12 border-white/5 backdrop-blur-3xl bg-white/[0.02]">
            <div className="space-y-4 text-center">
              <h2 className="text-3xl font-black text-white tracking-tighter leading-none">Access Protocol</h2>
              <p className="text-sm text-slate-500 font-medium">Verify your identity to enter the console.</p>
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="p-6 bg-rose-500/10 rounded-2xl border border-rose-500/20 flex items-start gap-4 text-rose-400"
              >
                <AlertCircle size={20} className="shrink-0 mt-0.5" />
                <p className="text-xs font-black uppercase tracking-widest">{error}</p>
              </motion.div>
            )}

            <button 
              onClick={onLoginSuccess}
              disabled={isProcessing}
              className="group relative w-full py-6 bg-white text-slate-950 rounded-[28px] font-black text-[11px] uppercase tracking-[0.4em] shadow-[0_30px_60px_rgba(0,0,0,0.5)] hover:scale-[1.02] active:scale-95 transition-all overflow-hidden"
            >
              <div className="relative z-10 flex items-center justify-center gap-4">
                <img src="https://www.gstatic.com/images/branding/googleg/1x/googleg_standard_color_128dp.png" className="w-6 h-6" alt="Google" />
                {isProcessing ? 'SYNCHRONIZING...' : 'AUTHORIZE WITH GOOGLE'}
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-900/5 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite]" />
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/5"></div>
              </div>
              <div className="relative flex justify-center text-[9px] uppercase tracking-[0.5em] font-black">
                <span className="bg-[#12121A] px-6 text-slate-600">Secure Network Entry</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-8">
              {[
                { icon: ShieldCheck, label: 'Encrypted' },
                { icon: Zap, label: 'Instant' },
                { icon: Globe, label: 'Global' }
              ].map((item, idx) => (
                <Reveal key={item.label} delay={0.4 + (idx * 0.1)} y={10}>
                   <div className="text-center group cursor-pointer">
                      <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-3 text-slate-600 border border-white/5 transition-all group-hover:text-indigo-400 group-hover:border-indigo-500/20">
                        <item.icon size={18} />
                      </div>
                      <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest group-hover:text-slate-400 transition-colors">{item.label}</span>
                   </div>
                </Reveal>
              ))}
            </div>
          </PremiumCard>
        </Reveal>

        <Reveal delay={0.8}>
          <p className="text-center mt-12 text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] leading-relaxed">
            By accessing this console, you adhere to the <br /> 
            <a href="#" className="text-indigo-400 hover:text-white transition-colors">Digital Governance Agreement</a>
          </p>
        </Reveal>
      </motion.div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const { user, login, logout, completeSignup, loading } = useAuth();
  const [onboardingStep, setOnboardingStep] = useState<'none' | 'setup'>('none');
  const [tempUser, setTempUser] = useState<any>(null);
  const [companyName, setCompanyName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const handleLogin = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      const result = await login();
      if (result.isNew) {
        setTempUser(result.firebaseUser);
        setOnboardingStep('setup');
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError("Sign-in was cancelled. Please try again.");
      } else {
        setError(err.message || "Failed to sign in");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCompleteSignup = async () => {
    if (!companyName) return;
    setIsProcessing(true);
    setError(null);
    try {
      const location = await getUserLocation();
      const currency = await getCountryCurrency(location.country_code);
      
      const companyId = `comp-${Math.random().toString(36).substr(2, 9)}`;
      const company: Company = {
        id: companyId,
        name: companyName,
        baseCurrency: currency.code,
        country: location.country_name || location.country_code,
        adminId: tempUser.uid
      };

      await setDoc(doc(db, 'companies', companyId), company);

      const newUser: UserType = {
        uid: tempUser.uid,
        email: tempUser.email,
        name: tempUser.displayName || tempUser.email.split('@')[0],
        role: 'Admin',
        companyId: companyId,
        currency: currency.code
      };

      await completeSignup(newUser);
      setOnboardingStep('none');
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, 'companies/users');
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (onboardingStep === 'setup') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/5 blur-[120px] rounded-full" />
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md card p-10 relative z-10">
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-6 text-indigo-600">
            <Building2 size={24} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Welcome to ReimbursePro</h2>
          <p className="text-slate-500 mb-8 text-sm">Let's set up your company profile to get started.</p>
          
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Company Name</label>
              <input 
                type="text" 
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="input-field" 
                placeholder="Acme Corp"
              />
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-xs text-center font-medium">
                {error}
              </div>
            )}

            <button 
              onClick={handleCompleteSignup}
              disabled={isProcessing || !companyName}
              className="btn-primary w-full py-4 shadow-lg shadow-indigo-500/20"
            >
              {isProcessing ? 'Setting up...' : 'Create Company & Start'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage onLoginSuccess={handleLogin} isProcessing={isProcessing} error={error} />;
  }

  return (
    <Router>
      <Toaster position="top-right" richColors />
      <div className="flex min-h-screen bg-[#080810] text-slate-900 selection:bg-indigo-500/30">
        <Sidebar role={user.role} onLogout={logout} />
        
        <main className="flex-1 flex flex-col min-w-0">
          <TopBar user={user} searchQuery={searchQuery} setSearchQuery={setSearchQuery} onLogout={logout} />
          <div className="flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              <Routes>
                <Route path="/" element={<Dashboard user={user} searchQuery={searchQuery} />} />
                <Route path="/team" element={<TeamPage user={user} />} />
                <Route path="/expenses" element={<MyExpenses user={user} searchQuery={searchQuery} />} />
                <Route path="/approvals" element={<Approvals user={user} searchQuery={searchQuery} />} />
                <Route path="/admin" element={<AdminSettings user={user} />} />
                <Route path="/submit" element={<SubmitExpense user={user} />} />
                <Route path="/pro-plan" element={<ProPlanPage user={user} />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </Router>
  );
}
