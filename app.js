/**
 * Fuel Price Adjustment System - Pro Tabbed Version
 * 6 Rows per Fuel Type | Working Refresh | Clean UI
 */

const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRFBYTixlf9JHq7oc523FFnWAB4NnGWkAu5Sy6ZNmdr_rHJHPZz7_mJf-XGgW8aT_yIj3Xv4wCnSTsQ/pub?output=csv';

const db = new Dexie('FuelSystemDB');
db.version(1).stores({ vehicles: '++id, plateNo, fixedPrice' });

let allFuelHistory = [];
let selectedFuelType = 'lp92'; // Default පෙන්වන්නේ 92

async function fetchLiveFuelData() {
    const statusEl = document.getElementById('systemStatus');
    const lockScreen = document.getElementById('offlineLock');
    const refreshBtn = document.getElementById('refreshBtn');

    if(refreshBtn) refreshBtn.classList.add('animate-spin'); // කරකැවෙන animation එකක්

    try {
        const cacheBuster = new Date().getTime();
        const response = await fetch(`${SHEET_CSV_URL}&t=${cacheBuster}`);
        const csvData = await response.text();
        const rows = csvData.split('\n').map(row => row.split(','));
        
        const latest = rows[1];
        if (latest) {
            // උඩ තියෙන Widgets ටික Update කිරීම
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
        
        if (statusEl) statusEl.innerHTML = '<span class="text-green-500 font-black">● LIVE</span>';
        if (lockScreen) lockScreen.classList.add('hidden');

    } catch (e) {
        console.error("Sheet Error:", e);
        if (statusEl) statusEl.innerHTML = '<span class="text-red-500 font-bold">ERROR</span>';
    } finally {
        if(refreshBtn) refreshBtn.classList.remove('animate-spin');
    }
}

// වර්ගය තේරීමට Tab එකක් හැදීම
function setFuelTab(type) {
    selectedFuelType = type;
    updateLivePricesUI();
}

function updateLivePricesUI() {
    const list = document.getElementById('priceHistoryList');
    if (!list) return;

    const fuelConfig = {
        'lp92': { name: 'Petrol 92', color: 'blue' },
        'lp95': { name: 'Petrol 95', color: 'red' },
        'lad': { name: 'Auto Diesel', color: 'emerald' },
        'lsd': { name: 'Super Diesel', color: 'orange' }
    };

    const current = fuelConfig[selectedFuelType];

    // Tab Buttons (මේවා UI එකේ උඩින්ම පේනවා)
    let tabsHTML = `
        <div class="flex gap-2 mb-4 overflow-x-auto pb-2 no-scrollbar">
            ${Object.keys(fuelConfig).map(key => `
                <button onclick="setFuelTab('${key}')" 
                    class="px-4 py-2 rounded-full text-[10px] font-black uppercase transition-all whitespace-nowrap
                    ${selectedFuelType === key ? `bg-${fuelConfig[key].color}-600 text-white shadow-lg` : 'bg-slate-100 text-slate-400'}">
                    ${fuelConfig[key].name.split(' ')[1] || fuelConfig[key].name}
                </button>
            `).join('')}
        </div>
    `;

    // අදාළ වර්ගයේ පේළි 6ක් පෙන්වීම
    let rowsHTML = allFuelHistory.slice(0, 6).map(entry => `
        <div class="flex items-center justify-between p-3 mb-2 rounded-xl border border-slate-50 bg-white shadow-sm animate-fade-in">
            <div class="flex flex-col text-left">
                <span class="text-[8px] font-black text-slate-400 uppercase">${entry.date}</span>
                <span class="text-[11px] font-bold text-slate-700">${current.name}</span>
            </div>
            <div class="bg-${current.color}-50 px-3 py-1 rounded-lg border border-${current.color}-100">
                <span class="text-sm font-black text-${current.color}-600 font-mono">Rs. ${entry[selectedFuelType]}</span>
            </div>
        </div>
    `).join('');

    list.innerHTML = tabsHTML + rowsHTML;
}

// වාහන කළමනාකරණය සහ අනෙකුත් කොටස්
async function loadVehicles() {
    const vehicles = await db.vehicles.toArray();
    const list = document.getElementById('vehicleList');
    if (!list) return;
    list.innerHTML = vehicles.length ? '' : '<p class="text-xs text-center text-slate-400 py-4 italic">No vehicles added.</p>';
    vehicles.forEach(v => {
        const isActive = (selectedVehicle?.id === v.id);
        list.innerHTML += `
            <div onclick="selectVehicle(${v.id})" class="p-3 mb-2 rounded-xl border-2 transition-all cursor-pointer ${isActive ? 'border-blue-500 bg-blue-50' : 'border-slate-100 bg-white'}">
                <div class="flex justify-between items-center text-left">
                    <span class="text-sm font-black text-slate-800 uppercase">${v.plateNo}</span>
                    <span class="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-mono">Rs. ${v.fixedPrice}</span>
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

// App එක පටන් ගැන්ම
window.onload = () => {
    fetchLiveFuelData();
    loadVehicles();
    
    // Refresh Button එක ලින්ක් කිරීම
    const refreshBtn = document.getElementById('refreshBtn');
    if(refreshBtn) {
        refreshBtn.onclick = (e) => {
            e.preventDefault();
            fetchLiveFuelData();
        };
    }

    if(document.getElementById('addRangeBtn')) document.getElementById('addRangeBtn').addEventListener('click', addDateRangeRow);
    if(document.getElementById('clearAllRangesBtn')) document.getElementById('clearAllRangesBtn').addEventListener('click', clearAllRanges);
};

// Global function එකක් විදිහට Tab මාරු කරන්න ඉඩ දීම
window.setFuelTab = setFuelTab;
