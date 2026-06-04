import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, serverTimestamp, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from './firebaseSetup.js'; // We will connect this soon!

export default function ClientPOS() {
  const [cart, setCart] = useState([]);
  
  // Bill Calculations
  const [subTotal, setSubTotal] = useState(0);
  const [discountPercent, setDiscountPercent] = useState('');
  const [discountAmt, setDiscountAmt] = useState(0);
  const [taxableValue, setTaxableValue] = useState(0);
  const [gstPercent, setGstPercent] = useState(5); // Default 5% GST for clothes
  const [cgst, setCgst] = useState(0);
  const [sgst, setSgst] = useState(0);
  const [grandTotal, setGrandTotal] = useState(0);

  // Inputs
  const [inputMode, setInputMode] = useState('manual');
  const [barcode, setBarcode] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [manualQty, setManualQty] = useState(1);
  
  // Customer & Invoice
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerStatus, setCustomerStatus] = useState(null); // 'new' | 'returning'
  const [customerDB, setCustomerDB] = useState(() => {
    const saved = localStorage.getItem('sulekha_customers');
    return saved ? JSON.parse(saved) : [];
  }); // Local browser database (Like SQLite)
  const [invoiceNo, setInvoiceNo] = useState(Math.floor(Math.random() * 100000));
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [lastPurchaseAmt, setLastPurchaseAmt] = useState(null);
  const [lastPurchaseDate, setLastPurchaseDate] = useState(null);
  const [dailySales, setDailySales] = useState([]);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isReportLoading, setIsReportLoading] = useState(false);

  const barcodeInputRef = useRef(null);

  useEffect(() => {
    if (inputMode === 'barcode' && barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  }, [inputMode]);

  // Core GST & Discount Calculation Logic
  useEffect(() => {
    const newSubTotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    setSubTotal(newSubTotal);
    
    const dValue = Number(discountPercent) || 0;
    const dAmt = (newSubTotal * dValue) / 100;
    setDiscountAmt(dAmt);
    
    const taxValue = newSubTotal - dAmt;
    setTaxableValue(taxValue);

    const gPercent = Number(gstPercent) || 0;
    const totalGst = (taxValue * gPercent) / 100;
    
    setCgst(totalGst / 2);
    setSgst(totalGst / 2);
    
    setGrandTotal(taxValue + totalGst);
  }, [cart, discountPercent, gstPercent]);

  // Add Item via Barcode
  const handleScan = (e) => {
    e.preventDefault();
    if (!barcode.trim()) return;

    // TODO: Fetch real product from Firebase here using where('barcode', '==', barcode)
    const scannedProduct = {
      id: barcode,
      name: `Premium Product (${barcode})`,
      price: 1500, // Fetch real price
      qty: 1
    };

    const existingItem = cart.find(item => item.id === barcode);
    if (existingItem) {
      setCart(cart.map(item => item.id === barcode ? { ...item, qty: item.qty + 1 } : item));
    } else {
      setCart([...cart, scannedProduct]);
    }
    setBarcode('');
    barcodeInputRef.current.focus();
  };

  // Add Item Manually
  const handleManualAdd = (e) => {
    e.preventDefault();
    if (!manualName.trim() || !manualPrice || !manualQty) return;
    
    const newItem = {
      id: `MNL-${Date.now()}`,
      name: manualName,
      price: Number(manualPrice),
      qty: Number(manualQty)
    };
    
    setCart([...cart, newItem]);
    setManualName('');
    setManualPrice('');
    setManualQty(1);
  };

  const handleRemoveItem = (indexToRemove) => {
    setCart(cart.filter((_, index) => index !== indexToRemove));
  };

  // Search customer by phone number
  const handleSearchCustomer = async () => {
    if (!customerPhone.trim()) return;
    setIsSearching(true);

    try {
      const existing = customerDB.find(c => c.phone === customerPhone.trim());
      if (existing) {
        setCustomerName(existing.name);
        setCustomerStatus('returning');
        setIsSearching(false);
        return;
      }

      const q = query(collection(db, "sales"), where("customerPhone", "==", customerPhone.trim()));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const sales = querySnapshot.docs.map(d => d.data());
        // Sort locally to avoid Firebase index error
        sales.sort((a, b) => {
           const timeA = a.timestamp?.seconds || new Date(a.date || 0).getTime()/1000 || 0;
           const timeB = b.timestamp?.seconds || new Date(b.date || 0).getTime()/1000 || 0;
           return timeB - timeA;
        });
        const pastSale = sales[0];
        setCustomerName(pastSale.customerName || '');
        setCustomerStatus('returning');
        
        if (pastSale.grandTotal || pastSale.total) setLastPurchaseAmt((pastSale.grandTotal || pastSale.total).toFixed(2));
        let saleDateObj = pastSale.timestamp?.toDate ? pastSale.timestamp.toDate() : (pastSale.date ? new Date(pastSale.date) : new Date());
        setLastPurchaseDate(saleDateObj.toLocaleDateString());
      } else {
        setCustomerStatus('new');
        setLastPurchaseAmt(null);
        setLastPurchaseDate(null);
      }
    } catch (error) {
      console.error("Error searching customer in Firebase:", error);
      setCustomerStatus('new');
    } finally {
      setIsSearching(false);
    }
  };

  // Fetch Today's Total Sales when opening Daily Report
  const handleOpenReport = async () => {
    setShowReportModal(true);
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0); // Set time to today midnight
      const q = query(collection(db, "sales"));
      const querySnapshot = await getDocs(q);
      const fetchedSales = [];
      querySnapshot.forEach((doc) => {
         const data = doc.data();
         let saleDateObj = data.timestamp?.toDate ? data.timestamp.toDate() : (data.date ? new Date(data.date) : new Date());
         if(saleDateObj >= startOfDay) {
            fetchedSales.push({ ...data, dateObj: saleDateObj, id: doc.id });
         }
      });
      fetchedSales.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
      setDailySales(fetchedSales);
    } catch (error) {
      console.error("Error fetching daily sales:", error);
    }
  };

  const handleDownloadReport = () => {
    if (dailySales.length === 0) {
      alert("No sales recorded yet for today.");
      return;
    }
    const headers = ["Invoice No", "Date", "Time", "Customer Name", "Phone", "Total Amount (₹)", "Items"];
    const rows = dailySales.map(sale => [
      sale.invoiceNo,
      sale.dateObj.toLocaleDateString(),
      sale.dateObj.toLocaleTimeString(),
      `"${sale.customerName || 'N/A'}"`,
      sale.customerPhone || 'N/A',
      (sale.grandTotal || sale.total || 0).toFixed(2),
      `"${sale.items.map(item => `${item.qty}x ${item.name}`).join('; ')}"`
    ]);
    let csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    link.setAttribute("download", `Sulekha_Silks_Sales_Report_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteSale = (indexToDelete) => {
    if (window.confirm("Are you sure you want to delete this sale record?")) {
      setDailySales(dailySales.filter((_, index) => index !== indexToDelete));
    }
  };

  // Save to Firebase & Print
  const handleCheckoutAndPrint = () => {
    setShowPrintModal(false);

    const billData = {
      invoiceNo: `INV-${invoiceNo}`,
      customerName: customerName || 'Walk-in Customer',
      customerPhone: customerPhone || 'N/A',
      items: cart,
      subTotal: subTotal,
      discountPercent: Number(discountPercent) || 0,
      discountAmount: discountAmt,
      taxableValue: taxableValue,
      gstPercent: Number(gstPercent) || 0,
      cgst: cgst,
      sgst: sgst,
      grandTotal: grandTotal,
    };

    const originalTitle = document.title;
    document.title = `Invoice_${billData.invoiceNo}`;

    setTimeout(async () => {
      window.print();
      document.title = originalTitle; 
      
      if (window.confirm("Bill printed! Do you want to save this to the database and clear the cart?")) {
        // Save customer if new
        if (customerPhone.trim() && customerName.trim()) {
          const existing = customerDB.find(c => c.phone === customerPhone.trim());
          if (!existing) {
            const updatedDB = [...customerDB, { phone: customerPhone.trim(), name: customerName.trim() }];
            setCustomerDB(updatedDB);
            localStorage.setItem('sulekha_customers', JSON.stringify(updatedDB));
          }
        }

        try {
          // Save the bill data to a "sales" collection in Firestore
          await addDoc(collection(db, "sales"), {
            ...billData,
            timestamp: serverTimestamp()
          });
          console.log("Saved to Firebase successfully!");
        } catch (error) {
          console.error("Error saving to Firebase: ", error);
          alert('Failed to save to database. Please check your Firebase rules and connection.');
        }
        
        setCart([]);
        setDiscountPercent('');
        setCustomerPhone('');
        setCustomerName('');
        setCustomerStatus(null);
        setLastPurchaseAmt(null);
        setLastPurchaseDate(null);
        setInvoiceNo(Math.floor(Math.random() * 100000));
      }
    }, 500);
  };

  return (

    <>
      {/* CSS for Professional A4/Thermal Print with GST */}
      <style>
        {`
          @keyframes spin { 100% { transform: rotate(360deg); } }
          .spin { animation: spin 1s linear infinite; }
          @media print {
            @page { margin: 0; size: 80mm 297mm; }
            body { background-color: white !important; margin: 2mm; padding: 0; -webkit-print-color-adjust: exact; }
            .no-print { display: none !important; }
            .print-only { display: block !important; }
          }
          .print-only { display: none; }
        `}
      </style>

      {/* Main Software UI */}
      <div className="no-print" style={{ padding: '30px', fontFamily: 'system-ui, sans-serif', backgroundColor: '#f4f7f6', minHeight: '100vh', color: '#333' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '3px solid #2c3e50', paddingBottom: '15px', marginBottom: '25px' }}>
          <h1 style={{ color: '#2c3e50', margin: 0, textTransform: 'uppercase', letterSpacing: '1px' }}>
            <span style={{ color: '#3498db' }}>Sulekha</span> Silks
          </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '30px' }}>
          <button 
              onClick={handleOpenReport}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', fontSize: '16px', backgroundColor: '#fff', color: '#2c3e50', border: '2px solid #2c3e50', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"></line>
                <line x1="12" y1="20" x2="12" y2="4"></line>
                <line x1="6" y1="20" x2="6" y2="14"></line>
              </svg>
              Daily Report
          </button>
          <h2 style={{ margin: 0, color: '#27ae60', fontSize: '32px' }}>₹{grandTotal.toFixed(2)}</h2>
        </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
          <button onClick={() => setInputMode('manual')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: inputMode === 'manual' ? '#3498db' : '#fff', color: inputMode === 'manual' ? '#fff' : '#3498db', border: '1px solid #3498db', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            Manual Entry
          </button>
          <button onClick={() => setInputMode('barcode')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: inputMode === 'barcode' ? '#3498db' : '#fff', color: inputMode === 'barcode' ? '#fff' : '#3498db', border: '1px solid #3498db', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7V5a2 2 0 0 1 2-2h2"></path>
              <path d="M17 3h2a2 2 0 0 1 2 2v2"></path>
              <path d="M21 17v2a2 2 0 0 1-2 2h-2"></path>
              <path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>
              <path d="M8 7v10"></path>
              <path d="M12 7v10"></path>
              <path d="M16 7v10"></path>
            </svg>
            Barcode Scanner
          </button>
        </div>

        {/* Customer & Settings */}
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '20px', display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: '14px', color: '#666', marginBottom: '5px' }}>Customer Phone</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input type="tel" value={customerPhone} onChange={(e) => { setCustomerPhone(e.target.value); setCustomerStatus(null); }} placeholder="Phone Number" style={{ flex: 1, padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }} />
              <button type="button" onClick={handleSearchCustomer} disabled={isSearching} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '10px 15px', backgroundColor: '#3498db', color: '#fff', border: 'none', borderRadius: '4px', cursor: isSearching ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                {isSearching ? (
                  <svg className="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                )}
                Search
              </button>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: '14px', color: '#666', marginBottom: '5px' }}>Customer Name</label>
            <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Name" style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: 0.5, minWidth: '100px' }}>
            <label style={{ display: 'block', fontSize: '14px', color: '#666', marginBottom: '5px' }}>GST Rate (%)</label>
            <select value={gstPercent} onChange={(e) => setGstPercent(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }}>
              <option value="0">0%</option>
              <option value="5">5%</option>
              <option value="12">12%</option>
              <option value="18">18%</option>
              <option value="28">28%</option>
            </select>
          </div>
          {customerStatus && (
            <div style={{ width: '100%', padding: '10px', marginTop: '10px', textAlign: 'center', backgroundColor: customerStatus === 'returning' ? '#e8f8f5' : '#fef9e7', color: customerStatus === 'returning' ? '#27ae60' : '#f39c12', border: `1px solid ${customerStatus === 'returning' ? '#2ecc71' : '#f1c40f'}`, borderRadius: '4px', fontWeight: 'bold' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                {customerStatus === 'returning' ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                )}
                {customerStatus === 'returning' ? 'Returning Customer' : 'New Customer'}
              </div>
            {lastPurchaseAmt && <div style={{ fontSize: '13px', marginTop: '5px', color: '#555' }}>Last Purchase: ₹{lastPurchaseAmt} {lastPurchaseDate && `(${lastPurchaseDate})`}</div>}
            </div>
          )}
        </div>

        {/* Product Input */}
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '20px' }}>
          {inputMode === 'barcode' ? (
            <form onSubmit={handleScan}>
              <input ref={barcodeInputRef} type="text" placeholder="Scan Barcode Here..." value={barcode} onChange={(e) => setBarcode(e.target.value)} style={{ padding: '12px', fontSize: '16px', width: '100%', maxWidth: '400px', border: '2px solid #3498db', borderRadius: '4px' }} />
            </form>
          ) : (
            <form onSubmit={handleManualAdd} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
              <div style={{ flex: 2 }}>
                <label style={{ fontSize: '14px', color: '#666' }}>Item Name</label>
                <input type="text" value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Product Name" style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }} required />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '14px', color: '#666' }}>Price (₹)</label>
                <input type="number" value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} placeholder="Price" style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }} required />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '14px', color: '#666' }}>Qty</label>
                <input type="number" min="1" value={manualQty} onChange={(e) => setManualQty(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }} required />
              </div>
              <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#2ecc71', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Add</button>
            </form>
          )}
        </div>

        {/* Cart Table */}
        <table style={{ width: '100%', backgroundColor: '#fff', borderCollapse: 'collapse', border: '1px solid #ddd' }}>
          <thead style={{ backgroundColor: '#2c3e50', color: '#fff' }}>
            <tr>
              <th style={{ padding: '12px', textAlign: 'left' }}>Item</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>Price</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>Qty</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>Total</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>X</th>
            </tr>
          </thead>
          <tbody>
            {cart.map((item, index) => (
              <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '12px' }}>{item.name}</td>
                <td style={{ padding: '12px', textAlign: 'center' }}>₹{item.price}</td>
                <td style={{ padding: '12px', textAlign: 'center' }}>{item.qty}</td>
                <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>₹{item.price * item.qty}</td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <button onClick={() => handleRemoveItem(index)} style={{ color: '#e74c3c', border: 'none', background: 'none', cursor: 'pointer' }} title="Remove Item">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
            {cart.length === 0 && (
              <tr><td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#999' }}>Cart is empty</td></tr>
            )}
          </tbody>
        </table>

        {/* Billing Calculations Box */}
        {cart.length > 0 && (
          <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: '350px', backgroundColor: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #ddd', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span>Subtotal:</span>
                <strong>₹{subTotal.toFixed(2)}</strong>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  Discount: 
                  <input type="number" value={discountPercent} onChange={(e)=>setDiscountPercent(e.target.value)} placeholder="%" style={{ width: '50px', padding: '2px 5px', border: '1px solid #ccc' }} /> %
                </span>
                <strong style={{ color: '#e74c3c' }}>- ₹{discountAmt.toFixed(2)}</strong>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px dashed #ccc' }}>
                <span>Taxable Value:</span>
                <strong>₹{taxableValue.toFixed(2)}</strong>
              </div>

              {Number(gstPercent) > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '14px', color: '#555' }}>
                    <span>CGST ({gstPercent / 2}%):</span>
                    <span>+ ₹{cgst.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '14px', color: '#555', paddingBottom: '10px', borderBottom: '1px solid #eee' }}>
                    <span>SGST ({gstPercent / 2}%):</span>
                    <span>+ ₹{sgst.toFixed(2)}</span>
                  </div>
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '22px', color: '#27ae60', marginTop: '10px' }}>
                <strong>GRAND TOTAL:</strong>
                <strong>₹{grandTotal.toFixed(2)}</strong>
              </div>

              <button onClick={() => setShowPrintModal(true)} style={{ width: '100%', padding: '15px', marginTop: '20px', backgroundColor: '#2c3e50', color: '#fff', fontSize: '18px', fontWeight: 'bold', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                Checkout & Print
              </button>
            </div>

      {/* Daily Sales Report Modal */}
      {showReportModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', padding: '30px', borderRadius: '10px', width: '90%', maxWidth: '800px', border: '3px solid #3498db', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #eee', paddingBottom: '15px', marginBottom: '20px' }}>
              <h2 style={{ color: '#2c3e50', margin: 0 }}>Daily Sales Report</h2>
              <button onClick={() => setShowReportModal(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#888' }}>&times;</button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '20px' }}>
              {isReportLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0', color: '#3498db' }}>
                  <svg className="spin" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  <p style={{ marginTop: '10px', color: '#666', fontWeight: 'bold' }}>Loading today's sales...</p>
                </div>
              ) : dailySales.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f2f2f2' }}>
                      <th style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'left' }}>Invoice No</th>
                      <th style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'left' }}>Time</th>
                      <th style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'left' }}>Customer</th>
                      <th style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'right' }}>Amount</th>
                      <th style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailySales.map((sale, index) => (
                      <tr key={index}>
                        <td style={{ padding: '10px', border: '1px solid #ddd' }}>{sale.invoiceNo}</td>
                        <td style={{ padding: '10px', border: '1px solid #ddd' }}>{sale.dateObj.toLocaleTimeString()}</td>
                        <td style={{ padding: '10px', border: '1px solid #ddd' }}>{sale.customerName ? `${sale.customerName} (${sale.customerPhone})` : 'N/A'}</td>
                        <td style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'right' }}>₹{(sale.grandTotal || sale.total || 0).toFixed(2)}</td>
                        <td style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'center' }}>
                          <button onClick={() => handleDeleteSale(index)} style={{ background: 'transparent', border: 'none', color: '#e74c3c', cursor: 'pointer' }} title="Delete Record">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ textAlign: 'center', color: '#888', padding: '40px 0' }}>No sales recorded yet for today.</p>
              )}
            </div>

            <div style={{ borderTop: '2px solid #eee', paddingTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>Total Sales:</strong> {dailySales.length} <br />
                <strong>Total Revenue:</strong> ₹{dailySales.reduce((sum, sale) => sum + (sale.grandTotal || sale.total || 0), 0).toFixed(2)}
              </div>
              <button onClick={handleDownloadReport} style={{ padding: '12px 25px', fontSize: '16px', backgroundColor: '#2c3e50', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }} disabled={dailySales.length === 0}>
                Download Report (CSV)
              </button>
            </div>
          </div>
        </div>
      )}
          </div>
        )}

        {/* Print Modal */}
        {showPrintModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
            <div style={{ backgroundColor: '#fff', padding: '40px', borderRadius: '10px', textAlign: 'center', maxWidth: '400px', width: '90%', border: '2px solid #3498db' }}>
              <h2 style={{ color: '#2c3e50', marginTop: 0 }}>Select Print Option</h2>
              <p style={{ color: '#666', marginBottom: '30px' }}>Do you want to print to a physical printer or save as a PDF file?</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <button onClick={handleCheckoutAndPrint} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', padding: '15px', fontSize: '18px', backgroundColor: '#2c3e50', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                  Save as PDF
                </button>
                <button onClick={handleCheckoutAndPrint} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', padding: '15px', fontSize: '18px', backgroundColor: '#3498db', color: '#fff', fontWeight: 'bold', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect>
                  </svg>
                  Print to Printer
                </button>
                <button onClick={() => setShowPrintModal(false)} style={{ padding: '10px', marginTop: '10px', fontSize: '16px', backgroundColor: 'transparent', color: '#888', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Print Only Layout (Compact Thermal Receipt with GST) */}
      <div className="print-only" style={{ padding: '2mm', width: '100%', maxWidth: '80mm', boxSizing: 'border-box', margin: '0 auto', color: '#000', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.4' }}>
        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <h2 style={{ margin: '0 0 5px 0', fontSize: '20px', textTransform: 'uppercase', fontWeight: 'bold' }}>SulekhaSilks</h2>
          <p style={{ margin: '0' }}>Opposite Main Bus Stand, Kerala - 670001</p> 
          <p style={{ margin: '0' }}>Ph: +91 98765 43210</p>
          <p style={{ margin: '0' }}>GSTIN: 32AABCU9603R1ZM</p>
        </div>
        
        <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '5px 0', marginBottom: '10px', fontSize: '12px' }}>
          <div><strong>Bill No:</strong> INV-{invoiceNo}</div>
          <div><strong>Date:</strong> {new Date().toLocaleString()}</div>
          {customerName && <div><strong>Name:</strong> {customerName}</div>}
          {customerPhone && <div><strong>Phone:</strong> {customerPhone}</div>}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
          <thead>
            <tr style={{ borderBottom: '1px dashed #000', textAlign: 'left' }}>
              <th style={{ paddingBottom: '3px', width: '50%' }}>Item</th>
              <th style={{ paddingBottom: '3px', width: '15%', textAlign: 'center' }}>Qty</th>
              <th style={{ paddingBottom: '3px', width: '35%', textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {cart.map((item, index) => (
              <tr key={index}>
                <td style={{ padding: '4px 0', wordBreak: 'break-word' }}>{item.name}</td>
                <td style={{ padding: '4px 0', textAlign: 'center' }}>{item.qty}</td>
                <td style={{ padding: '4px 0', textAlign: 'right' }}>{(item.price * item.qty).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ borderTop: '1px dashed #000', padding: '10px 0', textAlign: 'right' }}>
          <div style={{ marginBottom: '3px' }}>Subtotal: ₹{subTotal.toFixed(2)}</div>
          {discountAmt > 0 && <div style={{ marginBottom: '3px' }}>Discount: -₹{discountAmt.toFixed(2)}</div>}
          
          <div style={{ borderTop: '1px dotted #ccc', paddingTop: '3px', marginBottom: '3px' }}>Taxable Value: ₹{taxableValue.toFixed(2)}</div>
          
          {Number(gstPercent) > 0 && (
            <>
              <div style={{ marginBottom: '3px', fontSize: '11px' }}>CGST ({gstPercent/2}%): ₹{cgst.toFixed(2)}</div>
              <div style={{ marginBottom: '3px', fontSize: '11px' }}>SGST ({gstPercent/2}%): ₹{sgst.toFixed(2)}</div>
            </>
          )}
          
          <div style={{ borderTop: '1px dashed #000', marginTop: '5px', paddingTop: '5px', fontSize: '18px', fontWeight: 'bold' }}>
            Total: ₹{grandTotal.toFixed(2)}
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '15px', borderTop: '1px dashed #000', paddingTop: '10px' }}>
          <p style={{ margin: '0' }}>Thank You for Shopping!</p>
          
          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=https://sulekha-silks-mg7f.onrender.com/" alt="Website QR Code" style={{ width: '60px', height: '60px' }} />
            <p style={{ margin: '5px 0 0 0', fontSize: '10px' }}>Scan to Visit Our Online Store</p>
          </div>
        </div>
      </div>
    </>
  );
}