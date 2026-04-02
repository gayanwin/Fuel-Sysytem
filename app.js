/**
 * Fuel Price Adjustment System - Gayan Special Edition
 * Centered Tabs | Correct Naming | Working Refresh
 */

const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRFBYTixlf9JHq7oc523FFnWAB4NnGWkAu5Sy6ZNmdr_rHJHPZz7_mJf-XGgW8aT_yIj3Xv4wCnSTsQ/pub?output=csv';

const db = new Dexie('FuelSystemDB');
db.version(1).stores({ vehicles: '++id, plateNo, fixedPrice' });

let allFuelHistory = [];
let selectedFuelType = 'lp92'; 

// 1. දත්ත අලුත් කිරීමේ ෆන්ක්ෂන් එක (Refresh)
async function fetchLiveFuelData() {
    const statusEl = document.getElementById('systemStatus');
    const lockScreen = document.getElementById('offlineLock');
    const refreshBtn = document.getElementById('refreshBtn');

    if(refreshBtn) refreshBtn.style.opacity = "0.5"; // Click කළාම පොඩ්ඩක් පේන්න

    try {
        const cacheBuster = new Date().getTime();
        const response = await fetch(`${SHEET_CSV_URL}&t=${cacheBuster}`);
        const csvData = await response.text();
        const rows = csvData.split('\n').map(row => row.split(','));
        
        const latest = rows[1];
        if (latest) {
            // උඩ තියෙන Widgets Update කිරීම
            if(document.getElementById('price_lp92')) document.getElementById('price_lp92').innerText = latest[1];
            if(document.getElementById('price_lp95')) document.getElementById('price_lp95').innerText = latest[2];
            if(document.getElementById('price_lad')) document.getElementById('price_lad').innerText = latest[3];
            if(document.getElementById('price_lsd')) document.getElementById('price_lsd').innerText = latest[4];
        }

        allFuelHistory = rows.slice(1).map(row => ({
            date: row[0] ? row[0].trim() : "",
            lp92: parseFloat(row[1]) || 0,
            lp95: parseFloat(row[2]) || 0,
            lad: parseFloat(row[3]) || 0,
            lsd: parseFloat(row[4]) || 0
        })).filter(item => item.date !== "");

        updateLivePricesUI();
        
        if (statusEl) statusEl.innerHTML = '<span class="text-green-500 font-black">● LIVE SYNC</span>';
        if (lockScreen) lockScreen.classList.add('hidden');

    } catch (e) {
        console.error("Fetch Error:", e);
        if (statusEl) statusEl.innerHTML = '<span class="text-red-500 font-bold text-[10px]">SYNC ERROR</span>';
    } finally {
        if(refreshBtn) refreshBtn.style.opacity = "1";
    }
}

// Global refresh function (HTML එකෙන් direct කෝල් කරන්න පුළුවන්)
window.refreshData = function() {
    fetchLiveFuelData();
};

function setFuelTab(type) {
    selectedFuelType = type;
    updateLivePricesUI();
}

// 2. UI එක සැකසීම (Tabs සහ List එක)
function updateLivePricesUI() {
    const list = document.getElementById('priceHistoryList');
    if (!list) return;

    const fuelConfig = {
        'lp92': { name: 'LP - 92', color: 'blue' },
        'lp95': { name: 'LP - 95', color: 'red' },
        'lad': { name: 'LAD', color: 'emerald' },
        'lsd': { name: 'LSD', color: 'orange' }
    };

    const current = fuelConfig[selectedFuelType];

    // Tabs - මෙතන justify-center දාලා තියෙන්නේ මැදට වෙන්න
    let tabsHTML = `
        <div class="flex justify-center gap-2 mb-5 flex-wrap">
            ${Object.keys(fuelConfig).map(key => `
                <button onclick="setFuelTab('${key}')" 
                    class="px-3 py-1.5 rounded-lg text-[10px] font-black transition-all border-2
                    ${selectedFuelType === key 
                        ? `bg-${fuelConfig[key].color}-600 border-${fuelConfig[key].color}-600 text-white shadow-md` 
                        : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}">
                    ${fuelConfig[key].name}
                </button>
            `).join('')}
        </div>
    `;

    // ඉතිහාසය පේළි 6
    let rowsHTML = allFuelHistory.slice(0, 6).map(entry => `
        <div class="flex items-center justify-between p-3 mb-2 rounded-xl border border-slate-100 bg-white shadow-sm">
            <div class="flex flex-col text-left">
                <span class="text-[8px] font-black text-slate-400 uppercase">${entry.date}</span>
                <span class="text-[11px] font-extrabold text-slate-700">${current.name}</span>
            </div>
            <div class="bg-${current.color}-50 px-3 py-1 rounded-lg">
                <span class="text-sm font-black text-${current.color}-600 font-mono">Rs. ${entry[selectedFuelType]}</span>
            </div>
        </div>
    `).join('');

    list.innerHTML = tabsHTML + rowsHTML;
}

// --- වාහන සහ ගණනය කිරීම් (UI එකට හානියක් නැත) ---

async function loadVehicles() {
    const vehicles = await db.vehicles.toArray();
    const list = document.getElementById('vehicleList');
    if (!list) return;
    list.innerHTML = vehicles.length ? '' : '<p class="text-xs text-center text-slate-400 py-4 italic">No vehicles added.</p>';
    vehicles.forEach(v => {
        const isActive = (selectedVehicle?.id === v.id);
        list.innerHTML += `
            <div onclick="selectVehicle(${v.id})" class="p-3 mb-2 rounded-xl border-2 transition-all cursor-pointer ${isActive ? 'border-blue-500 bg-blue-50' : 'border-slate-100 bg-white shadow-sm'}">
                <div class="flex justify-between items-center text-left">
                    <span class="text-sm font-black text-slate-800 uppercase tracking-tighter">${v.plateNo}</span>
                    <span class="text-[10px] font-bold px-2 py-0.5 bg-slate-50 text-slate-500 rounded border border-slate-100">Rs. ${v.fixedPrice}</span>
                </div>
            </div>`;
    });
}

async function selectVehicle(id) {
    selectedVehicle = await db.vehicles.get(id);
    document.getElementById('activeVehicleLabel').innerText = selectedVehicle.plateNo;
    document.getElementById('calcVehicleNo').innerText = selectedVehicle.plateNo;
    document.getElementById('calcFixedPrice').innerText = selectedVehicle.fixedPrice;
    document.getElementById('noVehicleWarning').classList.add('hidden');
    document.getElementById('calculatorPanel').classList.remove('hidden');
    loadVehicles(); clearAllRanges(); addDateRangeRow();
}

window.saveVehicle = async function() {
    const plate = document.getElementById('vehPlateInput').value.trim();
    const price = parseFloat(document.getElementById('vehFixedPriceInput').value);
    if (plate && !isNaN(price)) {
        await db.vehicles.add({ plateNo: plate.toUpperCase(), fixedPrice: price });
        document.getElementById('vehicleModal').classList.add('hidden');
        loadVehicles();
        document.getElementById('vehPlateInput').value = '';
        document.getElementById('vehFixedPriceInput').value = '';
    }
};

function addDateRangeRow() {
    rangesCount++;
    const container = document.getElementById('dateRangesContainer');
    const rowHTML = `
        <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200 mb-3 text-left">
            <div class="grid grid-cols-2 gap-3 mb-3">
                <div class="flex flex-col text-left">
                    <label class="text-[10px] font-black text-slate-400 uppercase mb-1">Fueling Date</label>
                    <input type="text" id="start_date_${rangesCount}" class="w-full border-0 bg-white p-2.5 rounded-xl text-xs font-bold shadow-sm" placeholder="Pick Date">
                </div>
                <div class="flex flex-col text-right">
                    <label class="text-[10px] font-black text-slate-400 uppercase mb-1">Liters</label>
                    <input type="number" id="liters_${rangesCount}" step="0.01" class="w-full border-0 bg-white p-2.5 rounded-xl text-xs font-bold text-right shadow-sm" oninput="calculateTotalAdjustment()">
                </div>
            </div>
            <div class="flex justify-between items-center border-t border-slate-200 pt-2">
                <span id="priceInfo_${rangesCount}" class="text-[10px] font-bold text-slate-500 italic">...</span>
                <span class="text-[10px] font-bold text-slate-400 uppercase">Subtotal: <span id="subtotal_${rangesCount}" class="text-xs text-blue-600 font-black font-mono">0.00</span></span>
            </div>
        </div>`;
    container.insertAdjacentHTML('beforeend', rowHTML);
    flatpickr(`#start_date_${rangesCount}`, { dateFormat: "Y-m-d", maxDate: "today", onChange: calculateTotalAdjustment });
}

function calculateTotalAdjustment() {
    if (!selectedVehicle) return;
    let grandTotal = 0;
    for (let i = 1; i <= rangesCount; i++) {
        const dVal = document.getElementById(`start_date_${i}`)?.value;
        const lVal = parseFloat(document.getElementById(`liters_${i}`)?.value) || 0;
        if (dVal && lVal > 0) {
            const entry = allFuelHistory.find(p => p.date <= dVal) || allFuelHistory[allFuelHistory.length - 1];
            const diff = entry.lp92 - selectedVehicle.fixedPrice;
            const sub = diff * lVal;
            document.getElementById(`priceInfo_${i}`).innerText = `Market Price (92): Rs. ${entry.lp92}`;
            document.getElementById(`subtotal_${i}`).innerText = sub.toLocaleString(undefined, {minimumFractionDigits: 2});
            grandTotal += sub;
        }
    }
    document.getElementById('totalAdjustmentValue').innerText = grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2});
}

function clearAllRanges() { 
    document.getElementById('dateRangesContainer').innerHTML = ''; 
    rangesCount = 0; 
    document.getElementById('totalAdjustmentValue').innerText = '0.00'; 
}

// ආරම්භය
window.onload = () => {
    fetchLiveFuelData();
    loadVehicles();
    
    const refreshBtn = document.getElementById('refreshBtn');
    if(refreshBtn) {
        refreshBtn.addEventListener('click', (e) => {
            e.preventDefault();
            fetchLiveFuelData();
        });
    }

    if(document.getElementById('addRangeBtn')) document.getElementById('addRangeBtn').addEventListener('click', addDateRangeRow);
    if(document.getElementById('clearAllRangesBtn')) document.getElementById('clearAllRangesBtn').addEventListener('click', clearAllRanges);
};

window.setFuelTab = setFuelTab;