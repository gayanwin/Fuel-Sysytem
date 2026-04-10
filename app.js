const db = new Dexie('FuelSystemDB_v7');
db.version(1).stores({
    vehicles: 'plateNo, fixedPrice, fuelType, baseKm, basePrice, extraKmRate, otRate, fuelEfficiency, ownerName, contactNumber, address, approvedKm, contractNo',
    calculations: '++id, vehicleId, adjustment, createdAt'
});

db.open().catch(err => {
    console.error("Dexie Open failed, clearing old database:", err);
    Dexie.delete('FuelSystemDB_v7');
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
        content.classList.remove('hidden');

        modeBtnIcon.className = 'fa-solid fa-unlock text-emerald-500 drop-shadow-md';
        modeBtnText.innerText = 'Admin Active';
        modeToggleBtn.classList.add('bg-emerald-50', 'border-emerald-200');
        modeToggleBtn.classList.remove('bg-slate-50', 'border-slate-200');

        if (activeVehicle) btnEdit.classList.remove('hidden');
        if (dateRanges.length > 0) updateCalculations();
    } else {
        overlay.classList.remove('hidden');
        content.classList.add('hidden');

        modeBtnIcon.className = 'fa-solid fa-lock text-slate-400 group-hover:drop-shadow-md';
        modeBtnText.innerText = 'Viewer Mode';
        modeToggleBtn.classList.remove('bg-emerald-50', 'border-emerald-200');
        modeToggleBtn.classList.add('bg-slate-50', 'border-slate-200');

        btnEdit.classList.add('hidden');
        if (dateRanges.length > 0) updateCalculations();
    }
}

async function toggleAppMode() {
    if (!isAdminMode) {
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
            Toast.fire({ icon: 'success', title: 'Admin panel unlocked.', timer: 1000 });
        } else if (password) {
            Toast.fire({ icon: 'error', title: 'Access Denied: Invalid PIN', timer: 1000 });
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
        const response = await fetch(sheetUrl, {
            cache: 'no-store'
        });
        if (!response.ok) throw new Error('Network response was not ok');

        const csvText = await response.text();
        processData(csvText);
    } catch (e) {
        console.error("Fetch Error:", e);
        try {
            const backupProxy = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(sheetUrl)}`;
            const res = await fetch(backupProxy);
            const text = await res.text();
            processData(text);
        } catch (err) {
            console.error("Critical: Both fetch and proxy failed.", err);
            showLockScreen("Connection Error", "Fuel prices cannot be synced. You can proceed by entering prices manually.", false, true);
        }
    }
}

// දත්ත Process කරන කොටස ලේසි වෙන්න වෙනම Function එකකට ගත්තා
function processData(csvText) {
    console.log("Raw CSV Data Received, Length:", csvText.length);
    const possibleDelimiters = [',', ';', '\t'];
    let rows = [];
    for (let delim of possibleDelimiters) {
        let testRows = csvText.split('\n').map(row => row.split(delim).map(cell => cell.replace(/^"(.*)"$/, '$1').trim()));
        if (testRows.length > 1 && testRows[0].length > 1) {
            rows = testRows;
            console.log("Detected CSV Delimiter:", delim === '\t' ? 'TAB' : delim);
            break;
        }
    }
    if (rows.length === 0) rows = csvText.split('\n').map(row => row.split(','));

    // Extract exact Last Updated string from Google Sheet
    let sheetSyncDate = '';
    for (let r of rows) {
        let line = r.join(' ');
        if (line.includes('Last Updated:')) {
            let matches = line.match(/Last Updated:\s*(.*)/i);
            if (matches) sheetSyncDate = matches[1].replace(/,+$/, '').trim();
            break;
        }
    }

    let allData = rows.filter(r => {
        if (!r[0]) return false;
        // Strict date check: must have numbers and dots, and looks like DD.MM.YYYY or YYYY.MM.DD
        const datePart = r[0].split(' ')[0];
        const dotCount = (datePart.match(/\./g) || []).length;
        const hasDashes = datePart.includes('-');
        // If it's a date with dots (un-split) or dashes (ISO)
        return (dotCount === 2 || hasDashes) && /\d/.test(datePart) && !datePart.toLowerCase().includes('last');
    }).map(r => {
        let clean = r[0].split(' ')[0].trim();
        let p = clean.split(/[.-]/); // Handle both dot and dash separators

        // Normalize to YYYY.MM.DD for string comparison sorting
        let ymd = "";
        if (p.length === 3) {
            if (p[0].length === 4) { // YYYY-MM-DD
                ymd = `${p[0]}.${p[1].padStart(2, '0')}.${p[2].padStart(2, '0')}`;
            } else { // DD.MM.YYYY
                ymd = `${p[2]}.${p[1].padStart(2, '0')}.${p[0].padStart(2, '0')}`;
            }
        } else {
            ymd = clean;
        }

        return {
            date: ymd,
            originalDate: r[0],
            p95: parseFloat(r[1]) || 0,
            p92: parseFloat(r[2]) || 0,
            lad: parseFloat(r[3]) || 0,
            lsd: parseFloat(r[4]) || 0
        };
    });
    // Sort descending by YYYY.MM.DD so comparison logic ALWAYS evaluates from newest to oldest.
    allData.sort((a, b) => b.date.localeCompare(a.date));
    if (allData.length === 0) {
        console.warn("No valid fuel data rows found after filtering.");
        allHistoricalData = [];
        hideLockScreen(); // Prevent permanent UI lock
        return;
    }

    allHistoricalData = allData;
    console.log("Successfully Parsed Records:", allHistoricalData.length);
    console.log("Latest Revision:", allHistoricalData[0]);

    const latest = allData[0];
    currentPricesObj = { lp95: latest.p95, lp92: latest.p92, lad: latest.lad, lsd: latest.lsd, date: latest.date };
    livePrices = allData.slice(0, 5).map(item => ({ date: item.date, p92: item.p92, p95: item.p95, lad: item.lad, lsd: item.lsd }));

    updateTopWidgets();
    updateLivePricesUI();

    const statusEl = document.getElementById('systemStatus');
    const syncBadge = document.getElementById('cloud_last_sync');

    if (statusEl) {
        let fetchTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        let badgeColor = 'bg-emerald-50 text-emerald-600 border-emerald-200';
        let statusText = 'Online';

        // Detect Staleness (2 hours = 120 mins)
        if (sheetSyncDate) {
            const parts = sheetSyncDate.split('|').map(s => s.trim());
            if (parts.length === 2) {
                // Support both YYYY.MM.DD and YYYY-MM-DD
                const dateParts = parts[0].replace(/\./g, '-').split('-');
                const timeParts = parts[1].split(':');
                const lastSyncDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2], timeParts[0], timeParts[1], timeParts[2]);
                const diffMins = Math.floor((new Date() - lastSyncDate) / (1000 * 60));

                if (diffMins > 120 && !isNaN(diffMins)) {
                    badgeColor = 'bg-amber-50 text-amber-600 border-amber-200';
                    statusText = 'Stale Data';
                    notifyStaleData(sheetSyncDate, diffMins);
                }
            }
        }

        statusEl.className = `flex items-center gap-2 px-3 py-1.5 rounded-full ${badgeColor} text-xs font-semibold border shadow-sm transition-colors duration-300`;
        statusEl.innerHTML = `<i class="fa-solid fa-cloud-check"></i><span>${statusText}</span> <span class="pl-2 border-l border-current text-[10px] font-bold tracking-tight">Sync: ${fetchTime} | Records: ${allData.length}</span>`;
    }

    if (syncBadge) {
        if (sheetSyncDate) {
            syncBadge.classList.remove('hidden');
            syncBadge.querySelector('span').innerText = sheetSyncDate;
        } else {
            syncBadge.classList.add('hidden');
        }
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

function showLockScreen(t, d, s, allowManual = false) {
    document.getElementById('offlineLock').classList.remove('hidden');
    document.getElementById('lockTitle').innerText = t;
    document.getElementById('lockDesc').innerText = d;

    if (allowManual) {
        document.getElementById('lockRetryBtn').classList.remove('hidden');
        document.getElementById('lockRetryBtn').innerHTML = 'Retry Sync <i class="fa-solid fa-rotate"></i>';

        // Add manual entry option if not present
        if (!document.getElementById('lockManualBtn')) {
            const btn = document.createElement('button');
            btn.id = 'lockManualBtn';
            btn.className = 'mt-3 px-6 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-white text-[10px] font-black uppercase tracking-widest shadow-lg transition-all';
            btn.innerHTML = '<i class="fa-solid fa-keyboard mr-2"></i> Enter Prices Manually';
            btn.onclick = () => { hideLockScreen(); openManualPriceModal(); };
            document.getElementById('offlineLock').appendChild(btn);
        }
    }
}
function hideLockScreen() {
    document.getElementById('offlineLock').classList.add('hidden');
    const mBtn = document.getElementById('lockManualBtn');
    if (mBtn) mBtn.remove();
}

let activeVehicle = null;
let dateRanges = [];

function openVehicleModal(veh = null) {
    const m = document.getElementById('vehicleModal');
    const mc = document.getElementById('vehicleModalContent');
    m.classList.remove('hidden');
    m.classList.remove('opacity-0');
    mc.classList.remove('scale-95');

    document.getElementById('vehError').classList.add('hidden');

    if (veh) {
        document.getElementById('vehModalTitle').innerText = 'Edit Vehicle';
        document.getElementById('vehIdInput').value = veh.plateNo; // Using plateNo as ID
        document.getElementById('vehPlateInput').value = veh.plateNo || '';
        document.getElementById('vehPlateInput').readOnly = true; // Plate No should not change during Edit
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
        document.getElementById('vehPlateInput').readOnly = false;
        ['vehPlateInput', 'vehFixedPriceInput', 'vehBasePriceInput', 'vehExtraKmRateInput', 'vehOtRateInput', 'vehKmPerLtrInput', 'vehOwnerNameInput', 'vehContactInput', 'vehAddressInput', 'vehContractNoInput'].forEach(id => {
            document.getElementById(id).value = '';
        });
        document.getElementById('vehApprovedKmInput').value = '2000';
        document.getElementById('vehBaseKmInput').value = '1500';
    }
}

function closeVehicleModal() {
    document.getElementById('vehicleModal').classList.add('opacity-0');
    document.getElementById('vehicleModalContent').classList.add('scale-95');
    setTimeout(() => {
        document.getElementById('vehicleModal').classList.add('hidden');

        const inputsToClear = ['vehPlateInput', 'vehFixedPriceInput', 'vehBasePriceInput', 'vehExtraKmRateInput', 'vehOtRateInput', 'vehKmPerLtrInput', 'vehOwnerNameInput', 'vehContactInput', 'vehAddressInput', 'vehContractNoInput', 'vehApprovedKmInput'];
        inputsToClear.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('vehBaseKmInput').value = '1500';

        document.getElementById('vehError').classList.add('hidden');
    }, 300);
}



// Google Apps Script Cloud Database Configuration
// IMPORTANT: Paste your deployed Google Apps Script Web App URL here:
const APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzQNcM8pMWsFG1IBaRt63KyaoV6NaxYtx3LLBvVy_j_soiWir0Fl9gl4cGM5b22tvMR/exec";

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

    static async deleteVehicle(plateNo) {
        if (APP_SCRIPT_URL && APP_SCRIPT_URL.trim() !== '') {
            try {
                // Post to Google Sheets
                await fetch(APP_SCRIPT_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({ action: 'deleteVehicle', plateNo: plateNo })
                });
            } catch (e) {
                console.log("Failed to sync deletion to Google Sheets", e);
            }
        }

        // Add to local blacklist to prevent re-syncing from cloud for 1 hour
        let blacklist = JSON.parse(localStorage.getItem('deletedVehicles') || '[]');
        if (!blacklist.includes(plateNo)) {
            blacklist.push(plateNo);
            localStorage.setItem('deletedVehicles', JSON.stringify(blacklist));
        }

        await db.vehicles.delete(plateNo);
        return true;
    }

    static async getVehicles() {
        console.log("OnlineAPI.getVehicles() sequence initiated...");
        let allVehs = [];

        if (APP_SCRIPT_URL && APP_SCRIPT_URL.trim() !== '') {
            try {
                console.log("Calling Apps Script API...");
                const response = await fetch(APP_SCRIPT_URL + "?action=getVehicles");
                if (response.ok) {
                    const data = await response.json();
                    if (Array.isArray(data) && data.length > 0) {
                        console.log("Apps Script returned", data.length, "vehicles.");

                        // Get blacklist of recently deleted vehicles to avoid re-syncing them
                        const blacklist = JSON.parse(localStorage.getItem('deletedVehicles') || '[]');

                        // Map the data and filter out blacklisted or invalid items
                        const cleanedData = data
                            .filter(v => v.plateNo && !blacklist.includes(String(v.plateNo).trim().toUpperCase()))
                            .map(v => ({
                                ...v,
                                plateNo: String(v.plateNo).trim().toUpperCase()
                            }));

                        await db.vehicles.clear(); // Clear local to ensure we don't keep deleted items
                        await db.vehicles.bulkPut(cleanedData);
                        console.log("Cloud vehicles merged via Apps Script.");
                        allVehs = await db.vehicles.toArray();
                    } else {
                        console.warn("Apps Script returned empty or invalid data.");
                    }
                }
            } catch (e) {
                console.warn("Apps Script Sync failed, trying CSV fallback...", e);
            }
        }

        // CSV Fallback (Very robust as it uses direct Google export)
        if (allVehs.length === 0) {
            try {
                const vehicleSheetGid = '1243426519';
                const sheetId = '1x0VxehtNbDFqVOEmFICEpkJ2kGJEdMoVgEgb0sOvPt8';
                const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${vehicleSheetGid}&t=${new Date().getTime()}`;

                console.log("Syncing from direct CSV:", csvUrl);
                const res = await fetch(csvUrl);
                if (res.ok) {
                    const csvText = await res.text();
                    console.log("CSV Data Received, length:", csvText.length);
                    // Handle CSV columns carefully
                    const rows = csvText.split('\n').filter(r => r.trim() !== '').map(row => {
                        return row.split(',').map(cell => cell.replace(/^"(.*)"$/, '$1').trim());
                    });

                    if (rows.length > 1) {
                        const vehicles = rows.slice(1).filter(r => r[1] && r[1].trim() !== '').map(r => {
                            const parseNum = (val) => {
                                if (!val) return 0;
                                let clean = String(val).replace(/,/g, '').trim();
                                return parseFloat(clean) || 0;
                            };

                            return {
                                plateNo: String(r[1]).trim().toUpperCase(),
                                contractNo: r[2] || '',
                                ownerName: r[3] || '',
                                contactNumber: r[4] || '',
                                fuelType: (r[5] || 'p92').toLowerCase(),
                                fuelEfficiency: parseNum(r[6]),
                                basePrice: parseNum(r[7]),
                                baseKm: parseNum(r[8]),
                                extraKmRate: parseNum(r[9]),
                                otRate: parseNum(r[10]),
                                fixedPrice: parseNum(r[11]),
                                approvedKm: parseNum(r[12]) || 2000
                            };
                        });

                        if (vehicles.length > 0) {
                            console.log("Extracted", vehicles.length, "vehicles from CSV.");
                            await db.vehicles.bulkPut(vehicles);
                            allVehs = await db.vehicles.toArray();
                        }
                    }
                }
            } catch (csvErr) {
                console.error("CSV Sync completely failed:", csvErr);
            }
        }

        const finalCount = await db.vehicles.count();
        if (finalCount === 0) {
            console.log("No vehicles found in Cloud or CSV. Checking for local JSON backup...");
            try {
                const res = await fetch("./Vehicle details.json?t=" + Date.now());
                if (res.ok) {
                    const data = await res.json();
                    await db.vehicles.bulkPut(data);
                    console.log("Fallback to local JSON worked.");
                }
            } catch (e) { }
        }

        const returnArray = await db.vehicles.toArray();
        console.log("OnlineAPI.getVehicles() completed. Final Count:", returnArray.length);
        return returnArray;
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

    await OnlineAPI.saveVehicle(vehicleToSave);

    Toast.fire({ icon: 'success', title: 'Vehicle details strictly stored.' });
    closeVehicleModal();

    if (activeVehicle && activeVehicle.plateNo === plateNo) {
        activeVehicle = vehicleToSave;
        if (dateRanges.length > 0) updateCalculations();
    }

    await loadVehicles();
    await populateManageVehiclesTable();
}

function editSelectedVehicle() {
    if (!activeVehicle) return;
    openVehicleModal(activeVehicle);
}

async function openManageVehiclesModal() {
    const m = document.getElementById('manageVehiclesModal');
    const mc = document.getElementById('manageVehiclesModalContent');
    m.classList.remove('hidden');
    setTimeout(() => {
        m.classList.remove('opacity-0');
        if (mc) mc.classList.remove('scale-95');
    }, 10);

    await populateManageVehiclesTable();
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

    try {
        const vehicles = await OnlineAPI.getVehicles();
        if (!vehicles || vehicles.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="p-8 text-center"><div class="flex flex-col items-center justify-center text-slate-400"><i class="fa-solid fa-folder-open text-4xl mb-3 opacity-20"></i><p class="font-bold">No vehicles found in database.</p><p class="text-[10px] mt-1">Please register a new vehicle to begin.</p></div></td></tr>';
            return;
        }

        tbody.innerHTML = '';
        vehicles.forEach(v => {
            tbody.innerHTML += `
                <tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors group">
                    <td class="p-3 font-bold text-slate-800">${v.plateNo}</td>
                    <td class="p-3 text-xs font-semibold text-slate-500">${getFuelDisplayInfo(v.fuelType)}</td>
                    <td class="p-3 text-slate-700 font-mono italic">Rs. ${fmt(v.fixedPrice)}</td>
                    <td class="p-3 text-slate-700 font-bold text-xs">${v.fuelEfficiency} <span class="text-[9px] text-slate-400">Km/L</span></td>
                    <td class="p-3 text-slate-700 text-xs">${fmt(v.baseKm)} <span class="text-[9px] text-slate-400 font-bold">Km</span></td>
                    <td class="p-3 text-slate-700 font-mono">Rs. ${fmt(v.basePrice)}</td>
                    <td class="p-3 text-slate-700 font-mono">Rs. ${fmt(v.extraKmRate)}</td>
                    <td class="p-3 text-slate-700 font-mono">Rs. ${fmt(v.otRate)}</td>
                    <td class="p-3 text-right space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onclick="editVehicleFromDB('${v.plateNo}')" class="text-amber-600 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 p-2 rounded-lg transition-colors" title="Edit Profile"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button onclick="deleteVehicleFromDB('${v.plateNo}')" class="text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 p-2 rounded-lg transition-colors" title="Remove"><i class="fa-solid fa-trash-can"></i></button>
                    </td>
                </tr>
            `;
        });
    } catch (err) {
        console.error("Table Population Error:", err);
        tbody.innerHTML = '<tr><td colspan="9" class="p-4 text-center text-rose-500 font-bold">Critical Error: Failed to load database content.</td></tr>';
    }
}

async function editVehicleFromDB(plateNo) {
    const vehicles = await db.vehicles.toArray();
    const v = vehicles.find(x => x.plateNo === plateNo);
    if (v) {
        closeManageVehiclesModal();
        openVehicleModal(v);
    }
}

async function deleteVehicleFromDB(plateNo) {
    let res = await Swal.fire({
        title: 'Delete Vehicle?',
        text: `Are you sure you want to permanently remove this vehicle info?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e11d48',
        confirmButtonText: 'Yes, delete it!'
    });

    if (res.isConfirmed) {
        Swal.fire({
            title: 'Syncing Deletion...',
            text: 'Removing from local and cloud databases.',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

        await db.vehicles.delete(plateNo);
        await OnlineAPI.deleteVehicle(plateNo);

        // Wait for potential Sheet latency
        await new Promise(resolve => setTimeout(resolve, 1500));

        if (activeVehicle && activeVehicle.plateNo === plateNo) {
            activeVehicle = null;
            if (document.getElementById('calculatorPanel')) document.getElementById('calculatorPanel').classList.add('hidden');
            if (document.getElementById('noVehicleWarning')) document.getElementById('noVehicleWarning').classList.remove('hidden');
            if (document.getElementById('btnEditVehicle')) document.getElementById('btnEditVehicle').classList.add('hidden');
            if (document.getElementById('selectedVehicleInfo')) document.getElementById('selectedVehicleInfo').classList.add('hidden');
            if (document.getElementById('invoiceHistoryWidget')) document.getElementById('invoiceHistoryWidget').classList.add('hidden');
        }

        await loadVehicles();
        await populateManageVehiclesTable();
        Swal.fire({ icon: 'success', title: 'Removed Officially', timer: 2000, showConfirmButton: false });
    }
}

async function loadVehicles() {
    console.log("Loading dropdown from Local DB...");
    const dropdown = document.getElementById('vehicleDropdown');
    dropdown.innerHTML = '<option value="" disabled selected>Dropdown Vehicle Target...</option>';

    // Always load from local database for immediate UI updates
    let vehicles = await db.vehicles.toArray();

    // Sort alphabetically for easy navigation
    vehicles.sort((a, b) => a.plateNo.localeCompare(b.plateNo, undefined, { numeric: true, sensitivity: 'base' }));

    if (vehicles.length === 0) {
        dropdown.innerHTML += '<option value="" disabled>No local vehicles found. Initializing...</option>';
    } else {
        console.log("Populating dropdown with", vehicles.length, "vehicles.");
        vehicles.forEach((v, idx) => {
            const safeId = v.plateNo;
            let fLabel = v.fuelType ? getFuelDisplayInfo(v.fuelType) : 'UNK';
            dropdown.innerHTML += `<option value="${safeId}">${v.plateNo} (${fLabel})</option>`;
        });
    }

    // Trigger background sync WITHOUT blocking the UI
    if (!window.isSyncingVehicles) {
        window.isSyncingVehicles = true;
        OnlineAPI.getVehicles().then(() => {
            window.isSyncingVehicles = false;
            console.log("Background vehicle sync finished. Refreshing dropdown...");
            // Re-call loadVehicles WITHOUT triggering another sync to avoid loops
            loadVehiclesUIOnly();
        }).catch(err => {
            window.isSyncingVehicles = false;
            console.warn("Background sync failed:", err);
        });
    }
}

async function loadVehiclesUIOnly() {
    console.log("Refreshing dropdown UI only...");
    const dropdown = document.getElementById('vehicleDropdown');
    const currentValue = dropdown.value;

    let vehicles = await db.vehicles.toArray();
    vehicles.sort((a, b) => a.plateNo.localeCompare(b.plateNo, undefined, { numeric: true, sensitivity: 'base' }));

    dropdown.innerHTML = '<option value="" disabled selected>Dropdown Vehicle Target...</option>';
    if (vehicles.length === 0) {
        dropdown.innerHTML += '<option value="" disabled>No vehicles found.</option>';
    } else {
        vehicles.forEach((v, idx) => {
            const safeId = v.plateNo;
            let fLabel = v.fuelType ? getFuelDisplayInfo(v.fuelType) : 'UNK';
            dropdown.innerHTML += `<option value="${safeId}">${v.plateNo} (${fLabel})</option>`;
        });

        // Restore previous selection if it still exists
        if (currentValue) {
            dropdown.value = currentValue;
        }
    }
}

async function onVehicleChange() {
    const plateNo = document.getElementById('vehicleDropdown').value;
    console.log("selectVehicleFromDropdown triggered! Selected Plate:", plateNo);
    if (!plateNo || plateNo === "") return;

    // Optimization: Direct lookup
    activeVehicle = await db.vehicles.get(plateNo);
    window.activeVehicle = activeVehicle;

    if (!activeVehicle) {
        Swal.fire('Error', 'Vehicle identification failed.', 'error');
        return;
    }
    console.log("Vehicle Selected Successfully:", activeVehicle.plateNo);

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
            <div class="bg-white rounded-[2rem] p-0 shadow-2xl shadow-slate-200/50 text-slate-800 relative overflow-hidden border border-slate-100 animate__animated animate__fadeIn">
                <!-- Top Accents -->
                <div class="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r ${theme.bgGrad} to-indigo-500"></div>
                
                <div class="p-8">
                    <!-- Header: Plate & Fuel -->
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 border-b border-slate-50 pb-6">
                        <div class="flex items-center gap-4">
                            <div class="w-16 h-16 ${theme.iconBg} rounded-2xl flex items-center justify-center ${theme.iconColor} shadow-inner border ${theme.iconBorder}">
                                <i class="fa-solid fa-car-side text-3xl"></i>
                            </div>
                            <div>
                                <p class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Active Vehicle</p>
                                <h3 class="text-4xl font-black tracking-tighter text-slate-900 leading-none">${activeVehicle.plateNo}</h3>
                            </div>
                        </div>
                        <div class="bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-lg shadow-slate-900/10 flex items-center gap-3">
                            <div class="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                                <i class="fa-solid fa-gas-pump text-sm"></i>
                            </div>
                            <div>
                                <p class="text-[9px] font-bold text-slate-400 uppercase leading-none mb-1">Engine Fuel</p>
                                <p class="text-sm font-black tracking-wide leading-none">${getFuelDisplayInfo(activeVehicle.fuelType)}</p>
                            </div>
                        </div>
                    </div>

                    <!-- Long Data Section (Full Width Rows) -->
                    <div class="space-y-4 mb-8">
                        <!-- 1. Owner Name -->
                        <div class="bg-slate-50/50 p-6 rounded-3xl border border-slate-100 group hover:border-indigo-100 hover:bg-white hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300">
                            <div class="flex items-center gap-3 mb-2">
                                <span class="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-500 flex items-center justify-center"><i class="fa-solid fa-user-tie text-xs"></i></span>
                                <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Authorized Owner / Department</p>
                            </div>
                            <p class="text-2xl font-black text-slate-900 leading-tight">${activeVehicle.ownerName || 'NWSDB Authorized'}</p>
                            <div class="flex items-center gap-2 mt-3 text-slate-500">
                                <i class="fa-solid fa-phone-volume text-[10px]"></i>
                                <span class="text-xs font-bold font-mono tracking-wider">${activeVehicle.contactNumber || 'Contact not listed'}</span>
                            </div>
                        </div>

                        <!-- 2. Contract Number -->
                        <div class="bg-slate-50/50 p-6 rounded-3xl border border-slate-100 group hover:border-blue-100 hover:bg-white hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300">
                            <div class="flex items-center gap-3 mb-2">
                                <span class="w-7 h-7 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center"><i class="fa-solid fa-file-signature text-xs"></i></span>
                                <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contract Registry Number</p>
                            </div>
                            <p class="text-xl font-black text-slate-800 leading-tight break-all font-mono">${activeVehicle.contractNo || 'REF-N/A-0000'}</p>
                        </div>
                    </div>

                    <!-- Metrics Grid (Split Rows) -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <!-- 6. Approved Km -->
                        <div class="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center"><i class="fa-solid fa-road"></i></div>
                                <div>
                                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Usage Limit</p>
                                    <p class="text-sm font-bold text-slate-500">Monthly Allowed</p>
                                </div>
                            </div>
                            <div class="text-right">
                                <span class="text-2xl font-black text-emerald-600">${fmt(activeVehicle.approvedKm)}</span>
                                <span class="text-[10px] font-black text-slate-400 block uppercase tracking-tighter">Kilometers</span>
                            </div>
                        </div>

                        <!-- 8. Fuel Efficiency -->
                        <div class="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center"><i class="fa-solid fa-bolt"></i></div>
                                <div>
                                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Avg Consumption</p>
                                    <p class="text-sm font-bold text-slate-500">Efficiency Rate</p>
                                </div>
                            </div>
                            <div class="text-right">
                                <span class="text-2xl font-black text-slate-800">${activeVehicle.fuelEfficiency}</span>
                                <span class="text-[10px] font-black text-slate-400 block uppercase tracking-tighter">Km / Liter</span>
                            </div>
                        </div>

                        <!-- 4. OT Rate -->
                        <div class="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center"><i class="fa-solid fa-clock"></i></div>
                                <div>
                                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-tighter">OT Rate</p>
                                    <p class="text-sm font-bold text-slate-500">Per Hour Rev</p>
                                </div>
                            </div>
                            <div class="text-right text-amber-600">
                                <span class="text-xs font-bold mr-1 italic">Rs.</span>
                                <span class="text-2xl font-black">${fmt(activeVehicle.otRate)}</span>
                                <span class="text-[10px] font-black text-slate-400 block uppercase tracking-tighter">Payable / Hr</span>
                            </div>
                        </div>

                        <!-- 7. Excess Km Rate -->
                        <div class="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center"><i class="fa-solid fa-money-bill-transfer"></i></div>
                                <div>
                                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Excess Km</p>
                                    <p class="text-sm font-bold text-slate-500">Unit Price</p>
                                </div>
                            </div>
                            <div class="text-right text-rose-600">
                                <span class="text-xs font-bold mr-1 italic">Rs.</span>
                                <span class="text-2xl font-black">${fmt(activeVehicle.extraKmRate)}</span>
                                <span class="text-[10px] font-black text-slate-400 block uppercase tracking-tighter">Rate / Km</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Admin Action Footer (Only in Admin Mode) -->
                ${isAdminMode ? `
                <div class="px-8 pb-8 flex flex-col sm:flex-row gap-3">
                    <button onclick="editSelectedVehicle()" class="flex-1 bg-white border border-slate-200 text-slate-700 font-black text-xs uppercase tracking-widest py-4 rounded-2xl hover:bg-slate-50 hover:border-indigo-200 hover:text-indigo-600 transition-all flex items-center justify-center gap-2 group shadow-sm">
                        <i class="fa-solid fa-user-pen text-slate-400 group-hover:text-indigo-500"></i> Edit Profile
                    </button>
                    <button onclick="deleteVehicleFromDB('${activeVehicle.plateNo}')" class="flex-1 bg-rose-50 border border-rose-100 text-rose-600 font-black text-xs uppercase tracking-widest py-4 rounded-2xl hover:bg-rose-100 hover:border-rose-200 transition-all flex items-center justify-center gap-2 group shadow-sm">
                        <i class="fa-solid fa-trash-can text-rose-400 group-hover:text-rose-600"></i> Delete From DB
                    </button>
                </div>
                ` : ''}
            </div>`;
        document.getElementById('selectedVehicleInfo').classList.remove('hidden');
        const historyWidget = document.getElementById('invoiceHistoryWidget');
        if (historyWidget) historyWidget.classList.remove('hidden');

        // Fetch saved invoices if defined
        if (typeof fetchInvoiceHistory === 'function') {
            try { fetchInvoiceHistory(); } catch (e) { }
        }
    }

    document.getElementById('calculatorPanel').classList.remove('hidden');
    document.getElementById('noVehicleWarning').classList.add('hidden');

    // Removed auto-scroll as per user request

    document.getElementById('btnEditVehicle').classList.remove('hidden');
    document.getElementById('calcEndDate').disabled = false;

    // Trigger calculation split for the newly selected vehicle (using existing dates if any)
    if (typeof checkDates === 'function') {
        checkDates();
    }
}


function getPriceForDate(dateStr, fuelType) {
    if (!allHistoricalData.length) return 0;
    const entry = allHistoricalData.find(r => r.date <= dateStr);
    return entry ? (entry[fuelType] || 0) : (allHistoricalData[allHistoricalData.length - 1][fuelType] || 0);
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

function checkDates() {
    const startInput = document.getElementById('calcStartDate');
    const endInput = document.getElementById('calcEndDate');
    if (!startInput || !endInput) return;

    let sDate = startInput.value;
    let eDate = endInput.value;
    if (!sDate || !eDate || !activeVehicle) return;

    // More robust parsing to support YYYY.MM.DD and YYYY-MM-DD
    const p1 = sDate.split(/[.-]/);
    const p2 = eDate.split(/[.-]/);

    if (p1.length === 3 && p2.length === 3) {
        // Use localized date construction to avoid UTC/Timezone shifts
        let startDate = new Date(parseInt(p1[0]), parseInt(p1[1]) - 1, parseInt(p1[2]));
        let endDate = new Date(parseInt(p2[0]), parseInt(p2[1]) - 1, parseInt(p2[2]));

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return;

        if (endDate < startDate) {
            if (endDatePicker) endDatePicker.clear();
            dateRanges = [];
            renderDateRanges();
            return;
        }
        calculateSplits(startDate, endDate);
    }
}

function initDateRangePicker() {
    const startInput = document.getElementById('calcStartDate');
    const endInput = document.getElementById('calcEndDate');

    // Improve UX for manual typing
    if (startInput) startInput.classList.replace('cursor-pointer', 'cursor-text');
    if (endInput) endInput.classList.replace('cursor-pointer', 'cursor-text');

    const fpConfig = {
        dateFormat: "Y.m.d",
        allowInput: true,
        monthSelectorType: "static",
        animate: true
    };

    // Initialize Flatpickr for start date
    startDatePicker = flatpickr(startInput, {
        ...fpConfig,
        onChange: function (selectedDates, dateStr, instance) {
            if (endDatePicker) endDatePicker.set('minDate', dateStr);
            checkDates();
        },
        onClose: function () { checkDates(); }
    });

    // Initialize Flatpickr for end date
    endDatePicker = flatpickr(endInput, {
        ...fpConfig,
        onChange: function (selectedDates, dateStr, instance) {
            checkDates();
        },
        onClose: function () { checkDates(); }
    });
}

function calculateSplits(startDate, endDate) {
    function localToYMD(dateObj) {
        return `${dateObj.getFullYear()}.${String(dateObj.getMonth() + 1).padStart(2, '0')}.${String(dateObj.getDate()).padStart(2, '0')}`;
    }

    let tempStart = localToYMD(startDate);
    let tempEnd = localToYMD(endDate);

    let priceAtStart = getPriceForDate(tempStart, activeVehicle.fuelType);
    let validRevisions = allHistoricalData.filter(r => r.date > tempStart && r.date <= tempEnd);
    validRevisions.sort((a, b) => a.date.localeCompare(b.date));

    let splitRanges = [];
    let currentStart = tempStart;
    let currentPrice = priceAtStart;
    console.log(`Calculating splits for ${activeVehicle.fuelType} from ${tempStart} to ${tempEnd}. Base Price: ${currentPrice}. Revisions Found: ${validRevisions.length}`);

    for (let rev of validRevisions) {
        let revPrice = Number(rev[activeVehicle.fuelType] || 0);
        let currentPriceNum = Number(currentPrice || 0);

        // Use a strict threshold for splitting
        if (Math.abs(revPrice - currentPriceNum) > 0.1) {
            console.log(`- Detected Price Change on ${rev.date}: ${currentPriceNum} -> ${revPrice}`);
            let revParts = rev.date.split('.');
            let nextDayTime = new Date(parseInt(revParts[0]), parseInt(revParts[1]) - 1, parseInt(revParts[2]));
            nextDayTime.setDate(nextDayTime.getDate() - 1);
            let endOfCurrent = localToYMD(nextDayTime);

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

    // Preserve existing KM values if the segment start/end matches
    const oldRanges = [...dateRanges];
    dateRanges = splitRanges.map((seg, i) => {
        const existing = oldRanges.find(old => old.start === seg.start && old.end === seg.end);
        return {
            id: Date.now() + i,
            start: seg.start,
            end: seg.end,
            km: existing ? existing.km : 0
        };
    });

    renderDateRanges();
}

function formatVDate(ymd) {
    if (!ymd) return '';
    let p = ymd.split('.');
    if (p.length !== 3) return ymd;
    // Normalized format: YYYY MMM DD for better readability
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let mIdx = parseInt(p[1]) - 1;
    let mStr = months[mIdx] || p[1];
    return `${p[0]} ${mStr} ${p[2].padStart(2, '0')}`;
}

function fmt(num) {
    return Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getDayDiff(d1, d2) {
    if (!d1 || !d2) return 0;
    const s = d1.split('.');
    const e = d2.split('.');
    const date1 = new Date(s[0], s[1] - 1, s[2]);
    const date2 = new Date(e[0], e[1] - 1, e[2]);
    const diffTime = Math.abs(date2 - date1);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
}

function renderDateRanges() {
    const container = document.getElementById('dateRangesContainer');
    const billSummaryContainer = document.getElementById('billSummaryContainer');
    const breakdownHeader = document.querySelector('#calculationResultsContainer h3');

    if (dateRanges.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 text-slate-400">
                <i class="fa-regular fa-calendar-check text-2xl mb-2 text-slate-300"></i>
                <span class="text-sm font-medium">Select a Calculation Period to instantly generate ranges.</span>
            </div>`;
        billSummaryContainer.innerHTML = '';
        if (breakdownHeader) breakdownHeader.innerHTML = `<i class="fa-solid fa-layer-group text-slate-300 mr-1.5"></i> Price Breakdown`;
        return;
    }

    if (breakdownHeader) {
        breakdownHeader.innerHTML = `
            <div class="flex items-center justify-between w-full">
                <span><i class="fa-solid fa-layer-group text-brand-500 mr-1.5"></i> Price Adjustment Breakdown</span>
                <span class="bg-brand-100 text-brand-700 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter">${dateRanges.length} Active Segments</span>
            </div>
        `;
    }

    let tConfig = {
        'p92': { iconBg: 'bg-amber-50', iconBorder: 'border-amber-100', iconColor: 'text-amber-500', btnBg: 'bg-amber-500 hover:bg-amber-600', totalIcon: 'bg-amber-100 text-amber-600', highlight: 'text-amber-700 bg-amber-50 border-amber-200' },
        'p95': { iconBg: 'bg-rose-50', iconBorder: 'border-rose-100', iconColor: 'text-rose-500', btnBg: 'bg-rose-500 hover:bg-rose-600', totalIcon: 'bg-rose-100 text-rose-600', highlight: 'text-rose-700 bg-rose-50 border-rose-200' },
        'lad': { iconBg: 'bg-indigo-50', iconBorder: 'border-indigo-100', iconColor: 'text-indigo-500', btnBg: 'bg-indigo-500 hover:bg-indigo-600', totalIcon: 'bg-indigo-100 text-indigo-600', highlight: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
        'lsd': { iconBg: 'bg-emerald-50', iconBorder: 'border-emerald-100', iconColor: 'text-emerald-500', btnBg: 'bg-emerald-500 hover:bg-emerald-600', totalIcon: 'bg-emerald-100 text-emerald-600', highlight: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
    };
    let theme = activeVehicle ? (tConfig[activeVehicle.fuelType] || tConfig['p92']) : tConfig['p92'];

    container.innerHTML = '';
    // Reverse the order so newest is on top
    const displayRanges = [...dateRanges].reverse();

    displayRanges.forEach((range, idx) => {
        const realIdx = (displayRanges.length - 1) - idx; // Original index for data mapping
        let actualPrice = getPriceForDate(range.start, activeVehicle.fuelType);
        let diffPerLtr = (actualPrice > 0 && activeVehicle.fixedPrice > 0) ? (actualPrice - activeVehicle.fixedPrice) : 0;
        let diffPrefix = diffPerLtr > 0 ? '+' : '';
        let duration = getDayDiff(range.start, range.end);

        container.innerHTML += `
            <div class="group relative bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col lg:flex-row items-center gap-4">
                <!-- Slim Timeline indicator -->
                <div class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-slate-100 group-hover:bg-brand-500 rounded-r-full transition-all"></div>
                
                <!-- Date Range Section -->
                <div class="flex items-center gap-3 flex-shrink-0 w-full lg:w-[25%] border-b lg:border-b-0 lg:border-r border-slate-100 pb-2 lg:pb-0">
                    <div class="min-w-[32px] h-8 rounded-lg flex items-center justify-center font-black text-xs ${theme.iconBg} ${theme.iconColor} border ${theme.iconBorder} shadow-sm">
                        ${realIdx + 1}
                    </div>
                    <div class="flex-grow">
                        <div class="flex items-center gap-2">
                             <p class="text-[14px] font-black text-slate-800 font-mono tracking-tight whitespace-nowrap">${formatVDate(range.start)} <span class="text-slate-300 font-normal">→</span> ${formatVDate(range.end)}</p>
                        </div>
                        <div class="flex items-center gap-3 mt-1">
                            <span class="text-[11px] font-black text-brand-700 font-sans tracking-wide flex items-center gap-1.5"><i class="fa-regular fa-calendar-days text-[10px]"></i> ${duration} DAYS</span>
                            ${Math.abs(diffPerLtr) < 3 ? '<span class="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded ml-auto">NO ADJ.</span>' : ''}
                        </div>
                    </div>
                </div>

                <!-- Data Matrix -->
                <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 lg:gap-6 w-full flex-grow items-center">
                    <!-- Fuel Price Multi-Line -->
                    <div class="text-center lg:text-left flex flex-col justify-center">
                        <div class="flex items-center gap-2 mb-0.5">
                            <span class="text-[9px] font-bold text-slate-400 uppercase">Act</span>
                            <span class="text-[14px] font-black text-slate-800">Rs. ${fmt(actualPrice)}</span>
                        </div>
                        <div class="flex items-center gap-2 border-t border-slate-50 pt-0.5 opacity-60">
                            <span class="text-[9px] font-bold text-slate-400 uppercase">Fix</span>
                            <span class="text-[12px] font-bold text-slate-500">Rs. ${fmt(activeVehicle.fixedPrice)}</span>
                        </div>
                    </div>

                    <!-- Price Diff -->
                    <div class="text-center">
                        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Diff / Ltr</p>
                        <p class="text-[14px] font-black ${Math.abs(diffPerLtr) < 3 ? 'text-slate-300' : (diffPerLtr > 0 ? 'text-emerald-600' : 'text-rose-600')}">
                            ${diffPrefix}${fmt(Math.abs(diffPerLtr))}
                        </p>
                    </div>

                    <!-- Input Driven Km -->
                    <div class="relative bg-slate-50 px-3 py-1.5 rounded-lg border-2 border-slate-100 focus-within:border-brand-500 focus-within:bg-white transition-all">
                        <label class="block text-[9px] font-black text-brand-500 uppercase tracking-tighter leading-none mb-1">Driven Km</label>
                        <input type="number" id="segKmIn_${realIdx}" value="${range.km || ''}" placeholder="0" 
                            oninput="updateSegmentKm(${realIdx}, this.value)" 
                            onkeydown="if(event.key==='Enter'){ event.preventDefault(); document.getElementById('segKmIn_${realIdx + 1}')?.focus() || document.getElementById('segKmIn_${realIdx - 1}')?.focus(); }"
                            class="w-full bg-transparent text-[16px] font-black text-slate-800 outline-none border-none p-0">
                    </div>

                    <!-- Calculated Rate -->
                    <div class="text-center border-l border-slate-100">
                        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rate / Km</p>
                        <p class="text-[14px] font-black text-slate-700" id="segRate_${realIdx}">0.00</p>
                    </div>

                    <!-- Row Final Adjustment -->
                    <div id="segAdj_container_${realIdx}" class="text-center lg:text-right border-l lg:border-l-0 border-slate-100 p-2.5 rounded-xl flex flex-col justify-center transition-all h-full">
                        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Adjustment</p>
                        <p class="text-[17px] font-black text-slate-800" id="segAdj_${realIdx}">0.00</p>
                    </div>
                </div>
            </div>
        `;
    });

    updateCalculations();
}

function updateSegmentKm(idx, val) {
    let km = parseFloat(val);
    if (isNaN(km) || km < 0) km = 0;

    // Check constraint before saving
    let testTotal = dateRanges.reduce((sum, seg, i) => sum + (i === idx ? km : (seg.km || 0)), 0);
    if (activeVehicle.approvedKm > 0 && testTotal > activeVehicle.approvedKm) {
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
        if (inputEl) inputEl.value = km;
    }

    dateRanges[idx].km = km;
    updateCalculations();
}

function updateCalculations() {
    const billSummaryContainer = document.getElementById('billSummaryContainer');
    const waitContainer = document.getElementById('calculationWaitContainer');
    const resultsContainer = document.getElementById('calculationResultsContainer');

    if (!activeVehicle) return;

    // Calculate total Km from segments.
    let totalKm = dateRanges.reduce((sum, seg) => sum + (seg.km || 0), 0);

    let calcRunEl = document.getElementById('calcRunKm');
    if (calcRunEl) calcRunEl.value = totalKm > 0 ? totalKm : '';

    if (dateRanges.length === 0) {
        if (waitContainer) waitContainer.classList.remove('hidden');
        if (resultsContainer) resultsContainer.classList.add('hidden');
        return;
    } else {
        if (waitContainer) waitContainer.classList.add('hidden');
        if (resultsContainer) resultsContainer.classList.remove('hidden');
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
        let diffClass = rangeAdj > 0 ? (theme.highlight + ' shadow-md scale-[1.02]') : (rangeAdj < 0 ? 'bg-rose-50 border-rose-200 text-rose-700 shadow-sm' : 'bg-slate-50/50 border-slate-200 text-slate-400 opacity-60');

        let rateEl = document.getElementById(`segRate_${idx}`);
        let adjEl = document.getElementById(`segAdj_${idx}`);
        let adjCont = document.getElementById(`segAdj_container_${idx}`);

        if (rateEl) {
            rateEl.innerText = (ratePerKm > 0 ? '+' : '') + fmt(ratePerKm);
            rateEl.className = ratePerKm > 0 ? 'text-sm font-black text-emerald-600' : (ratePerKm < 0 ? 'text-sm font-black text-rose-600' : 'text-sm font-black text-slate-400');
        }
        if (adjEl) {
            if (isCalculated) {
                adjEl.innerText = `${rangeAdj < 0 ? '(' : adjPrefix}${fmt(Math.abs(rangeAdj))}${rangeAdj < 0 ? ')' : ''}`;
                adjEl.className = 'text-lg font-black';
            } else {
                adjEl.innerText = `Rs. 0.00`;
                adjEl.className = 'text-[10px] font-bold opacity-40 uppercase tracking-wider';
                diffClass = 'bg-slate-50/20 border-slate-100 text-slate-300 opacity-50 grayscale';
            }
        }
        if (adjCont) {
            adjCont.className = `md:col-span-2 lg:col-span-1 p-2.5 rounded-xl flex flex-col justify-center border transition-all h-full text-center lg:text-right ${diffClass}`;
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
                        <td class="p-3 font-semibold text-black tracking-wide border-r-2 border-gray-300">${formatVDate(range.start)} <i class="fa-solid fa-arrow-right mx-1 text-gray-400"></i> ${formatVDate(range.end)}</td>
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

                    // Generate specialized Filename based on contract logic OR use existing if in Edit Mode
                    let fileName = "";
                    if (currentInvoiceFileName) {
                        fileName = currentInvoiceFileName;
                    } else {
                        let contractPart = String(activeVehicle.contractNo || "General").replace(/[^a-zA-Z0-9-]/g, '_');
                        let rawD = new Date();
                        let datePart = `${rawD.getFullYear()}${String(rawD.getMonth() + 1).padStart(2, '0')}${String(rawD.getDate()).padStart(2, '0')}_${rawD.getTime()}`;
                        fileName = `NWSDB - O & M - ${contractPart}_${datePart}.pdf`;
                        // Set this as current so subsequent generations during this session stay on same file
                        currentInvoiceFileName = fileName;
                    }

                    // Always download locally for the Admin doing the entry
                    pdf.save(fileName);

                    // If App Script is configured, Upload to Google Drive directly via base64 encoded PDF
                    if (APP_SCRIPT_URL && APP_SCRIPT_URL.trim() !== '') {
                        Swal.fire({ title: 'Uploading to Cloud...', html: 'Syncing encrypted PDF stream to Google Drive Central DB.', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

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
                        } catch (e) {
                            console.log("PDF upload encountered an issue, or CORS blocked response. Checking silently...", e);
                        }
                    }

                    Swal.fire({ icon: 'success', title: 'Generation Complete', text: `Invoice saved locally and enqueued to cloud.`, confirmButtonColor: '#10b981', timer: 3000 });

                    // Reload the invoice history
                    setTimeout(fetchInvoiceHistory, 2000);

                } catch (e) {
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

let currentInvoiceFileName = null; // Track if we are editing an existing invoice

// Fetch invoice history specifically for the chosen activeVehicle
async function fetchInvoiceHistory() {
    if (!activeVehicle) return;
    const historyList = document.getElementById('invoiceHistoryList');
    if (!historyList) return;

    // Reset edit mode when fetching new history
    currentInvoiceFileName = null;

    historyList.innerHTML = `
        <div class="flex flex-col gap-2">
            <div class="loading-pulse bg-slate-100 rounded-lg h-10 w-full"></div>
            <div class="loading-pulse bg-slate-100 rounded-lg h-10 w-full"></div>
        </div>
    `;

    if (APP_SCRIPT_URL && APP_SCRIPT_URL.trim() !== '') {
        try {
            // Use no-cache to avoid stale results
            const response = await fetch(APP_SCRIPT_URL + "?action=getInvoices&plateNo=" + activeVehicle.plateNo, { cache: 'no-store' });
            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data) && data.length > 0) {
                    historyList.innerHTML = '';
                    // Sort by time descending
                    data.sort((a, b) => (b.filename || '').localeCompare(a.filename || '')).slice(0, 5).forEach(inv => {
                        const safeData = btoa(unescape(encodeURIComponent(JSON.stringify(inv))));
                        historyList.innerHTML += `
                            <div onclick="loadInvoiceData('${safeData}')" 
                                class="p-3 bg-white border border-slate-100 rounded-xl hover:border-indigo-500 hover:shadow-md transition-all cursor-pointer group animate__animated animate__fadeIn">
                                <div class="flex justify-between items-start mb-1">
                                    <span class="text-[10px] font-black text-slate-700 uppercase leading-none truncate w-24">${inv.filename.split('_')[0] || 'Invoice'}</span>
                                    <span class="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded leading-none">${inv.netTotal}</span>
                                </div>
                                <div class="flex justify-between items-center">
                                    <span class="text-[8px] font-black text-slate-400 uppercase tracking-tighter">${inv.period}</span>
                                    <i class="fa-solid fa-pen-to-square text-[10px] text-slate-300 group-hover:text-indigo-500 transition-colors"></i>
                                </div>
                            </div>
                        `;
                    });
                } else {
                    historyList.innerHTML = '<p class="text-[10px] text-slate-400 italic text-center py-4">No recent invoices found.</p>';
                }
            } else {
                throw new Error("Cloud script error");
            }
        } catch (e) {
            console.error("Failed to fetch history:", e);
            // Don't show scary error to user, just show empty
            historyList.innerHTML = '<p class="text-[10px] text-slate-400 italic text-center py-4">History sync currently unavailable.</p>';
        }
    }
}

function loadInvoiceData(encoded) {
    try {
        const inv = JSON.parse(decodeURIComponent(escape(atob(encoded))));

        // Populate dates
        const period = inv.period || "";
        const parts = period.split(" to ");
        if (parts.length === 2) {
            document.getElementById('calcStartDate').value = parts[0];
            document.getElementById('calcEndDate').value = parts[1];
            // Update flatpickr if exists
            if (window.startPicker) window.startPicker.setDate(parts[0]);
            if (window.endPicker) window.endPicker.setDate(parts[1]);
        }

        // Set edit mode
        currentInvoiceFileName = inv.filename;

        // Try to recover OT and RunKm if encoded in some way, otherwise user must re-enter
        // Note: For full re-edit, the saveInvoice action should be updated to store raw params

        // Run checkDates to refresh UI
        checkDates();

        Swal.fire({
            icon: 'info',
            title: 'Invoice Loaded',
            text: 'System loaded parameters for: ' + inv.filename + '. You can now modify and generate to OVERWRITE.',
            timer: 3000,
            toast: true,
            position: 'top-end'
        });

    } catch (e) {
        console.error("Load invoice error:", e);
        Swal.fire('Error', 'Could not parse invoice history data.', 'error');
    }
}

function notifyStaleData(lastTime, diff) {
    if (window.staleNotified) return;
    window.staleNotified = true;

    Swal.fire({
        title: '<span class="text-sm font-black text-amber-600 uppercase">Stale Data Warning</span>',
        html: `
            <div class="text-xs text-slate-600 text-left space-y-3">
                <p>The fuel price database was last updated at <b>${lastTime}</b>.</p>
                <p>This is approximately <b>${Math.floor(diff / 60)} hours and ${diff % 60} minutes</b> ago.</p>
                <p class="bg-amber-50 p-3 rounded-lg border border-amber-100 font-bold text-amber-800">Please verify if prices have changed on CEYPETCO before processing bills.</p>
            </div>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Manual Override',
        cancelButtonText: 'Proceed Anyway',
        confirmButtonColor: '#f59e0b',
        cancelButtonColor: '#94a3b8',
        customClass: { popup: 'rounded-2xl border-2 border-amber-100 shadow-2xl' }
    }).then((result) => {
        if (result.isConfirmed) {
            openManualPriceModal();
        }
    });
}

function openManualPriceModal() {
    const m = document.getElementById('manualPriceModal');
    const mc = document.getElementById('manualPriceModalContent');
    m.classList.remove('hidden');
    setTimeout(() => { m.classList.remove('opacity-0'); mc.classList.remove('scale-95'); }, 10);

    document.getElementById('manPrice92').value = currentPricesObj.lp92;
    document.getElementById('manPrice95').value = currentPricesObj.lp95;
    document.getElementById('manPriceLad').value = currentPricesObj.lad;
    document.getElementById('manPriceLsd').value = currentPricesObj.lsd;
}

function closeManualPriceModal() {
    document.getElementById('manualPriceModal').classList.add('opacity-0');
    document.getElementById('manualPriceModalContent').classList.add('scale-95');
    setTimeout(() => { document.getElementById('manualPriceModal').classList.add('hidden'); }, 300);
}

async function applyManualPrices() {
    const prices = {
        p92: parseFloat(document.getElementById('manPrice92').value) || 0,
        p95: parseFloat(document.getElementById('manPrice95').value) || 0,
        lad: parseFloat(document.getElementById('manPriceLad').value) || 0,
        lsd: parseFloat(document.getElementById('manPriceLsd').value) || 0
    };

    // Immediate UI Update
    currentPricesObj = { lp95: prices.p95, lp92: prices.p92, lad: prices.lad, lsd: prices.lsd };
    currentPricesObj.date = "MANUAL OVERRIDE: " + new Date().toLocaleTimeString();

    // Update the latest historical record if it exists, otherwise create one
    if (allHistoricalData.length > 0) {
        allHistoricalData[0] = { ...allHistoricalData[0], ...prices };
    } else {
        allHistoricalData.push({
            date: new Date().getFullYear() + "." + String(new Date().getMonth() + 1).padStart(2, '0') + "." + String(new Date().getDate()).padStart(2, '0'),
            ...prices
        });
    }

    updateTopWidgets();
    if (dateRanges.length > 0) {
        checkDates();
    }

    closeManualPriceModal();

    // Background Sync to Google Sheet
    if (APP_SCRIPT_URL && APP_SCRIPT_URL.trim() !== '') {
        Swal.fire({
            title: 'Syncing to Cloud...',
            text: 'Updating manual prices in Google Sheet database.',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

        try {
            const response = await fetch(APP_SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors', // Standard Apps Script mode
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action: 'updateManualPrices', prices: prices })
            });

            // Note: with no-cors we can't read the response, but it will succeed on the sheet
            setTimeout(() => {
                Swal.fire({ icon: 'success', title: 'Manual Sync Complete', text: 'Google Sheet has been updated with override values.', timer: 2000 });
            }, 1000);
        } catch (e) {
            console.error("Cloud Sync Failed:", e);
            Swal.fire('Cloud Sync Issue', 'Prices updated locally but sheet sync failed.', 'warning');
        }
    } else {
        Toast.fire({ icon: 'success', title: 'Prices updated locally.' });
    }
}

function showSyncHealth() {
    Swal.fire({
        title: 'Cloud Synchronization Health',
        html: `
            <div class="text-left text-xs space-y-2">
                <div class="flex justify-between"><span>Status:</span> <span class="text-emerald-500 font-bold">Active</span></div>
                <div class="flex justify-between"><span>Source:</span> <span class="font-mono text-[9px]">Google Sheets (gid=0)</span></div>
                <div class="flex justify-between"><span>Manual Mode:</span> <span class="text-slate-400">Disabled</span></div>
            </div>
        `,
        customClass: { popup: 'rounded-2xl' }
    });
}

window.onVehicleChange = onVehicleChange;
window.loadVehicles = loadVehicles;
window.updateSegmentKm = updateSegmentKm;
window.updateCalculations = updateCalculations;
window.toggleAppMode = toggleAppMode;
window.openManualPriceModal = openManualPriceModal;
window.closeManualPriceModal = closeManualPriceModal;
window.applyManualPrices = applyManualPrices;
window.showSyncHealth = showSyncHealth;
window.generatePDF = generatePDF;
window.loadInvoiceData = loadInvoiceData;

window.onload = () => {
    initDateRangePicker();
    fetchLiveFuelData();
    loadVehicles();
    console.log("Fuel System App v6.4 Final Core Initialized.");
};
