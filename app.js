// Google Sheet එකෙන් කෙලින්ම CSV එක ගන්න ලින්ක් එක
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRFBYTixlf9JHq7oc523FFnWAB4NnGWkAu5Sy6ZNmdr_rHJHPZz7_mJf-XGgW8aT_yIj3Xv4wCnSTsQ/pub?output=csv';

// Database setup
const db = new Dexie('FuelSystemDB');
db.version(1).stores({ vehicles: '++id, plateNo, fixedPrice' });

let allFuelHistory = [];
let selectedFuelType = 'lp92';

async function fetchLiveFuelData() {
    try {
        // Cache ප්‍රශ්න නැති වෙන්න timestamp එකක් එකතු කරනවා
        const response = await fetch(`${CSV_URL}&t=${new Date().getTime()}`);
        const data = await response.text();
        
        // CSV එක පේළි වලට කඩනවා
        const rows = data.split('\n').map(row => row.split(','));
        
        // Header එක අයින් කරලා ඩේටා ටික ගන්නවා
        const cleanRows = rows.filter(r => r.length > 1 && r[0].toLowerCase() !== 'date');
        
        if (cleanRows.length > 0) {
            // අලුත්ම ඩේටා පේළිය (යටම තියෙන එක)
            const latest = cleanRows[cleanRows.length - 1];
            
            // UI එකේ මිල ගණන් අප්ඩේට් කිරීම
            const updatePrice = (id, val) => {
                const el = document.getElementById(id);
                if(el) el.innerText = val.trim();
            };
            
            updatePrice('price_lp92', latest[1]);
            updatePrice('price_lp95', latest[2]);
            updatePrice('price_lad', latest[3]);
            updatePrice('price_lsd', latest[4]);

            // History එක සඳහා
            allFuelHistory = cleanRows.map(r => ({
                date: r[0].trim(),
                lp92: parseFloat(r[1]) || 0,
                lp95: parseFloat(r[2]) || 0,
                lad: parseFloat(r[3]) || 0,
                lsd: parseFloat(r[4]) || 0
            })).reverse();

            updateLivePricesUI();
            if(document.getElementById('systemStatus')) {
                document.getElementById('systemStatus').innerHTML = '<span class="text-green-500">● LIVE SYNC</span>';
            }
        }
    } catch (error) {
        console.error("Data Fetching Failed:", error);
    }
}

function updateLivePricesUI() {
    const list = document.getElementById('priceHistoryList');
    if (!list) return;

    const titles = { 'lp92': '92 Octane', 'lp95': '95 Octane', 'lad': 'Auto Diesel', 'lsd': 'Super Diesel' };
    
    // Tab buttons
    let html = `<div class="flex justify-center gap-2 mb-4">` + 
        ['lp92','lp95','lad','lsd'].map(k => `
            <button onclick="setFuelTab('${k}')" class="px-3 py-1.5 rounded-xl text-[10px] font-black border transition-all 
            ${selectedFuelType === k ? 'bg-slate-800 text-white' : 'bg-white text-slate-400'}">
                ${k.toUpperCase()}
            </button>`).join('') + `</div>`;
    
    // List history
    html += allFuelHistory.slice(0, 6).map(e => `
        <div class="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-2xl mb-2 shadow-sm">
            <div class="flex flex-col">
                <span class="text-[8px] font-black text-slate-400">${e.date}</span>
                <span class="text-[11px] font-extrabold text-slate-700">${titles[selectedFuelType]}</span>
            </div>
            <div class="bg-slate-50 px-3 py-1 rounded-lg">
                <span class="text-sm font-black text-slate-800">Rs. ${e[selectedFuelType]}</span>
            </div>
        </div>`).join('');
    
    list.innerHTML = html;
}

window.setFuelTab = function(type) {
    selectedFuelType = type;
    updateLivePricesUI();
};

// Start the app
window.onload = () => {
    fetchLiveFuelData();
};
