/**
 * Fuel Price System - Final Fix
 * Corrects Tab Names and Dynamic Heading
 */

const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRFBYTixlf9JHq7oc523FFnWAB4NnGWkAu5Sy6ZNmdr_rHJHPZz7_mJf-XGgW8aT_yIj3Xv4wCnSTsQ/pub?output=csv';

const db = new Dexie('FuelSystemDB');
db.version(1).stores({ vehicles: '++id, plateNo, fixedPrice' });

let allFuelHistory = [];
let selectedFuelType = 'lp92'; 
let selectedVehicle = null;
let rangesCount = 0;

// 1. Fetch Live Data
async function fetchLiveFuelData() {
    const statusEl = document.getElementById('systemStatus');
    const refreshBtn = document.getElementById('refreshBtn');

    if(refreshBtn) refreshBtn.querySelector('i').classList.add('fa-spin');

    try {
        const cacheBuster = new Date().getTime();
        const response = await fetch(`${SHEET_CSV_URL}&t=${cacheBuster}`);
        const csvData = await response.text();
        const rows = csvData.split('\n').map(row => row.split(','));
        
        const latest = rows[1];
        if (latest) {
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
        if (statusEl) statusEl.innerHTML = '<span class="text-green-500 font-black">● LIVE SYNC ACTIVE</span>';

    } catch (e) {
        console.error("Fetch Error:", e);
        if (statusEl) statusEl.innerHTML = '<span class="text-red-500 font-black">OFFLINE</span>';
    } finally {
        if(refreshBtn) refreshBtn.querySelector('i').classList.remove('fa-spin');
    }
}

// 2. Update History UI & Handle Name Changes
window.setFuelTab = function(type) {
    selectedFuelType = type;
    updateLivePricesUI();
};

function updateLivePricesUI() {
    const list = document.getElementById('priceHistoryList');
    const tabsContainer = document.getElementById('fuelTabs');
    const titleEl = document.getElementById('fuelTitle');

    if (!list || !tabsContainer) return;

    const fuelConfig = {
        'lp92': { name: 'LP-92', title: '92 Octane', color: 'blue' },
        'lp95': { name: 'LP-95', title: '95 Octane', color: 'red' },
        'lad': { name: 'LAD', title: 'Auto Diesel', color: 'green' },
        'lsd': { name: 'LSD', title: 'Super Diesel', color: 'orange' }
    };

    const current = fuelConfig[selectedFuelType];

    // මෙන්න මෙතනින් තමයි උඹ කියපු නම වෙනස් වෙන්නේ
    if (titleEl) titleEl.innerText = `Live ${current.title} Prices`;

    // Tabs
    tabsContainer.innerHTML = Object.keys(fuelConfig).map(key => `
        <button onclick="setFuelTab('${key}')" 
            class="px-3 py-1.5 text-[10px] font-black rounded-lg transition-all border
            ${selectedFuelType === key 
                ? 'bg-gray-800 border-gray-800 text-white' 
                : 'bg-white border-gray-200 text-gray-400'}">
            ${fuelConfig[key].name}
        </button>
    `).join('');

    // History List (Show 6 rows)
    list.innerHTML = allFuelHistory.slice(0, 6).map(entry => `
        <div class="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-xl shadow-sm">
            <div class="flex flex-col">
                <span class="text-[8px] font-black text-gray-400 uppercase tracking-tighter">${entry.date}</span>
                <span class="text-[11px] font-black text-gray-700">${current.name}</span>
            </div>
            <div class="font-mono font-black text-sm text-gray-900">Rs. ${entry[selectedFuelType]}</div>
        </div>
    `).join('');
}

// 3. Vehicles
async function loadVehicles() {
    const vehicles = await db.vehicles.toArray();
    const list = document.getElementById('vehicleList');
    if (!list) return;
    list.innerHTML = vehicles.length ? '' : '<p class="text-[10px] text-center text-gray-400 py-4 italic">No vehicles added.</p>';
    vehicles.forEach(v => {
        const isActive = (selectedVehicle?.id === v.id);
        list.innerHTML += `
            <div onclick="selectVehicle(${v.id})" class="p-3 rounded-xl border-2 transition-all cursor-pointer ${isActive ? 'border-blue-500 bg-blue-50' : 'border-gray-50 bg-gray-50'}">
                <div class="flex justify-between items-center">
                    <span class="text-xs font-black text-gray-800 uppercase">${v.plateNo}</span>
                    <span class="text-[10px] font-bold text-gray-500">Fixed: Rs. ${v.fixedPrice}</span>
                </div>
            </div>`;
    });
}

async function selectVehicle(id) {
    selectedVehicle = await db.vehicles.get(id);
    document.getElementById('activeVehicleLabel').innerText = selectedVehicle.plateNo;
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

// 4. Calculator
function addDateRangeRow() {
    rangesCount++;
    const container = document.getElementById('dateRangesContainer');
    const rowHTML = `
        <div class="bg-gray-50 p-4 rounded-xl border border-gray-100 mb-2">
            <div class="grid grid-cols-2 gap-2 mb-2">
                <input type="text" id="start_date_${rangesCount}" class="bg-white p-2 rounded-lg text-xs font-bold border-0 shadow-sm" placeholder="Pick Date">
                <input type="number" id="liters_${rangesCount}" step="0.01" class="bg-white p-2 rounded-lg text-xs font-bold text-right border-0 shadow-sm" placeholder="Liters" oninput="calculateTotalAdjustment()">
            </div>
            <div class="flex justify-between items-center text-[9px] font-black text-gray-400">
                <span id="priceInfo_${rangesCount}">---</span>
                <span class="uppercase">Subtotal: Rs. <span id="subtotal_${rangesCount}" class="text-blue-600 font-mono">0.00</span></span>
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
            document.getElementById(`subtotal_${i}`).innerText = sub.toFixed(2);
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

// Init
window.onload = () => {
    fetchLiveFuelData();
    loadVehicles();
    
    document.getElementById('refreshBtn').onclick = (e) => {
        e.preventDefault();
        fetchLiveFuelData();
    };

    document.getElementById('addRangeBtn').addEventListener('click', addDateRangeRow);
    document.getElementById('clearAllRangesBtn').addEventListener('click', clearAllRanges);
};
