const db = new Dexie('FuelSystemDB');
db.version(5).stores({
    vehicles: '++id, plateNo, fixedPrice, fuelType, baseKm, basePrice, extraKmRate, otRate, fuelEfficiency, ownerName, contactNumber, address, approvedKm',
    calculations: '++id, vehicleId, adjustment, createdAt'
});

let livePrices = []; 
let currentPricesObj = { lp92: 0, lp95: 0, lad: 0, lsd: 0 };
let allHistoricalData = [];

async function fetchLiveFuelData() {
    const statusEl = document.getElementById('systemStatus');
    showLockScreen("Fetching Data", "Connecting...", true);

    
    // මේ ලින්ක් එකයි හරිම ක්‍රමයයි. මේකෙන් Cache වෙන්නෙත් නෑ, Proxy ලෙඩ එන්නෙත් නෑ.
    const sheetUrl = `https://docs.google.com/spreadsheets/d/1jAn5mIjtawXGqfRxzISZjMkxLxgv3KlbtYS5JZuVDq0/export?format=csv&gid=0&t=${new Date().getTime()}`;
    
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
        statusEl.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-600 text-xs font-semibold border border-emerald-200 transition-colors duration-300';
        statusEl.innerHTML = '<i class="fa-solid fa-check-circle"></i><span>Online</span>';
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
            document.getElementById('vehApprovedKmInput').value = veh.approvedKm !== undefined ? veh.approvedKm : 2000;
            document.getElementById('vehBaseKmInput').value = veh.baseKm !== undefined ? veh.baseKm : 1500;
            document.getElementById('vehBasePriceInput').value = veh.basePrice || '';
            document.getElementById('vehExtraKmRateInput').value = veh.extraKmRate || '';
            document.getElementById('vehOtRateInput').value = veh.otRate || '';
            document.getElementById('vehKmPerLtrInput').value = veh.fuelEfficiency || '';
        } else {
            document.getElementById('vehModalTitle').innerText = 'Add New Vehicle';
            document.getElementById('vehIdInput').value = '';
            ['vehPlateInput', 'vehFixedPriceInput', 'vehBasePriceInput', 'vehExtraKmRateInput', 'vehOtRateInput', 'vehKmPerLtrInput', 'vehOwnerNameInput', 'vehContactInput', 'vehAddressInput'].forEach(id => {
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
        
        const inputsToClear = ['vehPlateInput', 'vehFixedPriceInput', 'vehBasePriceInput', 'vehExtraKmRateInput', 'vehOtRateInput', 'vehKmPerLtrInput', 'vehOwnerNameInput', 'vehContactInput', 'vehAddressInput', 'vehApprovedKmInput'];
        inputsToClear.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.value = '';
        });
        document.getElementById('vehBaseKmInput').value = '1500';
        
        document.getElementById('vehError').classList.add('hidden');
    }, 300);
}



// GitHub Remote Database Configuration
const GITHUB_VEHICLES_URL = ""; // Paste your raw GitHub JSON URL here, e.g., "https://raw.githubusercontent.com/user/repo/main/vehicles.json"

// Online API Mock - Prepared for Real Backend or GitHub Sync
class OnlineAPI {
    static async saveVehicle(vehicle) {
        // Since GitHub raw URLs are read-only, we save to local DB.
        // To save to GitHub, you would need GitHub REST API with a token.
        await db.vehicles.put(vehicle);
        return new Promise(r => setTimeout(r, 600)); // Simulate delay
    }

    static async getVehicles() {
        // If GitHub URL is provided, try to fetch from it to sync our local Dexie DB
        if (GITHUB_VEHICLES_URL && GITHUB_VEHICLES_URL.trim() !== '') {
            try {
                const response = await fetch(GITHUB_VEHICLES_URL + `?t=${new Date().getTime()}`);
                if (response.ok) {
                    const data = await response.json();
                    if (Array.isArray(data)) {
                        // Clear old and store new from GitHub master branch
                        await db.vehicles.clear();
                        await db.vehicles.bulkPut(data);
                    }
                }
            } catch (e) {
                console.log("Could not fetch from GitHub, falling back to local database", e);
            }
        }
        
        const vehicles = await db.vehicles.toArray();
        return new Promise(r => setTimeout(() => r(vehicles), 400));
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
    Swal.fire({ title: 'Saving to Online DB...', allowOutsideClick: false, showConfirmButton: false });
    Swal.showLoading();
    
    let vehicleToSave = { plateNo, fixedPrice, fuelType, baseKm, basePrice, extraKmRate, otRate, fuelEfficiency, ownerName, contactNumber, address, approvedKm };
    if (id) {
        vehicleToSave.id = isNaN(parseInt(id)) ? id : parseInt(id); // handle integer dexie IDs
    }
    await OnlineAPI.saveVehicle(vehicleToSave);
    
    Swal.fire({ icon: 'success', title: 'Saved successfully!', text: 'Vehicle stored optimally.', timer: 1500, showConfirmButton: false, toast: true, position: 'top-end' });
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
        Swal.fire({ icon: 'success', title: 'Deleted', timer: 1500, showConfirmButton: false, toast: true, position: 'top-end' });
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
    
    // Populate info widget
    const vInfo = document.getElementById('selectedVehicleInfo');
    if (vInfo) {
        vInfo.innerHTML = `
            <div class="flex flex-col gap-4 w-full animate__animated animate__fadeIn mt-2">
                <div class="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl shadow-xl border border-slate-700 overflow-hidden relative text-white">
                    <div class="absolute right-0 bottom-0 opacity-10 pointer-events-none transform translate-x-1/4 translate-y-1/4">
                        <i class="fa-solid fa-car text-[150px]"></i>
                    </div>
                    
                    <div class="p-5 md:p-6 relative z-10 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
                        <div>
                            <p class="text-[10px] font-bold text-brand-400 uppercase tracking-widest mb-1 shadow-sm">Selected Vehicle</p>
                            <h4 class="text-3xl font-black tracking-tight uppercase flex flex-wrap items-center gap-3">
                                ${activeVehicle.plateNo} 
                                <span class="bg-brand-500/20 text-brand-300 text-xs px-3 py-1 rounded-full border border-brand-500/30 backdrop-blur-sm shadow-inner">${getFuelDisplayInfo(activeVehicle.fuelType)}</span>
                            </h4>
                        </div>
                        
                        <div class="w-full xl:w-auto bg-white/5 rounded-xl p-4 border border-white/10 backdrop-blur-sm shadow-inner">
                            <div class="flex flex-col md:flex-row gap-4 xl:gap-8 mb-3">
                                <div class="flex flex-col">
                                    <span class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Owner Name</span>
                                    <span class="text-sm font-semibold truncate max-w-[200px]"><i class="fa-solid fa-user-tie text-brand-400 mr-1.5"></i> ${activeVehicle.ownerName || 'N/A'}</span>
                                </div>
                                <div class="flex flex-col">
                                    <span class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Contact No</span>
                                    <span class="text-sm font-semibold"><i class="fa-solid fa-phone text-brand-400 mr-1.5"></i> ${activeVehicle.contactNumber || 'N/A'}</span>
                                </div>
                            </div>
                            <div class="flex flex-col pt-3 border-t border-white/10">
                                <span class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Registered Address</span>
                                <span class="text-sm font-semibold break-words"><i class="fa-solid fa-map-location-dot text-brand-400 mr-1.5"></i> ${activeVehicle.address || 'N/A'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 text-center">
                    <div class="p-3 bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col justify-center items-center transform hover:-translate-y-1 transition-all duration-300 group">
                        <p class="text-[9px] font-bold text-slate-400 uppercase mb-1 tracking-widest group-hover:text-brand-500 transition-colors">Fuel</p>
                        <p class="text-sm font-black text-slate-700">${getFuelDisplayInfo(activeVehicle.fuelType)}</p>
                    </div>
                    <div class="p-3 bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col justify-center items-center transform hover:-translate-y-1 transition-all duration-300 group">
                        <p class="text-[9px] font-bold text-slate-400 uppercase mb-1 tracking-widest group-hover:text-brand-500 transition-colors">Fixed Price</p>
                        <p class="text-sm font-black text-slate-700">Rs. ${fmt(activeVehicle.fixedPrice)}</p>
                    </div>
                    <div class="p-3 bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col justify-center items-center transform hover:-translate-y-1 transition-all duration-300 group">
                        <p class="text-[9px] font-bold text-slate-400 uppercase mb-1 tracking-widest group-hover:text-brand-500 transition-colors">Efficiency</p>
                        <p class="text-sm font-black text-slate-700">${activeVehicle.fuelEfficiency} Km/L</p>
                    </div>
                    <div class="p-3 bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col justify-center items-center transform hover:-translate-y-1 transition-all duration-300 group">
                        <p class="text-[9px] font-bold text-slate-400 uppercase mb-1 tracking-widest group-hover:text-brand-500 transition-colors">Base Rent</p>
                        <p class="text-sm font-black text-slate-700">Rs. ${fmt(activeVehicle.basePrice)}</p>
                    </div>
                </div>
            </div>
        `;
        vInfo.classList.remove('hidden');
    }
    
    document.getElementById('calculatorPanel').classList.remove('hidden');
    document.getElementById('noVehicleWarning').classList.add('hidden');
    
    document.getElementById('btnEditVehicle').classList.remove('hidden');
    
    document.getElementById('calcStartDate').disabled = false;
    document.getElementById('calcEndDate').disabled = false;
    
    if(pickerStart) pickerStart.clear();
    if(pickerEnd) pickerEnd.clear();
    
    dateRanges = [];
    renderDateRanges();
}

function getPriceForDate(dateStr, fuelType) {
    if(!allHistoricalData.length) return 0;
    const entry = allHistoricalData.find(r => r.date <= dateStr);
    return entry ? (entry[fuelType] || 0) : (allHistoricalData[allHistoricalData.length-1][fuelType] || 0);
}

let pickerStart = null;
let pickerEnd = null;

function getFuelDisplayInfo(type) {
    const map = {
        'p92': 'LP - 92',
        'p95': 'LP - 95',
        'lad': 'LAD',
        'lsd': 'LSD'
    };
    return map[type] || type.toUpperCase();
}

function initDateRangePicker() {
    const config = {
        dateFormat: "Y.m.d",
        onChange: function() {
            let sDate = document.getElementById('calcStartDate').value;
            let eDate = document.getElementById('calcEndDate').value;
            if (sDate && eDate && activeVehicle) {
                let startDate = new Date(sDate.replace(/\./g, '-'));
                let endDate = new Date(eDate.replace(/\./g, '-'));
                if(endDate < startDate) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Invalid Range',
                        text: 'End Date cannot be earlier than Start Date.',
                        customClass: { popup: 'rounded-xl' }
                    });
                    return;
                }
                calculateSplits(startDate, endDate);
            } else {
                dateRanges = [];
                renderDateRanges();
            }
        }
    };
    pickerStart = flatpickr("#calcStartDate", config);
    pickerEnd = flatpickr("#calcEndDate", config);
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

    if (splitRanges.length > 1) {
        Swal.fire({
            icon: 'success',
            title: 'Auto Split Triggered',
            text: 'System detected price revisions inside your date range and split it instantly.',
            timer: 3500,
            showConfirmButton: false,
            toast: true,
            position: 'top-end',
            customClass: { popup: 'rounded-xl' }
        });
    }

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
                        <p class="text-sm font-bold text-slate-700">${diffPrefix}${fmt(diffPerLtr)}</p>
                    </div>
                    <div class="pl-3 md:pl-0 border-l-2 md:border-l-0 border-brand-200 relative group">
                        <p class="text-[10px] font-bold text-brand-500 uppercase tracking-wider mb-0.5">Seg. Km</p>
                        <p class="text-sm font-black text-brand-700 tracking-tight text-left md:text-center mt-1" id="segKmOut_${idx}">${fmt(range.km || 0)}</p>
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

// UpdateSegmentKm removed since calculation is automatic

function updateCalculations() {
    const billSummaryContainer = document.getElementById('billSummaryContainer');
    const waitContainer = document.getElementById('calculationWaitContainer');
    const resultsContainer = document.getElementById('calculationResultsContainer');

    if(!activeVehicle) return;

    let calcRunEl = document.getElementById('calcRunKm');
    let totalKm = parseFloat(calcRunEl.value) || 0;
    
    // Safety lock against Approved Contract Km
    if (activeVehicle.approvedKm > 0 && totalKm > activeVehicle.approvedKm) {
        Swal.fire({
            icon: 'warning',
            title: 'Safety Lock Triggered',
            text: `Allocated distance cannot exceed Contract Approved Limit (${activeVehicle.approvedKm} Km)`,
            toast: true,
            position: 'top-end',
            timer: 3000,
            showConfirmButton: false,
            customClass: { popup: 'rounded-xl' }
        });
        totalKm = activeVehicle.approvedKm;
        calcRunEl.value = totalKm;
    }

    if (dateRanges.length === 0) {
        if(waitContainer) waitContainer.classList.remove('hidden');
        if(resultsContainer) resultsContainer.classList.add('hidden');
        return; 
    } else {
        if(waitContainer) waitContainer.classList.add('hidden');
        if(resultsContainer) resultsContainer.classList.remove('hidden');
    }

    // Auto calculate segment KMs automatically internally without showing to user
    if (totalKm > 0) {
        let totalDays = 0;
        dateRanges.forEach(seg => {
            let s = new Date(seg.start.replace(/\./g, '-'));
            let e = new Date(seg.end.replace(/\./g, '-'));
            let days = Math.round((e - s) / (1000 * 3600 * 24)) + 1;
            seg.days = days;
            totalDays += days;
        });

        let remainingKm = totalKm;
        dateRanges.forEach((seg, idx) => {
            if (idx === dateRanges.length - 1) {
                seg.km = remainingKm;
            } else {
                let share = Math.round((seg.days / totalDays) * totalKm * 100) / 100;
                seg.km = share;
                remainingKm -= share;
                remainingKm = Math.round(remainingKm * 100) / 100;
            }
            let uiKm = document.getElementById(`segKmOut_${idx}`);
            if (uiKm) uiKm.innerText = fmt(seg.km);
        });
    } else {
        dateRanges.forEach((seg, idx) => {
            seg.km = 0;
            let uiKm = document.getElementById(`segKmOut_${idx}`);
            if (uiKm) uiKm.innerText = '0.00';
        });
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
                <button id="saveCalculationBtn" onclick="generatePDF()"
                    class="${theme.btnBg} border border-white/20 text-white font-bold py-3.5 px-8 rounded-xl transition-all shadow-xl shadow-brand-500/20 whitespace-nowrap text-sm flex items-center gap-2 justify-center hover:scale-105 active:scale-95">
                    <i class="fa-solid fa-file-pdf"></i> Generate PDF
                </button>
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
            document.getElementById('invOwnerName').innerText = activeVehicle.ownerName || 'N/A';
            document.getElementById('invContact').innerText = activeVehicle.contactNumber || 'N/A';
            document.getElementById('invAddress').innerText = activeVehicle.address || 'N/A';
            document.getElementById('invFuelType').innerText = getFuelDisplayInfo(activeVehicle.fuelType);
            document.getElementById('invFixedPrice').innerText = fmt(activeVehicle.fixedPrice);
            document.getElementById('invFuelEff').innerText = activeVehicle.fuelEfficiency;
            document.getElementById('invPeriod').innerText = (document.getElementById('calcStartDate').value || 'N/A') + " to " + (document.getElementById('calcEndDate').value || 'N/A');
            
            let totalKm = parseFloat(document.getElementById('calcRunKm').value) || 0;
            let otHours = parseFloat(document.getElementById('calcOTHours').value) || 0;
            document.getElementById('invTotalKm').innerText = fmt(totalKm);
            document.getElementById('invBaseKm').innerText = fmt(activeVehicle.baseKm || 0);
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
                    <tr class="border-b border-slate-100 last:border-0">
                        <td class="p-3 font-mono text-slate-600">${range.start} <i class="fa-solid fa-arrow-right mx-1 text-slate-300"></i> ${range.end}</td>
                        <td class="p-3 text-center font-bold text-slate-700">${fmt(range.km)}</td>
                        <td class="p-3 text-center font-bold text-slate-700">${(ratePerKm > 0 ? '+' : '')}${fmt(ratePerKm)}</td>
                        <td class="p-3 text-right font-semibold text-slate-600">Rs. ${fmt(actualPrice)}</td>
                        <td class="p-3 text-right font-semibold text-slate-600">${diffPrefix}${fmt(diffPerLtr)}</td>
                        <td class="p-3 text-right font-black ${!isCalculated ? 'text-slate-300 text-xs' : 'text-slate-800'}">${isCalculated ? (adjPrefix + fmt(rangeAdj)) : 'Not Calculated'}</td>
                    </tr>
                `;
            });

            let baseRental = activeVehicle.basePrice || 0;
            let extraKm = Math.max(0, totalKm - (activeVehicle.baseKm || 0));
            let extraKmCharge = extraKm * (activeVehicle.extraKmRate || 0);
            let otCharge = otHours * (activeVehicle.otRate || 0);
            
            let grossAmount = baseRental + extraKmCharge + otCharge;
            let subTotalAfterAdditions = grossAmount + positiveFuelAdjustments;
            let netTotal = subTotalAfterAdditions + negativeFuelAdjustments;
            
            let sumContent = '';
            sumContent += `
                <div class="flex justify-between items-center pb-2 border-b border-slate-200/60">
                    <span class="font-semibold text-slate-500">Base Rental</span>
                    <span class="font-bold text-slate-700">Rs. ${fmt(baseRental)}</span>
                </div>
                <div class="flex justify-between items-center pb-2 border-b border-slate-200/60">
                    <span class="font-semibold text-slate-500">Excess Km Charge <span class="text-[10px] text-slate-400 font-bold ml-1">(${fmt(extraKm)} Km)</span></span>
                    <span class="font-bold text-slate-700">Rs. ${fmt(extraKmCharge)}</span>
                </div>
                <div class="flex justify-between items-center pb-2 border-b border-slate-200/60">
                    <span class="font-semibold text-slate-500">Over Time (OT)</span>
                    <span class="font-bold text-slate-700">Rs. ${fmt(otCharge)}</span>
                </div>
                <div class="flex justify-between items-center pb-2 border-b-2 border-slate-200">
                    <span class="font-black uppercase tracking-widest text-xs text-slate-800">Gross Basic Value</span>
                    <span class="font-black text-slate-800">Rs. ${fmt(grossAmount)}</span>
                </div>
            `;
            
            if (positiveFuelAdjustments > 0) sumContent += `
                <div class="flex justify-between items-center pt-1 pb-2 border-b border-slate-200/60">
                    <span class="font-semibold text-emerald-600">+ Fuel Addition (Adjs.)</span>
                    <span class="font-bold text-emerald-700">+ Rs. ${fmt(positiveFuelAdjustments)}</span>
                </div>
            `;
            if (negativeFuelAdjustments < 0) sumContent += `
                <div class="flex justify-between items-center pt-1 pb-2 border-b border-slate-200/60">
                    <span class="font-semibold text-rose-600">- Fuel Deduction (Adjs.)</span>
                    <span class="font-bold text-rose-700">(Rs. ${fmt(Math.abs(negativeFuelAdjustments))})</span>
                </div>
            `;
            if (positiveFuelAdjustments === 0 && negativeFuelAdjustments === 0) sumContent += `
                <div class="flex justify-between items-center pt-1 pb-2 border-b border-slate-200/60">
                    <span class="font-semibold text-slate-400">Fuel Adjustment</span>
                    <span class="font-bold text-slate-400">Rs. 0.00</span>
                </div>
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

            html2canvas(element, { scale: 2, useCORS: true, scrollY: 0 }).then(canvas => {
                try {
                    const imgData = canvas.toDataURL('image/jpeg', 0.98);
                    const { jsPDF } = window.jspdf;
                    const pdf = new jsPDF('p', 'pt', 'a4');
                    
                    const pdfWidth = pdf.internal.pageSize.getWidth();
                    const pdfHeight = pdf.internal.pageSize.getHeight();
                    
                    let imgWidth = pdfWidth;
                    let imgHeight = (canvas.height * pdfWidth) / canvas.width;
                    
                    // Force scale down so it NEVER goes to page 2 !
                    if (imgHeight > pdfHeight) {
                        imgHeight = pdfHeight;
                        imgWidth = (canvas.width * pdfHeight) / canvas.height;
                    }
                    
                    const xOffset = (pdfWidth - imgWidth) / 2;
                    pdf.addImage(imgData, 'JPEG', xOffset, 0, imgWidth, imgHeight);
                    pdf.save(`Fuel_Bill_${activeVehicle.plateNo}_${new Date().toISOString().split('T')[0]}.pdf`);
                    
                    Swal.close();
                } catch(e) {
                    Swal.fire('Error', 'Failed to render PDF Document', 'error');
                } finally {
                    container.style = '';
                    element.style.height = ''; 
                    container.classList.add('-left-[9999px]', 'pointer-events-none');
                }
            }).catch(err => {
                Swal.fire('Error', 'Failed to generate PDF canvas layer', 'error');
                container.style = '';
                element.style.height = '';
                container.classList.add('-left-[9999px]', 'pointer-events-none');
            });
        }
    });
}

window.onload = () => { 
    initDateRangePicker();
    fetchLiveFuelData(); 
    loadVehicles(); 
};
document.getElementById('refreshPricesBtn').addEventListener('click', fetchLiveFuelData);
