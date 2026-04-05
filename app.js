const db = new Dexie('FuelSystemDB');
db.version(6).stores({
    vehicles: '++id, plateNo, fixedPrice, fuelType, baseKm, basePrice, extraKmRate, otRate, fuelEfficiency, ownerName, contactNumber, address, approvedKm, contractNo',
    calculations: '++id, vehicleId, adjustment, createdAt'
});

// Configure Global Toast for SweetAlert2
const Toast = Swal.mixin({
    toast: true,
    position: 'bottom-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    customClass: { popup: 'rounded-xl shadow-lg border border-slate-100' }
});

let isAdminMode = false;

function updateAdminUI() {
    const overlay = document.getElementById('adminPanelLock');
    const content = document.getElementById('adminPanelContent');
    const btnEdit = document.getElementById('btnEditVehicle');
    const modeBtnIcon = document.getElementById('modeIcon');
    const modeBtnText = document.getElementById('modeText');
    const modeToggleBtn = document.getElementById('modeToggleBtn');

    if (isAdminMode) {
        overlay.classList.add('hidden');
        content.classList.remove('blur-sm', 'pointer-events-none', 'opacity-50');
        
        modeBtnIcon.className = 'fa-solid fa-unlock text-emerald-500 drop-shadow-md';
        modeBtnText.innerText = 'Admin Active';
        modeToggleBtn.classList.add('bg-emerald-50', 'border-emerald-200');
        modeToggleBtn.classList.remove('bg-slate-50', 'border-slate-200');
        
        if (activeVehicle) btnEdit.classList.remove('hidden');
        if (dateRanges.length > 0) updateCalculations();
    } else {
        overlay.classList.remove('hidden');
        content.classList.add('blur-sm', 'pointer-events-none', 'opacity-50');
        
        modeBtnIcon.className = 'fa-solid fa-lock text-slate-400 group-hover:drop-shadow-md';
        modeBtnText.innerText = 'Viewer Mode';
        modeToggleBtn.classList.remove('bg-emerald-50', 'border-emerald-200');
        modeToggleBtn.classList.add('bg-slate-50', 'border-slate-200');
        
        btnEdit.classList.add('hidden');
        if (dateRanges.length > 0) updateCalculations();
    }
}

async function toggleAppMode() {
    if(!isAdminMode) {
        const { value: password } = await Swal.fire({
            title: '<span class="text-sm font-black text-slate-800 uppercase tracking-widest border-b border-slate-200 pb-2 flex justify-center"><i class="fa-solid fa-shield-halved text-brand-500 mr-2"></i>Admin Access</span>',
            input: 'password',
            inputPlaceholder: '4-digit PIN',
            showCancelButton: true,
            confirmButtonColor: '#1e293b',
            cancelButtonColor: '#e2e8f0',
            cancelButtonText: '<span class="text-slate-600 font-bold">Cancel</span>',
            customClass: { 
                popup: 'rounded-2xl shadow-2xl border border-slate-100 max-w-xs p-4',
                title: 'p-0 text-center mb-4 mt-2',
                input: 'text-center font-black tracking-[0.5em] text-lg rounded-xl bg-slate-50 border-slate-200 focus:border-brand-500 py-3',
                actions: 'mt-2 mb-2',
                confirmButton: 'text-xs rounded-lg py-2 px-6',
                cancelButton: 'text-xs rounded-lg py-2 px-6'
            }
        });
        
        if (password === '1234') {
            isAdminMode = true;
            updateAdminUI();
            Toast.fire({ icon: 'success', title: 'Admin panel unlocked.'});
        } else if (password) {
            Toast.fire({ icon: 'error', title: 'Access Denied: Invalid PIN'});
        }
    } else {
        isAdminMode = false;
        updateAdminUI();
        Toast.fire({ icon: 'info', title: 'Protocol Locked: Viewer Mode' });
    }
}

function updateModeUI() {
    // legacy support if other UI elements need it
}

let livePrices = []; 
let currentPricesObj = { lp92: 0, lp95: 0, lad: 0, lsd: 0 };
let allHistoricalData = [];

async function fetchLiveFuelData() {
    const statusEl = document.getElementById('systemStatus');
    showLockScreen("Fetching Data", "Connecting...", true);

    
    // මේ ලින්ක් එකයි හරිම ක්‍රමයයි. මේකෙන් Cache වෙන්නෙත් නෑ, Proxy ලෙඩ එන්නෙත් නෑ.
    const sheetUrl = `https://docs.google.com/spreadsheets/d/1x0VxehtNbDFqVOEmFICEpkJ2kGJEdMoVgEgb0sOvPt8/export?format=csv&gid=0&t=${new Date().getTime()}`;
    
    try {
        // Proxy නැතුව කෙලින්ම Fetch කරනවා. Cors ප්‍රශ්නයක් ආවොත් විතරක් මේක වෙනස් කරමු.
        const response = await fetch(sheetUrl, { 
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });
        if (!response.ok) throw new Error('Network response was not ok');
        
        const csvText = await response.text();
        processData(csvText);
    } catch (e) {
        console.error("Fetch Error:", e);
        // මෙතනදි තමයි "Check Internet" කියන එක පෙන්නන්නේ. 
        // ඒක නිසා මම ආයෙත් පරණ stable proxy එකක් backend එකට දැම්මා backup එකක් විදිහට.
        try {
            const backupProxy = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(sheetUrl)}`;
            const res = await fetch(backupProxy);
            const text = await res.text();
            // ... (ඉතුරු ටික පරණ විදිහටම වැඩ කරයි)
            processData(text); 
        } catch(err) {
            showLockScreen("Offline", "Check Internet Connection", false);
        }
    }
}

// දත්ත Process කරන කොටස ලේසි වෙන්න වෙනම Function එකකට ගත්තා
function processData(csvText) {
    const rows = csvText.split('\n').map(row => row.split(',').map(cell => cell.replace(/^"(.*)"$/, '$1').trim()));
    
    // Extract exact Last Updated string from Google Sheet
    let sheetSyncDate = '';
    for(let r of rows) {
        let line = r.join(' ');
        if(line.includes('Last Updated:')) {
            let matches = line.match(/Last Updated:\s*(.*)/i);
            if(matches) sheetSyncDate = matches[1].replace(/,+$/, '').trim();
            break;
        }
    }

    let allData = rows.filter(r => r[0] && /\d/.test(r[0]) && r[0].includes('.')).map(r => {
        let clean = r[0].split(' ')[0];
        let p = clean.split('.');
        let ymd = p.length === 3 ? `${p[2]}.${p[1].padStart(2, '0')}.${p[0].padStart(2, '0')}` : r[0];
        return {
            date: ymd, originalDate: r[0], p95: parseFloat(r[1]) || 0, p92: parseFloat(r[2]) || 0, lad: parseFloat(r[3]) || 0, lsd: parseFloat(r[4]) || 0
        };
    });
    // Sort descending by YYYY.MM.DD so comparison logic ALWAYS evaluates from newest to oldest.
    allData.sort((a,b) => b.date.localeCompare(a.date));
    if (allData.length === 0) throw new Error("No data found in proxy response");
    allHistoricalData = allData;
    const latest = allData[0];
    currentPricesObj = { lp95: latest.p95, lp92: latest.p92, lad: latest.lad, lsd: latest.lsd, date: latest.date };
    livePrices = allData.slice(0, 5).map(item => ({ date: item.date, p92: item.p92, p95: item.p95, lad: item.lad, lsd: item.lsd }));
    updateTopWidgets();
    updateLivePricesUI();
    const statusEl = document.getElementById('systemStatus');
    if(statusEl) {
        let fetchTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        let finalSheetStr = sheetSyncDate ? sheetSyncDate : latest.originalDate || latest.date;
        statusEl.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-600 text-xs font-semibold border border-emerald-200 shadow-sm transition-colors duration-300';
        statusEl.innerHTML = `<i class="fa-solid fa-check-circle"></i><span>Online</span> <span class="pl-2 border-l border-emerald-300 text-[10px] text-emerald-800 font-bold tracking-tight">Sync: ${fetchTime} | Data: ${finalSheetStr}</span>`;
    }
    hideLockScreen();
}

function updateTopWidgets() {
    document.getElementById('price_lp92').innerText = currentPricesObj.lp92.toFixed(2);
    document.getElementById('price_lp95').innerText = currentPricesObj.lp95.toFixed(2);
    document.getElementById('price_lad').innerText = currentPricesObj.lad.toFixed(2);
    document.getElementById('price_lsd').innerText = currentPricesObj.lsd.toFixed(2);

    document.getElementById('date_lp92').innerText = currentPricesObj.date;
    document.getElementById('date_lp95').innerText = currentPricesObj.date;
    document.getElementById('date_lad').innerText = currentPricesObj.date;
    document.getElementById('date_lsd').innerText = currentPricesObj.date;
}

function updateLivePricesUI() {
    const list = document.getElementById('priceHistoryList');
    list.innerHTML = '';
    livePrices.forEach((entry, idx) => {
        let isLatest = idx === 0;
        let badge = isLatest ? `<span class="bg-brand-100 text-brand-700 text-[10px] font-bold px-2 py-0.5 rounded ml-2 uppercase">Current</span>` : '';
        let borderCls = isLatest ? 'border-brand-200 bg-white shadow-sm' : 'border-slate-100 bg-slate-50/50';
        list.innerHTML += `
            <div class="p-3 rounded-xl border ${borderCls} mb-2 flex flex-col gap-2">
                <div class="flex items-center justify-between">
                    <span class="text-xs font-bold text-slate-500 uppercase flex items-center"><i class="fa-regular fa-calendar-days mr-1.5"></i> ${entry.date} ${badge}</span>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <div class="bg-white rounded p-1.5 border border-slate-100 flex justify-between items-center shadow-sm">
                        <span class="text-[10px] font-bold text-slate-500">LP - 92</span>
                        <span class="text-xs font-black text-amber-500">Rs. ${entry.p92.toFixed(2)}</span>
                    </div>
                    <div class="bg-white rounded p-1.5 border border-slate-100 flex justify-between items-center shadow-sm">
                        <span class="text-[10px] font-bold text-slate-500">LP - 95</span>
                        <span class="text-xs font-black text-red-500">Rs. ${entry.p95.toFixed(2)}</span>
                    </div>
                    <div class="bg-white rounded p-1.5 border border-slate-100 flex justify-between items-center shadow-sm">
                        <span class="text-[10px] font-bold text-slate-500">LAD</span>
                        <span class="text-xs font-black text-blue-500">Rs. ${entry.lad.toFixed(2)}</span>
                    </div>
                    <div class="bg-white rounded p-1.5 border border-slate-100 flex justify-between items-center shadow-sm">
                        <span class="text-[10px] font-bold text-slate-500">LSD</span>
                        <span class="text-xs font-black text-emerald-500">Rs. ${entry.lsd.toFixed(2)}</span>
                    </div>
                </div>
            </div>`;
    });
}

function showLockScreen(t, d, s) { 
    document.getElementById('offlineLock').classList.remove('hidden');
    document.getElementById('lockTitle').innerText = t;
    document.getElementById('lockDesc').innerText = d;
}
function hideLockScreen() { document.getElementById('offlineLock').classList.add('hidden'); }

let activeVehicle = null;
let dateRanges = [];

function openVehicleModal(veh = null) {
    const m = document.getElementById('vehicleModal');
    const mc = document.getElementById('vehicleModalContent');
    m.classList.remove('hidden');
    setTimeout(() => {
        m.classList.remove('opacity-0');
        mc.classList.remove('scale-95');
        
        document.getElementById('vehError').classList.add('hidden');
        
        if (veh) {
            document.getElementById('vehModalTitle').innerText = 'Edit Vehicle';
            document.getElementById('vehIdInput').value = veh.id;
            document.getElementById('vehPlateInput').value = veh.plateNo || '';
            document.getElementById('vehFixedPriceInput').value = veh.fixedPrice || '';
            document.getElementById('vehFuelTypeInput').value = veh.fuelType || 'p92';
            document.getElementById('vehOwnerNameInput').value = veh.ownerName || '';
            document.getElementById('vehContactInput').value = veh.contactNumber || '';
            document.getElementById('vehAddressInput').value = veh.address || '';
            document.getElementById('vehContractNoInput').value = veh.contractNo || '';
            document.getElementById('vehApprovedKmInput').value = veh.approvedKm !== undefined ? veh.approvedKm : 2000;
            document.getElementById('vehBaseKmInput').value = veh.baseKm !== undefined ? veh.baseKm : 1500;
            document.getElementById('vehBasePriceInput').value = veh.basePrice || '';
            document.getElementById('vehExtraKmRateInput').value = veh.extraKmRate || '';
            document.getElementById('vehOtRateInput').value = veh.otRate || '';
            document.getElementById('vehKmPerLtrInput').value = veh.fuelEfficiency || '';
        } else {
            document.getElementById('vehModalTitle').innerText = 'Add New Vehicle';
            document.getElementById('vehIdInput').value = '';
            ['vehPlateInput', 'vehFixedPriceInput', 'vehBasePriceInput', 'vehExtraKmRateInput', 'vehOtRateInput', 'vehKmPerLtrInput', 'vehOwnerNameInput', 'vehContactInput', 'vehAddressInput', 'vehContractNoInput'].forEach(id => {
                document.getElementById(id).value = '';
            });
            document.getElementById('vehApprovedKmInput').value = '2000';
            document.getElementById('vehBaseKmInput').value = '1500';
            document.getElementById('vehFuelTypeInput').value = 'p92';
        }
    }, 10);
}

function closeVehicleModal() {
    document.getElementById('vehicleModal').classList.add('opacity-0');
    document.getElementById('vehicleModalContent').classList.add('scale-95');
    setTimeout(() => {
        document.getElementById('vehicleModal').classList.add('hidden');
        
        const inputsToClear = ['vehPlateInput', 'vehFixedPriceInput', 'vehBasePriceInput', 'vehExtraKmRateInput', 'vehOtRateInput', 'vehKmPerLtrInput', 'vehOwnerNameInput', 'vehContactInput', 'vehAddressInput', 'vehContractNoInput', 'vehApprovedKmInput'];
        inputsToClear.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.value = '';
        });
        document.getElementById('vehBaseKmInput').value = '1500';
        
        document.getElementById('vehError').classList.add('hidden');
    }, 300);
}



// Google Apps Script Cloud Database Configuration
// IMPORTANT: Paste your deployed Google Apps Script Web App URL here:
const APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxtnTJLwLoYuZNQ19XmQ3PqW0_ymunoNZ7U8bIodIll62P8PRyRTTb5-mx2T4g0eX7SYQ/exec"; 

// Centralized Cloud Database Synchronization
class OnlineAPI {
    static async saveVehicle(vehicle) {
        if (APP_SCRIPT_URL && APP_SCRIPT_URL.trim() !== '') {
            try {
                // Post to Google Sheets
                await fetch(APP_SCRIPT_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({ action: 'saveVehicle', vehicle: vehicle })
                });
            } catch (e) {
                console.log("Failed to sync vehicle to Google Sheets", e);
            }
        }
        await db.vehicles.put(vehicle);
        return true;
    }

    static async getVehicles() {
        if (APP_SCRIPT_URL && APP_SCRIPT_URL.trim() !== '') {
            try {
                const response = await fetch(APP_SCRIPT_URL + "?action=getVehicles");
                if (response.ok) {
                    const data = await response.json();
                    if (Array.isArray(data) && data.length > 0) {
                        await db.vehicles.clear();
                        await db.vehicles.bulkPut(data);
                    }
                }
            } catch (e) {
                console.log("Could not fetch from Google Sheets API, falling back to local database", e);
            }
        } else {
            // Backup fallback for manual JSON drop testing
            const count = await db.vehicles.count();
            if (count === 0) {
                try {
                    const res = await fetch("./Vehicle details.json?t=" + Date.now());
                    if (res.ok) {
                        const data = await res.json();
                        await db.vehicles.bulkPut(data);
                    }
                } catch(e) {}
            }
        }
        
        return await db.vehicles.toArray();
    }
}

async function saveVehicle() {
    const id = document.getElementById('vehIdInput').value;
    const plateNo = document.getElementById('vehPlateInput').value.trim().toUpperCase();
    const fixedPrice = parseFloat(document.getElementById('vehFixedPriceInput').value);
    const fuelType = document.getElementById('vehFuelTypeInput').value;
    
    const baseKm = parseFloat(document.getElementById('vehBaseKmInput').value) || 0;
    const basePrice = parseFloat(document.getElementById('vehBasePriceInput').value) || 0;
    const extraKmRate = parseFloat(document.getElementById('vehExtraKmRateInput').value) || 0;
    const otRate = parseFloat(document.getElementById('vehOtRateInput').value) || 0;
    const fuelEfficiency = parseFloat(document.getElementById('vehKmPerLtrInput').value) || 0;
    const approvedKm = parseFloat(document.getElementById('vehApprovedKmInput').value) || 0;
    
    const ownerName = document.getElementById('vehOwnerNameInput').value.trim();
    const contactNumber = document.getElementById('vehContactInput').value.trim();
    const address = document.getElementById('vehAddressInput').value.trim();
    const contractNo = document.getElementById('vehContractNoInput').value.trim();

    const errEl = document.getElementById('vehError');
    
    if (plateNo.length === 0) {
        errEl.innerText = "Please enter Vehicle Name / License Plate.";
        errEl.classList.remove('hidden');
        return;
    }
    if (isNaN(fixedPrice) || fixedPrice <= 0) {
        errEl.innerText = "Please enter a valid fixed fuel price.";
        errEl.classList.remove('hidden');
        return;
    }
    if (fuelEfficiency <= 0) {
        errEl.innerText = "Please enter a valid Fuel Efficiency (Km/L).";
        errEl.classList.remove('hidden');
        return;
    }
    
    // Remote Save Flow
    
    let vehicleToSave = { plateNo, fixedPrice, fuelType, baseKm, basePrice, extraKmRate, otRate, fuelEfficiency, ownerName, contactNumber, address, approvedKm, contractNo };
    if (id) {
        vehicleToSave.id = isNaN(parseInt(id)) ? id : parseInt(id); // handle integer dexie IDs
    }
    await OnlineAPI.saveVehicle(vehicleToSave);
    
    Toast.fire({ icon: 'success', title: 'Vehicle details strictly stored.' });
    closeVehicleModal();
    
    if (id && activeVehicle && activeVehicle.id == id) {
        activeVehicle = vehicleToSave;
        if(dateRanges.length > 0) updateCalculations();
    }
    
    loadVehicles();
}

function editSelectedVehicle() {
    if (!activeVehicle) return;
    openVehicleModal(activeVehicle);
}

async function openManageVehiclesModal() {
    const m = document.getElementById('manageVehiclesModal');
    const mc = document.getElementById('manageVehiclesModalContent');
    m.classList.remove('hidden');
    
    await populateManageVehiclesTable();

    setTimeout(() => {
        m.classList.remove('opacity-0');
        mc.classList.remove('scale-95');
    }, 10);
}

function closeManageVehiclesModal() {
    document.getElementById('manageVehiclesModal').classList.add('opacity-0');
    document.getElementById('manageVehiclesModalContent').classList.add('scale-95');
    setTimeout(() => {
        document.getElementById('manageVehiclesModal').classList.add('hidden');
    }, 300);
}

async function populateManageVehiclesTable() {
    const tbody = document.getElementById('manageVehiclesTableBody');
    tbody.innerHTML = '<tr><td colspan="9" class="p-4 text-center text-slate-400">Loading...</td></tr>';
    
    const vehicles = await OnlineAPI.getVehicles();
    if(vehicles.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="p-4 text-center text-slate-400">No vehicles found in database.</td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    vehicles.forEach(v => {
        tbody.innerHTML += `
            <tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                <td class="p-3 font-bold text-slate-800">${v.plateNo}</td>
                <td class="p-3 text-xs font-semibold text-slate-500">${getFuelDisplayInfo(v.fuelType)}</td>
                <td class="p-3 text-slate-700">Rs. ${fmt(v.fixedPrice)}</td>
                <td class="p-3 text-slate-700">${v.fuelEfficiency}</td>
                <td class="p-3 text-slate-700">${v.baseKm}</td>
                <td class="p-3 text-slate-700">Rs. ${fmt(v.basePrice)}</td>
                <td class="p-3 text-slate-700">Rs. ${fmt(v.extraKmRate)}</td>
                <td class="p-3 text-slate-700">Rs. ${fmt(v.otRate)}</td>
                <td class="p-3 text-right space-x-2">
                    <button onclick="editVehicleFromDB(${v.id})" class="text-amber-600 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 p-2 rounded transition-colors" title="Edit"><i class="fa-solid fa-pen"></i></button>
                    <button onclick="deleteVehicleFromDB(${v.id})" class="text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 p-2 rounded transition-colors" title="Delete"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
}

async function editVehicleFromDB(id) {
    const vehicles = await OnlineAPI.getVehicles();
    const v = vehicles.find(x => x.id == id);
    if(v) {
        closeManageVehiclesModal();
        openVehicleModal(v);
    }
}

async function deleteVehicleFromDB(id) {
    let res = await Swal.fire({
        title: 'Delete Vehicle?',
        text: `Are you sure you want to permanently delete this vehicle?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e11d48',
        confirmButtonText: 'Yes, delete it!'
    });
    
    if (res.isConfirmed) {
        Swal.showLoading();
        await db.vehicles.delete(id);
        
        if(activeVehicle && activeVehicle.id == id) {
            activeVehicle = null;
            document.getElementById('calculatorPanel').classList.add('hidden');
            document.getElementById('noVehicleWarning').classList.remove('hidden');
            document.getElementById('btnEditVehicle').classList.add('hidden');
        }
        
        await loadVehicles();
        await populateManageVehiclesTable();
        Swal.fire({ icon: 'success', title: 'Deleted Successfully', text: 'Vehicle has been removed from database.', confirmButtonColor: '#10b981', customClass: { popup: 'rounded-2xl' } });
    }
}

async function loadVehicles() {
    const dropdown = document.getElementById('vehicleDropdown');
    dropdown.innerHTML = '<option value="" disabled selected>Loading Online DB...</option>';
    
    const vehicles = await OnlineAPI.getVehicles();
    
    dropdown.innerHTML = '<option value="" disabled selected>-- Choose from Online DB --</option>';
    if (vehicles.length === 0) {
        dropdown.innerHTML += '<option value="" disabled>No vehicles found. Click New.</option>';
    } else {
        vehicles.forEach(v => {
            let fLabel = v.fuelType ? getFuelDisplayInfo(v.fuelType) : 'UNK';
            dropdown.innerHTML += `<option value="${v.id}">${v.plateNo} (${fLabel})</option>`;
        });
    }
}

async function selectVehicleFromDropdown() {
    const id = document.getElementById('vehicleDropdown').value;
    if(!id) return;
    
    const vehicles = await OnlineAPI.getVehicles();
    activeVehicle = vehicles.find(v => v.id == id);
    if(!activeVehicle) return;
    
    const vInfo = document.getElementById('selectedVehicleInfo');
    if (vInfo) {
        let tConfig = {
            'p92': { iconBg: 'bg-amber-50', iconBorder: 'border-amber-100', iconColor: 'text-amber-500', bgGrad: 'from-amber-50' },
            'p95': { iconBg: 'bg-rose-50', iconBorder: 'border-rose-100', iconColor: 'text-rose-500', bgGrad: 'from-rose-50' },
            'lad': { iconBg: 'bg-indigo-50', iconBorder: 'border-indigo-100', iconColor: 'text-indigo-500', bgGrad: 'from-indigo-50' },
            'lsd': { iconBg: 'bg-emerald-50', iconBorder: 'border-emerald-100', iconColor: 'text-emerald-500', bgGrad: 'from-emerald-50' }
        };
        let theme = tConfig[activeVehicle.fuelType] || tConfig['p92'];
        
        vInfo.innerHTML = `
            <div class="bg-white rounded-2xl p-5 shadow-lg shadow-slate-200/50 text-slate-800 flex flex-col xl:flex-row gap-5 items-center relative overflow-hidden border border-slate-100 animate__animated animate__fadeIn">
                <!-- Abstract BG Shape -->
                <div class="absolute right-0 top-0 w-64 h-64 bg-gradient-to-br ${theme.bgGrad} to-transparent rounded-full -mr-20 -mt-20 pointer-events-none"></div>
                
                <div class="flex-shrink-0 relative z-10 w-20 h-20 ${theme.iconBg} rounded-2xl flex items-center justify-center border ${theme.iconBorder} shadow-sm ${theme.iconColor}">
                    <i class="fa-solid fa-car-side text-3xl"></i>
                </div>
                
                <div class="flex-grow w-full relative z-10 text-center xl:text-left">
                    <div class="flex flex-col xl:flex-row xl:items-end justify-between mb-3 border-b border-slate-100 pb-3">
                        <div>
                            <span class="text-[9px] uppercase tracking-[0.2em] font-bold text-slate-400 block mb-0.5"><i class="fa-solid fa-file-signature mr-1"></i>${activeVehicle.contractNo || 'No Contract'}</span>
                            <h3 class="text-xl font-black tracking-tight text-slate-800 leading-none">${activeVehicle.plateNo}</h3>
                        </div>
                        <div class="mt-3 xl:mt-0 flex justify-center xl:justify-end gap-2">
                            <span class="bg-white border border-slate-200 shadow-sm text-slate-600 text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider inline-flex items-center"><i class="fa-solid fa-gas-pump mr-1.5 opacity-70 ${theme.iconColor}"></i> ${getFuelDisplayInfo(activeVehicle.fuelType)}</span>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-left">
                        <div class="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                            <p class="text-[9px] uppercase tracking-widest font-bold text-slate-400 mb-0.5">Owner</p>
                            <p class="font-bold text-slate-700 truncate">${activeVehicle.ownerName || 'N/A'}</p>
                            <p class="text-[9px] text-slate-500 mt-0.5 font-mono truncate">${activeVehicle.contactNumber || 'No Contact'}</p>
                        </div>
                        <div class="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                            <p class="text-[9px] uppercase tracking-widest font-bold text-slate-400 mb-0.5">Contract Limit</p>
                            <p class="font-bold text-slate-700 truncate max-w-[120px]">Max: <span class="text-emerald-600">${fmt(activeVehicle.approvedKm)} Km</span></p>
                            <p class="text-[9px] text-slate-500 mt-0.5 truncate max-w-[120px]">Base: ${fmt(activeVehicle.baseKm)} Km</p>
                        </div>
                        <div class="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                            <p class="text-[9px] uppercase tracking-widest font-bold text-slate-400 mb-0.5">Rent Charges</p>
                            <p class="font-bold text-slate-700 truncate max-w-[140px]">Rs. ${fmt(activeVehicle.basePrice)}</p>
                            <p class="text-[9px] text-slate-500 mt-0.5 truncate max-w-[140px]"><i class="fa-solid fa-plus text-[7px] mr-1 opacity-50"></i>Rs. ${fmt(activeVehicle.extraKmRate)} /Km</p>
                        </div>
                        <div class="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                            <p class="text-[9px] uppercase tracking-widest font-bold text-slate-400 mb-0.5">Fuel Price</p>
                            <p class="font-bold text-slate-700 truncate max-w-[120px]">Rs. ${fmt(activeVehicle.fixedPrice)}</p>
                            <p class="text-[9px] text-slate-500 mt-0.5 truncate max-w-[120px]"><i class="fa-solid fa-bolt text-[7px] mr-1 opacity-50 ${theme.iconColor}"></i>${activeVehicle.fuelEfficiency} Km/L</p>
                        </div>
                    </div>
                </div>
            </div>`;
        document.getElementById('selectedVehicleInfo').classList.remove('hidden');
        document.getElementById('invoiceHistoryWidget').classList.remove('hidden');
        
        // Fetch saved invoices automatically
        fetchInvoiceHistory();
    }
    
    document.getElementById('calculatorPanel').classList.remove('hidden');
    document.getElementById('noVehicleWarning').classList.add('hidden');
    
    document.getElementById('btnEditVehicle').classList.remove('hidden');
    
    document.getElementById('calcStartDate').disabled = false;
    document.getElementById('calcEndDate').disabled = false;

    // Use flatpickr methods if they are initialized
    if(startDatePicker) {
        startDatePicker.clear();
        endDatePicker.clear();
    } else {
        document.getElementById('calcStartDate').value = '';
        document.getElementById('calcEndDate').value = '';
    }
    
    dateRanges = [];
    renderDateRanges();
}

function getPriceForDate(dateStr, fuelType) {
    if(!allHistoricalData.length) return 0;
    const entry = allHistoricalData.find(r => r.date <= dateStr);
    return entry ? (entry[fuelType] || 0) : (allHistoricalData[allHistoricalData.length-1][fuelType] || 0);
}

function getFuelDisplayInfo(type) {
    const map = {
        'p92': 'LP - 92',
        'p95': 'LP - 95',
        'lad': 'LAD',
        'lsd': 'LSD'
    };
    return map[type] || type.toUpperCase();
}

let startDatePicker = null;
let endDatePicker = null;

function initDateRangePicker() {
    const startInput = document.getElementById('calcStartDate');
    const endInput = document.getElementById('calcEndDate');

    function checkDates() {
        let sDate = startInput.value;
        let eDate = endInput.value;
        if (!sDate || !eDate || !activeVehicle) return;

        let startDate = new Date(sDate);
        let endDate = new Date(eDate);
        if(endDate < startDate) {
            if(endDatePicker) endDatePicker.clear();
            dateRanges = [];
            renderDateRanges();
            return;
        }
        calculateSplits(startDate, endDate);
    }
    
    // Initialize Flatpickr for start date
    startDatePicker = flatpickr(startInput, {
        dateFormat: "Y-m-d",
        onChange: function(selectedDates, dateStr, instance) {
            if(endDatePicker) endDatePicker.set('minDate', dateStr);
            checkDates();
        }
    });

    // Initialize Flatpickr for end date
    endDatePicker = flatpickr(endInput, {
        dateFormat: "Y-m-d",
        onChange: function(selectedDates, dateStr, instance) {
            if(startDatePicker) startDatePicker.set('maxDate', dateStr);
            checkDates();
        }
    });
}

function calculateSplits(startDate, endDate) {
    let tempStart = startDate.toISOString().split('T')[0].replace(/-/g, '.');
    let tempEnd = endDate.toISOString().split('T')[0].replace(/-/g, '.');

    let priceAtStart = getPriceForDate(tempStart, activeVehicle.fuelType);
    let validRevisions = allHistoricalData.filter(r => r.date > tempStart && r.date <= tempEnd);
    validRevisions.sort((a, b) => a.date.localeCompare(b.date));
    
    let splitRanges = [];
    let currentStart = tempStart;
    let currentPrice = priceAtStart;

    for (let rev of validRevisions) {
        let revPrice = rev[activeVehicle.fuelType];
        if (revPrice !== currentPrice) {
            let nextDayTime = new Date(rev.date.replace(/\./g, '-'));
            nextDayTime.setDate(nextDayTime.getDate() - 1);
            let endOfCurrent = nextDayTime.toISOString().split('T')[0].replace(/-/g, '.');
            
            if (currentStart <= endOfCurrent) {
                splitRanges.push({ start: currentStart, end: endOfCurrent });
            }
            currentStart = rev.date;
            currentPrice = revPrice;
        }
    }
    
    if (currentStart <= tempEnd) {
        splitRanges.push({ start: currentStart, end: tempEnd });
    }

    dateRanges = splitRanges.map((seg, i) => ({
        id: Date.now() + i,
        start: seg.start,
        end: seg.end,
        km: 0
    })).reverse();

    // Auto-split notification removed as requested

    renderDateRanges();
}

function fmt(num) {
    return Number(num || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function renderDateRanges() {
    const container = document.getElementById('dateRangesContainer');
    const billSummaryContainer = document.getElementById('billSummaryContainer');
    
    if(dateRanges.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 text-slate-400">
                <i class="fa-regular fa-calendar-check text-2xl mb-2 text-slate-300"></i>
                <span class="text-sm font-medium">Select a Calculation Period to instantly generate ranges.</span>
            </div>`;
        billSummaryContainer.innerHTML = '';
        return;
    }

    let tConfig = {
        'p92': { iconBg: 'bg-amber-50', iconBorder: 'border-amber-100', iconColor: 'text-amber-500', btnBg: 'bg-amber-500 hover:bg-amber-600', totalIcon: 'bg-amber-100 text-amber-600', highlight: 'text-amber-700 bg-amber-50 border-amber-200' },
        'p95': { iconBg: 'bg-rose-50', iconBorder: 'border-rose-100', iconColor: 'text-rose-500', btnBg: 'bg-rose-500 hover:bg-rose-600', totalIcon: 'bg-rose-100 text-rose-600', highlight: 'text-rose-700 bg-rose-50 border-rose-200' },
        'lad': { iconBg: 'bg-indigo-50', iconBorder: 'border-indigo-100', iconColor: 'text-indigo-500', btnBg: 'bg-indigo-500 hover:bg-indigo-600', totalIcon: 'bg-indigo-100 text-indigo-600', highlight: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
        'lsd': { iconBg: 'bg-emerald-50', iconBorder: 'border-emerald-100', iconColor: 'text-emerald-500', btnBg: 'bg-emerald-500 hover:bg-emerald-600', totalIcon: 'bg-emerald-100 text-emerald-600', highlight: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
    };
    let theme = activeVehicle ? (tConfig[activeVehicle.fuelType] || tConfig['p92']) : tConfig['p92'];

    container.innerHTML = '';
    dateRanges.forEach((range, idx) => {
        let actualPrice = getPriceForDate(range.start, activeVehicle.fuelType);
        let diffPerLtr = (actualPrice > 0 && activeVehicle.fixedPrice > 0) ? (actualPrice - activeVehicle.fixedPrice) : 0;
        let diffPrefix = diffPerLtr > 0 ? '+' : '';

        container.innerHTML += `
            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm animate__animated animate__fadeIn flex flex-col md:flex-row gap-4 items-center">
                <div class="flex items-center gap-3 md:border-r border-slate-100 md:pr-5 flex-shrink-0 w-full md:w-auto justify-center md:justify-start">
                    <div class="w-10 h-10 rounded-lg flex items-center justify-center border ${theme.iconBg} ${theme.iconColor} ${theme.iconBorder}">
                        <i class="fa-regular fa-calendar-check"></i>
                    </div>
                    <div>
                        <p class="text-[10px] uppercase font-bold text-slate-400 mb-0.5 tracking-wider hidden md:block">Period Segment</p>
                        <p class="text-sm font-bold text-slate-700 font-mono">${range.start} <i class="fa-solid fa-arrow-right text-slate-300 mx-1 text-xs"></i> ${range.end}</p>
                    </div>
                </div>
                
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 w-full text-left md:text-center items-center py-2">
                    <div class="pl-3 md:pl-0 border-l-2 md:border-l-0 border-slate-200">
                        <p class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Actual</p>
                        <p class="text-sm font-bold text-slate-700">${fmt(actualPrice)}</p>
                    </div>
                    <div class="pl-3 md:pl-0 border-l-2 md:border-l-0 border-slate-200">
                        <p class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Fixed</p>
                        <p class="text-sm font-bold text-slate-700">${fmt(activeVehicle.fixedPrice)}</p>
                    </div>
                    <div class="pl-3 md:pl-0 border-l-2 md:border-l-0 border-slate-200">
                        <p class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Diff/L</p>
                        <p class="text-sm font-bold text-slate-700 ${Math.abs(diffPerLtr) < 3 ? 'text-slate-400' : ''}">${diffPrefix}${fmt(diffPerLtr)}</p>
                    </div>
                    <div class="pl-3 md:pl-0 border-l-2 md:border-l-0 border-brand-200 relative group">
                        <p class="text-[10px] font-bold ${Math.abs(diffPerLtr) < 3 ? 'text-slate-400' : 'text-brand-500'} uppercase tracking-wider mb-0.5">Seg. Km</p>
                        <input type="number" id="segKmIn_${idx}" value="${range.km || ''}" placeholder="0" oninput="updateSegmentKm(${idx}, this.value)" ${Math.abs(diffPerLtr) < 3 ? 'disabled' : ''} class="w-20 md:w-full mt-1 border border-brand-300 rounded px-2 py-0.5 text-sm font-black text-brand-700 text-left md:text-center outline-none focus:ring-2 focus:ring-brand-500/30 transition-all ${Math.abs(diffPerLtr) < 3 ? 'bg-slate-100 text-slate-400 cursor-not-allowed border-none' : 'bg-brand-50'} mx-auto block max-w-full placeholder:font-normal placeholder:opacity-50 shadow-inner">
                        ${Math.abs(diffPerLtr) < 3 ? '<i class="fa-solid fa-lock absolute right-1 top-1/2 mt-0.5 text-slate-300 text-[10px]"></i>' : ''}
                    </div>
                    <div class="pl-3 md:pl-0 border-l-2 md:border-l-0 border-slate-200">
                        <p class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Rate/Km</p>
                        <p class="text-sm font-bold text-slate-700" id="segRate_${idx}">0.00</p>
                    </div>
                    <div id="segAdj_container_${idx}" class="pl-3 md:pl-0 border-l-2 md:border-l-0 border-slate-200 transition-colors">
                        <p class="text-[10px] font-bold opacity-70 uppercase tracking-wider mb-0.5">Adj. (Rs)</p>
                        <p class="text-xs font-black text-slate-400" id="segAdj_${idx}">0.00</p>
                    </div>
                </div>
            </div>
        `;
    });
    
    updateCalculations();
}

function updateSegmentKm(idx, val) {
    let km = parseFloat(val);
    if(isNaN(km) || km < 0) km = 0;
    
    // Check constraint before saving
    let testTotal = dateRanges.reduce((sum, seg, i) => sum + (i === idx ? km : (seg.km || 0)), 0);
    if(activeVehicle.approvedKm > 0 && testTotal > activeVehicle.approvedKm) {
        let maxAllowedForThisSeg = activeVehicle.approvedKm - (testTotal - km);
        km = maxAllowedForThisSeg < 0 ? 0 : maxAllowedForThisSeg;
        
        Swal.fire({
            icon: 'warning',
            title: 'Safety Lock Triggered',
            text: `Cannot exceed Contract Approved Limit (${activeVehicle.approvedKm} Km). Auto-correcting value.`,
            confirmButtonColor: '#eab308',
            customClass: { popup: 'rounded-2xl' }
        });
        
        // Find input and force update visually
        let inputEl = document.getElementById(`segKmIn_${idx}`);
        if(inputEl) inputEl.value = km;
    }
    
    dateRanges[idx].km = km;
    updateCalculations();
}

function updateCalculations() {
    const billSummaryContainer = document.getElementById('billSummaryContainer');
    const waitContainer = document.getElementById('calculationWaitContainer');
    const resultsContainer = document.getElementById('calculationResultsContainer');

    if(!activeVehicle) return;

    // Calculate total Km from segments.
    let totalKm = dateRanges.reduce((sum, seg) => sum + (seg.km || 0), 0);
    
    let calcRunEl = document.getElementById('calcRunKm');
    if(calcRunEl) calcRunEl.value = totalKm > 0 ? totalKm : '';

    if (dateRanges.length === 0) {
        if(waitContainer) waitContainer.classList.remove('hidden');
        if(resultsContainer) resultsContainer.classList.add('hidden');
        return; 
    } else {
        if(waitContainer) waitContainer.classList.add('hidden');
        if(resultsContainer) resultsContainer.classList.remove('hidden');
    }

    let tConfig = {
        'p92': { iconBg: 'bg-amber-50', iconBorder: 'border-amber-100', iconColor: 'text-amber-500', btnBg: 'bg-amber-500 hover:bg-amber-600', totalIcon: 'bg-amber-100 text-amber-600', highlight: 'text-amber-700 bg-amber-50 border-amber-200' },
        'p95': { iconBg: 'bg-rose-50', iconBorder: 'border-rose-100', iconColor: 'text-rose-500', btnBg: 'bg-rose-500 hover:bg-rose-600', totalIcon: 'bg-rose-100 text-rose-600', highlight: 'text-rose-700 bg-rose-50 border-rose-200' },
        'lad': { iconBg: 'bg-indigo-50', iconBorder: 'border-indigo-100', iconColor: 'text-indigo-500', btnBg: 'bg-indigo-500 hover:bg-indigo-600', totalIcon: 'bg-indigo-100 text-indigo-600', highlight: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
        'lsd': { iconBg: 'bg-emerald-50', iconBorder: 'border-emerald-100', iconColor: 'text-emerald-500', btnBg: 'bg-emerald-500 hover:bg-emerald-600', totalIcon: 'bg-emerald-100 text-emerald-600', highlight: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
    };
    let theme = activeVehicle ? (tConfig[activeVehicle.fuelType] || tConfig['p92']) : tConfig['p92'];

    let positiveFuelAdjustments = 0;
    let negativeFuelAdjustments = 0;

    dateRanges.forEach((range, idx) => {
        let actualPrice = getPriceForDate(range.start, activeVehicle.fuelType);
        let diffPerLtr = (actualPrice > 0 && activeVehicle.fixedPrice > 0) ? (actualPrice - activeVehicle.fixedPrice) : 0;
        
        let ratePerKm = (activeVehicle.fuelEfficiency > 0) ? (diffPerLtr / activeVehicle.fuelEfficiency) : 0;
        let rangeAdj = 0;
        let isCalculated = true;
        
        if (Math.abs(diffPerLtr) < 3) {
            isCalculated = false;
        } else {
            rangeAdj = ratePerKm * range.km; // New Logic: (Diff / FuelEff) * RangeKm
        }
        
        if (rangeAdj > 0) {
            positiveFuelAdjustments += rangeAdj;
        } else if (rangeAdj < 0) {
            negativeFuelAdjustments += rangeAdj;
        }
        
        let adjPrefix = rangeAdj > 0 ? '+' : '';
        let diffClass = rangeAdj > 0 ? theme.highlight : (rangeAdj < 0 ? 'text-rose-600 border-rose-200' : 'text-slate-500 border-slate-200');
        
        let rateEl = document.getElementById(`segRate_${idx}`);
        let adjEl = document.getElementById(`segAdj_${idx}`);
        let adjCont = document.getElementById(`segAdj_container_${idx}`);
        
        if (rateEl) {
            rateEl.innerText = (ratePerKm > 0 ? '+' : '') + fmt(ratePerKm);
            rateEl.className = ratePerKm > 0 ? 'text-sm font-bold text-emerald-600' : (ratePerKm < 0 ? 'text-sm font-bold text-rose-600' : 'text-sm font-bold text-slate-700');
        }
        if (adjEl) {
            if (isCalculated) {
                adjEl.innerText = `${adjPrefix}${fmt(rangeAdj)}`;
                adjEl.className = 'text-xs font-black';
            } else {
                adjEl.innerText = `Not Calculated`;
                adjEl.className = 'text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-wider';
                diffClass = 'text-slate-400 border-slate-200';
            }
        }
        if (adjCont) {
            adjCont.className = `pl-3 md:pl-0 border-l-2 md:border-l-0 ${diffClass} transition-colors`;
        }
    });

    let otHours = parseFloat(document.getElementById('calcOTHours').value) || 0;
    let baseRental = activeVehicle.basePrice || 0;
    let extraKm = Math.max(0, totalKm - (activeVehicle.baseKm || 0));
    let extraKmCharge = extraKm * (activeVehicle.extraKmRate || 0);
    let otCharge = otHours * (activeVehicle.otRate || 0);
    
    let grossAmount = baseRental + extraKmCharge + otCharge;
    let subTotalAfterAdditions = grossAmount + positiveFuelAdjustments;
    let netTotal = subTotalAfterAdditions + negativeFuelAdjustments;

    billSummaryContainer.innerHTML = `
        <div class="mt-6 bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-sm animate__animated animate__fadeIn">
            <h3 class="text-sm font-bold text-slate-700 mb-5 flex items-center">
                <i class="fa-solid fa-file-invoice-dollar text-brand-500 mr-2 text-lg"></i> Final Bill Summary
            </h3>
            
            <div class="space-y-0 text-sm bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div class="flex justify-between items-center p-3.5 border-b border-slate-100">
                    <span class="text-slate-600 font-semibold tracking-wide flex items-center gap-2"><i class="fa-solid fa-car-side text-slate-400 w-4"></i> Base Rental</span>
                    <span class="font-bold text-slate-800">Rs. ${fmt(baseRental)}</span>
                </div>
                <div class="flex justify-between items-center p-3.5 border-b border-slate-100 bg-slate-50/50">
                    <span class="text-slate-600 font-semibold tracking-wide flex items-center gap-2"><i class="fa-solid fa-road text-slate-400 w-4"></i> Excess Km Charge <span class="text-xs ml-1 text-slate-400">(${fmt(extraKm)} Km)</span></span>
                    <span class="font-bold text-slate-800">Rs. ${fmt(extraKmCharge)}</span>
                </div>
                <div class="flex justify-between items-center p-3.5 border-b border-slate-100">
                    <span class="text-slate-600 font-semibold tracking-wide flex items-center gap-2"><i class="fa-regular fa-clock text-slate-400 w-4"></i> Over Time (OT)</span>
                    <span class="font-bold text-slate-800">Rs. ${fmt(otCharge)}</span>
                </div>
                <div class="flex justify-between items-center p-4 bg-slate-100/50 border-b border-slate-200">
                    <span class="text-slate-800 font-black tracking-wide uppercase">Gross Basic Value</span>
                    <span class="font-black text-slate-900">Rs. ${fmt(grossAmount)}</span>
                </div>
                
                ${positiveFuelAdjustments > 0 ? `
                <div class="flex justify-between items-center p-3.5 border-b border-slate-100">
                    <span class="text-emerald-600 font-semibold tracking-wide flex items-center gap-2"><i class="fa-solid fa-plus text-emerald-500 w-4"></i> Fuel Addition (Adjs.)</span>
                    <span class="font-bold text-emerald-700">+ Rs. ${fmt(positiveFuelAdjustments)}</span>
                </div>
                <div class="flex justify-between items-center p-4 bg-slate-100/50 border-b border-slate-200">
                    <span class="text-slate-800 font-black tracking-wide uppercase">Sub Total</span>
                    <span class="font-black text-slate-900">Rs. ${fmt(subTotalAfterAdditions)}</span>
                </div>
                ` : ''}

                ${negativeFuelAdjustments < 0 ? `
                <div class="flex justify-between items-center p-3.5 border-b border-rose-100 bg-rose-50/30">
                    <span class="text-rose-600 font-semibold tracking-wide flex items-center gap-2"><i class="fa-solid fa-minus text-rose-500 w-4"></i> Fuel Deduction (Adjs.)</span>
                    <span class="font-bold text-rose-700">(Rs. ${fmt(Math.abs(negativeFuelAdjustments))})</span>
                </div>
                ` : ''}
                
                ${(positiveFuelAdjustments === 0 && negativeFuelAdjustments === 0) ? `
                <div class="flex justify-between items-center p-3.5 border-b border-slate-200">
                    <span class="text-slate-500 font-semibold tracking-wide flex items-center gap-2"><i class="fa-solid fa-gas-pump text-slate-400 w-4"></i> Fuel Adjustment</span>
                    <span class="font-bold text-slate-600">Rs. 0.00</span>
                </div>
                ` : ''}
            </div>

            <div class="mt-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div class="flex items-center gap-4">
                    <div id="totalSummaryIcon" class="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${theme.totalIcon}">
                        <i class="fa-solid fa-sack-dollar text-2xl drop-shadow-sm"></i>
                    </div>
                    <div>
                        <p class="text-slate-500 text-xs flex items-center font-bold tracking-[0.2em] mb-0.5">NET TOTAL BILL</p>
                        <div class="flex items-baseline gap-1.5">
                            <span class="text-base font-bold text-slate-700">Rs.</span>
                            <span class="text-4xl font-black text-slate-900 tracking-tight drop-shadow-sm">${fmt(netTotal)}</span>
                        </div>
                    </div>
                </div>
                ${isAdminMode ? `
                <button id="saveCalculationBtn" onclick="generatePDF()"
                    class="${theme.btnBg} border border-white/20 text-white font-bold py-3.5 px-8 rounded-xl transition-all shadow-xl shadow-brand-500/20 whitespace-nowrap text-sm flex items-center gap-2 justify-center hover:scale-105 active:scale-95">
                    <i class="fa-solid fa-file-pdf"></i> Generate PDF
                </button>
                ` : `
                <div class="bg-slate-100 text-slate-400 font-bold py-3 px-6 rounded-xl text-[11px] flex items-center gap-2 justify-center border border-slate-200">
                    <i class="fa-solid fa-lock"></i> Ext. Locked
                </div>
                `}
            </div>
        </div>
    `;
}

function generatePDF() {
    if (!activeVehicle || !dateRanges.length) {
        Swal.fire('Error', 'No data to generate PDF', 'error');
        return;
    }
    
    Swal.fire({
        title: 'Generating Invoice PDF...',
        text: 'Preparing formal document...',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
            
            document.getElementById('invGeneratedDate').innerText = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
            document.getElementById('invPlateNo').innerText = activeVehicle.plateNo || 'N/A';
            document.getElementById('invFuelType').innerText = getFuelDisplayInfo(activeVehicle.fuelType);
            
            document.getElementById('invOwnerName').innerText = activeVehicle.ownerName || 'N/A';
            document.getElementById('invContact').innerText = activeVehicle.contactNumber || 'N/A';

            document.getElementById('invContractNo').innerText = activeVehicle.contractNo || 'N/A';
            document.getElementById('invApprovedKm').innerText = fmt(activeVehicle.approvedKm);
            
            document.getElementById('invBasePrice').innerText = fmt(activeVehicle.basePrice);
            document.getElementById('invExtraKmRate').innerText = fmt(activeVehicle.extraKmRate);
            document.getElementById('invOtRate').innerText = fmt(activeVehicle.otRate);

            document.getElementById('invFixedPrice').innerText = fmt(activeVehicle.fixedPrice);
            document.getElementById('invFuelEff').innerText = activeVehicle.fuelEfficiency;
            document.getElementById('invPeriod').innerText = (document.getElementById('calcStartDate').value || 'N/A') + " to " + (document.getElementById('calcEndDate').value || 'N/A');
            
            let totalKm = dateRanges.reduce((sum, seg) => sum + (seg.km || 0), 0);
            let otHours = parseFloat(document.getElementById('calcOTHours').value) || 0;
            let extraKm = Math.max(0, totalKm - (activeVehicle.baseKm || 0));

            document.getElementById('invTotalKm').innerText = fmt(totalKm);
            document.getElementById('invBaseKm').innerText = fmt(activeVehicle.baseKm || 0);
            document.getElementById('invExcessKm').innerText = fmt(extraKm);
            document.getElementById('invOtHours').innerText = otHours;

            const tbody = document.getElementById('invRangesBody');
            tbody.innerHTML = '';
            
            let positiveFuelAdjustments = 0;
            let negativeFuelAdjustments = 0;
            
            dateRanges.forEach((range, idx) => {
                let actualPrice = getPriceForDate(range.start, activeVehicle.fuelType);
                let diffPerLtr = (actualPrice > 0 && activeVehicle.fixedPrice > 0) ? (actualPrice - activeVehicle.fixedPrice) : 0;
                let ratePerKm = (activeVehicle.fuelEfficiency > 0) ? (diffPerLtr / activeVehicle.fuelEfficiency) : 0;
                let rangeAdj = 0;
                let isCalculated = true;
                
                if (Math.abs(diffPerLtr) < 3) {
                    isCalculated = false;
                } else {
                    rangeAdj = ratePerKm * range.km;
                }
                
                if (rangeAdj > 0) positiveFuelAdjustments += rangeAdj;
                else if (rangeAdj < 0) negativeFuelAdjustments += rangeAdj;
                
                let diffPrefix = diffPerLtr > 0 ? '+' : '';
                let adjPrefix = rangeAdj > 0 ? '+' : '';
                
                tbody.innerHTML += `
                    <tr class="border-b border-gray-300 last:border-0 hover:bg-gray-50 transition-colors">
                        <td class="p-3 font-semibold text-black tracking-wide border-r-2 border-gray-300">${range.start} <i class="fa-solid fa-arrow-right mx-1 text-gray-400"></i> ${range.end}</td>
                        <td class="p-3 text-center font-black text-black border-r-2 border-gray-300">${fmt(range.km)}</td>
                        <td class="p-3 text-right font-bold text-gray-800 border-r-2 border-gray-300">${(ratePerKm > 0 ? '+' : '')}${fmt(ratePerKm)}</td>
                        <td class="p-3 text-right font-bold text-gray-700 border-r-2 border-gray-300">Rs. ${fmt(actualPrice)}</td>
                        <td class="p-3 text-right font-bold text-gray-700 border-r-2 border-gray-300">${diffPrefix}${fmt(diffPerLtr)}</td>
                        <td class="p-3 text-right font-black ${!isCalculated ? 'text-gray-400 italic text-[10px]' : 'text-black bg-gray-100 font-mono'}">${isCalculated ? (adjPrefix + fmt(rangeAdj)) : 'Not Calculated'}</td>
                    </tr>
                `;
            });

            let baseRental = activeVehicle.basePrice || 0;
            let extraKmCharge = extraKm * (activeVehicle.extraKmRate || 0);
            let otCharge = otHours * (activeVehicle.otRate || 0);
            
            let grossAmount = baseRental + extraKmCharge + otCharge;
            let subTotalAfterAdditions = grossAmount + positiveFuelAdjustments;
            let netTotal = subTotalAfterAdditions + negativeFuelAdjustments;
            
            let sumContent = `
                <table class="w-full text-right border-collapse">
                    <tbody>
                        <tr>
                            <td class="pt-2 pb-2 text-[10px] font-bold text-gray-600 uppercase tracking-widest text-left">Base Rental</td>
                            <td class="pt-2 pb-2 text-sm font-black text-black">Rs. ${fmt(baseRental)}</td>
                        </tr>
                        <tr>
                            <td class="pt-2 pb-2 text-[10px] font-bold text-gray-600 uppercase tracking-widest text-left">Excess Km <span class="text-gray-400 font-normal">(${fmt(extraKm)} Km)</span></td>
                            <td class="pt-2 pb-2 text-sm font-black text-black">Rs. ${fmt(extraKmCharge)}</td>
                        </tr>
                        <tr>
                            <td class="pt-2 pb-3 text-[10px] font-bold text-gray-600 uppercase tracking-widest text-left border-b border-gray-300">Over Time</td>
                            <td class="pt-2 pb-3 text-sm font-black text-black border-b border-gray-300">Rs. ${fmt(otCharge)}</td>
                        </tr>
                        <tr>
                            <td class="pt-4 pb-4 text-[11px] font-black text-black uppercase tracking-widest text-left border-b-2 border-black">Gross Basic Value</td>
                            <td class="pt-4 pb-4 text-[15px] font-black text-black border-b-2 border-black">Rs. ${fmt(grossAmount)}</td>
                        </tr>
            `;

            if (positiveFuelAdjustments > 0) sumContent += `
                        <tr>
                            <td class="pt-4 pb-2 text-[10px] font-bold text-black uppercase tracking-widest text-left">+ Fuel Addition</td>
                            <td class="pt-4 pb-2 text-sm font-black text-black">+ Rs. ${fmt(positiveFuelAdjustments)}</td>
                        </tr>
            `;
            if (negativeFuelAdjustments < 0) sumContent += `
                        <tr>
                            <td class="pt-4 pb-2 text-[10px] font-bold text-black uppercase tracking-widest text-left">- Fuel Deduction</td>
                            <td class="pt-4 pb-2 text-sm font-black text-black">(Rs. ${fmt(Math.abs(negativeFuelAdjustments))})</td>
                        </tr>
            `;
            if (positiveFuelAdjustments === 0 && negativeFuelAdjustments === 0) sumContent += `
                        <tr>
                            <td class="pt-4 pb-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-left">Fuel Adjustment</td>
                            <td class="pt-4 pb-2 text-sm font-bold text-gray-500">Rs. 0.00</td>
                        </tr>
            `;
            
            sumContent += `
                    </tbody>
                </table>
            `;
            
            document.getElementById('invSummaryContent').innerHTML = sumContent;
            document.getElementById('invNetTotal').innerText = fmt(netTotal);

            const element = document.getElementById('invoiceTemplate');
            
            const container = document.getElementById('invoiceTemplateContainer');
            container.classList.remove('-left-[9999px]', 'pointer-events-none');
            // Element MUST be completely free to grow to natural height for correct canvas capture!
            element.style.height = 'auto'; 
            
            container.style.position = 'absolute';
            container.style.left = '0';
            container.style.top = '0';
            container.style.zIndex = '-9999';

            html2canvas(element, { scale: 2, useCORS: true, scrollY: 0 }).then(async canvas => {
                try {
                    const imgData = canvas.toDataURL('image/jpeg', 0.98);
                    const { jsPDF } = window.jspdf;
                    const pdf = new jsPDF('p', 'pt', 'a4');
                    
                    const pdfWidth = pdf.internal.pageSize.getWidth();
                    const pdfHeight = pdf.internal.pageSize.getHeight();
                    
                    let imgWidth = pdfWidth;
                    let imgHeight = (canvas.height * pdfWidth) / canvas.width;
                    
                    if (imgHeight > pdfHeight) {
                        imgHeight = pdfHeight;
                        imgWidth = (canvas.width * pdfHeight) / canvas.height;
                    }
                    
                    const xOffset = (pdfWidth - imgWidth) / 2;
                    pdf.addImage(imgData, 'JPEG', xOffset, 0, imgWidth, imgHeight);
                    
                    // Generate specialized Filename based on contract logic
                    let contractPart = (activeVehicle.contractNo || "General").replace(/[^a-zA-Z0-9-]/g, '_');
                    let rawD = new Date();
                    let datePart = `${rawD.getFullYear()}${String(rawD.getMonth()+1).padStart(2,'0')}${String(rawD.getDate()).padStart(2,'0')}_${rawD.getTime()}`;
                    let fileName = `NWSDB - O & M - ${contractPart}_${datePart}.pdf`;
                    
                    // Always download locally for the Admin doing the entry
                    pdf.save(fileName);
                    
                    // If App Script is configured, Upload to Google Drive directly via base64 encoded PDF
                    if (APP_SCRIPT_URL && APP_SCRIPT_URL.trim() !== '') {
                        Swal.fire({ title: 'Uploading to Cloud...', html: 'Syncing encrypted PDF stream to Google Drive Central DB.', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});
                        
                        // Convert PDF to base64
                        let pdfBase64 = pdf.output('datauristring').split(',')[1];
                        
                        let payload = {
                            action: 'saveInvoice',
                            plateNo: activeVehicle.plateNo,
                            contractNo: activeVehicle.contractNo || 'N/A',
                            period: document.getElementById('invPeriod').innerText,
                            netTotal: document.getElementById('invNetTotal').innerText,
                            filename: fileName,
                            pdfBase64: pdfBase64
                        };
                        
                        try {
                            // We use no-cors POST if it's restricted, but to read JSON back we need standard CORS enabled on AppScript
                            const postRes = await fetch(APP_SCRIPT_URL, {
                                method: 'POST',
                                body: JSON.stringify(payload)
                            });
                            const returnData = await postRes.json();
                            console.log("PDF Uploaded to Drive:", returnData.url);
                        } catch(e) {
                            console.log("PDF upload encountered an issue, or CORS blocked response. Checking silently...", e);
                        }
                    }
                    
                    Swal.fire({ icon: 'success', title: 'Generation Complete', text: `Invoice saved locally and enqueued to cloud.`, confirmButtonColor: '#10b981', timer: 3000 });
                    
                    // Reload the invoice history
                    setTimeout(fetchInvoiceHistory, 2000);
                    
                } catch(e) {
                    console.error("PDF Generate error", e);
                    Swal.fire('Error', 'Failed to render PDF Document', 'error');
                } finally {
                    container.style = '';
                    element.style.height = ''; 
                    container.classList.add('-left-[9999px]', 'pointer-events-none');
                }
            }).catch(err => {
                console.error("Canvas error", err);
                Swal.fire('Error', 'Failed to generate PDF canvas layer', 'error');
                container.style = '';
                element.style.height = '';
                container.classList.add('-left-[9999px]', 'pointer-events-none');
            });
        }
    });
}

// Fetch invoice history specifically for the chosen activeVehicle
async function fetchInvoiceHistory() {
    const listEl = document.getElementById('invoiceHistoryList');
    if (!activeVehicle || !APP_SCRIPT_URL || APP_SCRIPT_URL.trim() === '') {
        listEl.innerHTML = `<div class="text-[10px] text-slate-400 font-bold text-center py-4 bg-slate-50 rounded-lg border border-dashed border-slate-200">Cloud API strictly required to retrieve historic generated invoices.</div>`;
        return;
    }
    
    listEl.innerHTML = `<div class="p-3 text-center text-xs font-bold text-brand-500 animate-pulse"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Fetching records from Drive...</div>`;
    
    try {
        const response = await fetch(`${APP_SCRIPT_URL}?action=getInvoices&plateNo=${encodeURIComponent(activeVehicle.plateNo)}`);
        if(response.ok) {
            const data = await response.json();
            if (data.length === 0) {
                 listEl.innerHTML = `<div class="text-[10px] text-slate-400 font-bold text-center py-4 bg-slate-50 rounded-lg border border-dashed border-slate-200">No previous invoices bound to this vehicle.</div>`;
                 return;
            }
            
            listEl.innerHTML = '';
            // Display latest first
            data.reverse().forEach(inv => {
                listEl.innerHTML += `
                    <div class="bg-slate-50 hover:bg-slate-100 border border-slate-100 p-2.5 rounded-lg flex items-center justify-between transition-colors shadow-sm group">
                        <div class="flex items-center gap-3 w-3/4">
                            <div class="bg-white border border-slate-200 text-slate-400 w-8 h-8 flex items-center justify-center rounded shadow-sm flex-shrink-0 group-hover:text-red-500 transition-colors">
                                <i class="fa-solid fa-file-pdf"></i>
                            </div>
                            <div class="w-full">
                                <p class="text-[10px] font-black text-slate-700 truncate block leading-tight" title="${inv.Filename}">${inv.Filename}</p>
                                <div class="flex gap-2 text-[9px] text-slate-500 font-bold mt-0.5">
                                    <span><i class="fa-regular fa-calendar mr-0.5"></i> ${inv.Period}</span>
                                    <span class="text-brand-600">Rs. ${inv.NetTotal}</span>
                                </div>
                            </div>
                        </div>
                        <a href="${inv.FileURL}" target="_blank" class="bg-brand-50 text-brand-600 border border-brand-200 px-3 py-1.5 rounded text-[10px] font-black uppercase hover:bg-brand-500 hover:text-white transition-all shadow-sm">View</a>
                    </div>
                `;
            });
        }
    } catch(err) {
        listEl.innerHTML = `<div class="text-[10px] text-rose-500 font-bold text-center py-4 bg-rose-50 rounded-lg border border-dashed border-rose-200">Failed to sync secure connection with Cloud Storage.</div>`;
    }
}

window.onload = () => { 
    initDateRangePicker();
    fetchLiveFuelData(); 
    loadVehicles(); 
};
document.getElementById('refreshPricesBtn').addEventListener('click', fetchLiveFuelData);
