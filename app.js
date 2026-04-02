/**
 * Fuel Price Adjustment System - Auto-Sync Edition
 * Source: Direct Live Fetch via Proxy
 */

const db = new Dexie('FuelSystemDB');
db.version(1).stores({
    vehicles: '++id, plateNo, fixedPrice'
});

let livePrices = []; 
let currentPricesObj = { lp92: 0, lp95: 0, lad: 0, lsd: 0 };
let selectedVehicle = null;
let rangesCount = 0;

// 1. මේක තමයි මැජික් එක - CORS Proxy එකක් හරහා කෙලින්ම Data Fetch කරනවා
async function fetchLiveFuelData() {
    const statusEl = document.getElementById('systemStatus');
    const lockScreen = document.getElementById('offlineLock');
    
    // මේ Proxy එක හරහා අපිට ඕනෑම සයිට් එකක දත්ත Block වෙන්නේ නැතුව ගන්න පුළුවන්
    const proxy = 'https://api.allorigins.win/get?url=';
    const target = encodeURIComponent('https://raw.githubusercontent.com/Arunoda/fuel-price-lk/main/data.json');
    
    try {
        const response = await fetch(proxy + target);
        const json = await response.json();
        const data = JSON.parse(json.contents); // Proxy එකෙන් එන දත්ත Parse කරනවා

        // 92 Octane History & Current
        livePrices = data.petrol92.history.map(h => ({
            date: h.date,
            price: parseFloat(h.price),
            rawDate: new Date(h.date)
        })).sort((a, b) => b.rawDate - a.rawDate);

        currentPricesObj = {
            lp92: parseFloat(data.petrol92.price),
            lp95: parseFloat(data.petrol95.price),
            lad: parseFloat(data.autoDiesel.price),
            lsd: parseFloat(data.superDiesel.price)
        };

        updateTopWidgets();
        updateLivePricesUI();
        
        if (statusEl) statusEl.innerHTML = '<div class="px-3 py-1 bg-green-50 text-green-700 rounded-full border border-green-200 text-[10px] font-bold animate-pulse">LIVE SYNC ACTIVE</div>';
        if (lockScreen) lockScreen.classList.add('hidden');

    } catch (e) {
        console.error("Fetch Error:", e);
        if (statusEl) statusEl.innerHTML = '<span class="text-red-500 font-bold text-[10px]">RETRYING...</span>';
        setTimeout(fetchLiveFuelData, 5000); // Fail වුණොත් ආයෙත් ට්‍රයි කරනවා
    }
}

function updateTopWidgets() {
    document.getElementById('price_lp92').innerText = currentPricesObj.lp92.toFixed(0);
    document.getElementById('price_lp95').innerText = currentPricesObj.lp95.toFixed(0);
    document.getElementById('price_lad').innerText = currentPricesObj.lad.toFixed(0);
    document.getElementById('price_lsd').innerText = currentPricesObj.lsd.toFixed(0);
}

function updateLivePricesUI() {
    const list = document.getElementById('priceHistoryList');
    if (!list) return;
    list.innerHTML = '';
    livePrices.slice(0, 5).forEach((entry) => {
        list.innerHTML += `
            <div class="flex items-center justify-between p-3 mb-2 rounded-xl border border-slate-100 bg-white shadow-sm">
                <div class="flex flex-col">
                    <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider">${entry.date}</span>
                    <span class="text-xs font-bold text-slate-700 leading-tight">Lanka Petrol 92</span>
                </div>
                <div class="bg-brand-50 px-3 py-1 rounded-lg border border-brand-100">
                    <span class="text-sm font-black text-brand-600">Rs. ${entry.price}</span>
                </div>
            </div>`;
    });
}

// වාහන කළමනාකරණය
async function loadVehicles() {
    const vehicles = await db.vehicles.toArray();
    const list = document.getElementById('vehicleList');
    if (!list) return;
    list.innerHTML = vehicles.length ? '' : '<p class="text-xs text-center text-slate-400 py-4 italic">Add a vehicle to start.</p>';
    vehicles.forEach(v => {
        const isActive = (selectedVehicle?.id === v.id);
        list.innerHTML += `
            <div onclick="selectVehicle(${v.id})" class="p-3 mb-2 rounded-xl border-2 transition-all cursor-pointer ${isActive ? 'border-brand-500 bg-brand-50' : 'border-slate-100 bg-white'}">
                <span class="text-sm font-black text-slate-800 uppercase">${v.plateNo}</span>
            </div>`;
    });
}

async function selectVehicle(id) {
    selectedVehicle = await db.vehicles.get(id);
    document.getElementById('activeVehicleLabel').innerText = selectedVehicle.plateNo;
    document.getElementById('calcVehicleNo').innerText = selectedVehicle.plateNo;
    document.getElementById('calcFixedPrice').innerText = selectedVehicle.fixedPrice.toFixed(2);
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
    }
};

function addDateRangeRow() {
    rangesCount++;
    const container = document.getElementById('dateRangesContainer');
    const rowHTML = `
        <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200 mb-3">
            <div class="grid grid-cols-2 gap-3 mb-3">
                <div>
                    <label class="text-[10px] font-black text-slate-400 uppercase">Date</label>
                    <input type="text" id="start_date_${rangesCount}" class="w-full border-0 bg-white p-2.5 rounded-xl text-xs font-bold" placeholder="Select">
                </div>
                <div class="text-right">
                    <label class="text-[10px] font-black text-slate-400 uppercase">Liters</label>
                    <input type="number" id="liters_${rangesCount}" step="0.01" class="w-full border-0 bg-white p-2.5 rounded-xl text-xs font-bold text-right" oninput="calculateTotalAdjustment()">
                </div>
            </div>
            <div class="flex justify-between items-center border-t border-slate-200 pt-2">
                <span id="priceInfo_${rangesCount}" class="text-[10px] font-bold text-slate-500 italic">...</span>
                <span id="subtotal_${rangesCount}" class="text-xs text-brand-600 font-black">0.00</span>
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
            const selectedDate = new Date(dVal).getTime();
            const priceEntry = livePrices.find(p => p.rawDate.getTime() <= selectedDate) || livePrices[livePrices.length - 1];
            const diff = priceEntry.price - selectedVehicle.fixedPrice;
            const sub = diff * lVal;
            document.getElementById(`priceInfo_${i}`).innerText = `Price: Rs. ${priceEntry.price}`;
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

window.onload = () => {
    fetchLiveFuelData();
    loadVehicles();
    document.getElementById('addRangeBtn').addEventListener('click', addDateRangeRow);
    document.getElementById('clearAllRangesBtn').addEventListener('click', clearAllRanges);
    document.getElementById('refreshPricesBtn').addEventListener('click', fetchLiveFuelData);
};
