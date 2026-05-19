import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, addDoc, updateDoc, deleteDoc, doc, Timestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Invoice, Case, UserProfile } from '../types';
import { useAuth } from '../hooks/useAuth';
import { 
  Receipt, 
  Plus, 
  Search, 
  Filter, 
  MoreVertical, 
  Pencil, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  DollarSign,
  FileText,
  Calendar,
  User,
  ChevronRight,
  X,
  CreditCard,
  Wallet,
  ArrowRightLeft,
  Briefcase
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import ConfirmationModal from './ConfirmationModal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function BillingManagement() {
  const { profile, isAdmin, isLawyer } = useAuth();
  const canModify = isAdmin || isLawyer;

  if (!canModify) {
    return (
      <div style={{ textAlign: 'center', padding: '64px 24px' }}>
        <AlertCircle size={36} color="var(--oxblood)" style={{ margin: '0 auto 14px', display: 'block' }} />
        <h3 className="lm-display" style={{ fontSize: 18, color: 'var(--ink)', marginBottom: 6 }}>Acceso restringido</h3>
        <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Solo administradores y abogados pueden acceder a la sección de facturación.</p>
      </div>
    );
  }

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<'amount' | 'dueDate' | 'issueDate'>('issueDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<string | null>(null);

  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isPartialModalOpen, setIsPartialModalOpen] = useState(false);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [isEditPaymentModalOpen, setIsEditPaymentModalOpen] = useState(false);
  const [invoiceForStatusChange, setInvoiceForStatusChange] = useState<Invoice | null>(null);
  const [selectedInvoiceForSummary, setSelectedInvoiceForSummary] = useState<Invoice | null>(null);
  const [editingPayment, setEditingPayment] = useState<{ invoiceId: string, payment: Invoice['payments'][0] } | null>(null);
  const [partialPaymentData, setPartialPaymentData] = useState({
    amount: 0,
    method: 'transfer' as any,
    reference: ''
  });

  const [formData, setFormData] = useState({
    caseId: '',
    clientId: '',
    amount: 0,
    currency: 'ARS',
    status: 'pending' as Invoice['status'],
    dueDate: format(new Date(), 'yyyy-MM-dd'),
    issueDate: format(new Date(), 'yyyy-MM-dd'),
    description: '',
    items: [{ description: '', quantity: 1, unitPrice: 0, total: 0 }]
  });

  useEffect(() => {
    const qInvoices = query(collection(db, 'invoices'));
    const unsubscribeInvoices = onSnapshot(qInvoices, (snapshot) => {
      setInvoices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'invoices');
    });

    const qCases = query(collection(db, 'cases'));
    const unsubscribeCases = onSnapshot(qCases, (snapshot) => {
      setCases(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Case)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'cases');
    });

    const qClients = query(collection(db, 'users')); // Assuming clients are in users with role 'client'
    const unsubscribeClients = onSnapshot(qClients, (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)).filter(u => u.role === 'client'));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    return () => {
      unsubscribeInvoices();
      unsubscribeCases();
      unsubscribeClients();
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canModify) return;

    const totalAmount = formData.items.reduce((acc, item) => acc + item.total, 0);
    const invoiceData = {
      ...formData,
      amount: totalAmount,
      updatedAt: new Date().toISOString()
    };

    try {
      if (editingInvoice) {
        await updateDoc(doc(db, 'invoices', editingInvoice.id), invoiceData);
      } else {
        await addDoc(collection(db, 'invoices'), {
          ...invoiceData,
          payments: [],
          createdAt: new Date().toISOString()
        });
      }
      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      handleFirestoreError(error, editingInvoice ? OperationType.UPDATE : OperationType.CREATE, 'invoices');
    }
  };

  const resetForm = () => {
    setFormData({
      caseId: '',
      clientId: '',
      amount: 0,
      currency: 'ARS',
      status: 'pending',
      dueDate: format(new Date(), 'yyyy-MM-dd'),
      issueDate: format(new Date(), 'yyyy-MM-dd'),
      description: '',
      items: [{ description: '', quantity: 1, unitPrice: 0, total: 0 }]
    });
    setEditingInvoice(null);
  };

  const openEditModal = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setFormData({
      caseId: invoice.caseId,
      clientId: invoice.clientId,
      amount: invoice.amount,
      currency: invoice.currency,
      status: invoice.status,
      dueDate: invoice.dueDate,
      issueDate: invoice.issueDate,
      description: invoice.description,
      items: invoice.items
    });
    setIsModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!invoiceToDelete || !canModify) return;
    try {
      await deleteDoc(doc(db, 'invoices', invoiceToDelete));
      setIsDeleteModalOpen(false);
      setInvoiceToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `invoices/${invoiceToDelete}`);
    }
  };

  const handleAddItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { description: '', quantity: 1, unitPrice: 0, total: 0 }]
    });
  };

  const handleRemoveItem = (index: number) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...formData.items];
    const item = { ...newItems[index], [field]: value };
    
    if (field === 'quantity' || field === 'unitPrice') {
      item.total = item.quantity * item.unitPrice;
    }
    
    newItems[index] = item;
    setFormData({ ...formData, items: newItems });
  };

  const handleStatusChange = async (invoice: Invoice, newStatus: Invoice['status']) => {
    if (newStatus === 'partial') {
      setInvoiceForStatusChange(invoice);
      setPartialPaymentData({ amount: 0, method: 'transfer', reference: '' });
      setIsPartialModalOpen(true);
      setIsStatusModalOpen(false);
      return;
    }

    try {
      await updateDoc(doc(db, 'invoices', invoice.id), {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      setIsStatusModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `invoices/${invoice.id}`);
    }
  };

  const handleSavePartialPayment = async () => {
    if (!invoiceForStatusChange) return;

    const newPayment = {
      id: crypto.randomUUID(),
      amount: partialPaymentData.amount,
      date: new Date().toISOString(),
      method: partialPaymentData.method,
      reference: partialPaymentData.reference
    };

    const updatedPayments = [...(invoiceForStatusChange.payments || []), newPayment];
    const totalPaid = updatedPayments.reduce((acc, p) => acc + p.amount, 0);
    
    let newStatus: Invoice['status'] = 'partial';
    if (totalPaid >= invoiceForStatusChange.amount) {
      newStatus = 'paid';
    }

    try {
      await updateDoc(doc(db, 'invoices', invoiceForStatusChange.id), {
        payments: updatedPayments,
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      setIsPartialModalOpen(false);
      setInvoiceForStatusChange(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `invoices/${invoiceForStatusChange.id}`);
    }
  };

  const handleEditPayment = (invoice: Invoice, payment: Invoice['payments'][0]) => {
    setEditingPayment({ invoiceId: invoice.id, payment });
    setPartialPaymentData({
      amount: payment.amount,
      method: payment.method,
      reference: payment.reference || ''
    });
    setIsEditPaymentModalOpen(true);
  };

  const handleUpdatePayment = async () => {
    if (!editingPayment || !selectedInvoiceForSummary) return;

    const updatedPayments = selectedInvoiceForSummary.payments.map(p => 
      p.id === editingPayment.payment.id 
        ? { ...p, amount: partialPaymentData.amount, method: partialPaymentData.method, reference: partialPaymentData.reference }
        : p
    );

    const totalPaid = updatedPayments.reduce((acc, p) => acc + p.amount, 0);
    let newStatus: Invoice['status'] = 'partial';
    if (totalPaid >= selectedInvoiceForSummary.amount) {
      newStatus = 'paid';
    } else if (totalPaid <= 0) {
      newStatus = 'pending';
    }

    try {
      await updateDoc(doc(db, 'invoices', selectedInvoiceForSummary.id), {
        payments: updatedPayments,
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      
      // Update local state for summary modal
      setSelectedInvoiceForSummary({
        ...selectedInvoiceForSummary,
        payments: updatedPayments,
        status: newStatus
      });
      
      setIsEditPaymentModalOpen(false);
      setEditingPayment(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `invoices/${selectedInvoiceForSummary.id}`);
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!selectedInvoiceForSummary) return;

    const updatedPayments = selectedInvoiceForSummary.payments.filter(p => p.id !== paymentId);
    const totalPaid = updatedPayments.reduce((acc, p) => acc + p.amount, 0);
    
    let newStatus: Invoice['status'] = 'partial';
    if (totalPaid <= 0) {
      newStatus = 'pending';
    } else if (totalPaid >= selectedInvoiceForSummary.amount) {
      newStatus = 'paid';
    }

    try {
      await updateDoc(doc(db, 'invoices', selectedInvoiceForSummary.id), {
        payments: updatedPayments,
        status: newStatus,
        updatedAt: new Date().toISOString()
      });

      // Update local state for summary modal
      setSelectedInvoiceForSummary({
        ...selectedInvoiceForSummary,
        payments: updatedPayments,
        status: newStatus
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `invoices/${selectedInvoiceForSummary.id}`);
    }
  };

  const generatePDF = (invoice: Invoice) => {
    const doc = new jsPDF();
    const client = clients.find(c => c.uid === invoice.clientId);
    const caseObj = cases.find(c => c.id === invoice.caseId);

    // Header
    doc.setFontSize(22);
    doc.setTextColor(63, 81, 181); // Indigo
    doc.text('LEXMANAGE', 105, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text('Estudio Jurídico Integral', 105, 28, { align: 'center' });
    
    doc.setDrawColor(200);
    doc.line(20, 35, 190, 35);

    // Invoice Info
    doc.setFontSize(16);
    doc.setTextColor(0);
    doc.text('RECIBO DE PAGO', 20, 45);
    
    doc.setFontSize(10);
    doc.text(`Fecha de Emisión: ${format(parseISO(invoice.issueDate), 'dd/MM/yyyy')}`, 140, 45);
    doc.text(`Fecha de Pago: ${format(new Date(), 'dd/MM/yyyy')}`, 140, 50);

    // Client & Case Info
    doc.setFontSize(11);
    doc.text('DATOS DEL CLIENTE:', 20, 60);
    doc.setFontSize(10);
    doc.text(`Nombre: ${client?.displayName || 'N/A'}`, 20, 65);
    doc.text(`Email: ${client?.email || 'N/A'}`, 20, 70);
    
    doc.setFontSize(11);
    doc.text('DETALLES DEL EXPEDIENTE:', 120, 60);
    doc.setFontSize(10);
    doc.text(`Nro. Expediente: ${caseObj?.caseNumber || 'N/A'}`, 120, 65);
    doc.text(`Estado: ${caseObj?.status || 'N/A'}`, 120, 70);

    // Table
    const tableData = invoice.items.map(item => [
      item.description,
      item.quantity.toString(),
      `$${item.unitPrice.toLocaleString()}`,
      `$${item.total.toLocaleString()}`
    ]);

    autoTable(doc, {
      startY: 80,
      head: [['Descripción', 'Cant.', 'Precio Unit.', 'Subtotal']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [63, 81, 181] },
      styles: { fontSize: 9 },
    });

    const finalY = (doc as any).lastAutoTable.finalY || 80;

    // Totals
    doc.setFontSize(12);
    doc.text('RESUMEN:', 140, finalY + 15);
    doc.setFontSize(10);
    doc.text(`Total Facturado: $${invoice.amount.toLocaleString()}`, 140, finalY + 22);
    
    const totalPaid = (invoice.payments || []).reduce((acc, p) => acc + p.amount, 0);
    if (invoice.status === 'paid') {
      doc.setFontSize(14);
      doc.setTextColor(0, 150, 0); // Green
      doc.text('TOTAL PAGADO', 140, finalY + 32);
      doc.text(`$${invoice.amount.toLocaleString()}`, 140, finalY + 40);
    } else {
      doc.text(`Total Abonado: $${totalPaid.toLocaleString()}`, 140, finalY + 27);
      doc.setFontSize(12);
      doc.setTextColor(200, 0, 0); // Red
      doc.text(`Saldo Pendiente: $${(invoice.amount - totalPaid).toLocaleString()}`, 140, finalY + 35);
    }

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text('Este documento sirve como comprobante de pago oficial de LexManage.', 105, 280, { align: 'center' });

    doc.save(`Recibo_${invoice.description.replace(/\s+/g, '_')}.pdf`);
  };

  const filteredInvoices = invoices.filter(inv => {
    const client = clients.find(c => c.uid === inv.clientId);
    const caseObj = cases.find(c => c.id === inv.caseId);
    const matchesSearch = 
      inv.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client?.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      caseObj?.caseNumber.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  }).sort((a, b) => {
    let comparison = 0;
    if (sortField === 'amount') {
      comparison = a.amount - b.amount;
    } else if (sortField === 'dueDate') {
      comparison = a.dueDate.localeCompare(b.dueDate);
    } else if (sortField === 'issueDate') {
      comparison = a.issueDate.localeCompare(b.issueDate);
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const getStatusColor = (status: Invoice['status']) => {
    switch (status) {
      case 'paid': return 'bg-emerald-100 text-emerald-700';
      case 'pending': return 'bg-amber-100 text-amber-700';
      case 'partial': return 'bg-slate-100 text-slate-600';
      case 'cancelled': return 'bg-slate-100 text-slate-500';
      default: return 'bg-slate-100 text-slate-500';
    }
  };

  const getStatusIcon = (status: Invoice['status']) => {
    switch (status) {
      case 'paid': return <CheckCircle2 className="h-4 w-4" />;
      case 'pending': return <Clock className="h-4 w-4" />;
      case 'partial': return <DollarSign className="h-4 w-4" />;
      case 'cancelled': return <AlertCircle className="h-4 w-4" />;
    }
  };

  const totalCobrado = invoices.reduce((acc, inv) => {
    if (inv.status === 'paid') return acc + inv.amount;
    if (inv.status === 'partial') return acc + (inv.payments?.reduce((pAcc, p) => pAcc + p.amount, 0) || 0);
    return acc;
  }, 0);
  const totalPendiente = invoices.reduce((acc, inv) => {
    if (inv.status === 'pending') return acc + inv.amount;
    if (inv.status === 'partial') { const paid = inv.payments?.reduce((pAcc, p) => pAcc + p.amount, 0) || 0; return acc + (inv.amount - paid); }
    return acc;
  }, 0);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <p className="lm-eyebrow" style={{ marginBottom: 6 }}>Administración</p>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 className="lm-display" style={{ fontSize: 28, fontWeight: 500, color: 'var(--ink)', margin: 0, lineHeight: 1.1 }}>Facturación</h1>
            <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>Honorarios, gastos y pagos de clientes.</p>
          </div>
          {canModify && (
            <button onClick={() => { resetForm(); setIsModalOpen(true); }} className="lm-btn lm-btn--primary lm-btn--sm">
              <Plus size={13} /> Nueva factura
            </button>
          )}
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total cobrado', value: `$${totalCobrado.toLocaleString('es-AR')}`, sub: 'ARS', color: 'var(--forest)', bg: 'var(--forest-soft)' },
          { label: 'Pendiente de cobro', value: `$${totalPendiente.toLocaleString('es-AR')}`, sub: 'ARS', color: 'var(--mustard)', bg: 'var(--mustard-soft)' },
          { label: 'Facturas activas', value: `${invoices.filter(i => i.status !== 'cancelled').length}`, sub: 'registros', color: 'var(--slate-c)', bg: 'var(--slate-soft)' },
        ].map(stat => (
          <div key={stat.label} className="lm-card" style={{ padding: '16px 20px', display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ width: 8, height: 36, borderRadius: 4, background: stat.color, flexShrink: 0 }} />
            <div>
              <p className="lm-eyebrow" style={{ marginBottom: 3 }}>{stat.label}</p>
              <p className="lm-mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>{stat.value}</p>
              <p style={{ fontSize: 10, color: 'var(--ink-mute)', margin: 0 }}>{stat.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="lm-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '0.5px solid var(--rule)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', background: 'var(--paper-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 200, background: 'var(--paper-3)', border: '0.5px solid var(--rule)', borderRadius: 'var(--r)', padding: '7px 11px' }}>
            <Search size={13} color="var(--ink-3)" />
            <input
              placeholder="Buscar por cliente, expediente o descripción…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ border: 0, background: 'transparent', outline: 'none', flex: 1, fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--ink)' }}
            />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '6px 10px', border: '0.5px solid var(--rule)', borderRadius: 'var(--r)', background: 'var(--paper-3)', fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--ink)', outline: 'none' }}>
            <option value="all">Todos los estados</option>
            <option value="pending">Pendientes</option>
            <option value="paid">Pagadas</option>
            <option value="partial">Parciales</option>
            <option value="cancelled">Canceladas</option>
          </select>
        </div>

        {/* Table header */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 120px 160px 120px 120px 80px', padding: '8px 16px', borderBottom: '0.5px solid var(--rule)', background: 'var(--paper-2)' }}>
          {[
            { label: 'Descripción / Fecha', field: 'issueDate' as const },
            { label: 'Vencimiento', field: 'dueDate' as const },
            { label: 'Cliente', field: null },
            { label: 'Monto', field: 'amount' as const },
            { label: 'Estado', field: null },
            { label: '', field: null },
          ].map(({ label, field }) => (
            <span
              key={label}
              className="lm-eyebrow"
              style={{ fontSize: 9.5, cursor: field ? 'pointer' : 'default' }}
              onClick={() => field && toggleSort(field)}
            >
              {label}{field && sortField === field ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''}
            </span>
          ))}
        </div>

        {filteredInvoices.length === 0 && (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <Receipt size={28} color="var(--rule)" style={{ margin: '0 auto 10px', display: 'block' }} />
            <p style={{ fontSize: 13, color: 'var(--ink-mute)', fontStyle: 'italic' }}>Sin facturas para los filtros aplicados.</p>
          </div>
        )}

        <div>
              {filteredInvoices.map((invoice) => {
                const client = clients.find(c => c.uid === invoice.clientId);
                const caseObj = cases.find(c => c.id === invoice.caseId);
                const isOverdue = new Date(invoice.dueDate) < new Date() && invoice.status !== 'paid';
                const invoiceStatusCfg: Record<string, { bg: string; color: string; dot: string }> = {
                  paid:      { bg: 'var(--forest-soft)',   color: 'var(--forest)',   dot: 'var(--forest)' },
                  pending:   { bg: 'var(--mustard-soft)',  color: 'var(--mustard)',  dot: 'var(--mustard)' },
                  partial:   { bg: 'var(--slate-soft)',    color: 'var(--slate-c)',  dot: 'var(--slate-c)' },
                  cancelled: { bg: 'var(--paper-2)',       color: 'var(--ink-mute)', dot: 'var(--ink-mute)' },
                };
                const statusLabels: Record<string, string> = { paid: 'Pagada', pending: 'Pendiente', partial: 'Parcial', cancelled: 'Cancelada' };
                const sCfg = invoiceStatusCfg[invoice.status] ?? invoiceStatusCfg['pending'];

                return (
                  <motion.div
                    layout
                    key={invoice.id}
                    className="lm-row"
                    style={{ gridTemplateColumns: '2fr 120px 160px 120px 120px 80px' }}
                    onClick={() => {
                      setSelectedInvoiceForSummary(invoice);
                      setIsSummaryModalOpen(true);
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 'var(--r)', background: 'var(--paper-2)', border: '0.5px solid var(--rule)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        <FileText size={13} color="var(--ink-3)" />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{invoice.description}</p>
                        <p style={{ margin: 0, fontSize: 11, color: 'var(--ink-mute)' }}>{format(parseISO(invoice.issueDate), 'dd MMM yyyy', { locale: es })}</p>
                      </div>
                    </div>
                    <div>
                      <p className="lm-mono" style={{ fontSize: 12, color: isOverdue ? 'var(--oxblood)' : 'var(--ink-3)', margin: 0 }}>
                        {format(parseISO(invoice.dueDate), 'dd/MM/yy')}
                      </p>
                      {isOverdue && <p style={{ margin: 0, fontSize: 10, color: 'var(--oxblood)', fontWeight: 700 }}>VENCIDA</p>}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client?.displayName || '—'}</p>
                      <p className="lm-mono" style={{ margin: 0, fontSize: 11, color: 'var(--ink-3)' }}>{caseObj?.caseNumber || '—'}</p>
                    </div>
                    <div>
                      <p className="lm-mono" style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>${invoice.amount.toLocaleString('es-AR')}</p>
                      <p style={{ margin: 0, fontSize: 10, color: 'var(--ink-mute)' }}>{invoice.currency}</p>
                    </div>
                    <div>
                      <span className="lm-chip" style={{ background: sCfg.bg, color: sCfg.color }}>
                        <span className="lm-dot" style={{ background: sCfg.dot }} />
                        {statusLabels[invoice.status] ?? invoice.status}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }} onClick={e => e.stopPropagation()}>
                      {canModify && (
                        <>
                          <button onClick={() => openEditModal(invoice)} title="Editar" style={{ background: 'none', border: 0, cursor: 'pointer', padding: 5, color: 'var(--ink-3)', borderRadius: 'var(--r-sm)' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}>
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => { setInvoiceToDelete(invoice.id); setIsDeleteModalOpen(true); }} title="Eliminar" style={{ background: 'none', border: 0, cursor: 'pointer', padding: 5, color: 'var(--ink-3)', borderRadius: 'var(--r-sm)' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--oxblood)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}>
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                      <button onClick={() => { setInvoiceForStatusChange(invoice); setIsStatusModalOpen(true); }} title="Cambiar estado" style={{ background: 'none', border: 0, cursor: 'pointer', padding: 5, color: 'var(--ink-3)', borderRadius: 'var(--r-sm)' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}>
                        <ChevronRight size={13} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
        </div>
      </div>

      {/* Modal Nueva/Editar Factura */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-3xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div style={{ padding: '20px 24px', background: 'var(--sidebar-bg)', color: 'var(--sidebar-fg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="flex items-center gap-3">
                  <Receipt style={{ width: 20, height: 20, opacity: 0.7 }} />
                  <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem' }}>{editingInvoice ? 'Editar Factura' : 'Nueva Factura'}</h3>
                </div>
                <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--sidebar-fg)', cursor: 'pointer', padding: 6, borderRadius: 6, opacity: 0.7 }}>
                  <X className="h-6 w-6" />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-6 space-y-6 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Cliente</label>
                    <select 
                      required
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={formData.clientId}
                      onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                    >
                      <option value="">Seleccionar Cliente</option>
                      {clients.map(c => (
                        <option key={c.uid} value={c.uid}>{c.displayName}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Expediente Relacionado</label>
                    <select 
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={formData.caseId}
                      onChange={(e) => setFormData({ ...formData, caseId: e.target.value })}
                    >
                      <option value="">Sin Expediente</option>
                      {cases.map(c => (
                        <option key={c.id} value={c.id}>{c.caseNumber} - {c.caseTitle}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Fecha de Emisión</label>
                    <input 
                      type="date"
                      required
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={formData.issueDate}
                      onChange={(e) => setFormData({ ...formData, issueDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Fecha de Vencimiento</label>
                    <input 
                      type="date"
                      required
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={formData.dueDate}
                      onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Estado</label>
                    <select 
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    >
                      <option value="pending">Pendiente</option>
                      <option value="partial">Pago Parcial</option>
                      <option value="paid">Pagada</option>
                      <option value="cancelled">Cancelada</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Descripción General</label>
                  <input 
                    type="text"
                    required
                    placeholder="Ej: Honorarios Profesionales - Divorcio"
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Ítems / Conceptos</h4>
                    <button 
                      type="button"
                      onClick={handleAddItem}
                      style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--oxblood)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-sans)' }}
                    >
                      <Plus className="h-3 w-3" /> Agregar Ítem
                    </button>
                  </div>
                  <div className="space-y-3">
                    {formData.items.map((item, index) => (
                      <div key={index} className="grid grid-cols-12 gap-3 items-end bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <div className="col-span-6 space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Descripción</label>
                          <input 
                            type="text"
                            required
                            className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                            value={item.description}
                            onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                          />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Cant.</label>
                          <input 
                            type="number"
                            required
                            min="1"
                            className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(index, 'quantity', parseFloat(e.target.value))}
                          />
                        </div>
                        <div className="col-span-3 space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">P. Unitario</label>
                          <input 
                            type="number"
                            required
                            min="0"
                            className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                            value={item.unitPrice}
                            onChange={(e) => handleItemChange(index, 'unitPrice', parseFloat(e.target.value))}
                          />
                        </div>
                        <div className="col-span-1 flex justify-end">
                          <button 
                            type="button"
                            onClick={() => handleRemoveItem(index)}
                            className="p-1.5 text-slate-400 hover:text-red-600 transition-all"
                            disabled={formData.items.length === 1}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
                  <div className="text-slate-500">
                    <p className="text-xs uppercase font-bold tracking-widest">Total Factura</p>
                    <p className="text-3xl font-black text-slate-900">
                      ${formData.items.reduce((acc, item) => acc + item.total, 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button 
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-6 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-2xl transition-all"
                    >
                      Cancelar
                    </button>
                    <button type="submit" className="lm-btn lm-btn--primary" style={{ padding: '12px 28px' }}>
                      {editingInvoice ? 'Actualizar Factura' : 'Crear Factura'}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmationModal 
        isOpen={isDeleteModalOpen}
        title="Eliminar Factura"
        message="¿Estás seguro de que deseas eliminar esta factura? Esta acción no se puede deshacer."
        onConfirm={confirmDelete}
        onCancel={() => setIsDeleteModalOpen(false)}
      />

      {/* Modal Cambio de Estado Rápido */}
      <AnimatePresence>
        {isStatusModalOpen && invoiceForStatusChange && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-900">Cambiar Estado</h3>
                <button onClick={() => setIsStatusModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4 space-y-2">
                {(['pending', 'partial', 'paid', 'cancelled'] as Invoice['status'][]).map((status) => (
                  <button
                    key={status}
                    onClick={() => handleStatusChange(invoiceForStatusChange, status)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 16px', borderRadius: 'var(--r-md)', border: 'none', cursor: 'pointer',
                      background: invoiceForStatusChange.status === status ? 'var(--paper-2)' : 'transparent',
                      outline: invoiceForStatusChange.status === status ? '1px solid var(--rule)' : 'none',
                      color: invoiceForStatusChange.status === status ? 'var(--ink)' : 'var(--ink-2)',
                      fontFamily: 'var(--font-sans)', transition: 'background .12s',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${getStatusColor(status)}`}>
                        {getStatusIcon(status)}
                      </div>
                      <span className="font-bold capitalize">
                        {status === 'paid' ? 'Pagada' : 
                         status === 'pending' ? 'Pendiente' : 
                         status === 'partial' ? 'Parcial' : 'Cancelada'}
                      </span>
                    </div>
                    {invoiceForStatusChange.status === status && <CheckCircle2 className="h-5 w-5" />}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Pago Parcial */}
      <AnimatePresence>
        {isPartialModalOpen && invoiceForStatusChange && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div style={{ padding: '20px 24px', background: 'var(--sidebar-bg)', color: 'var(--sidebar-fg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="flex items-center gap-3">
                  <DollarSign style={{ width: 20, height: 20, opacity: 0.7 }} />
                  <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem' }}>Registrar Pago</h3>
                </div>
                <button onClick={() => setIsPartialModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--sidebar-fg)', cursor: 'pointer', padding: 6, borderRadius: 6, opacity: 0.7 }}>
                  <X className="h-6 w-6" />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <p className="text-sm text-slate-500 mb-1">Total de la Factura</p>
                  <p className="text-2xl font-black text-slate-900">${invoiceForStatusChange.amount.toLocaleString()}</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Monto del Pago</label>
                    <div className="relative">
                      <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                      <input 
                        type="number"
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500"
                        value={partialPaymentData.amount}
                        onChange={(e) => setPartialPaymentData({ ...partialPaymentData, amount: parseFloat(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Método de Pago</label>
                    <select 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={partialPaymentData.method}
                      onChange={(e) => setPartialPaymentData({ ...partialPaymentData, method: e.target.value as any })}
                    >
                      <option value="transfer">Transferencia</option>
                      <option value="cash">Efectivo</option>
                      <option value="card">Tarjeta</option>
                      <option value="other">Otro</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Referencia / Concepto</label>
                    <textarea 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 min-h-[100px]"
                      placeholder="Ej: Pago de honorarios primera etapa..."
                      value={partialPaymentData.reference}
                      onChange={(e) => setPartialPaymentData({ ...partialPaymentData, reference: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setIsPartialModalOpen(false)}
                    className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-2xl transition-all"
                  >
                    Cancelar
                  </button>
                  <button onClick={handleSavePartialPayment} className="lm-btn lm-btn--primary" style={{ flex: 1, padding: '12px' }}>
                    Confirmar Pago
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Resumen de Factura */}
      <AnimatePresence>
        {isSummaryModalOpen && selectedInvoiceForSummary && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-2xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div style={{ padding: '20px 24px', background: 'var(--sidebar-bg)', color: 'var(--sidebar-fg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="flex items-center gap-3">
                  <Receipt style={{ width: 20, height: 20, opacity: 0.7 }} />
                  <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem' }}>Resumen de Factura</h3>
                </div>
                <button onClick={() => setIsSummaryModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--sidebar-fg)', cursor: 'pointer', padding: 6, borderRadius: 6, opacity: 0.7 }}>
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="p-6 space-y-8 overflow-y-auto flex-1">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-2xl font-black text-slate-900">{selectedInvoiceForSummary.description}</h4>
                    <p className="text-slate-500">Emitida el {format(parseISO(selectedInvoiceForSummary.issueDate), 'dd MMMM yyyy', { locale: es })}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${getStatusColor(selectedInvoiceForSummary.status)}`}>
                    {getStatusIcon(selectedInvoiceForSummary.status)}
                    {selectedInvoiceForSummary.status === 'paid' ? 'Pagada' : 
                     selectedInvoiceForSummary.status === 'pending' ? 'Pendiente' : 
                     selectedInvoiceForSummary.status === 'partial' ? 'Parcial' : 'Cancelada'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div style={{ width: 40, height: 40, borderRadius: 'var(--r-sm)', background: 'var(--paper-2)', border: '0.5px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-2)' }}>
                        <User className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Cliente</p>
                        <p className="font-bold text-slate-900">
                          {clients.find(c => c.uid === selectedInvoiceForSummary.clientId)?.displayName || 'N/A'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                        <Calendar className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Vencimiento</p>
                        <p className="font-bold text-slate-900">
                          {format(parseISO(selectedInvoiceForSummary.dueDate), 'dd/MM/yyyy')}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                        <Briefcase className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Expediente</p>
                        <p className="font-bold text-slate-900">
                          {cases.find(c => c.id === selectedInvoiceForSummary.caseId)?.caseNumber || 'N/A'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600">
                        <DollarSign className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Moneda</p>
                        <p className="font-bold text-slate-900">{selectedInvoiceForSummary.currency}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h5 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Conceptos</h5>
                  <div className="space-y-2">
                    {selectedInvoiceForSummary.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center py-2">
                        <div>
                          <p className="font-bold text-slate-900">{item.description}</p>
                          <p className="text-xs text-slate-500">{item.quantity} x ${item.unitPrice.toLocaleString()}</p>
                        </div>
                        <p className="font-black text-slate-900">${item.total.toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedInvoiceForSummary.payments && selectedInvoiceForSummary.payments.length > 0 && (
                  <div className="space-y-4">
                    <h5 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Historial de Pagos</h5>
                    <div className="space-y-3">
                      {selectedInvoiceForSummary.payments.map((payment, idx) => (
                        <div key={idx} className="group flex justify-between items-center py-3 bg-slate-50 px-4 rounded-2xl border border-slate-100 hover:border-slate-300 transition-all">
                          <div className="flex items-center gap-4">
                            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                              payment.method === 'cash' ? 'bg-emerald-50 text-emerald-600' :
                              payment.method === 'transfer' ? 'bg-slate-100 text-slate-600' :
                              payment.method === 'card' ? 'bg-amber-50 text-amber-600' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {payment.method === 'cash' ? <Wallet className="h-5 w-5" /> :
                               payment.method === 'transfer' ? <ArrowRightLeft className="h-5 w-5" /> :
                               payment.method === 'card' ? <CreditCard className="h-5 w-5" /> :
                               <DollarSign className="h-5 w-5" />}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-900">{payment.reference || 'Pago registrado'}</p>
                              <div className="flex items-center gap-2 text-[10px] text-slate-500">
                                <Calendar className="h-3 w-3" />
                                {format(parseISO(payment.date), 'dd/MM/yyyy HH:mm')}
                                <span className="mx-1">•</span>
                                <span className="capitalize">{payment.method}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <p className="font-black text-emerald-600">+ ${payment.amount.toLocaleString()}</p>
                            {canModify && (
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleEditPayment(selectedInvoiceForSummary, payment); }}
                                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-lg transition-all"
                                  title="Editar Pago"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleDeletePayment(payment.id); }}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-white rounded-lg transition-all"
                                  title="Eliminar Pago"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ background: 'var(--sidebar-bg)', borderRadius: 'var(--r-md)', padding: 24, color: 'var(--sidebar-fg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Final</p>
                    <p className="text-3xl font-black">${selectedInvoiceForSummary.amount.toLocaleString()}</p>
                  </div>
                  {selectedInvoiceForSummary.status === 'paid' && (
                    <div className="flex flex-col items-end">
                      <div className="flex items-center gap-2 text-emerald-400 font-bold mb-2">
                        <CheckCircle2 className="h-5 w-5" />
                        PAGADA TOTALMENTE
                      </div>
                    </div>
                  )}
                  {selectedInvoiceForSummary.status === 'partial' && (
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pendiente</p>
                      <p className="text-xl font-bold text-amber-400">
                        ${(selectedInvoiceForSummary.amount - selectedInvoiceForSummary.payments.reduce((acc, p) => acc + p.amount, 0)).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 flex gap-3">
                <button 
                  onClick={() => setIsSummaryModalOpen(false)}
                  className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-2xl transition-all"
                >
                  Cerrar
                </button>
                {selectedInvoiceForSummary.status === 'paid' && (
                  <button onClick={() => generatePDF(selectedInvoiceForSummary)} className="lm-btn lm-btn--primary" style={{ flex: 1, padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <FileText className="h-5 w-5" />
                    Descargar Recibo (PDF)
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Modal Editar Pago */}
      <AnimatePresence>
        {isEditPaymentModalOpen && selectedInvoiceForSummary && editingPayment && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div style={{ padding: '20px 24px', background: 'var(--sidebar-bg)', color: 'var(--sidebar-fg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="flex items-center gap-3">
                  <Pencil style={{ width: 20, height: 20, opacity: 0.7 }} />
                  <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem' }}>Editar Pago</h3>
                </div>
                <button onClick={() => { setIsEditPaymentModalOpen(false); setEditingPayment(null); }} style={{ background: 'none', border: 'none', color: 'var(--sidebar-fg)', cursor: 'pointer', padding: 6, borderRadius: 6, opacity: 0.7 }}>
                  <X className="h-6 w-6" />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Monto del Pago</label>
                    <div className="relative">
                      <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                      <input 
                        type="number"
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500"
                        value={partialPaymentData.amount}
                        onChange={(e) => setPartialPaymentData({ ...partialPaymentData, amount: parseFloat(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Método de Pago</label>
                    <select 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={partialPaymentData.method}
                      onChange={(e) => setPartialPaymentData({ ...partialPaymentData, method: e.target.value as any })}
                    >
                      <option value="transfer">Transferencia</option>
                      <option value="cash">Efectivo</option>
                      <option value="card">Tarjeta</option>
                      <option value="other">Otro</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Referencia / Concepto</label>
                    <textarea 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 min-h-[100px]"
                      placeholder="Ej: Pago de honorarios primera etapa..."
                      value={partialPaymentData.reference}
                      onChange={(e) => setPartialPaymentData({ ...partialPaymentData, reference: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => { setIsEditPaymentModalOpen(false); setEditingPayment(null); }}
                    className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-2xl transition-all"
                  >
                    Cancelar
                  </button>
                  <button onClick={handleUpdatePayment} className="lm-btn lm-btn--primary" style={{ flex: 1, padding: '12px' }}>
                    Guardar Cambios
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
