const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRFBYTixlf9JHq7oc523FFnWAB4NnGWkAu5Sy6ZNmdr_rHJHPZz7_mJf-XGgW8aT_yIj3Xv4wCnSTsQ/pub?output=csv';

const db = new Dexie('FuelSystemDB');
db.version(1).stores({ vehicles: '++id, plateNo, fixedPrice' });

let allFuelHistory = [];
let selectedFuelType = 'lp92';

async function fetchLiveFuelData() {
    console.log("Starting data fetch...");
    try {
        const response = await fetch(`${CSV_URL}&cache=${new Date().getTime()}`);
        const text = await response.text();
        
        // CSV parsing logic
        const rows = text.split('\n')
            .map(row => row.split(',').map(c => c.replace(/"/g, '').trim()))
            .filter(r => r.length > 1 && r[0].toLowerCase() !== 'date');

        if (rows.length > 0) {
            const latest = rows[rows.length - 1];
            
            // UI elements update
            document.getElementById('price_lp92').innerText = latest[1];
            document.getElementById('price_lp95').innerText = latest[2];
            document.getElementById('price_lad').innerText = latest[3];
            document.getElementById('price_lsd').innerText = latest[4];

            allFuelHistory = rows.map(r => ({
                date: r[0],
                lp92: parseFloat(r[1]) || 0,
                lp95: parseFloat(r[2]) || 0,
                lad: parseFloat(r[3]) || 0,
                lsd: parseFloat(r[4]) || 0
            })).reverse();

            updateLivePricesUI();
            document.getElementById('systemStatus').innerHTML = '<span class="text-green-500 font-black">● LIVE SYNC</span>';
        }
    } catch (err) {
        console.error("Critical error:", err);
        document.getElementById('systemStatus').innerText = "CONNECTION ERROR";
    }
}

function updateLivePricesUI() {
    const list = document.getElementById('priceHistoryList');
    if (!list) return;
    const titles = { 'lp92': '92 Octane', 'lp95': '95 Octane', 'lad': 'Auto Diesel', 'lsd': 'Super Diesel' };
    
    let html = `<div class="flex justify-center gap-2 mb-4">` + 
        ['lp92','lp95','lad','lsd'].map(k => `<button onclick="setFuelTab('${k}')" class="px-3 py-1.5 rounded-xl text-[10px] font-black border ${selectedFuelType===k?'bg-slate-800 text-white':'bg-white text-slate-400'}">${k.toUpperCase()}</button>`).join('') + `</div>`;
    
    html += allFuelHistory.slice(0, 6).map(e => `
        <div class="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-2xl mb-2 shadow-sm">
            <div class="flex flex-col"><span class="text-[8px] font-black text-slate-400">${e.date}</span><span class="text-[11px] font-extrabold text-slate-700">${titles[selectedFuelType]}</span></div>
            <div class="bg-slate-50 px-3 py-1 rounded-lg"><span class="text-sm font-black text-slate-800">Rs. ${e[selectedFuelType]}</span></div>
        </div>`).join('');
    list.innerHTML = html;
}

window.setFuelTab = (t) => { selectedFuelType = t; updateLivePricesUI(); };

window.onload = () => { 
    fetchLiveFuelData(); 
    // loadVehicles function එක මෙතන තිබුණා නම් ඒකත් ලියන්න
};
