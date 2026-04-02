/**
 * Fuel Price Adjustment System
 * Developer: Gayan Chinthaka (NWSDB)
 * 100% UI Compatible - No Layout Changes
 */

const db = new Dexie('FuelSystemDB');
db.version(1).stores({
    vehicles: '++id, plateNo, fixedPrice'
});

let livePrices = []; 
let currentPricesObj = { lp92: 0, lp95: 0, lad: 0, lsd: 0 };
let selectedVehicle = null;
let rangesCount = 0;

// 1. Live දත්ත ලබාගැනීම (AllOrigins Proxy හරහා)
async function fetchLiveFuelData() {
    const statusEl = document.getElementById('systemStatus');
    const lockScreen = document.getElementById('offlineLock');
    
    // දත්ත ගන්නා මුලාශ්‍රය
    const target = 'https://raw.githubusercontent.com/Arunoda/fuel-price-lk/main/data.json';
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(target)}&_=${new Date().getTime()}`;

    try {
        const response = await fetch(proxyUrl);
        const json = await response.json();
        const data = JSON.parse(json.contents);

        // මිල ගණන් වල ඉතිහාසය (පරණ දින වල මිල බැලීමට)
        livePrices = data.petrol92.history.map(h => ({
            date: h.date,
            price: parseFloat(h.price),
            rawDate: new Date(h.date)
        })).sort((a, b) => b.rawDate - a.rawDate);

        // වත්මන් මිල ගණන් UI එකේ Widgets වලට
        currentPricesObj = {
            lp92: parseFloat(data.petrol92.price),
            lp95: parseFloat(data.petrol95.price),
            lad: parseFloat(data.autoDiesel.price),
            lsd: parseFloat(data.superDiesel.price)
        };

        // UI එකේ පවතින IDs වලට අගයන් ලබාදීම
        if(document.getElementById('price_lp92')) document.getElementById('price_lp92').innerText = currentPricesObj.lp92;
        if(document.getElementById('price_lp95')) document.getElementById('price_lp95').innerText = currentPricesObj.lp95;
        if(document.getElementById('price_lad')) document.getElementById('price_lad').innerText = currentPricesObj.lad;
        if(document.getElementById('price_lsd')) document.getElementById('price_lsd').innerText = currentPricesObj.lsd;

        updateLivePricesUI();
        
        if (statusEl) statusEl.innerHTML = '<span class="text-green-500 font-black">● LIVE SYNC OK</span>';
        if (lockScreen) lockScreen.classList.add('hidden');

    } catch (e) {
        console.error("Sync Error:", e);
        if (statusEl) statusEl.innerHTML = '<span class="text-red-500 font-bold">RETRYING...</span>';
        setTimeout(fetchLiveFuelData, 5000);
    }
}

// 2. දකුණු පස ඇති මිල ලැයිස්තුව (Price History)
function updateLivePricesUI() {
    const list = document.getElementById('priceHistoryList');
    if (!list) return;
    list.innerHTML = livePrices.slice(0, 5).map(entry => `
        <div class="flex items-center justify-between p-3 mb-2 rounded-xl border border-slate-100 bg-white shadow-sm">
            <div class="flex flex-col text-left">
                <span class="text-[9px] font-black text-slate-400 uppercase">${entry.date}</span>
                <span class="text-xs font-bold text-slate-700 leading-tight">Lanka Petrol 92</span>
            </div>
            <div class="bg-blue-50 px-3 py-1 rounded-lg">
                <span class="text-sm font-black text-blue-600 font-mono">Rs. ${entry.price}</span>
            </div>
        </div>`).join('');
}

// 3. වාහන කළමනාකරණය
async function loadVehicles() {
    const vehicles = await db.vehicles.toArray();
    const list = document.getElementById('vehicleList');
    if (!list) return;
    list.innerHTML = vehicles.length ? '' : '<p class="text-xs text-center text-slate-400 py-4 italic">No vehicles added.</p>';
    vehicles.forEach(v => {
        const isActive = (selectedVehicle?.id === v.id);
        list.innerHTML += `
            <div onclick="selectVehicle(${v.id})" class="p-3 mb-2 rounded-xl border-2 transition-all cursor-pointer ${isActive ? 'border-blue-500 bg-blue-50' : 'border-slate-100 bg-white'}">
                <div class="flex justify-between items-center">
                    <span class="text-sm font-black text-slate-800 tracking-tight uppercase">${v.plateNo}</span>
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

// 4. ගණනය කිරීම්
function addDateRangeRow() {
    rangesCount++;
    const container = document.getElementById('dateRangesContainer');
    const rowHTML = `
        <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200 mb-3 text-left">
            <div class="grid grid-cols-2 gap-3 mb-3">
                <div class="flex flex-col">
                    <label class="text-[10px] font-black text-slate-400 uppercase mb-1">Fueling Date</label>
                    <input type="text" id="start_date_${rangesCount}" class="w-full border-0 bg-white p-2.5 rounded-xl text-xs font-extrabold shadow-sm" placeholder="Pick Date">
                </div>
                <div class="flex flex-col text-right">
                    <label class="text-[10px] font-black text-slate-400 uppercase mb-1">Liters</label>
                    <input type="number" id="liters_${rangesCount}" step="0.01" class="w-full border-0 bg-white p-2.5 rounded-xl text-xs font-extrabold text-right shadow-sm" oninput="calculateTotalAdjustment()">
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
            const entry = livePrices.find(p => p.date <= dVal) || livePrices[livePrices.length - 1];
            const diff = entry.price - selectedVehicle.fixedPrice;
            const sub = diff * lVal;
            document.getElementById(`priceInfo_${i}`).innerText = `Market Price: Rs. ${entry.price}`;
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

// 5. Initial Load
window.onload = () => {
    fetchLiveFuelData();
    loadVehicles();
    document.getElementById('addRangeBtn').addEventListener('click', addDateRangeRow);
    document.getElementById('clearAllRangesBtn').addEventListener('click', clearAllRanges);
};
