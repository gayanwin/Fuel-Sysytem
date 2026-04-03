const db = new Dexie('FuelSystemDB');
db.version(1).stores({
    vehicles: '++id, plateNo, fixedPrice',
    calculations: '++id, vehicleId, adjustment, createdAt'
});

let livePrices = []; 
let currentPricesObj = { lp92: 0, lp95: 0, lad: 0, lsd: 0 };

async function fetchLiveFuelData() {
    const statusEl = document.getElementById('systemStatus');
    showLockScreen("Fetching Data", "Connecting...", true);
    
    // මේ ලින්ක් එකයි හරිම ක්‍රමයයි. මේකෙන් Cache වෙන්නෙත් නෑ, Proxy ලෙඩ එන්නෙත් නෑ.
    const sheetUrl = `https://docs.google.com/spreadsheets/d/1jAn5mIjtawXGqfRxzISZjMkxLxgv3KlbtYS5JZuVDq0/export?format=csv&gid=0&t=${new Date().getTime()}`;
    
    try {
        // Proxy නැතුව කෙලින්ම Fetch කරනවා. Cors ප්‍රශ්නයක් ආවොත් විතරක් මේක වෙනස් කරමු.
        const response = await fetch(sheetUrl);
        if (!response.ok) throw new Error('Network response was not ok');
        
        const csvText = await response.text();
        const rows = csvText.split('\n').map(row => row.split(',').map(cell => cell.replace(/^"(.*)"$/, '$1').trim()));

        // දින වකවානුවක් තියෙන පේළි ටික ගන්නවා (2026.04.01 ඇතුළුව)
        let allData = rows.filter(r => r[0] && /\d/.test(r[0]) && r[0].includes('.')).map(r => ({
            date: r[0],
            p95: parseFloat(r[1]) || 0,
            p92: parseFloat(r[2]) || 0,
            pLAD: parseFloat(r[3]) || 0,
            pLSD: parseFloat(r[4]) || 0
        }));

        if (allData.length === 0) throw new Error("No data found");

        const latest = allData[0];
        currentPricesObj = { lp95: latest.p95, lp92: latest.p92, lad: latest.pLAD, lsd: latest.pLSD };
        livePrices = allData.slice(0, 5).map(item => ({ date: item.date, price: item.p92 }));

        updateTopWidgets();
        updateLivePricesUI();
        if(statusEl) statusEl.innerHTML = '<i class="fa-solid fa-check-circle"></i><span>Online</span>';
        hideLockScreen();
    } catch (e) {
        console.error("Fetch Error:", e);
        // මෙතනදි තමයි "Check Internet" කියන එක පෙන්නන්නේ. 
        // ඒක නිසා මම ආයෙත් පරණ stable proxy එකක් backend එකට දැම්මා backup එකක් විදිහට.
        try {
            const backupProxy = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(sheetUrl)}`;
            const res = await fetch(backupProxy);
            const text = await res.text();
            // ... (ඉතුරු ටික පරණ විදිහටම වැඩ කරයි)
            processData(text); 
        } catch(err) {
            showLockScreen("Offline", "Check Internet Connection", false);
        }
    }
}

// දත්ත Process කරන කොටස ලේසි වෙන්න වෙනම Function එකකට ගත්තා
function processData(csvText) {
    const rows = csvText.split('\n').map(row => row.split(',').map(cell => cell.replace(/^"(.*)"$/, '$1').trim()));
    let allData = rows.filter(r => r[0] && /\d/.test(r[0]) && r[0].includes('.')).map(r => ({
        date: r[0], p95: parseFloat(r[1]) || 0, p92: parseFloat(r[2]) || 0, pLAD: parseFloat(r[3]) || 0, pLSD: parseFloat(r[4]) || 0
    }));
    const latest = allData[0];
    currentPricesObj = { lp95: latest.p95, lp92: latest.p92, lad: latest.pLAD, lsd: latest.pLSD };
    livePrices = allData.slice(0, 5).map(item => ({ date: item.date, price: item.p92 }));
    updateTopWidgets();
    updateLivePricesUI();
    document.getElementById('systemStatus').innerHTML = '<i class="fa-solid fa-check-circle"></i><span>Online</span>';
    hideLockScreen();
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
    livePrices.forEach((entry, idx) => {
        let isLatest = idx === 0;
        let badge = isLatest ? `<span class="bg-brand-100 text-brand-700 text-[10px] font-bold px-2 py-0.5 rounded ml-2 uppercase">Current</span>` : '';
        let borderCls = isLatest ? 'border-brand-200 bg-white shadow-sm' : 'border-slate-100 bg-slate-50/50';
        list.innerHTML += `
            <div class="flex items-center justify-between p-3 rounded-xl border ${borderCls} mb-2">
                <div class="flex flex-col">
                    <span class="text-xs font-bold text-slate-500 uppercase flex items-center"><i class="fa-regular fa-calendar-days mr-1.5"></i> ${entry.date} ${badge}</span>
                    <span class="text-sm font-semibold text-slate-700 mt-0.5">Lanka Petrol 92 Octane</span>
                </div>
                <div class="text-right">
                    <span class="text-xs text-slate-400">Rs.</span>
                    <span class="text-xl font-black text-brand-600">${entry.price.toFixed(2)}</span>
                </div>
            </div>`;
    });
}

function showLockScreen(t, d, s) { 
    document.getElementById('offlineLock').classList.remove('hidden');
    document.getElementById('lockTitle').innerText = t;
    document.getElementById('lockDesc').innerText = d;
}
function hideLockScreen() { document.getElementById('offlineLock').classList.add('hidden'); }

async function loadVehicles() {
    const vehicles = await db.vehicles.toArray();
    const list = document.getElementById('vehicleList');
    list.innerHTML = vehicles.length ? '' : '<div class="text-[10px] font-bold text-slate-400 text-center py-4 uppercase tracking-wider">No Saved Vehicles</div>';
    vehicles.forEach(v => {
        list.innerHTML += `<div onclick="selectVehicle(${v.id})" class="p-3 rounded-xl border border-slate-200 mb-2 cursor-pointer uppercase font-black text-xs hover:border-brand-600 hover:bg-brand-50 transition-all text-slate-600">${v.plateNo}</div>`;
    });
}

async function selectVehicle(id) {
    const v = await db.vehicles.get(id);
    document.getElementById('activeVehicleLabel').innerText = v.plateNo;
    document.getElementById('calculatorPanel').classList.remove('hidden');
    document.getElementById('noVehicleWarning').classList.add('hidden');
}

window.onload = () => { fetchLiveFuelData(); loadVehicles(); };
document.getElementById('refreshPricesBtn').addEventListener('click', fetchLiveFuelData);
