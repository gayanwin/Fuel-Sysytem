/**
 * Fuel Price Adjustment System - Final Logic Fix
 * For: Gayan Chinthaka (NWSDB)
 */

// 1. Database Setup
const db = new Dexie('FuelSystemDB');
db.version(1).stores({
    vehicles: '++id, plateNo, fixedPrice',
    calculations: '++id, vehicleId, adjustment, createdAt'
});

let livePrices = []; 
let currentPricesObj = { lp92: 0, lp95: 0, lad: 0, lsd: 0 };
let selectedVehicle = null;
let rangesCount = 0;

// 2. Data Fetching Logic (Fixed)
async function fetchLiveFuelData() {
    console.log("Fetching live data...");
    const statusEl = document.getElementById('systemStatus');
    const lockScreen = document.getElementById('offlineLock');
    
    try {
        const baseUrl = 'https://raw.githubusercontent.com/xzunk/fuelpricelk/main/data';
        
        // Fetching all data
        const [res92, res95, resLAD, resLSD] = await Promise.all([
            fetch(`${baseUrl}/petrol92.json`),
            fetch(`${baseUrl}/petrol95.json`),
            fetch(`${baseUrl}/autodiesel.json`),
            fetch(`${baseUrl}/superdiesel.json`)
        ]);

        const data92 = await res92.json();
        const data95 = await res95.json();
        const dataLAD = await resLAD.json();
        const dataLSD = await resLSD.json();

        // Map history for LP92
        livePrices = data92.history.map(h => ({
            date: h.date,
            price: parseFloat(h.price),
            rawDate: new Date(h.date)
        })).sort((a, b) => b.rawDate - a.rawDate);

        // Get latest prices for widgets
        const latest = (arr) => parseFloat(arr.sort((a, b) => new Date(b.date) - new Date(a.date))[0].price);

        currentPricesObj = {
            lp92: latest(data92.history),
            lp95: latest(data95.history),
            lad: latest(dataLAD.history),
            lsd: latest(dataLSD.history)
        };

        updateTopWidgets();
        updateLivePricesUI();
        
        if(statusEl) {
            statusEl.innerHTML = '<i class="fa-solid fa-check-circle text-brand-500"></i><span>System Online</span>';
            statusEl.className = "flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 text-green-700 text-xs font-bold border border-green-200";
        }
        
        if(lockScreen) {
            lockScreen.classList.add('opacity-0');
            setTimeout(() => lockScreen.classList.add('hidden'), 500);
        }

    } catch (error) {
        console.error("Fetch Error:", error);
        if(statusEl) statusEl.innerHTML = '<span>Connection Error</span>';
    }
}

// 3. UI Process Functions
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
    livePrices.slice(0, 6).forEach((entry, idx) => {
        list.innerHTML += `
            <div class="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-white transition-all">
                <div class="flex flex-col">
                    <span class="text-[10px] font-bold text-slate-400 uppercase">${entry.date}</span>
                    <span class="text-xs font-bold text-slate-700">Lanka Petrol 92</span>
                </div>
                <div class="text-right">
                    <span class="text-lg font-black text-brand-600">${entry.price.toFixed(2)}</span>
                </div>
            </div>`;
    });
}

// 4. Vehicle & Calculation Process
async function loadVehicles() {
    const vehicles = await db.vehicles.toArray();
    const list = document.getElementById('vehicleList');
    if(!list) return;
    list.innerHTML = vehicles.length ? '' : '<p class="text-xs text-center py-4 text-slate-400">No vehicles.</p>';
    
    vehicles.forEach(v => {
        const activeCls = selectedVehicle?.id === v.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white';
        list.innerHTML += `
            <div onclick="selectVehicle(${v.id})" class="p-3 rounded-xl border cursor-pointer transition-all mb-2 ${activeCls}">
                <span class="block text-sm font-bold uppercase">${v.plateNo}</span>
                <span class="block text-[10px] text-slate-500">Fixed: Rs. ${v.fixedPrice}</span>
            </div>`;
    });
}

async function selectVehicle(id) {
    selectedVehicle = await db.vehicles.get(id);
    document.getElementById('activeVehicleLabel').innerText = selectedVehicle.plateNo;
    document.getElementById('calcVehicleNo').innerText = selectedVehicle.plateNo;
    document.getElementById('calcFixedPrice').innerText = selectedVehicle.fixedPrice;
    document.getElementById('calculatorPanel').classList.remove('hidden');
    document.getElementById('noVehicleWarning').classList.add('hidden');
    loadVehicles();
    clearAllRanges();
    addDateRangeRow();
}

function addDateRangeRow() {
    rangesCount++;
    const container = document.getElementById('dateRangesContainer');
    const rowId = `range_row_${rangesCount}`;
    
    const rowHTML = `
        <div id="${rowId}" class="flex flex-col md:flex-row gap-4 items-end bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div class="flex-1 w-full">
                <label class="text-[10px] font-bold text-slate-500 uppercase">Start Date</label>
                <input type="date" id="start_date_${rangesCount}" class="w-full border p-2 rounded-lg text-sm" onchange="calculateTotalAdjustment()">
            </div>
            <div class="flex-1 w-full">
                <label class="text-[10px] font-bold text-slate-500 uppercase">Liters</label>
                <input type="number" id="liters_${rangesCount}" class="w-full border p-2 rounded-lg text-sm" oninput="calculateTotalAdjustment()" value="0">
            </div>
            <div class="w-full md:w-32 text-right">
                <span class="text-[10px] font-bold text-slate-400 block">Subtotal</span>
                <span id="subtotal_${rangesCount}" class="text-sm font-bold">0.00</span>
            </div>
        </div>`;
    container.insertAdjacentHTML('beforeend', rowHTML);
}

function calculateTotalAdjustment() {
    if (!selectedVehicle) return;
    let total = 0;
    for (let i = 1; i <= rangesCount; i++) {
        const dateVal = document.getElementById(`start_date_${i}`)?.value;
        const liters = parseFloat(document.getElementById(`liters_${i}`)?.value) || 0;
        const subtotalEl = document.getElementById(`subtotal_${i}`);
        
        if (dateVal && liters > 0) {
            const price = livePrices.find(p => p.date <= dateVal)?.price || livePrices[livePrices.length-1].price;
            const sub = (price - selectedVehicle.fixedPrice) * liters;
            if(subtotalEl) subtotalEl.innerText = sub.toFixed(2);
            total += sub;
        }
    }
    document.getElementById('totalAdjustmentValue').innerText = total.toLocaleString(undefined, {minimumFractionDigits: 2});
}

function clearAllRanges() {
    document.getElementById('dateRangesContainer').innerHTML = '';
    rangesCount = 0;
}

// 5. App Init
window.onload = async () => {
    await fetchLiveFuelData();
    await loadVehicles();
};

// UI Triggers
function openVehicleModal() { document.getElementById('vehicleModal').classList.remove('hidden', 'opacity-0'); }
function closeVehicleModal() { document.getElementById('vehicleModal').classList.add('hidden'); }
async function saveVehicle() {
    const plate = document.getElementById('vehPlateInput').value;
    const price = parseFloat(document.getElementById('vehFixedPriceInput').value);
    if(plate && price) {
        await db.vehicles.add({ plateNo: plate.toUpperCase(), fixedPrice: price });
        closeVehicleModal();
        loadVehicles();
    }
}
