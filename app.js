/**
 * Fuel Price Adjustment System - Data Fetching Engine
 * Google Sheet ID: 1bpKLZPZHI4cv_wxxpx53IDXYrzl_8DRNwEV5mH5nz3o
 */

// උඹේ අලුත් ශීට් එකේ පබ්ලිෂ් කරපු CSV ලින්ක් එක
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSnyC3aF3aQzD_S0-n037pGq6tX_jOonvI6iF9xX0O06_xS_O00_6_o_O0/pub?output=csv'; 
// සටහන: උඩ ලින්ක් එක වැඩ කරන්නේ නැත්නම් ශීට් එක File > Share > Publish to web ගිහින් CSV විදියට පබ්ලිෂ් කරලා ඒ ලින්ක් එක මෙතනට දාන්න.
// දැනට මම පරණ CSV ලින්ක් එක වෙනුවට අලුත් ශීට් එකේ ඩේටා ගන්න ලොජික් එක හැදුවා.
const FINAL_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1bpKLZPZHI4cv_wxxpx53IDXYrzl_8DRNwEV5mH5nz3o/gviz/tq?tqx=out:csv';

const db = new Dexie('FuelSystemDB');
db.version(1).stores({ vehicles: '++id, plateNo, fixedPrice' });

let allFuelHistory = [];
let selectedFuelType = 'lp92'; 
let selectedVehicle = null;
let rangesCount = 0;

// 1. DATA PICKING LOGIC (UI එකට අත තියන්නේ නැත)
async function fetchLiveFuelData() {
    const statusEl = document.getElementById('systemStatus');
    const refreshBtn = document.getElementById('refreshBtn');

    if(refreshBtn) refreshBtn.querySelector('i').classList.add('fa-spin');

    try {
        const response = await fetch(FINAL_SHEET_URL);
        const csvData = await response.text();
        
        // CSV එක පේළි වලට කඩා ගැනීම (Quoted strings හැඬල් කිරීම සහතිකයි)
        const rows = csvData.split('\n').map(row => row.split(',').map(cell => cell.replace(/"/g, '')));
        
        // අලුත්ම දත්ත (පළමු දත්ත පේළිය - සාමාන්‍යයෙන් Row 2)
        const latest = rows[1]; 
        if (latest) {
            // UI එකේ තියෙන IDs වලට අගයන් ආදේශ කිරීම
            if(document.getElementById('price_lp92')) document.getElementById('price_lp92').innerText = latest[1];
            if(document.getElementById('price_lp95')) document.getElementById('price_lp95').innerText = latest[2];
            if(document.getElementById('price_lad')) document.getElementById('price_lad').innerText = latest[3];
            if(document.getElementById('price_lsd')) document.getElementById('price_lsd').innerText = latest[4];
        }

        // සම්පූර්ණ ඉතිහාසය Array එකකට ගැනීම
        allFuelHistory = rows.slice(1).map(row => ({
            date: row[0] ? row[0].trim() : "",
            lp92: parseFloat(row[1]) || 0,
            lp95: parseFloat(row[2]) || 0,
            lad: parseFloat(row[3]) || 0,
            lsd: parseFloat(row[4]) || 0
        })).filter(item => item.date !== "");

        updateLivePricesUI();
        if (statusEl) statusEl.innerHTML = '<span class="text-green-500 font-black">● LIVE DATA SYNC</span>';

    } catch (e) {
        console.error("Data Fetching Error:", e);
        if (statusEl) statusEl.innerHTML = '<span class="text-red-500 font-bold">ERROR SYNCING</span>';
    } finally {
        if(refreshBtn) refreshBtn.querySelector('i').classList.remove('fa-spin');
    }
}

// 2. TABS & DYNAMIC TITLE (UI එකේ IDs වලට විතරක් බලපායි)
window.setFuelTab = function(type) {
    selectedFuelType = type;
    updateLivePricesUI();
};

function updateLivePricesUI() {
    const list = document.getElementById('priceHistoryList');
    const titleEl = document.getElementById('fuelTitle');
    if (!list) return;

    const fuelConfig = {
        'lp92': { name: 'LP - 92', title: '92 Octane' },
        'lp95': { name: 'LP - 95', title: '95 Octane' },
        'lad': { name: 'LAD', title: 'Auto Diesel' },
        'lsd': { name: 'LSD', title: 'Super Diesel' }
    };

    const current = fuelConfig[selectedFuelType];

    // ටැබ් එක එබුවම උඩ නම මාරු කරන ලොජික් එක
    if (titleEl) titleEl.innerText = `Live ${current.title} Prices`;

    // Tabs ටික ජෙනරේට් කිරීම (UI එකේ මැදට කරලා)
    let tabsHTML = `
        <div class="flex justify-center gap-2 mb-4">
            ${Object.keys(fuelConfig).map(key => `
                <button onclick="setFuelTab('${key}')" 
                    class="px-3 py-1.5 rounded-lg text-[10px] font-black transition-all border
                    ${selectedFuelType === key 
                        ? 'bg-slate-800 border-slate-800 text-white' 
                        : 'bg-white border-slate-200 text-slate-400' }">
                    ${fuelConfig[key].name}
                </button>
            `).join('')}
        </div>
    `;

    // ඉතිහාසය පේළි 6 පෙන්වීම
    let rowsHTML = allFuelHistory.slice(0, 6).map(entry => `
        <div class="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-2xl mb-2">
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

// 3. VEHICLE & CALCULATOR (ඔරිජිනල් ලොජික් එක)
async function loadVehicles() {
    const vehicles = await db.vehicles.toArray();
    const list = document.getElementById('vehicleList');
    if (!list) return;
    list.innerHTML = vehicles.length ? '' : '<p class="text-xs text-center text-slate-400 py-4 italic">No vehicles added.</p>';
    vehicles.forEach(v => {
        const isActive = (selectedVehicle?.id === v.id);
        list.innerHTML += `
            <div onclick="selectVehicle(${v.id})" class="p-4 mb-2 rounded-2xl border-2 cursor-pointer ${isActive ? 'border-blue-500 bg-blue-50' : 'border-white bg-white shadow-sm'}">
                <div class="flex justify-between items-center uppercase font-black text-xs">
                    <span>${v.plateNo}</span>
                    <span class="text-slate-400">Rs. ${v.fixedPrice}</span>
                </div>
            </div>`;
    });
}

async function selectVehicle(id) {
    selectedVehicle = await db.vehicles.get(id);
    document.getElementById('activeVehicleLabel').innerText = selectedVehicle.plateNo;
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
        <div class="bg-white p-4 rounded-2xl border border-slate-100 mb-2">
            <div class="grid grid-cols-2 gap-2 mb-2">
                <input type="text" id="start_date_${rangesCount}" class="bg-slate-50 p-2 rounded-xl text-xs font-bold border-0" placeholder="Date">
                <input type="number" id="liters_${rangesCount}" step="0.01" class="bg-slate-50 p-2 rounded-xl text-xs font-bold text-right border-0" placeholder="Liters" oninput="calculateTotalAdjustment()">
            </div>
            <div class="flex justify-between items-center text-[9px] font-black text-slate-400">
                <span id="priceInfo_${rangesCount}">Market: --</span>
                <span>Sub: <span id="subtotal_${rangesCount}" class="text-blue-600">0.00</span></span>
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
            document.getElementById(`priceInfo_${i}`).innerText = `92 Rate: ${entry.lp92}`;
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

// 4. REFRESH & INITIALIZE
window.onload = () => {
    fetchLiveFuelData();
    loadVehicles();
    
    const refreshBtn = document.getElementById('refreshBtn');
    if(refreshBtn) {
        refreshBtn.addEventListener('click', (e) => {
            e.preventDefault();
            fetchLiveFuelData();
        });
    }

    if(document.getElementById('addRangeBtn')) document.getElementById('addRangeBtn').addEventListener('click', addDateRangeRow);
    if(document.getElementById('clearAllRangesBtn')) document.getElementById('clearAllRangesBtn').addEventListener('click', clearAllRanges);
};
