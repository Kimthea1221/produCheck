// desktopfrontend/src/pages/fdafolder/fda-product-db.jsx
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import Sidebar from '../component/sidebar';
import TopBar from '../component/top-bar';
import {
  Eye,
  Pencil,
  ArrowRightLeft,
  Plus,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
  ExternalLink,
  Package,
  MoreVertical,
  Trash2,
} from 'lucide-react';
import './fda-css.css';
import { apiFetch } from '../../utils/apiFetch';

// NOTE: Items per page for table pagination
const ITEMS_PER_PAGE = 10;

// Reusable View + Dropdown action control (Superadmin-style pattern with Portal)
function FdaActionDropdown({ id, activeDropdownId, setActiveDropdownId, onView, children }) {
  const [openUpward, setOpenUpward] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const isOpen = activeDropdownId === id;

  const handleToggle = (e) => {
    e.stopPropagation();
    if (!isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const upward = spaceBelow < 150;
      setOpenUpward(upward);
      setMenuPos({
        top: upward ? Math.max(8, rect.top - 120) : rect.bottom + 4,
        left: Math.max(8, rect.right - 190),
      });
    }
    setActiveDropdownId(isOpen ? null : id);
  };

  return (
    <div className={`FdaDropdownWrapper ${isOpen ? 'active-open' : ''}`}>
      <button
        className="FdaViewBtn"
        title="View Details"
        onClick={(e) => {
          e.stopPropagation();
          onView();
        }}
      >
        <Eye size={16} />
      </button>

      <button
        ref={triggerRef}
        className="FdaDropdownTrigger"
        title="More Actions"
        onClick={handleToggle}
      >
        <MoreVertical size={16} />
      </button>

      {isOpen &&
        createPortal(
          <div
            className={`FdaDropdownMenu ${openUpward ? 'open-upward' : ''}`}
            style={{
              position: 'fixed',
              top: `${menuPos.top}px`,
              left: `${menuPos.left}px`,
              zIndex: 9999,
              width: `150px`,
            }}
          >
            {children}
          </div>,
          document.body
        )}
    </div>
  );
}

function FDAProductDB() {
  // =========================================================================
  // STATES
  // =========================================================================

  // Tab state
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(location.state?.selectedTab || 'registered');

  // Dynamic lists fetched from PostgreSQL backend
  const [registeredProducts, setRegisteredProducts] = useState([]);
  const [unregisteredAdvisories, setUnregisteredAdvisories] = useState([]);

  // Registered Products filters state
  const [searchRegistered, setSearchRegistered] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterExpiry, setFilterExpiry] = useState('');
  const [filterDateFromReg, setFilterDateFromReg] = useState('');
  const [filterDateToReg, setFilterDateToReg] = useState('');

  // Unregistered Advisories filters state
  const [searchAdvisory, setSearchAdvisory] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterSource, setFilterSource] = useState('');

  // single current page index that resets on tab change
  const [currentPage, setCurrentPage] = useState(1);

  // Row-level action dropdown state (shared between both tables)
  const [activeDropdownId, setActiveDropdownId] = useState(null);

  const fetchProducts = async () => {
    try {
      const response = await apiFetch('/registered-products/');
      if (response.ok) {
        const data = await response.json();
        const mapped = data.map(item => ({
          id: item.product_id,
          registrationNumber: item.registration_number,
          productName: item.product_name,
          manufacturer: item.brand_name,
          category: item.product_category,
          dateRegistered: item.date_registered,
          expiryDate: item.expiry_date,
          status: item.registration_status,
          addedBy: item.added_by,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
          updatedBy: item.updated_by,
          marketplaceDetectionCount: item.marketplace_detection_count,
          convertedFromAdvisoryId: item.converted_from_advisory_id,
        }));
        setRegisteredProducts(mapped);
      }
    } catch (err) {
      console.error("Error fetching registered products:", err);
    }
  };

  const fetchAdvisories = async () => {
    try {
      const response = await apiFetch('/unregistered-advisories/');
      if (response.ok) {
        const data = await response.json();
        const mapped = data.map(item => ({
          id: item.advisory_id,
          productName: item.product_name,
          advisoryDetails: item.advisory_details,
          advisoryDate: item.advisory_date,
          sourceUrl: item.source_url,
          marketplaceDetectionCount: item.marketplace_detection_count,
          addedBy: item.added_by,
          createdAt: item.created_at,
          convertedFromProductId: item.converted_from_product_id,
          source: item.converted_from_product_id ? 'Converted from Registered' : 'Manually Added',
          updatedAt: item.updated_at,
          updatedBy: item.updated_by,
        }));
        setUnregisteredAdvisories(mapped);
      }
    } catch (err) {
      console.error("Error fetching unregistered advisories:", err);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchAdvisories();

    const refreshProducts = () => {
      fetchProducts();
      fetchAdvisories();
    };
    const refreshInterval = window.setInterval(refreshProducts, 5000);
    window.addEventListener('focus', refreshProducts);

    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener('focus', refreshProducts);
    };
  }, []);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (
        !event.target.closest('.FdaDropdownWrapper') &&
        !event.target.closest('.FdaDropdownMenu')
      ) {
        setActiveDropdownId(null);
      }
    }
    document.addEventListener('click', handleOutsideClick);
    return () => {
      document.removeEventListener('click', handleOutsideClick);
    };
  }, []);

  // Modal states — registered
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [showViewProductModal, setShowViewProductModal] = useState(false);
  const [showEditProductModal, setShowEditProductModal] = useState(false);
  const [showConvertToUnregisteredModal, setShowConvertToUnregisteredModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Modal states — unregistered (advisories)
  const [showAddAdvisoryModal, setShowAddAdvisoryModal] = useState(false);
  const [showViewAdvisoryModal, setShowViewAdvisoryModal] = useState(false);
  const [showEditAdvisoryModal, setShowEditAdvisoryModal] = useState(false);
  const [showConvertToRegisteredModal, setShowConvertToRegisteredModal] = useState(false);
  const [selectedAdvisory, setSelectedAdvisory] = useState(null);

  // Form states — add/edit product
  const [productForm, setProductForm] = useState({
    productName: '',
    manufacturer: '',
    registrationNumber: '',
    category: 'Cosmetics',
    dateRegistered: '',
    expiryDate: '',
  });

  // Form states — add/edit advisory
  const [advisoryForm, setAdvisoryForm] = useState({
    productName: '',
    advisoryDetails: '',
    advisoryDate: '',
    sourceUrl: '',
  });

  // Form states — conversion fields
  const [conversionDetails, setConversionDetails] = useState({
    advisoryDetails: '',
    advisoryDate: '',
    sourceUrl: '',
    registrationNumber: '',
    manufacturer: '',
    category: 'Cosmetics',
    dateRegistered: '',
    expiryDate: '',
  });

  // Form errors state
  const [formErrors, setFormErrors] = useState({});

  // Styled notification modal state
  const [notification, setNotification] = useState({
    isOpen: false,
    type: 'confirm', // 'confirm' or 'success'
    title: '',
    message: '',
    onConfirm: null,
    onCancel: null
  });


  // UTILITIES & HELPER FUNCTIONS


  // NOTE: Formats ISO dates into user-friendly "MMM DD, YYYY" format
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${String(date.getDate()).padStart(2, '0')}, ${date.getFullYear()}`;
  };

  // NOTE: Computes expiry badge styling and text
  const getExpiryInfo = (expiryDateStr) => {
    if (!expiryDateStr) return { label: '—', className: 'badge-none' };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDateStr);
    expiry.setHours(0, 0, 0, 0);

    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { label: 'Expired', className: 'badge-expired', icon: <AlertTriangle size={12} /> };
    } else if (diffDays <= 30) {
      return { label: 'Expiring Soon', className: 'badge-expiring', icon: <Clock size={12} /> };
    } else {
      return { label: 'Valid', className: 'badge-valid', icon: <CheckCircle size={12} /> };
    }
  };


  const extractErrorMessage = (errorData, defaultMsg) => {
    if (!errorData) return defaultMsg;
    if (errorData.detail) {
      if (Array.isArray(errorData.detail)) {
        return errorData.detail.map(err => {
          const field = err.loc ? err.loc[err.loc.length - 1] : "";
          return `${field}: ${err.msg}`;
        }).join(', ');
      } else if (typeof errorData.detail === 'string') {
        return errorData.detail;
      } else if (typeof errorData.detail === 'object') {
        return JSON.stringify(errorData.detail);
      }
    }
    return defaultMsg;
  };

  // RESET FORMS

  const resetProductForm = () => {
    setProductForm({
      productName: '',
      manufacturer: '',
      registrationNumber: '',
      category: 'Cosmetics',
      dateRegistered: '',
      expiryDate: '',
    });
    setFormErrors({});
  };

  const resetAdvisoryForm = () => {
    setAdvisoryForm({
      productName: '',
      advisoryDetails: '',
      advisoryDate: '',
      sourceUrl: '',
    });
    setFormErrors({});
  };

  const resetConversionDetails = () => {
    setConversionDetails({
      advisoryDetails: '',
      advisoryDate: '',
      sourceUrl: '',
      registrationNumber: '',
      manufacturer: '',
      category: 'Cosmetics',
      dateRegistered: '',
      expiryDate: '',
    });
    setFormErrors({});
  };


  // FILTERING LOGIC


  // NOTE: Filter products list based on status, expiry, date range and search filters
  const filteredProducts = registeredProducts.filter(product => {
    const matchesSearch = product.productName.toLowerCase().includes(searchRegistered.toLowerCase()) ||
      (product.manufacturer && product.manufacturer.toLowerCase().includes(searchRegistered.toLowerCase())) ||
      product.registrationNumber.toLowerCase().includes(searchRegistered.toLowerCase());

    const matchesStatus = filterStatus === '' || product.status === filterStatus;

    let matchesExpiry = true;
    if (filterExpiry !== '') {
      const expiryInfo = getExpiryInfo(product.expiryDate);
      if (filterExpiry === 'Valid' && expiryInfo.label !== 'Valid') matchesExpiry = false;
      if (filterExpiry === 'Expiring Soon' && expiryInfo.label !== 'Expiring Soon') matchesExpiry = false;
      if (filterExpiry === 'Expired' && expiryInfo.label !== 'Expired') matchesExpiry = false;
      if (filterExpiry === 'None' && expiryInfo.label !== '—') matchesExpiry = false;
    }

    const matchesDateFrom = filterDateFromReg === '' || (product.dateRegistered && product.dateRegistered >= filterDateFromReg);
    const matchesDateTo = filterDateToReg === '' || (product.dateRegistered && product.dateRegistered <= filterDateToReg);

    return matchesSearch && matchesStatus && matchesExpiry && matchesDateFrom && matchesDateTo;
  });

  // NOTE: Filter advisories list based on date ranges, source, and search filters
  const filteredAdvisories = unregisteredAdvisories.filter(advisory => {
    const matchesSearch = advisory.productName.toLowerCase().includes(searchAdvisory.toLowerCase()) ||
      (advisory.advisoryDetails && advisory.advisoryDetails.toLowerCase().includes(searchAdvisory.toLowerCase()));

    const matchesDateFrom = filterDateFrom === '' || (advisory.advisoryDate && advisory.advisoryDate >= filterDateFrom);
    const matchesDateTo = filterDateTo === '' || (advisory.advisoryDate && advisory.advisoryDate <= filterDateTo);

    let matchesSource = true;
    if (filterSource !== '') {
      if (filterSource === 'Manually Added') {
        matchesSource = advisory.source === 'Manually Added';
      } else if (filterSource === 'Converted from Registered') {
        matchesSource = !!advisory.convertedFromProductId;
      }
    }

    return matchesSearch && matchesDateFrom && matchesDateTo && matchesSource;
  });


  // PAGINATION CALCULATIONS

  const productsCount = filteredProducts.length;
  const advisoriesCount = filteredAdvisories.length;

  const totalPagesProducts = Math.ceil(productsCount / ITEMS_PER_PAGE) || 1;
  const totalPagesAdvisories = Math.ceil(advisoriesCount / ITEMS_PER_PAGE) || 1;

  const currentTabTotalPages = activeTab === 'registered' ? totalPagesProducts : totalPagesAdvisories;
  const currentTabTotalItems = activeTab === 'registered' ? productsCount : advisoriesCount;

  // Safeguard current page range
  const activePage = Math.min(Math.max(1, currentPage), currentTabTotalPages);
  const startIndex = (activePage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, currentTabTotalItems);

  const paginatedProducts = filteredProducts.slice(startIndex, endIndex);
  const paginatedAdvisories = filteredAdvisories.slice(startIndex, endIndex);

  // =========================================================================
  // CSV EXPORT LOGIC
  // =========================================================================

  // NOTE: Exports current grid view rows as CSV format
  const handleExportCSV = () => {
    const listToExport = activeTab === 'registered' ? filteredProducts : filteredAdvisories;
    if (listToExport.length === 0) {
      alert("No product records found to export.");
      return;
    }

    let csvContent = "";
    if (activeTab === 'registered') {
      const headers = ["Registration No.", "Product Name", "Manufacturer", "Category", "Date Registered", "Expiry Date", "Status", "Added By"];
      csvContent += headers.join(",") + "\n";
      listToExport.forEach(p => {
        const row = [
          p.registrationNumber,
          `"${p.productName.replace(/"/g, '""')}"`,
          `"${(p.manufacturer || '').replace(/"/g, '""')}"`,
          p.category,
          p.dateRegistered || '',
          p.expiryDate || '',
          p.status,
          `"${p.addedBy.replace(/"/g, '""')}"`
        ];
        csvContent += row.join(",") + "\n";
      });
    } else {
      const headers = ["Product Name", "Advisory Details", "Advisory Date", "Source URL", "Marketplace Detections", "Date Added", "Added By", "Converted"];
      csvContent += headers.join(",") + "\n";
      listToExport.forEach(a => {
        const row = [
          `"${a.productName.replace(/"/g, '""')}"`,
          `"${(a.advisoryDetails || '').replace(/"/g, '""')}"`,
          a.advisoryDate || '',
          a.sourceUrl || '',
          a.marketplaceDetectionCount,
          a.createdAt || '',
          `"${a.addedBy.replace(/"/g, '""')}"`,
          a.convertedFromProductId ? "Yes" : "No"
        ];
        csvContent += row.join(",") + "\n";
      });
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `fda_${activeTab}_products_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  // CRUD SUBMIT & VALIDATION HANDLERS


  // NOTE: Handles adding a registered product. Connected to backend.
  const handleAddProduct = async (e) => {
    e.preventDefault();
    const errors = {};

    if (!productForm.productName.trim()) {
      errors.productName = "Product Name is required";
    } else if (productForm.productName.trim().length < 2) {
      errors.productName = "Product Name must be at least 2 characters";
    }
    if (!productForm.manufacturer.trim()) {
      errors.manufacturer = "Manufacturer is required";
    } else if (productForm.manufacturer.trim().length < 2) {
      errors.manufacturer = "Manufacturer must be at least 2 characters";
    }
    if (!productForm.registrationNumber.trim()) {
      errors.registrationNumber = "Registration Number is required";
    }
    if (!productForm.dateRegistered) {
      errors.dateRegistered = "Date Registered is required";
    }
    if (!productForm.expiryDate) {
      errors.expiryDate = "Expiry Date is required";
    } else if (productForm.dateRegistered) {
      if (new Date(productForm.expiryDate) <= new Date(productForm.dateRegistered)) {
        errors.expiryDate = "Expiry Date must be after Date Registered";
      }
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setNotification({
      isOpen: true,
      type: 'confirm',
      title: 'Confirm Save Product',
      message: 'Please check details before saving. Are you sure you want to save this product? Please make sure this is a cosmetics product before proceeding.',
      onConfirm: async () => {
        try {
          const response = await apiFetch('/registered-products/', {
            method: 'POST',
            body: JSON.stringify({
              product_name: productForm.productName.trim(),
              brand_name: productForm.manufacturer.trim() || null,
              registration_number: productForm.registrationNumber.trim(),
              product_category: 'Cosmetics',
              date_registered: productForm.dateRegistered || null,
              expiry_date: productForm.expiryDate || null,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            const errorMsg = extractErrorMessage(errorData, "Failed to save product.");
            if (errorMsg.includes("Duplicate product name") || errorMsg.includes("product name")) {
              setFormErrors({ productName: errorMsg });
            } else {
              setFormErrors({ registrationNumber: errorMsg });
            }
            return;
          }

          await fetchProducts();
          setShowAddProductModal(false);
          resetProductForm();
          setNotification({
            isOpen: true,
            type: 'success',
            title: 'Success',
            message: 'Product saved successfully!',
          });
        } catch (err) {
          setFormErrors({ productName: "Network error. Please try again." });
        }
      }
    });
  };

  // NOTE: Handles editing a registered product.
  // 🔌 BACKEND: PUT /api/products/:id
  const handleEditProduct = async (e) => {
    e.preventDefault();
    const errors = {};

    if (!productForm.productName.trim()) {
      errors.productName = "Product Name is required";
    } else if (productForm.productName.trim().length < 2) {
      errors.productName = "Product Name must be at least 2 characters";
    }
    if (!productForm.manufacturer.trim()) {
      errors.manufacturer = "Manufacturer is required";
    } else if (productForm.manufacturer.trim().length < 2) {
      errors.manufacturer = "Manufacturer must be at least 2 characters";
    }
    if (!productForm.registrationNumber.trim()) {
      errors.registrationNumber = "Registration Number is required";
    } else {
      // Check unique constraint excluding the current editing product
      const exists = registeredProducts.some(p =>
        p.id !== selectedProduct.id &&
        p.registrationNumber.toLowerCase() === productForm.registrationNumber.trim().toLowerCase()
      );
      if (exists) {
        errors.registrationNumber = "Registration Number must be unique. This number is used by another product.";
      }
    }
    if (!productForm.dateRegistered) {
      errors.dateRegistered = "Date Registered is required";
    }
    if (!productForm.expiryDate) {
      errors.expiryDate = "Expiry Date is required";
    } else if (productForm.dateRegistered) {
      if (new Date(productForm.expiryDate) <= new Date(productForm.dateRegistered)) {
        errors.expiryDate = "Expiry Date must be after Date Registered";
      }
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setNotification({
      isOpen: true,
      type: 'confirm',
      title: 'Confirm Edit Product',
      message: 'Are you sure you want to change this?',
      onConfirm: async () => {
        try {
          const response = await apiFetch(`/registered-products/${selectedProduct.id}`, {
            method: 'PUT',
            body: JSON.stringify({
              product_name: productForm.productName.trim(),
              brand_name: productForm.manufacturer.trim() || null,
              registration_number: productForm.registrationNumber.trim(),
              product_category: 'Cosmetics',
              date_registered: productForm.dateRegistered || null,
              expiry_date: productForm.expiryDate || null,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            const errorMsg = extractErrorMessage(errorData, "Failed to update product.");
            if (errorMsg.includes("Duplicate product name") || errorMsg.includes("product name")) {
              setFormErrors({ productName: errorMsg });
            } else {
              setFormErrors({ registrationNumber: errorMsg });
            }
            return;
          }

          await fetchProducts();
          setShowEditProductModal(false);
          setSelectedProduct(null);
          resetProductForm();
          setNotification({
            isOpen: true,
            type: 'success',
            title: 'Success',
            message: 'Product updated successfully!',
          });
        } catch (err) {
          setFormErrors({ productName: "Network error. Please try again." });
        }
      }
    });
  };

  // NOTE: Handles converting a registered product into an unregistered product advisory.
  // 🔌 BACKEND: POST /api/advisories/convert-from-product/:product_id
  const handleConvertToUnregistered = async (e) => {
    e.preventDefault();
    const errors = {};

    if (!conversionDetails.advisoryDetails.trim()) {
      errors.advisoryDetails = "Advisory details are required";
    } else if (conversionDetails.advisoryDetails.trim().length < 10) {
      errors.advisoryDetails = "Advisory details must be at least 10 characters";
    }

    if (!conversionDetails.advisoryDate) {
      errors.advisoryDate = "Advisory date is required";
    } else {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const todayStr = `${yyyy}-${mm}-${dd}`;
      if (conversionDetails.advisoryDate > todayStr) {
        errors.advisoryDate = "Advisory Date cannot be in the future";
      }
    }

    if (!conversionDetails.sourceUrl || !conversionDetails.sourceUrl.trim()) {
      errors.sourceUrl = "Source URL is required";
    } else if (!conversionDetails.sourceUrl.startsWith('http://') && !conversionDetails.sourceUrl.startsWith('https://')) {
      errors.sourceUrl = "Source URL must start with http:// or https://";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setNotification({
      isOpen: true,
      type: 'confirm',
      title: 'Confirm Conversion',
      message: 'Are you sure you want to convert this to unregistered product?',
      onConfirm: async () => {
        try {
          const response = await apiFetch(`/unregistered-advisories/convert-from-product/${selectedProduct.id}`, {
            method: 'POST',
            body: JSON.stringify({
              product_name: selectedProduct.productName,
              advisory_details: (conversionDetails.advisoryDetails && conversionDetails.advisoryDetails.trim()) || `Advisory generated from converted product record (Registration No: ${selectedProduct.registrationNumber})`,
              advisory_date: conversionDetails.advisoryDate ? conversionDetails.advisoryDate : null,
              source_url: (conversionDetails.sourceUrl && conversionDetails.sourceUrl.trim()) || null,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMsg = extractErrorMessage(errorData, "Failed to convert product.");
            setFormErrors({ advisoryDate: errorMsg, advisoryDetails: errorMsg });
            return;
          }

          await fetchProducts();
          await fetchAdvisories();
          setShowConvertToUnregisteredModal(false);
          setSelectedProduct(null);
          resetConversionDetails();
          setNotification({
            isOpen: true,
            type: 'success',
            title: 'Success',
            message: 'Converted to unregistered product successfully!',
          });
        } catch (err) {
          console.error("Conversion error:", err);
          setFormErrors({ advisoryDetails: err.message || "Network error. Please try again." });
        }
      }
    });
  };


  // ADVISORY SUBMIT & VALIDATION HANDLERS


  // NOTE: Handles adding an unregistered product (advisory). Connected to backend.
  const handleAddAdvisory = async (e) => {
    e.preventDefault();
    const errors = {};

    if (!advisoryForm.productName.trim()) {
      errors.productName = "Product Name is required";
    } else if (advisoryForm.productName.trim().length < 2) {
      errors.productName = "Product Name must be at least 2 characters";
    }

    if (!advisoryForm.advisoryDate) {
      errors.advisoryDate = "Advisory Date is required";
    } else {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const todayStr = `${yyyy}-${mm}-${dd}`;
      if (advisoryForm.advisoryDate > todayStr) {
        errors.advisoryDate = "Advisory Date cannot be in the future";
      }
    }

    if (!advisoryForm.sourceUrl || !advisoryForm.sourceUrl.trim()) {
      errors.sourceUrl = "Source URL is required";
    } else if (!advisoryForm.sourceUrl.startsWith('http://') && !advisoryForm.sourceUrl.startsWith('https://')) {
      errors.sourceUrl = "Source URL must start with http:// or https://";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setNotification({
      isOpen: true,
      type: 'confirm',
      title: 'Confirm Save Advisory',
      message: 'Please check details before saving. Are you sure you want to save this advisory? Please make sure this is a cosmetics product before proceeding.',
      onConfirm: async () => {
        try {
          const response = await apiFetch('/unregistered-advisories/', {
            method: 'POST',
            body: JSON.stringify({
              product_name: advisoryForm.productName.trim(),
              advisory_details: advisoryForm.advisoryDetails.trim() || null,
              advisory_date: (advisoryForm.advisoryDate && advisoryForm.advisoryDate.trim()) || null,
              source_url: advisoryForm.sourceUrl.trim() || null,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            const errorMsg = extractErrorMessage(errorData, "Failed to save advisory.");
            setFormErrors({ productName: errorMsg });
            return;
          }

          await fetchAdvisories();
          setShowAddAdvisoryModal(false);
          resetAdvisoryForm();
          setNotification({
            isOpen: true,
            type: 'success',
            title: 'Success',
            message: 'Advisory saved successfully!',
          });
        } catch (err) {
          setFormErrors({ productName: "Network error. Please try again." });
        }
      }
    });
  };

  // NOTE: Handles editing an unregistered product (advisory).
  // 🔌 BACKEND: PUT /api/advisories/:id
  const handleEditAdvisory = async (e) => {
    e.preventDefault();
    const errors = {};

    if (!advisoryForm.productName.trim()) {
      errors.productName = "Product Name is required";
    } else if (advisoryForm.productName.trim().length < 2) {
      errors.productName = "Product Name must be at least 2 characters";
    }

    if (!advisoryForm.advisoryDate) {
      errors.advisoryDate = "Advisory Date is required";
    } else {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const todayStr = `${yyyy}-${mm}-${dd}`;
      if (advisoryForm.advisoryDate > todayStr) {
        errors.advisoryDate = "Advisory Date cannot be in the future";
      }
    }

    if (!advisoryForm.sourceUrl || !advisoryForm.sourceUrl.trim()) {
      errors.sourceUrl = "Source URL is required";
    } else if (!advisoryForm.sourceUrl.startsWith('http://') && !advisoryForm.sourceUrl.startsWith('https://')) {
      errors.sourceUrl = "Source URL must start with http:// or https://";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setNotification({
      isOpen: true,
      type: 'confirm',
      title: 'Confirm Edit Advisory',
      message: 'Are you sure you want to change this?',
      onConfirm: async () => {
        try {
          const response = await apiFetch(`/unregistered-advisories/${selectedAdvisory.id}`, {
            method: 'PUT',
            body: JSON.stringify({
              product_name: advisoryForm.productName.trim(),
              advisory_details: advisoryForm.advisoryDetails.trim() || null,
              advisory_date: advisoryForm.advisoryDate || null,
              source_url: advisoryForm.sourceUrl.trim() || null,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            const errorMsg = extractErrorMessage(errorData, "Failed to update advisory.");
            setFormErrors({ productName: errorMsg });
            return;
          }

          await fetchAdvisories();
          setShowEditAdvisoryModal(false);
          setSelectedAdvisory(null);
          resetAdvisoryForm();
          setNotification({
            isOpen: true,
            type: 'success',
            title: 'Success',
            message: 'Advisory updated successfully!',
          });
        } catch (err) {
          setFormErrors({ productName: "Network error. Please try again." });
        }
      }
    });
  };

  // NOTE: Handles converting an unregistered product advisory to a registered product record.
  // 🔌 BACKEND: POST /api/products/convert-from-advisory/:advisory_id
  const handleConvertToRegistered = async (e) => {
    e.preventDefault();
    const errors = {};

    if (!conversionDetails.registrationNumber.trim()) {
      errors.registrationNumber = "Registration Number is required for conversion";
    } else {
      const exists = registeredProducts.some(p => p.registrationNumber.toLowerCase() === conversionDetails.registrationNumber.trim().toLowerCase());
      if (exists) {
        errors.registrationNumber = "Registration Number must be unique.";
      }
    }

    if (!conversionDetails.manufacturer.trim()) {
      errors.manufacturer = "Manufacturer is required";
    } else if (conversionDetails.manufacturer.trim().length < 2) {
      errors.manufacturer = "Manufacturer must be at least 2 characters";
    }

    if (!conversionDetails.dateRegistered) {
      errors.dateRegistered = "Date Registered is required";
    }

    if (!conversionDetails.expiryDate) {
      errors.expiryDate = "Expiry Date is required";
    } else if (conversionDetails.dateRegistered) {
      if (new Date(conversionDetails.expiryDate) <= new Date(conversionDetails.dateRegistered)) {
        errors.expiryDate = "Expiry Date must be after Date Registered";
      }
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setNotification({
      isOpen: true,
      type: 'confirm',
      title: 'Confirm Conversion',
      message: 'Are you sure you want to convert this to registered product?',
      onConfirm: async () => {
        try {
          const response = await apiFetch(`/registered-products/convert-from-advisory/${selectedAdvisory.id}`, {
            method: 'POST',
            body: JSON.stringify({
              product_name: selectedAdvisory.productName,
              brand_name: (conversionDetails.manufacturer && conversionDetails.manufacturer.trim()) || null,
              registration_number: conversionDetails.registrationNumber.trim(),
              product_category: 'Cosmetics',
              date_registered: conversionDetails.dateRegistered ? conversionDetails.dateRegistered : null,
              expiry_date: conversionDetails.expiryDate ? conversionDetails.expiryDate : null,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMsg = extractErrorMessage(errorData, "Failed to convert advisory.");
            setFormErrors({ registrationNumber: errorMsg });
            return;
          }

          await fetchProducts();
          await fetchAdvisories();
          setShowConvertToRegisteredModal(false);
          setSelectedAdvisory(null);
          resetConversionDetails();
          setNotification({
            isOpen: true,
            type: 'success',
            title: 'Success',
            message: 'Converted to registered product successfully!',
          });
        } catch (err) {
          console.error("Conversion error:", err);
          setFormErrors({ registrationNumber: err.message || "Network error. Please try again." });
        }
      }
    });
  };

  const handleDeleteProduct = (product) => {
    setNotification({
      isOpen: true,
      type: 'confirm',
      title: 'Confirm Delete Product',
      message: `Are you sure you want to delete "${product.productName}"? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          const response = await apiFetch(`/registered-products/${product.id}`, {
            method: 'DELETE',
          });
          if (response.ok) {
            await fetchProducts();
            setNotification({
              isOpen: true,
              type: 'success',
              title: 'Success',
              message: 'Product deleted successfully!',
            });
          } else {
            const errorData = await response.json();
            const errorMsg = extractErrorMessage(errorData, "Failed to delete product.");
            setNotification({
              isOpen: true,
              type: 'success',
              title: 'Error',
              message: errorMsg,
            });
          }
        } catch (err) {
          console.error("Error deleting product:", err);
          setNotification({
            isOpen: true,
            type: 'success',
            title: 'Error',
            message: 'Network error. Failed to delete product.',
          });
        }
      }
    });
  };

  const handleDeleteAdvisory = (advisory) => {
    setNotification({
      isOpen: true,
      type: 'confirm',
      title: 'Confirm Delete Advisory',
      message: `Are you sure you want to delete advisory for "${advisory.productName}"? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          const response = await apiFetch(`/unregistered-advisories/${advisory.id}`, {
            method: 'DELETE',
          });
          if (response.ok) {
            await fetchAdvisories();
            setNotification({
              isOpen: true,
              type: 'success',
              title: 'Success',
              message: 'Advisory deleted successfully!',
            });
          } else {
            const errorData = await response.json();
            const errorMsg = extractErrorMessage(errorData, "Failed to delete advisory.");
            setNotification({
              isOpen: true,
              type: 'success',
              title: 'Error',
              message: errorMsg,
            });
          }
        } catch (err) {
          console.error("Error deleting advisory:", err);
          setNotification({
            isOpen: true,
            type: 'success',
            title: 'Error',
            message: 'Network error. Failed to delete advisory.',
          });
        }
      }
    });
  };

  // =========================================================================
  // VIEW TRIGGERS
  // =========================================================================
  const openViewProduct = (p) => {
    setSelectedProduct(p);
    setShowViewProductModal(true);
  };

  const openEditProduct = (p) => {
    setSelectedProduct(p);
    setProductForm({
      productName: p.productName,
      manufacturer: p.manufacturer || '',
      registrationNumber: p.registrationNumber,
      category: 'Cosmetics',
      dateRegistered: p.dateRegistered || '',
      expiryDate: p.expiryDate || '',
    });
    setShowEditProductModal(true);
  };

  const openConvertProduct = (p) => {
    setSelectedProduct(p);
    resetConversionDetails();
    setShowConvertToUnregisteredModal(true);
  };

  const openViewAdvisory = (a) => {
    setSelectedAdvisory(a);
    setShowViewAdvisoryModal(true);
  };

  const openEditAdvisory = (a) => {
    setSelectedAdvisory(a);
    setAdvisoryForm({
      productName: a.productName,
      advisoryDetails: a.advisoryDetails || '',
      advisoryDate: a.advisoryDate || '',
      sourceUrl: a.sourceUrl || '',
    });
    setShowEditAdvisoryModal(true);
  };

  const openConvertAdvisory = (a) => {
    setSelectedAdvisory(a);
    resetConversionDetails();
    setShowConvertToRegisteredModal(true);
  };



  return (
    <div className="FdaDashboardMain">
      <style>{`
        /* Wide & Responsive Layout Overrides */
        .FdaStatsRow,
        .FdaTableCard,
        .FdaProductFilterPanel,
        .FdaTabActionRow {
          max-width: 100% !important;
          width: 100% !important;
        }

        @media (max-width: 768px) {
          .FdaHeader {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 16px !important;
          }
          .FdaHeaderLeft {
            max-width: 100% !important;
          }
          .BtnExportCSV {
            align-self: flex-start !important;
          }
          .FdaFilterRow {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 14px !important;
          }
          .FdaPillContainer {
            width: 100% !important;
            display: flex !important;
            overflow-x: auto !important;
          }
          .FdaPill {
            flex: 1 !important;
            justify-content: center !important;
            white-space: nowrap !important;
          }
          .FdaControlsRight {
            width: 100% !important;
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .BtnAddProduct,
          .BtnAddAdvisory {
            width: 100% !important;
            justify-content: center !important;
          }
          .FdaStatsRow {
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 12px !important;
          }
          .FdaStatCard {
            flex: 1 1 150px !important;
          }
        }
        @media (max-width: 576px) {
          .FdaModalContent {
            padding: 20px !important;
            width: 95% !important;
            max-height: 90vh !important;
            overflow-y: auto !important;
          }
          .FdaModalForm,
          .FdaFormGrid,
          .FdaDetailGrid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
          .FdaModalFooter {
            flex-direction: column-reverse !important;
            gap: 8px !important;
            margin-top: 16px !important;
          }
          .FdaModalFooter button,
          .BtnModalCancel,
          .BtnModalSave {
            width: 100% !important;
            margin: 0 !important;
          }
        }
      `}</style>
      {/* FDA Sidebar */}
      <Sidebar sidebarType="FDA" />

      <div className="FdaContentContainer">
        {/* Top Header Navigation */}
        <TopBar topbarType="FDA" />

        <div className="FdaMainFeed">

          {/* PAGE HEADER BLOCK */}
          <div className="FdaHeader">
            <div className="FdaHeaderLeft">
              <p className="FdaEyebrow">FDA · PRODUCT DATABASE</p>
              <h1 className="FdaHeaderTitle">
                {activeTab === 'registered' ? 'Registered Products' : 'Unregistered Products'}
              </h1>
              <p className="FdaSubtitle">
                {activeTab === 'registered'
                  ? 'Manage FDA-registered cosmetic products. Add, update, or convert product records.'
                  : 'Manage FDA flagged unregistered products.'}
              </p>
            </div>
          </div>

          {/* STATISTICS CARDS ROW */}
          <div className="FdaStatsRow">

            {/* Card 1 — Total Products */}
            <div className="FdaStatCard">
              <div className="FdaStatCardTop">
                <span className="FdaStatBadge FdaStatBadgeBlue">
                  <Package size={16} />
                </span>
              </div>
              <p className="FdaStatValue">{registeredProducts.length + unregisteredAdvisories.length}</p>
              <p className="FdaStatLabel">Total Products</p>
            </div>

            {/* Card 2 — Registered */}
            <div className="FdaStatCard">
              <div className="FdaStatCardTop">
                <span className="FdaStatBadge FdaStatBadgeGreen">
                  <CheckCircle size={16} />
                </span>
              </div>
              <p className="FdaStatValue">{registeredProducts.length}</p>
              <p className="FdaStatLabel">Registered</p>
            </div>

            {/* Card 3 — Unregistered */}
            <div className="FdaStatCard">
              <div className="FdaStatCardTop">
                <span className="FdaStatBadge FdaStatBadgeRed">
                  <AlertTriangle size={16} />
                </span>
              </div>
              <p className="FdaStatValue">{unregisteredAdvisories.length}</p>
              <p className="FdaStatLabel">Unregistered</p>
            </div>

          </div>

          {/* TAB NAVIGATION + ACTION BUTTONS ROW */}
          <div className="FdaTabActionRow">
            {/* Left: Segmented Tab Control */}
            <div className="FdaTabContainer">
              <button
                className={`FDAButtonTab ${activeTab === 'registered' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('registered');
                  setCurrentPage(1);
                }}
              >
                Registered Products
              </button>
              <button
                className={`FDAButtonTab ${activeTab === 'advisories' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('advisories');
                  setCurrentPage(1);
                }}
              >
                Unregistered Products
              </button>
            </div>

            {/* Right: Action Buttons */}
            <div className="FdaTabActions">
              <button className="BtnExportCSV" onClick={handleExportCSV}>
                <FileText size={16} />
                Export CSV
              </button>
              {activeTab === 'registered' ? (
                <button className="BtnAddProduct" onClick={() => { resetProductForm(); setShowAddProductModal(true); }}>
                  <Plus size={16} />
                  <span>Add Product</span>
                </button>
              ) : (
                <button className="BtnAddAdvisory" onClick={() => { resetAdvisoryForm(); setShowAddAdvisoryModal(true); }}>
                  <Plus size={16} />
                  <span>Add Advisory</span>
                </button>
              )}
            </div>
          </div>

          {/* SEARCH & FILTERS ROW */}
          {activeTab === 'registered' ? (
            /* TAB 1: Registered Products Filter Row */
            <div className="FdaProductFilterPanel">
              <div className="FdaSearchWrapper FdaSearchFixed">
                <Search size={16} className="FdaSearchIcon" />
                <input
                  type="text"
                  placeholder="Search product name, manufacturer, or registration number..."
                  className="FdaSearchInput"
                  maxLength={150}
                  value={searchRegistered}
                  onChange={(e) => {
                    setSearchRegistered(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>

              <div className="FdaFilterGroupsRight">
                <div className="FdaFilterGroup">
                  <label>Expiry</label>
                  <select
                    value={filterExpiry}
                    onChange={(e) => {
                      setFilterExpiry(e.target.value);
                      setCurrentPage(1);
                    }}
                  >
                    <option value="">All</option>
                    <option value="Valid">Valid</option>
                    <option value="Expiring Soon">Expiring Soon (within 30 days)</option>
                    <option value="Expired">Expired</option>
                  </select>
                </div>

                <div className="FdaFilterGroup">
                  <label>From</label>
                  <input
                    type="date"
                    value={filterDateFromReg}
                    onChange={(e) => {
                      setFilterDateFromReg(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                </div>

                <div className="FdaFilterGroup">
                  <label>To</label>
                  <input
                    type="date"
                    value={filterDateToReg}
                    onChange={(e) => {
                      setFilterDateToReg(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                </div>

                {/* Clear Filters button */}
                {(searchRegistered !== '' || filterStatus !== '' || filterExpiry !== '' || filterDateFromReg !== '' || filterDateToReg !== '') && (
                  <button
                    className="BtnClearFiltersIcon"
                    aria-label="Clear Filters"
                    title="Clear Filters"
                    onClick={() => {
                      setSearchRegistered('');
                      setFilterStatus('');
                      setFilterExpiry('');
                      setFilterDateFromReg('');
                      setFilterDateToReg('');
                      setCurrentPage(1);
                    }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* TAB 2: Unregistered Products Filter Row */
            <div className="FdaProductFilterPanel">
              <div className="FdaSearchWrapper FdaSearchFixed">
                <Search size={16} className="FdaSearchIcon" />
                <input
                  type="text"
                  placeholder="Search product name or advisory details..."
                  className="FdaSearchInput"
                  maxLength={150}
                  value={searchAdvisory}
                  onChange={(e) => {
                    setSearchAdvisory(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>

              <div className="FdaFilterGroupsRight">


                <div className="FdaFilterGroup">
                  <label>Source</label>
                  <select
                    value={filterSource}
                    onChange={(e) => {
                      setFilterSource(e.target.value);
                      setCurrentPage(1);
                    }}
                  >
                    <option value="">All Sources</option>
                    <option value="Manually Added">Manually Added</option>
                    <option value="Converted from Registered">Converted from Registered</option>
                  </select>
                </div>
                <div className="FdaFilterGroup">
                  <label>From</label>
                  <input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => {
                      setFilterDateFrom(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                </div>

                <div className="FdaFilterGroup">
                  <label>To</label>
                  <input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => {
                      setFilterDateTo(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                </div>

                {/* Change 1 — icon-only Clear Filters button (X icon, no text label) */}
                {(searchAdvisory !== '' || filterDateFrom !== '' || filterDateTo !== '' || filterSource !== '') && (
                  <button
                    className="BtnClearFiltersIcon"
                    aria-label="Clear Filters"
                    title="Clear Filters"
                    onClick={() => {
                      setSearchAdvisory('');
                      setFilterDateFrom('');
                      setFilterDateTo('');
                      setFilterSource('');
                      setCurrentPage(1);
                    }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TABLE CONTAINER CARD */}
          <div className="FdaLayoutGrid">
            <div className="FdaTableCard FdaProductTableCard">
              <div className="FdaTableWrapper FdaProductTableWrapper">
                <table className="FdaTable">
                  {activeTab === 'registered' ? (
                    /* TAB 1: Registered Products Data Table */
                    <>
                      <thead>
                        <tr>
                          <th style={{ width: '40px' }}>#</th>
                          <th>REGISTRATION NO.</th>
                          <th>PRODUCT NAME</th>
                          <th>MANUFACTURER</th>
                          <th>CATEGORY</th>
                          <th>DATE REGISTERED</th>
                          <th>EXPIRY DATE</th>
                          <th>STATUS</th>
                          <th>ADDED BY</th>
                          <th style={{ width: '100px', textAlign: 'center' }}>ACTION</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedProducts.length === 0 ? (
                          <tr>
                            <td colSpan="10" className="FdaEmptyState">
                              <Search size={32} />
                              <p>No registered products match your filters.</p>
                            </td>
                          </tr>
                        ) : (
                          paginatedProducts.map((product, index) => {
                            const expiryInfo = getExpiryInfo(product.expiryDate);
                            return (
                              <tr key={product.id}>
                                <td>{startIndex + index + 1}</td>
                                <td className="CaseIdCell">{product.registrationNumber}</td>
                                <td style={{ fontWeight: '600' }}>{product.productName}</td>
                                <td>{product.manufacturer || '—'}</td>
                                <td>{product.category}</td>
                                <td>{formatDate(product.dateRegistered)}</td>
                                <td>
                                  {product.expiryDate ? (
                                    <span className={`FdaBadge ${expiryInfo.className}`}>
                                      {expiryInfo.icon}
                                      <span style={{ marginLeft: '4px' }}>
                                        {formatDate(product.expiryDate)} ({expiryInfo.label})
                                      </span>
                                    </span>
                                  ) : (
                                    <span className="FdaBadge badge-none">—</span>
                                  )}
                                </td>
                                <td>
                                  <span className={`FdaBadge ${product.status === 'registered' ? 'badge-registered' : 'badge-unregistered'}`}>
                                    {product.status === 'registered' ? 'Registered' : 'Unregistered'}
                                  </span>
                                </td>
                                <td>{product.addedBy}</td>
                                <td>
                                  <div className="FdaActionCell">
                                    <FdaActionDropdown
                                      id={`reg-${product.id}`}
                                      activeDropdownId={activeDropdownId}
                                      setActiveDropdownId={setActiveDropdownId}
                                      onView={() => openViewProduct(product)}
                                    >
                                      <button
                                        className="FdaDropdownItem"
                                        onClick={() => {
                                          openEditProduct(product);
                                          setActiveDropdownId(null);
                                        }}
                                      >
                                        <Pencil size={14} /> Edit Product
                                      </button>
                                      {product.status === 'registered' && (
                                        <button
                                          className="FdaDropdownItem"
                                          onClick={() => {
                                            openConvertProduct(product);
                                            setActiveDropdownId(null);
                                          }}
                                        >
                                          <ArrowRightLeft size={14} /> Convert to Unregistered
                                        </button>
                                      )}
                                      <button
                                        className="FdaDropdownItem delete-action"
                                        style={{ color: '#DC2626' }}
                                        onClick={() => {
                                          handleDeleteProduct(product);
                                          setActiveDropdownId(null);
                                        }}
                                      >
                                        <Trash2 size={14} /> Delete Product
                                      </button>
                                    </FdaActionDropdown>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </>
                  ) : (
                    /* TAB 2: Unregistered Products Data Table */
                    <>
                      <thead>
                        <tr>
                          <th style={{ width: '40px' }}>#</th>
                          <th>Product Name</th>
                          <th>Advisory Details</th>
                          <th>Advisory Date</th>
                          <th>Source URL</th>
                          <th>Marketplace Detections</th>
                          <th>Date Added</th>
                          <th>Added By</th>
                          <th>Converted</th>
                          <th style={{ width: '100px', textAlign: 'center' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedAdvisories.length === 0 ? (
                          <tr>
                            <td colSpan="10" className="FdaEmptyState">
                              <Search size={32} />
                              <p>No unregistered products match your filters.</p>
                            </td>
                          </tr>
                        ) : (
                          paginatedAdvisories.map((advisory, index) => (
                            <tr key={advisory.id}>
                              <td>{startIndex + index + 1}</td>
                              <td style={{ fontWeight: '600' }}>{advisory.productName}</td>
                              <td>
                                {advisory.advisoryDetails && advisory.advisoryDetails.length > 60
                                  ? `${advisory.advisoryDetails.slice(0, 60)}...`
                                  : advisory.advisoryDetails || '—'}
                              </td>
                              <td>{formatDate(advisory.advisoryDate)}</td>
                              <td>
                                {advisory.sourceUrl ? (
                                  <a href={advisory.sourceUrl} target="_blank" rel="noopener noreferrer" className="FdaSourceLink">
                                    View Source
                                    <ExternalLink size={12} />
                                  </a>
                                ) : '—'}
                              </td>
                              <td>
                                <span className="FdaBadge badge-marketplace">
                                  {advisory.marketplaceDetectionCount} Detections
                                </span>
                              </td>
                              <td>{formatDate(advisory.createdAt)}</td>
                              <td>{advisory.addedBy}</td>
                              <td>
                                {advisory.convertedFromProductId ? (
                                  <span className="FdaBadge badge-converted">Converted</span>
                                ) : '—'}
                              </td>
                              <td>
                                <div className="FdaActionCell">
                                  <FdaActionDropdown
                                    id={`adv-${advisory.id}`}
                                    activeDropdownId={activeDropdownId}
                                    setActiveDropdownId={setActiveDropdownId}
                                    onView={() => openViewAdvisory(advisory)}
                                  >
                                    <button
                                      className="FdaDropdownItem"
                                      onClick={() => {
                                        openEditAdvisory(advisory);
                                        setActiveDropdownId(null);
                                      }}
                                    >
                                      <Pencil size={14} /> Edit Advisory
                                    </button>
                                    <button
                                      className="FdaDropdownItem"
                                      onClick={() => {
                                        openConvertAdvisory(advisory);
                                        setActiveDropdownId(null);
                                      }}
                                    >
                                      <ArrowRightLeft size={14} /> Convert to Registered
                                    </button>
                                    <button
                                      className="FdaDropdownItem delete-action"
                                      style={{ color: '#DC2626' }}
                                      onClick={() => {
                                        handleDeleteAdvisory(advisory);
                                        setActiveDropdownId(null);
                                      }}
                                    >
                                      <Trash2 size={14} /> Delete Advisory
                                    </button>
                                  </FdaActionDropdown>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </>
                  )}
                </table>
              </div>

              {/* TABLE PAGINATION FOOTER */}
              <div className="FdaTableFooter">
                <span className="FdaFooterInfo">
                  Showing {currentTabTotalItems === 0 ? 0 : startIndex + 1}-{endIndex} of {currentTabTotalItems} {activeTab === 'registered' ? 'products' : 'advisories'}
                </span>

                <div className="FdaPagination">
                  <button
                    className="BtnPageNav"
                    disabled={activePage === 1}
                    onClick={() => setCurrentPage(activePage - 1)}
                  >
                    <ChevronLeft size={14} />
                    Prev
                  </button>

                  {Array.from({ length: currentTabTotalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      className={`FdaPageNumber ${activePage === page ? 'active' : ''}`}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </button>
                  ))}

                  <button
                    className="BtnPageNav"
                    disabled={activePage === currentTabTotalPages}
                    onClick={() => setCurrentPage(activePage + 1)}
                  >
                    Next
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* MODALS — TAB 1: REGISTERED PRODUCTS*/}

          {/* Modal 1: Add Registered Product */}
          {showAddProductModal && (
            <div className="FdaModalOverlay">
              <div className="FdaModalContent" onClick={(e) => e.stopPropagation()}>
                <button className="FdaDetailClose" onClick={() => setShowAddProductModal(false)}>
                  <X size={16} />
                </button>
                <div className="FdaDetailHeader">
                  <h2>Add Registered Product</h2>
                  <p>Register a new certified cosmetic product record</p>
                </div>
                <form noValidate onSubmit={handleAddProduct} className="FdaFormGrid">
                  <div className={`FdaFormGroup span-two ${formErrors.productName ? 'has-error' : ''}`}>
                    <label>Product Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Skin Whitening Soap"
                      maxLength={150}
                      minLength={2}
                      value={productForm.productName}
                      onChange={(e) => setProductForm({ ...productForm, productName: e.target.value })}
                    />
                    {formErrors.productName && <span className="form-error-msg">{formErrors.productName}</span>}
                  </div>

                  <div className={`FdaFormGroup span-two ${formErrors.manufacturer ? 'has-error' : ''}`}>
                    <label>Manufacturer *</label>
                    <input
                      type="text"
                      placeholder="e.g. SkinCare Corp PH"
                      maxLength={150}
                      minLength={2}
                      value={productForm.manufacturer}
                      onChange={(e) => setProductForm({ ...productForm, manufacturer: e.target.value })}
                    />
                    {formErrors.manufacturer && <span className="form-error-msg">{formErrors.manufacturer}</span>}
                  </div>

                  <div className={`FdaFormGroup span-two ${formErrors.registrationNumber ? 'has-error' : ''}`}>
                    <label>Registration Number *</label>
                    <input
                      type="text"
                      placeholder="FDA-COS-YYYY-XXXXX"
                      maxLength={100}
                      value={productForm.registrationNumber}
                      onChange={(e) => setProductForm({ ...productForm, registrationNumber: e.target.value })}
                    />
                    {formErrors.registrationNumber && <span className="form-error-msg">{formErrors.registrationNumber}</span>}
                  </div>

                  <div className={`FdaFormGroup ${formErrors.dateRegistered ? 'has-error' : ''}`}>
                    <label>Date Registered *</label>
                    <input
                      type="date"
                      value={productForm.dateRegistered}
                      onChange={(e) => setProductForm({ ...productForm, dateRegistered: e.target.value })}
                    />
                    {formErrors.dateRegistered && <span className="form-error-msg">{formErrors.dateRegistered}</span>}
                  </div>

                  <div className={`FdaFormGroup ${formErrors.expiryDate ? 'has-error' : ''}`}>
                    <label>Expiry Date *</label>
                    <input
                      type="date"
                      value={productForm.expiryDate}
                      onChange={(e) => setProductForm({ ...productForm, expiryDate: e.target.value })}
                    />
                    {formErrors.expiryDate && <span className="form-error-msg">{formErrors.expiryDate}</span>}
                  </div>

                  <div className="FdaModalFooter FdaAddModalFooter span-two">
                    <button type="button" className="BtnModalCancel" onClick={() => setShowAddProductModal(false)}>Cancel</button>
                    <button type="submit" className="BtnModalSave">Save Product</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal 2: View Registered Product Detail */}
          {showViewProductModal && selectedProduct && (
            <div className="FdaModalOverlay">
              <div className="FdaModalContent FdaProductViewModal" onClick={(e) => e.stopPropagation()}>
                <button className="FdaDetailClose" onClick={() => setShowViewProductModal(false)}>
                  <X size={16} />
                </button>
                <div className="FdaDetailHeader">
                  <small>Registration Details · {selectedProduct.registrationNumber}</small>
                  <h2>{selectedProduct.productName}</h2>
                  <p>{selectedProduct.manufacturer || 'Unknown Manufacturer'}</p>
                  <div className="FdaViewBadgeRow">
                    <span className="FdaBadge badge-marketplace">
                      Detected {selectedProduct.marketplaceDetectionCount} times across e-marketplaces
                    </span>
                    {selectedProduct.convertedFromAdvisoryId && (
                      <span className="FdaBadge badge-converted">Converted from Advisory</span>
                    )}
                  </div>
                </div>

                <div className="FdaProductViewBody">
                  <div className="FdaDetailGrid">
                    <div className="FdaDetailItem">
                      <label>Category</label>
                      <span>{selectedProduct.category}</span>
                    </div>
                    <div className="FdaDetailItem">
                      <label>Current Status</label>
                      <span className="FdaBadge badge-registered" style={{ width: 'fit-content' }}>Registered</span>
                    </div>
                    <div className="FdaDetailItem">
                      <label>Date Registered</label>
                      <span>{formatDate(selectedProduct.dateRegistered)}</span>
                    </div>
                    <div className="FdaDetailItem">
                      <label>Expiry Date</label>
                      <span className={`FdaBadge ${getExpiryInfo(selectedProduct.expiryDate).className}`} style={{ width: 'fit-content' }}>
                        {formatDate(selectedProduct.expiryDate)}
                      </span>
                    </div>
                    <div className="FdaDetailItem">
                      <label>Added By</label>
                      <span>{selectedProduct.addedBy}</span>
                    </div>
                    <div className="FdaDetailItem">
                      <label>Created On</label>
                      <span>{formatDate(selectedProduct.createdAt)}</span>
                    </div>
                    <div className="FdaDetailItem">
                      <label>Last Updated</label>
                      <span>{formatDate(selectedProduct.updatedAt)}</span>
                    </div>
                    <div className="FdaDetailItem">
                      <label>Last Updated By</label>
                      <span>{selectedProduct.updatedBy}</span>
                    </div>
                  </div>
                </div>

                <div className="FdaModalFooter">
                  <button className="BtnModalCancel" onClick={() => setShowViewProductModal(false)}>Close</button>
                </div>
              </div>
            </div>
          )}

          {/* Modal 3: Edit Registered Product */}
          {showEditProductModal && selectedProduct && (
            <div className="FdaModalOverlay">
              <div className="FdaModalContent" onClick={(e) => e.stopPropagation()}>
                <button className="FdaDetailClose" onClick={() => setShowEditProductModal(false)}>
                  <X size={16} />
                </button>
                <div className="FdaDetailHeader">
                  <h2>Edit Registered Product</h2>
                  <p>Update product registration record data</p>
                </div>
                <form noValidate onSubmit={handleEditProduct} className="FdaFormGrid">
                  <div className={`FdaFormGroup span-two ${formErrors.productName ? 'has-error' : ''}`}>
                    <label>Product Name *</label>
                    <input
                      type="text"
                      maxLength={150}
                      minLength={2}
                      value={productForm.productName}
                      onChange={(e) => setProductForm({ ...productForm, productName: e.target.value })}
                    />
                    {formErrors.productName && <span className="form-error-msg">{formErrors.productName}</span>}
                  </div>

                  <div className={`FdaFormGroup span-two ${formErrors.manufacturer ? 'has-error' : ''}`}>
                    <label>Manufacturer *</label>
                    <input
                      type="text"
                      maxLength={150}
                      minLength={2}
                      value={productForm.manufacturer}
                      onChange={(e) => setProductForm({ ...productForm, manufacturer: e.target.value })}
                    />
                    {formErrors.manufacturer && <span className="form-error-msg">{formErrors.manufacturer}</span>}
                  </div>

                  <div className={`FdaFormGroup span-two ${formErrors.registrationNumber ? 'has-error' : ''}`}>
                    <label>Registration Number *</label>
                    <input
                      type="text"
                      maxLength={100}
                      value={productForm.registrationNumber}
                      onChange={(e) => setProductForm({ ...productForm, registrationNumber: e.target.value })}
                    />
                    {formErrors.registrationNumber && <span className="form-error-msg">{formErrors.registrationNumber}</span>}
                  </div>

                  <div className={`FdaFormGroup ${formErrors.dateRegistered ? 'has-error' : ''}`}>
                    <label>Date Registered *</label>
                    <input
                      type="date"
                      value={productForm.dateRegistered}
                      onChange={(e) => setProductForm({ ...productForm, dateRegistered: e.target.value })}
                    />
                    {formErrors.dateRegistered && <span className="form-error-msg">{formErrors.dateRegistered}</span>}
                  </div>

                  <div className={`FdaFormGroup ${formErrors.expiryDate ? 'has-error' : ''}`}>
                    <label>Expiry Date *</label>
                    <input
                      type="date"
                      value={productForm.expiryDate}
                      onChange={(e) => setProductForm({ ...productForm, expiryDate: e.target.value })}
                    />
                    {formErrors.expiryDate && <span className="form-error-msg">{formErrors.expiryDate}</span>}
                  </div>

                  <div className="FdaModalFooter span-two">
                    <button type="button" className="BtnModalCancel" onClick={() => setShowEditProductModal(false)}>Cancel</button>
                    {/* 🔌 BACKEND: PUT /api/products/:id */}
                    <button type="submit" className="BtnModalSave">Save Changes</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal 4: Convert to Unregistered Product (Advisory) */}
          {showConvertToUnregisteredModal && selectedProduct && (
            <div className="FdaModalOverlay">
              <div className="FdaModalContent" onClick={(e) => e.stopPropagation()}>
                <button className="FdaDetailClose" onClick={() => setShowConvertToUnregisteredModal(false)}>
                  <X size={16} />
                </button>
                <div className="FdaDetailHeader">
                  <h2>Convert to Unregistered Advisory?</h2>
                  <p>Convert <strong>{selectedProduct.productName}</strong> (Reg. No: {selectedProduct.registrationNumber}) to an unregistered advisory.</p>
                </div>
                <p className="FdaConfirmationMessage" style={{ margin: '12px 0 20px', fontSize: '13px' }}>
                  The registered product record will be archived, and a new advisory record will be created.
                </p>
                <form noValidate onSubmit={handleConvertToUnregistered} className="FdaFormGrid">
                  <div className={`FdaFormGroup span-two ${formErrors.advisoryDetails ? 'has-error' : ''}`}>
                    <label>Advisory Details *</label>
                    <textarea
                      rows={4}
                      placeholder="Enter details on why this product is flagged as unregistered/dangerous..."
                      maxLength={2000}
                      minLength={10}
                      value={conversionDetails.advisoryDetails}
                      onChange={(e) => setConversionDetails({ ...conversionDetails, advisoryDetails: e.target.value })}
                    />
                    {formErrors.advisoryDetails && <span className="form-error-msg">{formErrors.advisoryDetails}</span>}
                  </div>

                  <div className={`FdaFormGroup ${formErrors.advisoryDate ? 'has-error' : ''}`}>
                    <label>Advisory Date *</label>
                    <input
                      type="date"
                      value={conversionDetails.advisoryDate}
                      onChange={(e) => setConversionDetails({ ...conversionDetails, advisoryDate: e.target.value })}
                    />
                    {formErrors.advisoryDate && <span className="form-error-msg">{formErrors.advisoryDate}</span>}
                  </div>

                  <div className={`FdaFormGroup ${formErrors.sourceUrl ? 'has-error' : ''}`}>
                    <label>Source URL *</label>
                    <input
                      type="text"
                      placeholder="https://..."
                      maxLength={500}
                      value={conversionDetails.sourceUrl}
                      onChange={(e) => setConversionDetails({ ...conversionDetails, sourceUrl: e.target.value })}
                    />
                    {formErrors.sourceUrl && <span className="form-error-msg">{formErrors.sourceUrl}</span>}
                  </div>

                  <div className="FdaModalFooter span-two">
                    <button type="button" className="BtnModalCancel" onClick={() => setShowConvertToUnregisteredModal(false)}>Cancel</button>
                    {/* 🔌 BACKEND: POST /api/advisories/convert-from-product/:product_id */}
                    <button type="submit" className="BtnModalDelete">Convert to Unregistered</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* MODALS — TAB 2: UNREGISTERED PRODUCTS (ADVISORIES) */}

          {/* Modal 5: Add Advisory */}
          {showAddAdvisoryModal && (
            <div className="FdaModalOverlay">
              <div className="FdaModalContent" onClick={(e) => e.stopPropagation()}>
                <button className="FdaDetailClose" onClick={() => setShowAddAdvisoryModal(false)}>
                  <X size={16} />
                </button>
                <div className="FdaDetailHeader">
                  <h2>Add Unregistered Product Advisory</h2>
                  <p>Flag an unregistered product and create a public advisory</p>
                </div>
                <form noValidate onSubmit={handleAddAdvisory} className="FdaFormGrid">
                  <div className={`FdaFormGroup span-two ${formErrors.productName ? 'has-error' : ''}`}>
                    <label>Product Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Dangerous Bleaching Agent"
                      maxLength={150}
                      minLength={2}
                      value={advisoryForm.productName}
                      onChange={(e) => setAdvisoryForm({ ...advisoryForm, productName: e.target.value })}
                    />
                    {formErrors.productName && <span className="form-error-msg">{formErrors.productName}</span>}
                  </div>

                  <div className={`FdaFormGroup span-two ${formErrors.advisoryDetails ? 'has-error' : ''}`}>
                    <label>Advisory Details</label>
                    <textarea
                      rows={5}
                      placeholder="Provide reasoning or laboratory results detailing safety hazards..."
                      maxLength={2000}
                      value={advisoryForm.advisoryDetails}
                      onChange={(e) => setAdvisoryForm({ ...advisoryForm, advisoryDetails: e.target.value })}
                    />
                    {formErrors.advisoryDetails && <span className="form-error-msg">{formErrors.advisoryDetails}</span>}
                  </div>

                  <div className={`FdaFormGroup ${formErrors.advisoryDate ? 'has-error' : ''}`}>
                    <label>Advisory Date *</label>
                    <input
                      type="date"
                      value={advisoryForm.advisoryDate}
                      onChange={(e) => setAdvisoryForm({ ...advisoryForm, advisoryDate: e.target.value })}
                    />
                    {formErrors.advisoryDate && <span className="form-error-msg">{formErrors.advisoryDate}</span>}
                  </div>

                  <div className={`FdaFormGroup ${formErrors.sourceUrl ? 'has-error' : ''}`}>
                    <label>Source URL *</label>
                    <input
                      type="text"
                      placeholder="https://fda.gov.ph/advisories/..."
                      maxLength={500}
                      value={advisoryForm.sourceUrl}
                      onChange={(e) => setAdvisoryForm({ ...advisoryForm, sourceUrl: e.target.value })}
                    />
                    {formErrors.sourceUrl && <span className="form-error-msg">{formErrors.sourceUrl}</span>}
                  </div>

                  <div className="FdaModalFooter FdaAddModalFooter span-two">
                    <button type="button" className="BtnModalCancel" onClick={() => setShowAddAdvisoryModal(false)}>Cancel</button>
                    {/* 🔌 BACKEND: POST /api/advisories */}
                    <button type="submit" className="BtnModalDelete">Save Advisory</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal 6: View Advisory Detail */}
          {showViewAdvisoryModal && selectedAdvisory && (
            <div className="FdaModalOverlay">
              <div className="FdaModalContent FdaProductViewModal" onClick={(e) => e.stopPropagation()}>
                <button className="FdaDetailClose" onClick={() => setShowViewAdvisoryModal(false)}>
                  <X size={16} />
                </button>
                <div className="FdaDetailHeader">
                  <small>Unregistered Product Profile</small>
                  <h2>{selectedAdvisory.productName}</h2>
                  <div className="FdaViewBadgeRow">
                    <span className="FdaBadge badge-marketplace">
                      Detected {selectedAdvisory.marketplaceDetectionCount} times across e-marketplaces
                    </span>
                    {selectedAdvisory.convertedFromProductId && (
                      <span className="FdaBadge badge-converted">Converted from Registered Product</span>
                    )}
                  </div>
                </div>

                <div className="FdaProductViewBody">
                  <div className="FdaDetailGrid">
                    <div className="FdaDetailItem">
                      <label>Status</label>
                      <span className="FdaBadge badge-unregistered" style={{ width: 'fit-content' }}>Unregistered</span>
                    </div>
                    <div className="FdaDetailItem">
                      <label>Advisory Date</label>
                      <span>{formatDate(selectedAdvisory.advisoryDate)}</span>
                    </div>
                    <div className="FdaDetailItem">
                      <label>Source URL</label>
                      <span>
                        {selectedAdvisory.sourceUrl ? (
                          <a href={selectedAdvisory.sourceUrl} target="_blank" rel="noopener noreferrer" className="FdaSourceLink">
                            {selectedAdvisory.sourceUrl}
                            <ExternalLink size={12} />
                          </a>
                        ) : '—'}
                      </span>
                    </div>
                    <div className="FdaDetailItem">
                      <label>Added By</label>
                      <span>{selectedAdvisory.addedBy}</span>
                    </div>
                    <div className="FdaDetailItem">
                      <label>Created On</label>
                      <span>{formatDate(selectedAdvisory.createdAt)}</span>
                    </div>
                    <div className="FdaDetailItem">
                      <label>Last Updated</label>
                      <span>{formatDate(selectedAdvisory.updatedAt)}</span>
                    </div>
                    <div className="FdaDetailItem" style={{ gridColumn: 'span 2' }}>
                      <label>Last Updated By</label>
                      <span>{selectedAdvisory.updatedBy}</span>
                    </div>
                  </div>

                  <div className="FdaDetailDesc">
                    <label>Advisory details</label>
                    <p>{selectedAdvisory.advisoryDetails || "No details provided."}</p>
                  </div>
                </div>

                <div className="FdaModalFooter">
                  <button className="BtnModalCancel" onClick={() => setShowViewAdvisoryModal(false)}>Close</button>
                </div>
              </div>
            </div>
          )}

          {/* Modal 7: Edit Advisory */}
          {showEditAdvisoryModal && selectedAdvisory && (
            <div className="FdaModalOverlay">
              <div className="FdaModalContent" onClick={(e) => e.stopPropagation()}>
                <button className="FdaDetailClose" onClick={() => setShowEditAdvisoryModal(false)}>
                  <X size={16} />
                </button>
                <div className="FdaDetailHeader">
                  <h2>Edit Unregistered Product Advisory</h2>
                  <p>Update advisory details for flagged product</p>
                </div>
                <form noValidate onSubmit={handleEditAdvisory} className="FdaFormGrid">
                  <div className={`FdaFormGroup span-two ${formErrors.productName ? 'has-error' : ''}`}>
                    <label>Product Name *</label>
                    <input
                      type="text"
                      maxLength={150}
                      minLength={2}
                      value={advisoryForm.productName}
                      onChange={(e) => setAdvisoryForm({ ...advisoryForm, productName: e.target.value })}
                    />
                    {formErrors.productName && <span className="form-error-msg">{formErrors.productName}</span>}
                  </div>

                  <div className={`FdaFormGroup span-two ${formErrors.advisoryDetails ? 'has-error' : ''}`}>
                    <label>Advisory Details</label>
                    <textarea
                      rows={5}
                      maxLength={2000}
                      value={advisoryForm.advisoryDetails}
                      onChange={(e) => setAdvisoryForm({ ...advisoryForm, advisoryDetails: e.target.value })}
                    />
                    {formErrors.advisoryDetails && <span className="form-error-msg">{formErrors.advisoryDetails}</span>}
                  </div>

                  <div className={`FdaFormGroup ${formErrors.advisoryDate ? 'has-error' : ''}`}>
                    <label>Advisory Date *</label>
                    <input
                      type="date"
                      value={advisoryForm.advisoryDate}
                      onChange={(e) => setAdvisoryForm({ ...advisoryForm, advisoryDate: e.target.value })}
                    />
                    {formErrors.advisoryDate && <span className="form-error-msg">{formErrors.advisoryDate}</span>}
                  </div>

                  <div className={`FdaFormGroup ${formErrors.sourceUrl ? 'has-error' : ''}`}>
                    <label>Source URL *</label>
                    <input
                      type="text"
                      maxLength={500}
                      value={advisoryForm.sourceUrl}
                      onChange={(e) => setAdvisoryForm({ ...advisoryForm, sourceUrl: e.target.value })}
                    />
                    {formErrors.sourceUrl && <span className="form-error-msg">{formErrors.sourceUrl}</span>}
                  </div>

                  <div className="FdaModalFooter span-two">
                    <button type="button" className="BtnModalCancel" onClick={() => setShowEditAdvisoryModal(false)}>Cancel</button>
                    {/* 🔌 BACKEND: PUT /api/advisories/:id */}
                    <button type="submit" className="BtnModalSave">Save Changes</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal 8: Convert Unregistered Product to Registered Product */}
          {showConvertToRegisteredModal && selectedAdvisory && (
            <div className="FdaModalOverlay">
              <div className="FdaModalContent" onClick={(e) => e.stopPropagation()}>
                <button className="FdaDetailClose" onClick={() => setShowConvertToRegisteredModal(false)}>
                  <X size={16} />
                </button>
                <div className="FdaDetailHeader">
                  <h2>Convert to Registered Product?</h2>
                  <p>Convert <strong>{selectedAdvisory.productName}</strong> to an approved registered product profile</p>
                </div>
                <p className="FdaConfirmationMessage" style={{ margin: '12px 0 20px', fontSize: '13px' }}>
                  A new registered product record will be created, and this advisory will be archived.
                </p>
                <form noValidate onSubmit={handleConvertToRegistered} className="FdaFormGrid">
                  <div className={`FdaFormGroup span-two ${formErrors.registrationNumber ? 'has-error' : ''}`}>
                    <label>Registration Number *</label>
                    <input
                      type="text"
                      placeholder="FDA-COS-YYYY-XXXXX"
                      maxLength={100}
                      value={conversionDetails.registrationNumber}
                      onChange={(e) => setConversionDetails({ ...conversionDetails, registrationNumber: e.target.value })}
                    />
                    {formErrors.registrationNumber && <span className="form-error-msg">{formErrors.registrationNumber}</span>}
                  </div>

                  <div className={`FdaFormGroup span-two ${formErrors.manufacturer ? 'has-error' : ''}`}>
                    <label>Manufacturer *</label>
                    <input
                      type="text"
                      placeholder="e.g. ActiveBrand Inc"
                      maxLength={150}
                      minLength={2}
                      value={conversionDetails.manufacturer}
                      onChange={(e) => setConversionDetails({ ...conversionDetails, manufacturer: e.target.value })}
                    />
                    {formErrors.manufacturer && <span className="form-error-msg">{formErrors.manufacturer}</span>}
                  </div>

                  <div className={`FdaFormGroup ${formErrors.dateRegistered ? 'has-error' : ''}`}>
                    <label>Date Registered *</label>
                    <input
                      type="date"
                      value={conversionDetails.dateRegistered}
                      onChange={(e) => setConversionDetails({ ...conversionDetails, dateRegistered: e.target.value })}
                    />
                    {formErrors.dateRegistered && <span className="form-error-msg">{formErrors.dateRegistered}</span>}
                  </div>

                  <div className={`FdaFormGroup ${formErrors.expiryDate ? 'has-error' : ''}`}>
                    <label>Expiry Date *</label>
                    <input
                      type="date"
                      value={conversionDetails.expiryDate}
                      onChange={(e) => setConversionDetails({ ...conversionDetails, expiryDate: e.target.value })}
                    />
                    {formErrors.expiryDate && <span className="form-error-msg">{formErrors.expiryDate}</span>}
                  </div>

                  <div className="FdaModalFooter span-two">
                    <button type="button" className="BtnModalCancel" onClick={() => setShowConvertToRegisteredModal(false)}>Cancel</button>
                    {/* 🔌 BACKEND: POST /api/products/convert-from-advisory/:advisory_id */}
                    <button type="submit" className="BtnModalSave">Convert to Registered</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Custom confirmation & success notifications styled like FDA modals */}
          {notification.isOpen && (
            <div className="FdaModalOverlay">
              <div className="FdaModalContent" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
                <button className="FdaDetailClose" onClick={() => setNotification({ ...notification, isOpen: false })}>
                  <X size={16} />
                </button>
                <div className="FdaDetailHeader">
                  <h2>{notification.title}</h2>
                  <p className="FdaConfirmationMessage" style={{ marginTop: '12px', fontSize: '14.5px', lineHeight: '1.6', color: '#1F2937', opacity: 1 }}>
                    {notification.message}
                  </p>
                </div>
                <div className="FdaModalFooter" style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  {notification.type === 'confirm' ? (
                    <>
                      <button
                        type="button"
                        className="BtnModalCancel"
                        onClick={() => {
                          setNotification({ ...notification, isOpen: false });
                          if (notification.onCancel) notification.onCancel();
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="BtnModalSave"
                        onClick={() => {
                          setNotification({ ...notification, isOpen: false });
                          if (notification.onConfirm) notification.onConfirm();
                        }}
                      >
                        Confirm
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="BtnModalSave"
                      onClick={() => setNotification({ ...notification, isOpen: false })}
                    >
                      OK
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default FDAProductDB;