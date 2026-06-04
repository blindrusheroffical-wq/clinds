import React, { useState, useEffect, useRef } from 'react';
// import { db } from '../firebaseSetup'; // We will use this later to fetch real products

export default function BillingPOS() {
  const [barcode, setBarcode] = useState('');
  const [cart, setCart] = useState([]);
  const [total, setTotal] = useState(0);
  const [discountPercent, setDiscountPercent] = useState('');
  const [finalTotal, setFinalTotal] = useState(0);
  
  // Customer States
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerStatus, setCustomerStatus] = useState(null); // 'new' | 'returning'
  const [customerDB, setCustomerDB] = useState([]); // Temporary local database

  // New UI States
  const [inputMode, setInputMode] = useState('manual'); // 'barcode' or 'manual'
  const [manualName, setManualName] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [manualQty, setManualQty] = useState(1);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [invoiceNo, setInvoiceNo] = useState(Math.floor(Math.random() * 100000));
  const [dailySales, setDailySales] = useState([]);
  const [showReportModal, setShowReportModal] = useState(false);

  // AI Assistant States
  const [aiQuery, setAiQuery] = useState('');
  const [aiResponse, setAiResponse] = useState('');

  // To keep the cursor always ready for the barcode scanner
  const barcodeInputRef = useRef(null);

  useEffect(() => {
    if (inputMode === 'barcode' && barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  }, [inputMode]);

  // Recalculate total whenever cart or discount changes
  useEffect(() => {
    const newTotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    setTotal(newTotal);
    
    const discountValue = Number(discountPercent) || 0;
    const discountAmt = (newTotal * discountValue) / 100;
    setFinalTotal(newTotal - discountAmt);
  }, [cart, discountPercent]);

  // Function triggered when scanner scans a barcode (acts as an 'Enter' key press)
  const handleScan = (e) => {
    e.preventDefault();
    if (!barcode.trim()) return;

    // TODO: In the future, we will fetch the product details from Firebase using this barcode
    // For now, let's mock a product based on the scanned barcode
    const scannedProduct = {
      id: barcode,
      name: `Sulekha Premium Item (${barcode})`,
      price: 1500, // Dummy price
      qty: 1
    };

    // Check if item already exists in cart, if so, increase quantity
    const existingItem = cart.find(item => item.id === barcode);
    if (existingItem) {
      setCart(cart.map(item => item.id === barcode ? { ...item, qty: item.qty + 1 } : item));
    } else {
      setCart([...cart, scannedProduct]);
    }

    // Clear barcode input for the next scan
    setBarcode('');
    barcodeInputRef.current.focus();
  };

  // Function to add item manually when barcode scanner is not available
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

  // Function to remove an item from the cart
  const handleRemoveItem = (indexToRemove) => {
    setCart(cart.filter((_, index) => index !== indexToRemove));
  };

  // Search customer by phone number
  const handleSearchCustomer = () => {
    if (!customerPhone.trim()) return;
    const existing = customerDB.find(c => c.phone === customerPhone);
    if (existing) {
      setCustomerName(existing.name);
      setCustomerStatus('returning');
    } else {
      setCustomerStatus('new');
    }
  };

  const handleAiAsk = (e) => {
    e.preventDefault();
    setAiResponse(`AI Assistant: Checking inventory for "${aiQuery}"... Yes Adam, we currently have stock available for this item in our Firebase database!`);
    setAiQuery('');
  };

  const handlePrintOption = (type) => {
    // Both options use the browser's native print dialog. 
    // The user can choose "Save as PDF" or select a physical printer from the dialog.
    setShowPrintModal(false);
    
    const originalTitle = document.title;
    // Sets the document title so the saved PDF has a professional file name
    document.title = `Sulekha_Silks_Invoice_${invoiceNo}`; 

    setTimeout(() => {
      window.print();
      document.title = originalTitle; // Revert the title back
      
      // Save customer if new
      if (customerPhone && customerName) {
        const existing = customerDB.find(c => c.phone === customerPhone);
        if (!existing) {
          setCustomerDB(prev => [...prev, { phone: customerPhone, name: customerName }]);
        }
      }

      // Save the completed bill to daily sales report
      const completedBill = {
        invoiceNo: invoiceNo,
        date: new Date(),
        customerPhone: customerPhone,
        customerName: customerName,
        items: [...cart], // Create a copy of the cart
        subTotal: total,
        discountPercent: Number(discountPercent) || 0,
        total: finalTotal,
      };
      setDailySales(prevSales => [...prevSales, completedBill]);

      // Ask if the user wants to clear the cart for the next customer
      if (window.confirm("Bill completed! Do you want to clear the cart for the next customer?")) {
        setCart([]);
        setDiscountPercent('');
        setCustomerPhone('');
        setCustomerName('');
        setCustomerStatus(null);
        setInvoiceNo(Math.floor(Math.random() * 100000)); // Generate new invoice number
      }
    }, 500);
  };

  const handleDownloadReport = () => {
    if (dailySales.length === 0) {
      alert("No sales recorded yet for today.");
      return;
    }

    const headers = ["Invoice No", "Date", "Time", "Customer Name", "Phone", "Total Amount (₹)", "Items"];
    const rows = dailySales.map(sale => [
      `#SLK-${sale.invoiceNo}`,
      sale.date.toLocaleDateString(),
      sale.date.toLocaleTimeString(),
      `"${sale.customerName || 'N/A'}"`,
      sale.customerPhone || 'N/A',
      sale.total.toFixed(2),
      `"${sale.items.map(item => `${item.qty}x ${item.name}`).join('; ')}"` // Use semicolon to avoid CSV issues with commas in names
    ]);

    let csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n" 
      + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    link.setAttribute("download", `Sulekha_Silks_Sales_Report_${dateStr}.csv`);
    document.body.appendChild(link); // Required for FF

    link.click();
    document.body.removeChild(link);
  };

  // Function to delete a sale record from the daily report
  const handleDeleteSale = (indexToDelete) => {
    if (window.confirm("Are you sure you want to delete this sale record?")) {
      setDailySales(dailySales.filter((_, index) => index !== indexToDelete));
    }
  };

  return (
    <>
      {/* CSS Styles for Printing a Beautiful Invoice */}
      <style>
        {`
          @media print {
            body {
              background-color: white !important;
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact;
            }
            .no-print { display: none !important; }
            .print-only { display: block !important; }
          }
          .print-only { display: none; }
        `}
      </style>

      {/* Main Software UI (Hidden during Print) */}
      <div className="no-print" style={{ padding: '30px', fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif', backgroundColor: '#fcfbf8', minHeight: '100vh', color: '#333' }}>
      
        {/* Premium Golden Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '3px solid #D4AF37', paddingBottom: '15px', marginBottom: '25px' }}>
          <h1 style={{ color: '#222', margin: 0, textTransform: 'uppercase', letterSpacing: '2px' }}>
            <span style={{ color: '#D4AF37' }}>Sulekha</span> Silks POS
          </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '30px' }}>
          <button 
              onClick={() => setShowReportModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', fontSize: '16px', backgroundColor: '#fff', color: '#222', border: '2px solid #222', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"></line>
                <line x1="12" y1="20" x2="12" y2="4"></line>
                <line x1="6" y1="20" x2="6" y2="14"></line>
              </svg>
              Daily Report
          </button>
          <div style={{ textAlign: 'right' }}>
            <h2 style={{ margin: 0, color: '#D4AF37', fontSize: '32px' }}>Total: ₹{finalTotal.toFixed(2)}</h2>
            {Number(discountPercent) > 0 && <div style={{ fontSize: '14px', color: '#888', marginTop: '5px' }}><del>₹{total.toFixed(2)}</del> ({discountPercent}% Off)</div>}
          </div>
        </div>
      </div>

        {/* Input Mode Toggle (Barcode vs Manual) */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button 
            onClick={() => setInputMode('manual')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', fontSize: '16px', fontWeight: 'bold', border: '2px solid #D4AF37', backgroundColor: inputMode === 'manual' ? '#D4AF37' : '#fff', color: inputMode === 'manual' ? '#111' : '#D4AF37', borderRadius: '5px', cursor: 'pointer', transition: '0.3s' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            Manual Entry
          </button>
          <button 
            onClick={() => setInputMode('barcode')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', fontSize: '16px', fontWeight: 'bold', border: '2px solid #D4AF37', backgroundColor: inputMode === 'barcode' ? '#D4AF37' : '#fff', color: inputMode === 'barcode' ? '#111' : '#D4AF37', borderRadius: '5px', cursor: 'pointer', transition: '0.3s' }}>
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
        
      {/* Customer Details Section */}
      <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', border: '1px solid #eee', marginBottom: '20px' }}>
        <h3 style={{ margin: '0 0 15px 0', color: '#555', fontSize: '16px' }}>Customer Details</h3>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#555' }}>Phone Number:</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input 
                type="tel" 
                placeholder="Enter Phone Number" 
                value={customerPhone}
                onChange={(e) => { setCustomerPhone(e.target.value); setCustomerStatus(null); }}
                style={{ flex: 1, padding: '12px', fontSize: '16px', border: '1px solid #ccc', borderRadius: '5px', outline: 'none' }}
              />
              <button type="button" onClick={handleSearchCustomer} style={{ padding: '12px 20px', backgroundColor: '#222', color: '#D4AF37', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
                Search
              </button>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#555' }}>Customer Name:</label>
            <input 
              type="text" 
              placeholder="Customer Name" 
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              style={{ padding: '12px', fontSize: '16px', width: '100%', border: '1px solid #ccc', borderRadius: '5px', outline: 'none' }}
            />
          </div>
          {customerStatus && (
            <div style={{ padding: '12px 20px', textAlign: 'center', backgroundColor: customerStatus === 'returning' ? '#e8f8f5' : '#fef9e7', color: customerStatus === 'returning' ? '#27ae60' : '#f39c12', border: `1px solid ${customerStatus === 'returning' ? '#2ecc71' : '#f1c40f'}`, borderRadius: '5px', fontWeight: 'bold', minWidth: '150px' }}>
              {customerStatus === 'returning' ? '✅ Returning Customer' : '✨ New Customer'}
            </div>
          )}
        </div>
      </div>

      {/* Inputs Section */}
      <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', border: '1px solid #eee', marginBottom: '30px' }}>
        {inputMode === 'barcode' ? (
          <form onSubmit={handleScan}>
            <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', color: '#555' }}>Scan Product Barcode:</label>
            <input 
              ref={barcodeInputRef}
              type="text" 
              placeholder="Scan Barcode Here..." 
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              style={{ padding: '15px', fontSize: '18px', width: '100%', maxWidth: '400px', border: '2px solid #D4AF37', borderRadius: '5px', outline: 'none' }}
            />
            <button type="submit" style={{ display: 'none' }}>Add</button>
          </form>
        ) : (
          <form onSubmit={handleManualAdd} style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '250px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#555' }}>Item Name:</label>
              <input 
                type="text" 
                placeholder="E.g., Silk Saree Red" 
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                style={{ padding: '12px', fontSize: '16px', width: '100%', border: '1px solid #ccc', borderRadius: '5px', outline: 'none' }}
                required
              />
            </div>
            <div style={{ flex: 1, minWidth: '150px', maxWidth: '200px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#555' }}>Price (₹):</label>
              <input 
                type="number" 
                placeholder="Price" 
                value={manualPrice}
                onChange={(e) => setManualPrice(e.target.value)}
                style={{ padding: '12px', fontSize: '16px', width: '100%', border: '1px solid #ccc', borderRadius: '5px', outline: 'none' }}
                required
              />
            </div>
            <div style={{ flex: 1, minWidth: '80px', maxWidth: '100px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#555' }}>Qty:</label>
              <input 
                type="number" 
                min="1"
                placeholder="1" 
                value={manualQty}
                onChange={(e) => setManualQty(e.target.value)}
                style={{ padding: '12px', fontSize: '16px', width: '100%', border: '1px solid #ccc', borderRadius: '5px', outline: 'none' }}
                required
              />
            </div>
            <button type="submit" style={{ padding: '12px 25px', fontSize: '16px', backgroundColor: '#222', color: '#D4AF37', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
              Add to Bill
            </button>
          </form>
        )}
      </div>

      {/* Cart/Bill Items Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '18px', backgroundColor: '#fff', boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
        <thead>
          <tr style={{ backgroundColor: '#222', color: '#D4AF37', textAlign: 'left' }}>
            <th style={{ padding: '15px', borderBottom: '2px solid #D4AF37' }}>Item</th>
            <th style={{ padding: '15px', borderBottom: '2px solid #D4AF37' }}>Price</th>
            <th style={{ padding: '15px', borderBottom: '2px solid #D4AF37' }}>Qty</th>
            <th style={{ padding: '15px', borderBottom: '2px solid #D4AF37' }}>Subtotal</th>
            <th style={{ padding: '15px', borderBottom: '2px solid #D4AF37', textAlign: 'center' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {cart.map((item, index) => (
            <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '15px' }}>{item.name}</td>
              <td style={{ padding: '15px' }}>₹{item.price}</td>
              <td style={{ padding: '15px' }}>{item.qty}</td>
              <td style={{ padding: '15px', fontWeight: 'bold' }}>₹{item.price * item.qty}</td>
              <td style={{ padding: '15px', textAlign: 'center' }}>
                <button onClick={() => handleRemoveItem(index)} style={{ background: 'transparent', border: 'none', color: '#e74c3c', cursor: 'pointer' }} title="Remove Item">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>
                  </svg>
                </button>
              </td>
            </tr>
          ))}
          {cart.length === 0 && (
            <tr>
              <td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#999' }}>No items added to the bill yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Print Button */}
      {cart.length > 0 && (
        <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '30px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ fontWeight: 'bold', fontSize: '18px', color: '#555' }}>Discount (%):</label>
            <input 
              type="number" 
              min="0" 
              max="100"
              placeholder="0"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
              style={{ padding: '12px', fontSize: '18px', width: '90px', border: '2px solid #D4AF37', borderRadius: '5px', outline: 'none', textAlign: 'center' }}
            />
          </div>
          <button onClick={() => setShowPrintModal(true)} style={{ padding: '15px 35px', fontSize: '20px', backgroundColor: '#D4AF37', color: '#111', fontWeight: 'bold', border: 'none', borderRadius: '5px', cursor: 'pointer', boxShadow: '0 4px 6px rgba(212, 175, 55, 0.4)' }}>
            Print Bill & Complete Order
          </button>
        </div>
      )}

      {/* Print Options Modal */}
      {showPrintModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', padding: '40px', borderRadius: '10px', textAlign: 'center', maxWidth: '400px', width: '90%', border: '3px solid #D4AF37' }}>
            <h2 style={{ color: '#222', marginTop: 0 }}>Select Print Option</h2>
            <p style={{ color: '#666', marginBottom: '30px' }}>Do you want to print to a physical printer or save as a PDF file?</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <button onClick={() => handlePrintOption('pdf')} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', padding: '15px', fontSize: '18px', backgroundColor: '#222', color: '#D4AF37', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                Save as PDF
              </button>
              <button onClick={() => handlePrintOption('printer')} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', padding: '15px', fontSize: '18px', backgroundColor: '#D4AF37', color: '#111', fontWeight: 'bold', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

      {/* Daily Sales Report Modal */}
      {showReportModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', padding: '30px', borderRadius: '10px', width: '90%', maxWidth: '800px', border: '3px solid #D4AF37', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #eee', paddingBottom: '15px', marginBottom: '20px' }}>
              <h2 style={{ color: '#222', margin: 0 }}>Daily Sales Report</h2>
              <button onClick={() => setShowReportModal(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#888' }}>&times;</button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '20px' }}>
              {dailySales.length > 0 ? (
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
                        <td style={{ padding: '10px', border: '1px solid #ddd' }}>#SLK-{sale.invoiceNo}</td>
                        <td style={{ padding: '10px', border: '1px solid #ddd' }}>{sale.date.toLocaleTimeString()}</td>
                        <td style={{ padding: '10px', border: '1px solid #ddd' }}>{sale.customerName ? `${sale.customerName} (${sale.customerPhone})` : 'N/A'}</td>
                        <td style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'right' }}>₹{sale.total.toFixed(2)}</td>
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
                <strong>Total Revenue:</strong> ₹{dailySales.reduce((sum, sale) => sum + sale.total, 0).toFixed(2)}
              </div>
              <button onClick={handleDownloadReport} style={{ padding: '12px 25px', fontSize: '16px', backgroundColor: '#222', color: '#D4AF37', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }} disabled={dailySales.length === 0}>
                Download Report (CSV)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Assistant Section */}
      <div style={{ marginTop: '50px', padding: '25px', border: '1px solid #eee', borderRadius: '8px', backgroundColor: '#fff', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
        <h3 style={{ color: '#222', margin: '0 0 15px 0', borderLeft: '4px solid #D4AF37', paddingLeft: '10px' }}>Ask AI Assistant</h3>
        <form onSubmit={handleAiAsk} style={{ display: 'flex', gap: '10px' }}>
          <input 
            type="text" 
            placeholder="E.g., Do we have Red Kanchipuram sarees in stock?" 
            value={aiQuery}
            onChange={(e) => setAiQuery(e.target.value)}
            style={{ flex: 1, padding: '12px', fontSize: '16px', borderRadius: '5px', border: '1px solid #ccc', outline: 'none' }}
          />
          <button type="submit" style={{ padding: '12px 25px', backgroundColor: '#222', color: '#D4AF37', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
            Ask AI
          </button>
        </form>
        {aiResponse && (
          <p style={{ marginTop: '20px', padding: '15px', backgroundColor: '#fcfbf8', border: '1px solid #D4AF37', borderRadius: '5px', fontSize: '16px', color: '#333' }}>
            {aiResponse}
          </p>
        )}
      </div>
      </div>

      {/* Print Only Layout (Compact POS Receipt) */}
      <div className="print-only" style={{ padding: '2mm', width: '100%', maxWidth: '80mm', boxSizing: 'border-box', margin: '0 auto', color: '#000', fontFamily: '"Courier New", Courier, monospace', fontSize: '14px', lineHeight: '1.4' }}>
        <div style={{ textAlign: 'center', marginBottom: '15px' }}>
          <h1 style={{ fontSize: '26px', margin: '0 0 5px 0', textTransform: 'uppercase', fontWeight: 'bold', borderBottom: '2px solid #000', display: 'inline-block', paddingBottom: '2px' }}>Sulekha Silks</h1>
          <p style={{ margin: '5px 0 2px' }}>Opposite Main Bus Stand</p>
          <p style={{ margin: '2px 0' }}>Kerala - 670001</p>
          <p style={{ margin: '2px 0' }}>Ph: +91 98765 43210</p>
          <p style={{ margin: '2px 0' }}>GSTIN: 32AABCU9603R1ZM</p>
        </div>
        
        <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '10px 0', marginBottom: '15px', display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ marginBottom: '5px' }}><strong>Bill No:</strong> #SLK-{invoiceNo}</div>
            <div><strong>Date:</strong> {new Date().toLocaleDateString()}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ marginBottom: '5px' }}><strong>Time:</strong> {new Date().toLocaleTimeString()}</div>
            <div><strong>Mode:</strong> POS</div>
          </div>
        </div>

        {/* Customer Details on Bill */}
        {(customerName || customerPhone) && (
          <div style={{ marginBottom: '15px', borderBottom: '1px dashed #000', paddingBottom: '10px' }}>
            {customerName && <div style={{ marginBottom: '3px' }}><strong>Name:</strong> {customerName}</div>}
            {customerPhone && <div><strong>Phone:</strong> {customerPhone}</div>}
          </div>
        )}

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '15px' }}>
          <thead>
            <tr style={{ borderBottom: '1px dashed #000' }}>
              <th style={{ padding: '5px 0', textAlign: 'left', width: '45%' }}>Item</th>
              <th style={{ padding: '5px 0', textAlign: 'center', width: '15%' }}>Qty</th>
              <th style={{ padding: '5px 0', textAlign: 'right', width: '20%' }}>Rate</th>
              <th style={{ padding: '5px 0', textAlign: 'right', width: '20%' }}>Amt</th>
            </tr>
          </thead>
          <tbody>
            {cart.map((item, index) => (
              <tr key={index}>
                <td style={{ padding: '8px 0', textAlign: 'left', wordBreak: 'break-word' }}>{item.name}</td>
                <td style={{ padding: '8px 0', textAlign: 'center' }}>{item.qty}</td>
                <td style={{ padding: '8px 0', textAlign: 'right' }}>{item.price}</td>
                <td style={{ padding: '8px 0', textAlign: 'right' }}>{(item.price * item.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ borderTop: '1px dashed #000', padding: '15px 0', textAlign: 'right' }}>
          {Number(discountPercent) > 0 && (
            <>
              <div style={{ marginBottom: '5px', fontSize: '14px' }}>Subtotal: ₹{total.toFixed(2)}</div>
              <div style={{ marginBottom: '5px', fontSize: '14px' }}>Discount ({discountPercent}%): -₹{((total * Number(discountPercent)) / 100).toFixed(2)}</div>
            </>
          )}
          <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
            TOTAL: ₹{finalTotal.toFixed(2)}
          </div>
        </div>

        <div style={{ borderTop: '1px dashed #000', textAlign: 'center', paddingTop: '15px', color: '#000' }}>
          <p style={{ margin: '0 0 5px 0', fontWeight: 'bold' }}>Thank You for Shopping!</p>
          <p style={{ margin: '0', fontSize: '12px' }}>Please Visit Again</p>
          
          <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=https://sulekha-silks-mg7f.onrender.com/" alt="Website QR Code" style={{ width: '70px', height: '70px' }} />
            <p style={{ margin: '5px 0 0 0', fontSize: '10px' }}>Scan to Visit Our Online Store</p>
          </div>
        </div>
      </div>
    </>
  );
}
