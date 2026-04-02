const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRFBYTixlf9JHq7oc523FFnWAB4NnGWkAu5Sy6ZNmdr_rHJHPZz7_mJf-XGgW8aT_yIj3Xv4wCnSTsQ/pub?output=csv';

const db = new Dexie('FuelSystemDB');
db.version(1).stores({ vehicles: '++id, plateNo, fixedPrice' });

let allFuelHistory = [];
let selectedFuelType = 'lp92'; 
let selectedVehicle = null;
let rangesCount = 0;

async function fetchLiveFuelData() {
    const statusEl = document.getElementById('systemStatus');
    const refreshBtn = document.getElementById('refreshBtn');
    if(refreshBtn) {
        const icon = refreshBtn.querySelector('i');
        if(icon) icon.classList.add('fa-spin');
    }

    try {
        const response = await fetch(`${SHEET_CSV_URL}&t=${new Date().getTime()}`);
        const csvData = await response.text();
        
        // Data parsing
        const rows = csvData.split('\n')
            .map(row => row.split(',').map(cell => cell.replace(/"/g, '').trim()))
            .filter(row => row[0] && row[0] !== "Date");
        
        // ශීට් එකේ යටම තියෙන අලුත්ම පේළිය ගැනීම
        const latest = rows[rows.length - 1]; 
        if (latest) {
            if(document.getElementById('price_lp92')) document.getElementById('price_lp92').innerText = latest[1];
            if(document.getElementById('price_lp95')) document.getElementById('price_lp95').innerText = latest[2];
            if(document.getElementById('price_lad')) document.getElementById('price_lad').innerText = latest[3];
            if(document.getElementById('price_lsd')) document.getElementById('price_lsd').innerText = latest[4];
        }

        allFuelHistory = rows.map(row => ({
            date: row[0],
            lp92: parseFloat(row[1]) || 0,
            lp95: parseFloat(row[2]) || 0,
            lad: parseFloat(row[3]) || 0,
            lsd: parseFloat(row[4]) || 0
        })).reverse();

        updateLivePricesUI();
        if (statusEl) statusEl.innerHTML = '<span class="text-green-500 font-black">● LIVE SYNC</span>';
    } catch (e) {
        console.error("Fetch Error:", e);
        if (statusEl) statusEl.innerHTML = '<span class="text-red-500 font-bold">OFFLINE</span>';
    } finally {
        if(refreshBtn) {
            const icon = refreshBtn.querySelector('i');
            if(icon) icon.classList.remove('fa-spin');
        }
    }
}

window.setFuelTab = function(type) {
    selectedFuelType = type;
    updateLivePricesUI();
};

function updateLivePricesUI() {
    const list = document.getElementById('priceHistoryList');
    const titleEl = document.getElementById('fuelTitle'); 
    if (!list) return;

    const fuelConfig = {
        'lp92': { name: 'LP 92', title: '92 Octane' },
        'lp95': { name: 'LP 95', title: '95 Octane' },
        'lad': { name: 'LAD', title: 'Auto Diesel' },
        'lsd': { name: 'LSD', title: 'Super Diesel' }
    };

    const current = fuelConfig[selectedFuelType];
    if (titleEl) titleEl.innerText = `Live ${current.title} Prices`;

    let tabsHTML = `<div class="flex justify-center gap-2 mb-4">
        ${Object.keys(fuelConfig).map(key => `
            <button onclick="setFuelTab('${key}')" 
                class="px-3 py-1.5 rounded-xl text-[10px] font-black transition-all border
                ${selectedFuelType === key ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-100 text-slate-400' }">
                ${fuelConfig[key].name}
            </button>
        `).join('')}
    </div>`;

    let rowsHTML = allFuelHistory.slice(0, 6).map(entry => `
        <div class="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-2xl mb-2 shadow-sm">
            <div class="flex flex-col">
                <span class="text-[8px] font-black text-slate-400 uppercase">${entry.date}</span>
                <span class="text-[11px] font-extrabold text-slate-700">${current.name}</span>
            </div>
            <div class="bg-slate-50 px-3 py-1 rounded-lg">
                <span class="text-sm font-black text-slate-800">Rs. ${entry[selectedFuelType]}</span>
            </div>
        </div>
    `).join('');

    list.innerHTML = tabsHTML + rowsHTML;
}

// Global functions for buttons
window.saveVehicle = async function() {
    const plate = document.getElementById('vehPlateInput')?.value.trim();
    const price = parseFloat(document.getElementById('vehFixedPriceInput')?.value);
    if (plate && !isNaN(price)) {
        await db.vehicles.add({ plateNo: plate.toUpperCase(), fixedPrice: price });
        document.getElementById('vehicleModal')?.classList.add('hidden');
        loadVehicles();
    }
};

async function loadVehicles() {
    const vehicles = await db.vehicles.toArray();
    const list = document.getElementById('vehicleList');
    if (!list) return;
    list.innerHTML = vehicles.length ? '' : '<p class="text-xs text-center text-slate-400 py-4 italic">No vehicles added.</p>';
    vehicles.forEach(v => {
        const isActive = (selectedVehicle?.id === v.id);
        list.innerHTML += `<div onclick="selectVehicle(${v.id})" class="p-4 mb-2 rounded-2xl border-2 cursor-pointer ${isActive ? 'border-blue-500 bg-blue-50' : 'border-white bg-white shadow-sm'}">
            <div class="flex justify-between items-center uppercase font-black text-[10px]">
                <span>${v.plateNo}</span>
                <span class="text-slate-400">Rs. ${v.fixedPrice}</span>
            </div>
        </div>`;
    });
}

window.selectVehicle = async function(id) {
    selectedVehicle = await db.vehicles.get(id);
    if(document.getElementById('activeVehicleLabel')) document.getElementById('activeVehicleLabel').innerText = selectedVehicle.plateNo;
    document.getElementById('calculatorPanel')?.classList.remove('hidden');
    loadVehicles(); clearAllRanges(); addDateRangeRow();
};

window.addDateRangeRow = function() {
    rangesCount++;
    const container = document.getElementById('dateRangesContainer');
    if(!container) return;
    const rowHTML = `<div class="bg-white p-4 rounded-2xl border border-slate-100 mb-2">
        <div class="grid grid-cols-2 gap-2 mb-2">
            <input type="text" id="start_date_${rangesCount}" class="bg-slate-50 p-2 rounded-xl text-xs font-bold border-0" placeholder="Date">
            <input type="number" id="liters_${rangesCount}" step="0.01" class="bg-slate-50 p-2 rounded-xl text-xs font-bold text-right border-0" placeholder="Liters" oninput="calculateTotalAdjustment()">
        </div>
        <div class="flex justify-between items-center text-[9px] font-black text-slate-400">
            <span id="priceInfo_${rangesCount}">Rate: --</span>
            <span>Sub: Rs. <span id="subtotal_${rangesCount}" class="text-blue-600">0.00</span></span>
        </div>
    </div>`;
    container.insertAdjacentHTML('beforeend', rowHTML);
    flatpickr(`#start_date_${rangesCount}`, { dateFormat: "Y-m-d", maxDate: "today", onChange: calculateTotalAdjustment });
};

window.calculateTotalAdjustment = function() {
    if (!selectedVehicle) return;
    let grandTotal = 0;
    const chronHistory = [...allFuelHistory].reverse();
    for (let i = 1; i <= rangesCount; i++) {
        const dVal = document.getElementById(`start_date_${i}`)?.value;
        const lVal = parseFloat(document.getElementById(`liters_${i}`)?.value) || 0;
        if (dVal && lVal > 0) {
            const entry = chronHistory.find(p => p.date <= dVal) || chronHistory[chronHistory.length - 1];
            const diff = entry.lp92 - selectedVehicle.fixedPrice;
            const sub = diff * lVal;
            if(document.getElementById(`priceInfo_${i}`)) document.getElementById(`priceInfo_${i}`).innerText = `Rate: Rs. ${entry.lp92}`;
            if(document.getElementById(`subtotal_${i}`)) document.getElementById(`subtotal_${i}`).innerText = sub.toFixed(2);
            grandTotal += sub;
        }
    }
    if(document.getElementById('totalAdjustmentValue')) document.getElementById('totalAdjustmentValue').innerText = grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2});
};

window.clearAllRanges = function() {
    if(document.getElementById('dateRangesContainer')) document.getElementById('dateRangesContainer').innerHTML = '';
    rangesCount = 0;
    if(document.getElementById('totalAdjustmentValue')) document.getElementById('totalAdjustmentValue').innerText = '0.00';
};

window.addEventListener('DOMContentLoaded', () => {
    fetchLiveFuelData();
    loadVehicles();
});
