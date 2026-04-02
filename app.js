/**
 * Fuel Price Adjustment System - Final Stable Version
 * For: Gayan Chinthaka (NWSDB)
 */

// 1. Database Setup using Dexie
const db = new Dexie('FuelSystemDB');
db.version(1).stores({
    vehicles: '++id, plateNo, fixedPrice',
    calculations: '++id, vehicleId, adjustment, createdAt'
});

// Global Variables
let livePrices = []; 
let currentPricesObj = { lp92: 0, lp95: 0, lad: 0, lsd: 0 };
let selectedVehicle = null;
let rangesCount = 0;

// 2. Fetch Live Data from GitHub Source
async function fetchLiveFuelData() {
    console.log("Fetching data...");
    const statusEl = document.getElementById('systemStatus');
    const lockScreen = document.getElementById('offlineLock');
    
    try {
        const baseUrl = 'https://raw.githubusercontent.com/xzunk/fuelpricelk/main/data';
        
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

        // Map and Sort History
        livePrices = data92.history.map(h => ({
            date: h.date,
            price: parseFloat(h.price),
            rawDate: new Date(h.date)
        })).sort((a, b) => b.rawDate - a.rawDate);

        // Helper to get latest price
        const getLatest = (historyArr) => {
            let sorted = historyArr.sort((a, b) => new Date(b.date) - new Date(a.date));
            return parseFloat(sorted[0].price);
        };

        currentPricesObj = {
            lp92: getLatest(data92.history),
            lp95: getLatest(data95.history),
            lad: getLatest(dataLAD.history),
            lsd: getLatest(dataLSD.history)
        };

        // Update UI
        updateTopWidgets();
        updateLivePricesUI();
        
        if (statusEl) {
            statusEl.innerHTML = '<i class="fa-solid fa-check-circle"></i><span>Online & Verified</span>';
            statusEl.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-50 text-brand-600 text-xs font-semibold border border-brand-200 transition-colors duration-300 shadow-sm shadow-brand-500/10';
        }

        if (lockScreen) {
            lockScreen.classList.add('opacity-0');
            setTimeout(() => lockScreen.classList.add('hidden'), 500);
        }

    } catch (e) {
        console.error("Data Fetch Error:", e);
        if (statusEl) statusEl.innerHTML = '<span>Connection Failed</span>';
    }
}

// 3. UI Update Helpers
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
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">${entry.date}</span>
                    <span class="text-sm font-semibold text-slate-700 mt-0.5">Lanka Petrol 92 Octane</span>
                </div>
                <div class="text-right">
                    <span class="text-xl font-black text-brand-600">${entry.price.toFixed(2)}</span>
                </div>
            </div>`;
    });
}

// 4. Vehicle Management Functions
async function loadVehicles() {
    const vehicles = await db.vehicles.toArray();
    const list = document.getElementById('vehicleList');
    if (!list) return;
    list.innerHTML = vehicles.length ? '' : '<div class="text-sm text-slate-500 text-center py-6">No vehicles added yet.</div>';
    
    vehicles.forEach(v => {
        const activeCls = (selectedVehicle && selectedVehicle.id === v.id) ? 'border-brand-500 bg-brand-50 shadow-md ring-1 ring-brand-500' : 'border-slate-200 bg-white hover:border-blue-300';
        list.innerHTML += `
            <div onclick="selectVehicle(${v.id})" class="p-3 rounded-xl border cursor-pointer transition-all duration-200 group mb-2 ${activeCls}">
                <div class="flex justify-between items-center">
                    <div>
                        <span class="block text-sm font-bold text-slate-800 uppercase tracking-widest">${v.plateNo}</span>
                        <span class="block text-xs text-slate-500 font-medium mt-0.5">Fixed: Rs. ${v.fixedPrice.toFixed(2)} /L</span>
                    </div>
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
    
    loadVehicles();
    clearAllRanges();
    addDateRangeRow();
}

// Modal Control Functions (HTML onclick calls these)
window.openVehicleModal = function() {
    const modal = document.getElementById('vehicleModal');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        document.getElementById('vehicleModalContent').classList.remove('scale-95');
    }, 10);
};

window.closeVehicleModal = function() {
    const modal = document.getElementById('vehicleModal');
    modal.classList.add('opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 300);
};

window.saveVehicle = async function() {
    const plate = document.getElementById('vehPlateInput').value.trim();
    const price = parseFloat(document.getElementById('vehFixedPriceInput').value);
    
    if (plate && !isNaN(price)) {
        await db.vehicles.add({ plateNo: plate.toUpperCase(), fixedPrice: price });
        window.closeVehicleModal();
        loadVehicles();
        document.getElementById('vehPlateInput').value = '';
        document.getElementById('vehFixedPriceInput').value = '';
    } else {
        alert("Enter valid plate and price.");
    }
};

// 5. Calculator Logic
function addDateRangeRow() {
    rangesCount++;
    const container = document.getElementById('dateRangesContainer');
    const rowId = `range_row_${rangesCount}`;
    
    const rowHTML = `
        <div id="${rowId}" class="flex flex-col md:flex-row gap-4 items-end bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative group">
            <div class="flex-1 w-full relative">
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Start Date</label>
                <input type="text" id="start_date_${rangesCount}" class="date-picker w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500 bg-white" placeholder="Select Date">
            </div>
            <div class="w-full md:w-32">
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Liters</label>
                <input type="number" id="liters_${rangesCount}" step="0.01" value="0.00" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500 text-right" oninput="calculateTotalAdjustment()">
            </div>
            <div class="w-full md:w-32 bg-slate-50 border border-slate-200 rounded-lg p-2 text-right">
                <span class="text-[10px] font-bold text-slate-400 uppercase block leading-none mb-1">Subtotal (Rs)</span>
                <span id="subtotal_${rangesCount}" class="text-sm font-bold text-slate-800">0.00</span>
            </div>
        </div>`;
    
    container.insertAdjacentHTML('beforeend', rowHTML);

    // Initialize Flatpickr for the new row
    flatpickr(`#start_date_${rangesCount}`, {
        dateFormat: "Y-m-d",
        onChange: () => calculateTotalAdjustment()
    });
}

function calculateTotalAdjustment() {
    if (!selectedVehicle) return;
    let grandTotal = 0;
    
    for (let i = 1; i <= rangesCount; i++) {
        const dInput = document.getElementById(`start_date_${i}`);
        const lInput = document.getElementById(`liters_${i}`);
        const subEl = document.getElementById(`subtotal_${i}`);
        
        if (dInput && lInput) {
            const dateVal = dInput.value;
            const liters = parseFloat(lInput.value) || 0;
            
            if (dateVal && liters > 0) {
                // Find nearest price on or before the selected date
                const priceEntry = livePrices.find(p => p.date <= dateVal) || livePrices[livePrices.length - 1];
                const subtotal = (priceEntry.price - selectedVehicle.fixedPrice) * liters;
                subEl.innerText = subtotal.toFixed(2);
                grandTotal += subtotal;
            } else {
                subEl.innerText = "0.00";
            }
        }
    }
    document.getElementById('totalAdjustmentValue').innerText = grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2});
}

function clearAllRanges() {
    document.getElementById('dateRangesContainer').innerHTML = '';
    rangesCount = 0;
    document.getElementById('totalAdjustmentValue').innerText = '0.00';
}

// 6. Global Event Listeners & Initialization
window.onload = async () => {
    fetchLiveFuelData();
    loadVehicles();
    
    // Bind Buttons to Functions
    document.getElementById('addRangeBtn').addEventListener('click', addDateRangeRow);
    document.getElementById('clearAllRangesBtn').addEventListener('click', clearAllRanges);
    document.getElementById('refreshPricesBtn').addEventListener('click', fetchLiveFuelData);
    
    document.getElementById('saveCalculationBtn').addEventListener('click', async () => {
        const total = document.getElementById('totalAdjustmentValue').innerText;
        if (total !== "0.00" && selectedVehicle) {
            await db.calculations.add({
                vehicleId: selectedVehicle.id,
                adjustment: parseFloat(total.replace(/,/g, '')),
                createdAt: new Date()
            });
            alert("Calculation Saved Successfully!");
            clearAllRanges();
            addDateRangeRow();
        } else {
            alert("Nothing to save.");
        }
    });
};
