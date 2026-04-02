/**
 * Fuel Price Adjustment System - Multi-Fuel 6-Row History Sync
 */

const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRFBYTixlf9JHq7oc523FFnWAB4NnGWkAu5Sy6ZNmdr_rHJHPZz7_mJf-XGgW8aT_yIj3Xv4wCnSTsQ/pub?output=csv';

const db = new Dexie('FuelSystemDB');
db.version(1).stores({ vehicles: '++id, plateNo, fixedPrice' });

let allFuelHistory = []; // ඔක්කොම දත්ත මෙතන තියෙනවා
let currentPricesObj = { lp92: 0, lp95: 0, lad: 0, lsd: 0 };
let selectedVehicle = null;
let rangesCount = 0;

async function fetchLiveFuelData() {
    const statusEl = document.getElementById('systemStatus');
    const lockScreen = document.getElementById('offlineLock');

    try {
        const cacheBuster = new Date().getTime();
        const response = await fetch(`${SHEET_CSV_URL}&t=${cacheBuster}`);
        const csvData = await response.text();
        const rows = csvData.split('\n').map(row => row.split(','));
        
        const latest = rows[1];
        if (latest) {
            currentPricesObj = {
                lp92: parseFloat(latest[1]) || 0,
                lp95: parseFloat(latest[2]) || 0,
                lad: parseFloat(latest[3]) || 0,
                lsd: parseFloat(latest[4]) || 0
            };

            if(document.getElementById('price_lp92')) document.getElementById('price_lp92').innerText = currentPricesObj.lp92;
            if(document.getElementById('price_lp95')) document.getElementById('price_lp95').innerText = currentPricesObj.lp95;
            if(document.getElementById('price_lad')) document.getElementById('price_lad').innerText = currentPricesObj.lad;
            if(document.getElementById('price_lsd')) document.getElementById('price_lsd').innerText = currentPricesObj.lsd;
        }

        // CSV එකෙන් වර්ග 4ම දත්ත වෙන් කරගැනීම
        allFuelHistory = rows.slice(1).map(row => ({
            date: row[0] ? row[0].trim() : "",
            lp92: parseFloat(row[1]) || 0,
            lp95: parseFloat(row[2]) || 0,
            lad: parseFloat(row[3]) || 0,
            lsd: parseFloat(row[4]) || 0
        })).filter(item => item.date !== "");

        updateLivePricesUI();
        
        if (statusEl) statusEl.innerHTML = '<span class="text-green-500 font-black">● LIVE SYNC ACTIVE</span>';
        if (lockScreen) lockScreen.classList.add('hidden');

    } catch (e) {
        console.error("Sheet Error:", e);
        if (statusEl) statusEl.innerHTML = '<span class="text-red-500 font-bold">SYNC ERROR</span>';
    }
}

// මේකෙන් තමයි පෙළගස්වන්නේ
function updateLivePricesUI() {
    const list = document.getElementById('priceHistoryList');
    if (!list) return;
    
    list.innerHTML = ''; // කලින් තිබ්බ ඒවා මකනවා

    // වර්ග 4ට අදාළව ලේබල් සහ දත්ත (එක වර්ගයකට වෙනස්කම් 6 බැගින්)
    const fuelTypes = [
        { name: 'Lanka Petrol 92', key: 'lp92', color: 'blue' },
        { name: 'Lanka Petrol 95', key: 'lp95', color: 'red' },
        { name: 'Lanka Auto Diesel', key: 'lad', color: 'emerald' },
        { name: 'Lanka Super Diesel', key: 'lsd', color: 'orange' }
    ];

    fuelTypes.forEach(fuel => {
        // හෙඩින් එකක් දානවා (Petrol 92, 95 වගේ)
        list.innerHTML += `<div class="text-[10px] font-black text-slate-400 uppercase mt-4 mb-2 ml-1 tracking-widest border-b border-slate-100 pb-1">${fuel.name} History</div>`;
        
        // අදාළ වර්ගයේ පේළි 6ක් පෙන්වීම
        const historyRows = allFuelHistory.slice(0, 6).map(entry => `
            <div class="flex items-center justify-between p-3 mb-2 rounded-xl border border-slate-50 bg-white shadow-sm">
                <div class="flex flex-col text-left">
                    <span class="text-[8px] font-black text-slate-400 uppercase">${entry.date}</span>
                    <span class="text-[11px] font-bold text-slate-700">${fuel.name}</span>
                </div>
                <div class="bg-${fuel.color}-50 px-3 py-1 rounded-lg border border-${fuel.color}-100">
                    <span class="text-sm font-black text-${fuel.color}-600 font-mono">Rs. ${entry[fuel.key]}</span>
                </div>
            </div>`).join('');
        
        list.innerHTML += historyRows;
    });
}

// වාහන කළමනාකරණය
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
                    <span class="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded">Rs. ${v.fixedPrice}</span>
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
                <span class="text-[10px] font-bold text-slate-400 uppercase">Subtotal: <span id="subtotal_${rangesCount}" class="text-xs text-blue-600 font-black">0.00</span></span>
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
            // ගණනය කිරීම්වලට LP92 මිල පාවිච්චි කරයි
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

window.onload = () => {
    fetchLiveFuelData();
    loadVehicles();
    if(document.getElementById('addRangeBtn')) document.getElementById('addRangeBtn').addEventListener('click', addDateRangeRow);
    if(document.getElementById('clearAllRangesBtn')) document.getElementById('clearAllRangesBtn').addEventListener('click', clearAllRanges);
};
