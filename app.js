/**
 * Fuel Price Adjustment System - High Reliability Version
 * Source: Automated Real-time Sync via AllOrigins Proxy
 * Developer: Gayan Chinthaka (NWSDB)
 */

const db = new Dexie('FuelSystemDB');
db.version(1).stores({
    vehicles: '++id, plateNo, fixedPrice',
    calculations: '++id, vehicleId, adjustment, createdAt'
});

let livePrices = []; 
let currentPricesObj = { lp92: 0, lp95: 0, lad: 0, lsd: 0 };
let selectedVehicle = null;
let rangesCount = 0;

// 1. Live දත්ත ලබාගැනීම (Proxy එකක් පාවිච්චි කරලා Block වීම් වළක්වා ඇත)
async function fetchLiveFuelData() {
    const statusEl = document.getElementById('systemStatus');
    const lockScreen = document.getElementById('offlineLock');
    
    // මේක තමයි ලංකාවේ මිල ගණන් හරියටම තියෙන JSON Source එක
    const targetUrl = 'https://raw.githubusercontent.com/Arunoda/fuel-price-lk/main/data.json';
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}&timestamp=${new Date().getTime()}`;

    try {
        const response = await fetch(proxyUrl);
        const json = await response.json();
        const data = JSON.parse(json.contents);

        // 92 Octane History - මේකෙන් තමයි පරණ දින වල මිල ගණන් ගන්නේ
        livePrices = data.petrol92.history.map(h => ({
            date: h.date,
            price: parseFloat(h.price),
            rawDate: new Date(h.date)
        })).sort((a, b) => b.rawDate - a.rawDate);

        // වත්මන් මිල ගණන් Widgets වලට
        currentPricesObj = {
            lp92: parseFloat(data.petrol92.price),
            lp95: parseFloat(data.petrol95.price),
            lad: parseFloat(data.autoDiesel.price),
            lsd: parseFloat(data.superDiesel.price)
        };

        updateTopWidgets();
        updateLivePricesUI();
        
        if (statusEl) {
            statusEl.innerHTML = '<div class="flex items-center gap-2 px-3 py-1 bg-green-50 text-green-700 rounded-full border border-green-200 text-[10px] font-bold shadow-sm"><span class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> SYSTEM ONLINE</div>';
        }
        if (lockScreen) lockScreen.classList.add('hidden');

    } catch (e) {
        console.error("Critical Sync Error:", e);
        if (statusEl) statusEl.innerHTML = '<span class="text-red-500 font-bold text-[10px]">SYNC ERROR - RETRYING...</span>';
        setTimeout(fetchLiveFuelData, 5000);
    }
}

// 2. උඹේ UI එකේ Widgets Update කිරීම
function updateTopWidgets() {
    if(document.getElementById('price_lp92')) document.getElementById('price_lp92').innerText = currentPricesObj.lp92.toFixed(0);
    if(document.getElementById('price_lp95')) document.getElementById('price_lp95').innerText = currentPricesObj.lp95.toFixed(0);
    if(document.getElementById('price_lad')) document.getElementById('price_lad').innerText = currentPricesObj.lad.toFixed(0);
    if(document.getElementById('price_lsd')) document.getElementById('price_lsd').innerText = currentPricesObj.lsd.toFixed(0);
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

// 3. වාහන සහ ගණනය කිරීම් (උඹේ UI එකට ගැලපෙන ලෙස)
async function loadVehicles() {
    const vehicles = await db.vehicles.toArray();
    const list = document.getElementById('vehicleList');
    if (!list) return;
    list.innerHTML = vehicles.length ? '' : '<p class="text-xs text-center text-slate-400 py-4 italic">No vehicles added.</p>';
    vehicles.forEach(v => {
        const isActive = (selectedVehicle?.id === v.id);
        list.innerHTML += `
            <div onclick="selectVehicle(${v.id})" class="p-3 mb-2 rounded-xl border-2 transition-all cursor-pointer ${isActive ? 'border-brand-500 bg-brand-50 shadow-md' : 'border-slate-100 bg-white hover:border-brand-200'}">
                <div class="flex justify-between items-center">
                    <span class="text-sm font-black text-slate-800 tracking-tight uppercase">${v.plateNo}</span>
                    <span class="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded">Rs. ${v.fixedPrice}</span>
                </div>
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
        document.getElementById('vehPlateInput').value = '';
        document.getElementById('vehFixedPriceInput').value = '';
    }
};

function addDateRangeRow() {
    rangesCount++;
    const container = document.getElementById('dateRangesContainer');
    const rowHTML = `
        <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200 mb-3">
            <div class="grid grid-cols-2 gap-3 mb-3">
                <div class="flex flex-col">
                    <label class="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-wider">Fueling Date</label>
                    <input type="text" id="start_date_${rangesCount}" class="w-full border-0 bg-white p-2.5 rounded-xl text-xs font-extrabold shadow-sm" placeholder="Pick Date">
                </div>
                <div class="flex flex-col text-right">
                    <label class="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-wider">Liters</label>
                    <input type="number" id="liters_${rangesCount}" step="0.01" placeholder="0.00" class="w-full border-0 bg-white p-2.5 rounded-xl text-xs font-extrabold text-right shadow-sm" oninput="calculateTotalAdjustment()">
                </div>
            </div>
            <div class="flex justify-between items-center border-t border-slate-200 pt-2">
                <span id="priceInfo_${rangesCount}" class="text-[10px] font-bold text-slate-500 italic">Select date...</span>
                <span class="text-[10px] font-bold text-slate-400 uppercase">Subtotal: <span id="subtotal_${rangesCount}" class="text-xs text-brand-600 font-black">0.00</span></span>
            </div>
        </div>`;
    container.insertAdjacentHTML('beforeend', rowHTML);
    flatpickr(`#start_date_${rangesCount}`, { 
        dateFormat: "Y-m-d", 
        maxDate: "today",
        onChange: calculateTotalAdjustment 
    });
}

function calculateTotalAdjustment() {
    if (!selectedVehicle) return;
    let grandTotal = 0;
    for (let i = 1; i <= rangesCount; i++) {
        const dVal = document.getElementById(`start_date_${i}`)?.value;
        const lVal = parseFloat(document.getElementById(`liters_${i}`)?.value) || 0;
        const subEl = document.getElementById(`subtotal_${i}`);
        const infoEl = document.getElementById(`priceInfo_${i}`);

        if (dVal && lVal > 0) {
            const selectedDate = new Date(dVal).getTime();
            // තෝරාගත් දිනට අදාළ මිල සෙවීම
            const priceEntry = livePrices.find(p => p.rawDate.getTime() <= selectedDate) || livePrices[livePrices.length - 1];
            const diff = priceEntry.price - selectedVehicle.fixedPrice;
            const sub = diff * lVal;
            if(infoEl) infoEl.innerText = `Price: Rs. ${priceEntry.price}`;
            if(subEl) subEl.innerText = sub.toLocaleString(undefined, {minimumFractionDigits: 2});
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

// 4. Initialization
window.onload = () => {
    fetchLiveFuelData();
    loadVehicles();
    document.getElementById('addRangeBtn').addEventListener('click', addDateRangeRow);
    document.getElementById('clearAllRangesBtn').addEventListener('click', clearAllRanges);
    document.getElementById('refreshPricesBtn').addEventListener('click', fetchLiveFuelData);
};
