/**
 * Fuel Price Adjustment System - Final Pro Version
 * Developed for Gayan Chinthaka
 */

const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRFBYTixlf9JHq7oc523FFnWAB4NnGWkAu5Sy6ZNmdr_rHJHPZz7_mJf-XGgW8aT_yIj3Xv4wCnSTsQ/pub?output=csv';

const db = new Dexie('FuelSystemDB');
db.version(1).stores({ vehicles: '++id, plateNo, fixedPrice' });

let allFuelHistory = [];
let selectedFuelType = 'lp92'; 
let selectedVehicle = null;
let rangesCount = 0;

// 1. Data Fetching (Google Sheets)
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
        if (statusEl) statusEl.innerHTML = '<span class="text-red-500 font-bold">SYNC ERROR</span>';
    } finally {
        if(refreshBtn) refreshBtn.querySelector('i').classList.remove('fa-spin');
    }
}

// Tab Change
function setFuelTab(type) {
    selectedFuelType = type;
    updateLivePricesUI();
}

// 2. UI Rendering (History & Tabs)
function updateLivePricesUI() {
    const list = document.getElementById('priceHistoryList');
    const titleEl = document.getElementById('fuelTitle');
    if (!list) return;

    const fuelConfig = {
        'lp92': { name: 'LP - 92', title: '92 Octane', color: 'blue' },
        'lp95': { name: 'LP - 95', title: '95 Octane', color: 'red' },
        'lad': { name: 'LAD', title: 'Auto Diesel', color: 'emerald' },
        'lsd': { name: 'LSD', title: 'Super Diesel', color: 'orange' }
    };

    const current = fuelConfig[selectedFuelType];

    // Update Title
    if (titleEl) titleEl.innerText = `Live ${current.title} Prices`;

    // Render Tabs (Centered)
    let tabsHTML = `
        <div class="flex justify-center gap-2 mb-6 flex-wrap">
            ${Object.keys(fuelConfig).map(key => `
                <button onclick="setFuelTab('${key}')" 
                    class="px-3 py-2 rounded-xl text-[10px] font-black transition-all border-2
                    ${selectedFuelType === key 
                        ? `bg-${fuelConfig[key].color}-600 border-${fuelConfig[key].color}-600 text-white shadow-lg` 
                        : 'bg-white border-slate-100 text-slate-400' }">
                    ${fuelConfig[key].name}
                </button>
            `).join('')}
        </div>
    `;

    // Render 6 Rows of History
    let rowsHTML = allFuelHistory.slice(0, 6).map(entry => `
        <div class="flex items-center justify-between p-3 mb-2 rounded-xl border border-slate-50 bg-white shadow-sm animate-fade-in">
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

// 3. Vehicle Management
async function loadVehicles() {
    const vehicles = await db.vehicles.toArray();
    const list = document.getElementById('vehicleList');
    if (!list) return;
    list.innerHTML = vehicles.length ? '' : '<p class="text-xs text-center text-slate-400 py-8 italic bg-white rounded-[2rem] border border-dashed border-slate-200">No vehicles added yet.</p>';
    vehicles.forEach(v => {
        const isActive = (selectedVehicle?.id === v.id);
        list.innerHTML += `
            <div onclick="selectVehicle(${v.id})" class="p-4 mb-2 rounded-[1.5rem] border-2 transition-all cursor-pointer ${isActive ? 'border-blue-500 bg-blue-50' : 'border-white bg-white shadow-sm'}">
                <div class="flex justify-between items-center">
                    <span class="text-sm font-black text-slate-800 uppercase tracking-tighter">${v.plateNo}</span>
                    <span class="text-[10px] font-bold px-3 py-1 bg-slate-100 text-slate-500 rounded-lg">Fixed: Rs. ${v.fixedPrice}</span>
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

// 4. Calculator Logic
function addDateRangeRow() {
    rangesCount++;
    const container = document.getElementById('dateRangesContainer');
    const rowHTML = `
        <div class="bg-white p-5 rounded-[2rem] border border-slate-100 mb-3 shadow-sm animate-fade-in">
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div class="flex flex-col text-left">
                    <label class="text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">Fueling Date</label>
                    <input type="text" id="start_date_${rangesCount}" class="w-full border-0 bg-slate-50 p-3 rounded-xl text-xs font-bold" placeholder="Select Date">
                </div>
                <div class="flex flex-col text-right">
                    <label class="text-[9px] font-black text-slate-400 uppercase mb-1 mr-1">Liters</label>
                    <input type="number" id="liters_${rangesCount}" step="0.01" class="w-full border-0 bg-slate-50 p-3 rounded-xl text-xs font-bold text-right" oninput="calculateTotalAdjustment()">
                </div>
            </div>
            <div class="flex justify-between items-center pt-3 border-t border-slate-50">
                <span id="priceInfo_${rangesCount}" class="text-[10px] font-bold text-slate-400 italic">Market Price: Rs. ---</span>
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Subtotal: <span id="subtotal_${rangesCount}" class="text-xs text-blue-600 font-black ml-1">0.00</span></span>
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
            document.getElementById(`priceInfo_${i}`).innerText = `Price (92): Rs. ${entry.lp92}`;
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

// Initialize
window.onload = () => {
    fetchLiveFuelData();
    loadVehicles();
    
    document.getElementById('refreshBtn').addEventListener('click', (e) => {
        e.preventDefault();
        fetchLiveFuelData();
    });

    document.getElementById('addRangeBtn').addEventListener('click', addDateRangeRow);
    document.getElementById('clearAllRangesBtn').addEventListener('click', clearAllRanges);
};

window.setFuelTab = setFuelTab;
