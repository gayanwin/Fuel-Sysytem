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
        const cacheBuster = new Date().getTime();
        const response = await fetch(`${SHEET_CSV_URL}&t=${cacheBuster}`);
        const csvData = await response.text();
        
        // පේළි වලට කඩා හිස් පේළි ඉවත් කිරීම
        const rows = csvData.split('\n')
            .map(row => row.split(','))
            .filter(row => row[0] && row[0].trim() !== "" && row[0] !== "Date");
        
        // ශීට් එකේ යටම තියෙන (අලුත්ම) පේළිය තෝරා ගැනීම
        const latest = rows[rows.length - 1]; 
        
        if (latest) {
            const mapPrice = (id, val) => {
                const el = document.getElementById(id);
                if(el) el.innerText = val.replace(/"/g, '').trim();
            };
            mapPrice('price_lp92', latest[1]);
            mapPrice('price_lp95', latest[2]);
            mapPrice('price_lad', latest[3]);
            mapPrice('price_lsd', latest[4]);
        }

        // හිස්ටරි එක සඳහා සියලුම ඩේටා ගැනීම
        allFuelHistory = rows.map(row => ({
            date: row[0].replace(/"/g, '').trim(),
            lp92: parseFloat(row[1]) || 0,
            lp95: parseFloat(row[2]) || 0,
            lad: parseFloat(row[3]) || 0,
            lsd: parseFloat(row[4]) || 0
        }));

        // අලුත්ම එක උඩට එන විදිහට ලිස්ට් එක reverse කිරීම
        allFuelHistory.reverse();

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

    let tabsHTML = `
        <div class="flex justify-center gap-2 mb-4">
            ${Object.keys(fuelConfig).map(key => `
                <button onclick="setFuelTab('${key}')" 
                    class="px-3 py-1.5 rounded-xl text-[10px] font-black transition-all border
                    ${selectedFuelType === key 
                        ? 'bg-slate-800 border-slate-800 text-white' 
                        : 'bg-white border-slate-100 text-slate-400' }">
                    ${fuelConfig[key].name}
                </button>
            `).join('')}
        </div>
    `;

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

// වාහන සහ Calculator ලොජික් (පෙනුම වෙනස් නොකරයි)
async function loadVehicles() {
    const vehicles = await db.vehicles.toArray();
    const list = document.getElementById('vehicleList');
    if (!list) return;
    list.innerHTML = vehicles.length ? '' : '<p class="text-xs text-center text-slate-400 py-4 italic">No vehicles added.</p>';
    vehicles.forEach(v => {
        const isActive = (selectedVehicle?.id === v.id);
        list.innerHTML += `
            <div onclick="selectVehicle(${v.id})" class="p-4 mb-2 rounded-2xl border-2 transition-all cursor-pointer ${isActive ? 'border-blue-500 bg-blue-50' : 'border-white bg-white shadow-sm'}">
                <div class="flex justify-between items-center uppercase font-black text-[10px]">
                    <span>${v.plateNo}</span>
                    <span class="text-slate-400 font-mono">Rs. ${v.fixedPrice}</span>
                </div>
            </div>`;
    });
}

async function selectVehicle(id) {
    selectedVehicle = await db.vehicles.get(id);
    const label = document.getElementById('activeVehicleLabel');
    if(label) label.innerText = selectedVehicle.plateNo;
    const calc = document.getElementById('calculatorPanel');
    if(calc) calc.classList.remove('hidden');
    loadVehicles(); clearAllRanges(); addDateRangeRow();
}

window.saveVehicle = async function() {
    const plate = document.getElementById('vehPlateInput')?.value.trim();
    const price = parseFloat(document.getElementById('vehFixedPriceInput')?.value);
    if (plate && !isNaN(price)) {
        await db.vehicles.add({ plateNo: plate.toUpperCase(), fixedPrice: price });
        const modal = document.getElementById('vehicleModal');
        if(modal) modal.classList.add('hidden');
        loadVehicles();
        document.getElementById('vehPlateInput').value = '';
        document.getElementById('vehFixedPriceInput').value = '';
    }
};

function addDateRangeRow() {
    rangesCount++;
    const container = document.getElementById('dateRangesContainer');
    if(!container) return;
    const rowHTML = `
        <div class="bg-white p-4 rounded-2xl border border-slate-100 mb-2">
            <div class="grid grid-cols-2 gap-2 mb-2">
                <input type="text" id="start_date_${rangesCount}" class="bg-slate-50 p-2 rounded-xl text-xs font-bold border-0" placeholder="Date">
                <input type="number" id="liters_${rangesCount}" step="0.01" class="bg-slate-50 p-2 rounded-xl text-xs font-bold text-right border-0" placeholder="Liters" oninput="calculateTotalAdjustment()">
            </div>
            <div class="flex justify-between items-center text-[9px] font-black text-slate-400">
                <span id="priceInfo_${rangesCount}">Market: --</span>
                <span>Sub: Rs. <span id="subtotal_${rangesCount}" class="text-blue-600 font-mono">0.00</span></span>
            </div>
        </div>`;
    container.insertAdjacentHTML('beforeend', rowHTML);
    flatpickr(`#start_date_${rangesCount}`, { dateFormat: "Y-m-d", maxDate: "today", onChange: calculateTotalAdjustment });
}

function calculateTotalAdjustment() {
    if (!selectedVehicle) return;
    let grandTotal = 0;
    // History එකේ මුල් පිළිවෙළටම (ascending) අවශ්‍යයි Calculate කරන්න
    const chronologicalHistory = [...allFuelHistory].reverse();
    
    for (let i = 1; i <= rangesCount; i++) {
        const dVal = document.getElementById(`start_date_${i}`)?.value;
        const lVal = parseFloat(document.getElementById(`liters_${i}`)?.value) || 0;
        if (dVal && lVal > 0) {
            // තෝරාගත් දිනට ගැලපෙන මිල සෙවීම
            const entry = chronologicalHistory.find(p => p.date <= dVal) || chronologicalHistory[chronologicalHistory.length - 1];
            const diff = entry.lp92 - selectedVehicle.fixedPrice;
            const sub = diff * lVal;
            
            const info = document.getElementById(`priceInfo_${i}`);
            if(info) info.innerText = `Rate: Rs. ${entry.lp92}`;
            const subEl = document.getElementById(`subtotal_${i}`);
            if(subEl) subEl.innerText = sub.toFixed(2);
            grandTotal += sub;
        }
    }
    const totalEl = document.getElementById('totalAdjustmentValue');
    if(totalEl) totalEl.innerText = grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2});
}

function clearAllRanges() { 
    const container = document.getElementById('dateRangesContainer');
    if(container) container.innerHTML = ''; 
    rangesCount = 0; 
    const totalEl = document.getElementById('totalAdjustmentValue');
    if(totalEl) totalEl.innerText = '0.00'; 
}

window.onload = () => {
    fetchLiveFuelData();
    loadVehicles();
    const refreshBtn = document.getElementById('refreshBtn');
    if(refreshBtn) refreshBtn.onclick = (e) => { e.preventDefault(); fetchLiveFuelData(); };
    const addBtn = document.getElementById('addRangeBtn');
    if(addBtn) addBtn.onclick = addDateRangeRow;
    const clearBtn = document.getElementById('clearAllRangesBtn');
    if(clearBtn) clearBtn.onclick = clearAllRanges;
};
