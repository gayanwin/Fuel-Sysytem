/**
 * Fuel Price Adjustment System - Real-time Live Sync
 * For: Gayan Chinthaka (NWSDB)
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

// 1. අලුත්ම මිල ගණන් ලබාගැනීම (Live API Sync)
async function fetchLiveFuelData() {
    console.log("Connecting to Live Fuel API...");
    const statusEl = document.getElementById('systemStatus');
    const lockScreen = document.getElementById('offlineLock');
    
    try {
        // ලංකාවේ මිල ගණන් හරියටම අප්ඩේට් වෙන Live API එක
        const response = await fetch('https://fuel-price-lk.vercel.app/api/latest', { cache: 'no-store' });
        const data = await response.json();

        if (!data || !data.prices) throw new Error("Invalid Data");

        // 92 Octane මිල ඉතිහාසය සහ වත්මන් මිල ලබාගැනීම
        // මෙහිදී API එකෙන් එන අලුත්ම දත්ත (Latest Price) ප්‍රමුඛව ගනියි.
        livePrices = data.history.map(h => ({
            date: h.date,
            price: parseFloat(h.price),
            rawDate: new Date(h.date)
        })).sort((a, b) => b.rawDate - a.rawDate);

        currentPricesObj = {
            lp92: parseFloat(data.prices.lp92),
            lp95: parseFloat(data.prices.lp95),
            lad: parseFloat(data.prices.lad),
            lsd: parseFloat(data.prices.lsd)
        };

        updateTopWidgets();
        updateLivePricesUI();
        
        if (statusEl) {
            statusEl.innerHTML = '<i class="fa-solid fa-bolt text-yellow-500"></i><span>Live Sync Active</span>';
            statusEl.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200 shadow-sm';
        }

        if (lockScreen) {
            lockScreen.classList.add('opacity-0');
            setTimeout(() => lockScreen.classList.add('hidden'), 500);
        }

        console.log("System Synced with Current Prices:", currentPricesObj);

    } catch (e) {
        console.error("Sync Error:", e);
        if (statusEl) statusEl.innerHTML = '<span class="text-red-500">Sync Failed</span>';
        // API එක අවුල් නම් පරණ ක්‍රමයට Backup එකක් ලෙස GitHub එකෙන් උත්සාහ කරයි
        fallbackToBackupSource();
    }
}

// Backup Source (GitHub) - API එක වැඩ නැති වුණොත් පමණක් පාවිච්චි වේ
async function fallbackToBackupSource() {
    const baseUrl = 'https://raw.githubusercontent.com/xzunk/fuelpricelk/main/data/petrol92.json';
    const res = await fetch(baseUrl);
    const backupData = await res.json();
    livePrices = backupData.history.map(h => ({ date: h.date, price: parseFloat(h.price), rawDate: new Date(h.date) }));
    updateTopWidgets();
    updateLivePricesUI();
}

// 2. UI Updates
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
    livePrices.slice(0, 6).forEach((entry) => {
        list.innerHTML += `
            <div class="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50/50">
                <div class="flex flex-col">
                    <span class="text-[10px] font-bold text-slate-400 uppercase">${entry.date}</span>
                    <span class="text-xs font-semibold text-slate-700">Lanka Petrol 92</span>
                </div>
                <div class="text-right">
                    <span class="text-lg font-black text-brand-600">${entry.price.toFixed(2)}</span>
                </div>
            </div>`;
    });
}

// 3. Calculation & Vehicle Management (Fixed Logic)
async function loadVehicles() {
    const vehicles = await db.vehicles.toArray();
    const list = document.getElementById('vehicleList');
    if (!list) return;
    list.innerHTML = vehicles.length ? '' : '<p class="text-xs text-center text-slate-400 py-4">No vehicles.</p>';
    vehicles.forEach(v => {
        const activeCls = (selectedVehicle?.id === v.id) ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-slate-200 bg-white';
        list.innerHTML += `<div onclick="selectVehicle(${v.id})" class="p-3 rounded-xl border cursor-pointer mb-2 ${activeCls}"><span class="block text-sm font-bold uppercase">${v.plateNo}</span><span class="text-[10px] text-slate-500 font-medium">Fixed: Rs. ${v.fixedPrice.toFixed(2)}</span></div>`;
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
        <div class="flex flex-col md:flex-row gap-4 items-end bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-2">
            <div class="flex-1 w-full"><label class="text-[10px] font-bold text-slate-500 uppercase">Select Date</label>
                <input type="text" id="start_date_${rangesCount}" class="w-full border p-2 rounded-lg text-sm bg-white" placeholder="Y-m-d"></div>
            <div class="w-24"><label class="text-[10px] font-bold text-slate-500 uppercase">Liters</label>
                <input type="number" id="liters_${rangesCount}" step="0.01" value="0.00" class="w-full border p-2 rounded-lg text-sm text-right" oninput="calculateTotalAdjustment()"></div>
            <div class="w-32 bg-slate-50 p-2 rounded-lg text-right"><span class="text-[10px] text-slate-400 font-bold block">Subtotal</span><span id="subtotal_${rangesCount}" class="text-sm font-bold">0.00</span></div>
        </div>`;
    container.insertAdjacentHTML('beforeend', rowHTML);
    flatpickr(`#start_date_${rangesCount}`, { dateFormat: "Y-m-d", onChange: calculateTotalAdjustment });
}

function calculateTotalAdjustment() {
    if (!selectedVehicle) return;
    let grandTotal = 0;
    for (let i = 1; i <= rangesCount; i++) {
        const dVal = document.getElementById(`start_date_${i}`)?.value;
        const lVal = parseFloat(document.getElementById(`liters_${i}`)?.value) || 0;
        const subEl = document.getElementById(`subtotal_${i}`);
        if (dVal && lVal > 0) {
            const selectedDate = new Date(dVal).getTime();
            // තෝරාගත් දිනට අදාළ නිවැරදිම මිල සෙවීම
            const priceEntry = livePrices.find(p => p.rawDate.getTime() <= selectedDate) || livePrices[livePrices.length - 1];
            const sub = (priceEntry.price - selectedVehicle.fixedPrice) * lVal;
            subEl.innerText = sub.toFixed(2);
            grandTotal += sub;
        }
    }
    document.getElementById('totalAdjustmentValue').innerText = grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2});
}

function clearAllRanges() { document.getElementById('dateRangesContainer').innerHTML = ''; rangesCount = 0; document.getElementById('totalAdjustmentValue').innerText = '0.00'; }

window.onload = () => {
    fetchLiveFuelData();
    loadVehicles();
    document.getElementById('addRangeBtn').addEventListener('click', addDateRangeRow);
    document.getElementById('clearAllRangesBtn').addEventListener('click', clearAllRanges);
    document.getElementById('refreshPricesBtn').addEventListener('click', fetchLiveFuelData);
};
