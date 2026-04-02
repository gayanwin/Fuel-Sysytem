/**
 * Fuel Price Adjustment System
 * Uses Dexie.js for local storage and fetches live CEYPETCO data.
 */

// --- 1. Database Setup ---
const db = new Dexie('FuelSystemDB');
db.version(1).stores({
    vehicles: '++id, plateNo, fixedPrice',
    calculations: '++id, vehicleId, dateRangeStart, dateRangeEnd, liters, adjustment, createdAt'
});

// --- 2. State & Variables ---
let livePrices = []; 
const MOCK_FALLBACK_PRICES = []; // Removed completely as requested

// Current latest prices for top widget
let currentPricesObj = { lp92: 0, lp95: 0, lad: 0, lsd: 0 };
let isSystemLocked = true;

// --- 3. Live Data Fetching ---
async function fetchLiveFuelData() {
    isSystemLocked = true;
    showLockScreen("Fetching Live Data...", "System is strictly locked until real-time fuel prices are fetched. No offline or fallback data allowed.", true);
    document.getElementById('lockRetryBtn').classList.add('hidden');

    const statusEl = document.getElementById('systemStatus');
    statusEl.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i><span>Updating Data Source...</span>';
    
    // Accurate Data Source: Open-source fuelpricelk JSON data tracks CBSL/Ceypetco precisely.
    const baseUrl = 'https://raw.githubusercontent.com/xzunk/fuelpricelk/main/data';
    
    // Add Timeout Controller so it doesn't hang forever on slow networks
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    try {
        const [res92, res95, resLAD, resLSD] = await Promise.all([
            fetch(`${baseUrl}/petrol92.json`, { signal: controller.signal }),
            fetch(`${baseUrl}/petrol95.json`, { signal: controller.signal }),
            fetch(`${baseUrl}/autodiesel.json`, { signal: controller.signal }),
            fetch(`${baseUrl}/superdiesel.json`, { signal: controller.signal })
        ]);
        
        clearTimeout(timeoutId);

        if (!res92.ok || !res95.ok || !resLAD.ok || !resLSD.ok) {
            throw new Error("Failed to fetch accurate data from data source.");
        }

        const data92 = await res92.json();
        const data95 = await res95.json();
        const dataLAD = await resLAD.json();
        const dataLSD = await resLSD.json();

        // The exact prices history for LP92 (Usually used as base, or just display its history)
        // Ensure data is sorted newest-first for the history list.
        const sorted92 = data92.history.sort((a,b) => new Date(b.date) - new Date(a.date));
        
        livePrices = sorted92.map(h => ({
            date: h.date, // format YYYY-MM-DD
            price: h.price,
            rawDate: new Date(h.date)
        }));

        // Extract latest current prices directly from the history arrays
        // Getting latest available by looking at the last item (if sorted oldest-first in the json)
        // or just the sorted highest date.
        
        function getLatest(jsonHistory) {
            let sorted = jsonHistory.sort((a,b) => new Date(b.date) - new Date(a.date));
            return sorted[0].price;
        }

        currentPricesObj = {
            lp92: getLatest(data92.history),
            lp95: getLatest(data95.history),
            lad: getLatest(dataLAD.history),
            lsd: getLatest(dataLSD.history)
        };

        updateLivePricesUI();
        updateTopWidgets();
        
        statusEl.innerHTML = '<i class="fa-solid fa-check-circle"></i><span>Online & Verified</span>';
        statusEl.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-50 text-brand-600 text-xs font-semibold border border-brand-200 transition-colors duration-300 shadow-sm shadow-brand-500/10';

        isSystemLocked = false;
        hideLockScreen();

        if (selectedVehicle) calculateTotalAdjustment();

    } catch (e) {
        console.error("Critical Fetch Error:", e);
        
        statusEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i><span>Connection Failed</span>';
        statusEl.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 text-red-600 text-xs font-semibold border border-red-200 transition-colors duration-300';
        
        showLockScreen("Connection Failed", "Unable to establish a link to the real-time data source. The system will remain locked.", false);
        document.getElementById('lockRetryBtn').classList.remove('hidden');
    }
}

function showLockScreen(title, desc, isSpinning) {
    const lock = document.getElementById('offlineLock');
    if(lock) {
        lock.classList.remove('hidden');
        setTimeout(() => lock.classList.remove('opacity-0'), 10);
        document.getElementById('lockTitle').innerText = title;
        document.getElementById('lockDesc').innerText = desc;
        const icon = document.getElementById('lockIcon');
        if(isSpinning) {
            icon.className = "fa-solid fa-satellite-dish text-6xl mb-4 text-brand-500 animate-pulse";
        } else {
            icon.className = "fa-solid fa-circle-exclamation text-6xl mb-4 text-red-500";
        }
    }
}

function hideLockScreen() {
    const lock = document.getElementById('offlineLock');
    if(lock) {
        lock.classList.add('opacity-0');
        setTimeout(() => lock.classList.add('hidden'), 300);
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
    list.innerHTML = '';
    
    // Show top 6
    const displayPrices = livePrices.slice(0, 6);
    
    displayPrices.forEach((entry, idx) => {
        let isLatest = idx === 0;
        let badge = isLatest ? `<span class="bg-brand-100 text-brand-700 text-[10px] font-bold px-2 py-0.5 rounded ml-2 uppercase tracking-wide">Current</span>` : '';
        let borderCls = isLatest ? 'border-brand-200 shadow-sm shadow-brand-500/5 bg-white' : 'border-slate-100 bg-slate-50/50';
        
        list.innerHTML += `
            <div class="flex items-center justify-between p-3 rounded-xl border ${borderCls} transition-all hover:border-brand-300 hover:shadow-md">
                <div class="flex flex-col">
                    <span class="text-xs font-bold text-slate-500 uppercase flex items-center"><i class="fa-regular fa-calendar-days mr-1.5"></i> ${entry.date} ${badge}</span>
                    <span class="text-sm font-semibold text-slate-700 mt-0.5">Lanka Petrol 92 Octane</span>
                </div>
                <div class="text-right">
                    <span class="text-xs text-slate-400">Rs.</span>
                    <span class="text-xl font-black text-brand-600">${entry.price.toFixed(2)}</span>
                </div>
            </div>
        `;
    });
}


// --- 4. Vehicle Management ---
async function loadVehicles() {
    const vehicles = await db.vehicles.toArray();
    const list = document.getElementById('vehicleList');
    
    if (vehicles.length === 0) {
        list.innerHTML = '<div class="text-sm text-slate-500 text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200"><i class="fa-solid fa-car-side text-2xl mb-2 text-slate-300 block"></i>No vehicles added yet.</div>';
        return;
    }
    
    list.innerHTML = '';
    vehicles.forEach(v => {
        let activeCls = (selectedVehicle && selectedVehicle.id === v.id) ? 'border-brand-500 bg-brand-50 shadow-md ring-1 ring-brand-500' : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-md';
        
        list.innerHTML += `
            <div onclick="selectVehicle(${v.id})" class="p-3 rounded-xl border cursor-pointer transition-all duration-200 group ${activeCls}">
                <div class="flex justify-between items-center">
                    <div>
                        <span class="block text-sm font-bold text-slate-800 uppercase tracking-widest">${v.plateNo}</span>
                        <span class="block text-xs text-slate-500 font-medium mt-0.5">Fixed: Rs. ${v.fixedPrice.toFixed(2)} /L</span>
                    </div>
                    <div class="text-slate-300 group-hover:text-blue-500 transition-colors">
                        <i class="fa-solid fa-chevron-right text-sm"></i>
                    </div>
                </div>
            </div>
        `;
    });
}

function openVehicleModal() {
    const m = document.getElementById('vehicleModal');
    const mc = document.getElementById('vehicleModalContent');
    m.classList.remove('hidden');
    // slight delay for animation
    setTimeout(() => {
        m.classList.remove('opacity-0');
        mc.classList.remove('scale-95');
    }, 10);
}

function closeVehicleModal() {
    const m = document.getElementById('vehicleModal');
    const mc = document.getElementById('vehicleModalContent');
    m.classList.add('opacity-0');
    mc.classList.add('scale-95');
    setTimeout(() => {
        m.classList.add('hidden');
        document.getElementById('vehPlateInput').value = '';
        document.getElementById('vehFixedPriceInput').value = '';
    }, 300);
}

async function saveVehicle() {
    let plate = document.getElementById('vehPlateInput').value.trim().toUpperCase();
    let price = parseFloat(document.getElementById('vehFixedPriceInput').value);
    
    if (!plate || isNaN(price) || price <= 0) {
        alert("Please enter a valid License Plate and Fixed Price.");
        return;
    }
    
    await db.vehicles.add({
        plateNo: plate,
        fixedPrice: price
    });
    
    closeVehicleModal();
    loadVehicles();
}

async function selectVehicle(id) {
    selectedVehicle = await db.vehicles.get(id);
    loadVehicles(); // update active state on list
    
    // Show Calculator Panel
    document.getElementById('noVehicleWarning').classList.add('hidden');
    document.getElementById('calculatorPanel').classList.remove('hidden');
    
    document.getElementById('activeVehicleLabel').innerText = selectedVehicle.plateNo;
    document.getElementById('activeVehicleLabel').className = 'font-bold text-brand-600 bg-brand-50 px-2 py-1 rounded shadow-sm border border-brand-100 uppercase tracking-wide';
    
    document.getElementById('calcVehicleNo').innerText = selectedVehicle.plateNo;
    document.getElementById('calcFixedPrice').innerText = selectedVehicle.fixedPrice.toFixed(2);
    
    // Clear existing ranges to prevent mixing state
    clearAllRanges();
    addDateRangeRow(); // Add initial blank row
}

// --- 5. Date Ranges & Calculation ---
function clearAllRanges() {
    document.getElementById('dateRangesContainer').innerHTML = '';
    rangesCount = 0;
    document.getElementById('totalAdjustmentValue').innerText = '0.00';
}

function addDateRangeRow() {
    rangesCount++;
    const container = document.getElementById('dateRangesContainer');
    
    const rowId = \`range_row_\${rangesCount}\`;
    
    // Determine start date logic: if it's not the first row, lock to previous row's end date + 1
    let isLocked = false;
    let defaultStartDate = '';
    
    if (rangesCount > 1) {
        const prevRowEndId = \`end_date_\${rangesCount - 1}\`;
        const prevEndInput = document.getElementById(prevRowEndId);
        
        if (prevEndInput && prevEndInput.value) {
            let prevDate = new Date(prevEndInput.value);
            prevDate.setDate(prevDate.getDate() + 1);
            defaultStartDate = prevDate.toISOString().split('T')[0];
            isLocked = true;
        } else {
            alert("Please select the ending date for the previous range first.");
            rangesCount--;
            return;
        }
    }
    
    let lockIconHTML = isLocked ? \`<i class="fa-solid fa-lock text-slate-400 absolute right-3 top-3 text-xs" title="Locked to previous end date"></i>\` : '';
    
    const rowHTML = \`
        <div id="\${rowId}" class="flex flex-col md:flex-row gap-4 items-end bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative group">
            
            \${rangesCount > 1 ? \`<button onclick="removeRow('\${rowId}')" class="absolute -right-2 -top-2 bg-red-100 text-red-600 rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white"><i class="fa-solid fa-xmark"></i></button>\` : ''}
            
            <div class="flex-1 w-full relative">
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Start Date</label>
                <input type="text" id="start_date_\${rangesCount}" \${isLocked ? 'readonly' : ''} class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500 \${isLocked ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-white'}" placeholder="Select Date">
                \${lockIconHTML}
            </div>
            
            <div class="flex-1 w-full">
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">End Date</label>
                <input type="text" id="end_date_\${rangesCount}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500 bg-white" placeholder="Select Date" onchange="calculateTotalAdjustment()">
            </div>
            
            <div class="w-full md:w-32">
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Liters</label>
                <div class="relative">
                    <input type="number" id="liters_\${rangesCount}" step="0.01" min="0" value="0.00" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500 font-mono text-right pr-8" oninput="calculateTotalAdjustment()">
                    <span class="absolute right-3 top-2.5 text-xs font-bold text-slate-400">L</span>
                </div>
            </div>
            
            <div class="w-full md:w-32 bg-slate-50 border border-slate-200 rounded-lg p-2 text-right self-stretch flex flex-col justify-end">
                <span class="text-[10px] font-bold text-slate-400 uppercase leading-none mb-1 text-left block">Subtotal (Rs)</span>
                <span id="subtotal_\${rangesCount}" class="text-sm font-bold text-slate-800">0.00</span>
            </div>
        </div>
    \`;
    
    container.insertAdjacentHTML('beforeend', rowHTML);
    
    // Initialize datepickers
    const startInput = document.getElementById(\`start_date_\${rangesCount}\`);
    const endInput = document.getElementById(\`end_date_\${rangesCount}\`);
    
    flatpickr(startInput, {
        dateFormat: "Y-m-d",
        defaultDate: defaultStartDate || "today"
    });
    
    flatpickr(endInput, {
        dateFormat: "Y-m-d",
        onChange: function(selectedDates, dateStr, instance) {
            calculateTotalAdjustment();
        }
    });

    if (defaultStartDate) {
        startInput.value = defaultStartDate;
    }
}

function removeRow(rowId) {
    document.getElementById(rowId).remove();
    calculateTotalAdjustment();
    
    // We must ensure the sequence logic is preserved. 
    // In a full robust app, removing intermediate rows cascades updates.
    // For now, removing the last ones is generally straightforward.
}

function getLivePriceForDate(dateStr) {
    // Find the latest price that was active ON or BEFORE the given date.
    // livePrices should be sorted descending by date.
    const targetDate = new Date(dateStr);
    
    for (let i = 0; i < livePrices.length; i++) {
        const priceDate = livePrices[i].rawDate;
        if (priceDate <= targetDate) {
            return livePrices[i].price;
        }
    }
    // If date is too old, return the oldest known price
    return livePrices[livePrices.length - 1].price;
}

function calculateTotalAdjustment() {
    if (!selectedVehicle) return;
    
    let totalAdjustment = 0;
    
    for (let i = 1; i <= rangesCount; i++) {
        const startInput = document.getElementById(\`start_date_\${i}\`);
        const endInput = document.getElementById(\`end_date_\${i}\`);
        const litersInput = document.getElementById(\`liters_\${i}\`);
        const subtotalEl = document.getElementById(\`subtotal_\${i}\`);
        
        if (startInput && endInput && litersInput && subtotalEl) {
            let start = startInput.value;
            let end = endInput.value;
            let liters = parseFloat(litersInput.value) || 0;
            
            if (start && end && liters > 0) {
                // Determine active live price during this period.
                // Assuming "exact matching", we check the price active AT the start of the period.
                // More complex logic could split periods if prices change halfway.
                let activePrice = getLivePriceForDate(start);
                
                let diffPerLiter = activePrice - selectedVehicle.fixedPrice;
                let subtotal = diffPerLiter * liters;
                
                // Show subtotal for clarity
                subtotalEl.innerText = subtotal.toFixed(2);
                if(subtotal > 0) subtotalEl.classList.add('text-brand-600');
                else if(subtotal < 0) subtotalEl.classList.add('text-red-500');
                
                totalAdjustment += subtotal;
            } else {
                subtotalEl.innerText = "0.00";
                subtotalEl.classList.remove('text-brand-600', 'text-red-500');
            }
        }
    }
    
    // Update main total UI
    const totalEl = document.getElementById('totalAdjustmentValue');
    totalEl.innerText = totalAdjustment > 0 ? totalAdjustment.toFixed(2) : '0.00';
}


// --- 6. Event Listeners ---
document.getElementById('refreshPricesBtn').addEventListener('click', () => {
    fetchLiveFuelData();
});

document.getElementById('addRangeBtn').addEventListener('click', () => {
    addDateRangeRow();
});

document.getElementById('clearAllRangesBtn').addEventListener('click', () => {
    if(confirm("Are you sure you want to clear all ranges?")) {
        clearAllRanges();
    }
});

document.getElementById('saveCalculationBtn').addEventListener('click', async () => {
    if(!selectedVehicle) return;
    const totalVal = parseFloat(document.getElementById('totalAdjustmentValue').innerText);
    if(totalVal === 0) {
        alert("Total adjustment is 0. Nothing to save!");
        return;
    }
    
    // Save to DB
    await db.calculations.add({
        vehicleId: selectedVehicle.id,
        adjustment: totalVal,
        createdAt: new Date()
    });
    
    alert("Calculation saved successfully!");
    clearAllRanges();
    addDateRangeRow();
});


// --- Init App ---
window.onload = async () => {
    // 1) First ensure we attempt fetching live data regardless of local DB issues
    fetchLiveFuelData();
    
    // 2) Safely try loading vehicles (can fail if run via file:/// in strict browsers or private mode)
    try {
        await loadVehicles();
    } catch (e) {
        console.error("Local Database Error (IndexedDB might be blocked or strict file mode):", e);
        // We will just show an empty vehicle list naturally
        const list = document.getElementById('vehicleList');
        if(list) list.innerHTML = '<div class="text-sm text-red-500 text-center py-4 bg-red-50 rounded-xl border border-red-200">Local storage is blocked by your browser. Vehicle saving disabled.</div>';
    }
};
