<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Fuel Price Adjustment System</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <script src="https://unpkg.com/dexie/dist/dexie.js"></script>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css">
    <script src="https://cdn.jsdelivr.net/npm/flatpickr"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
        body { font-family: 'Inter', sans-serif; }
    </style>
</head>
<body class="bg-gray-100 p-4">

    <!-- Header Section -->
    <div class="max-w-md mx-auto bg-white p-4 rounded-xl shadow-sm mb-4 flex justify-between items-center">
        <div>
            <h1 class="text-lg font-bold">FUEL SYSTEM</h1>
            <p id="systemStatus" class="text-[10px] text-gray-400 font-bold uppercase">Syncing...</p>
        </div>
        <button id="refreshBtn" class="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200">
            <i class="fa-solid fa-arrows-rotate text-gray-600"></i>
        </button>
    </div>

    <!-- Live Prices Boxes -->
    <div class="max-w-md mx-auto grid grid-cols-2 gap-2 mb-6">
        <div class="bg-white p-4 rounded-xl border border-gray-200">
            <p class="text-[10px] font-bold text-gray-400 uppercase">LP 92</p>
            <p class="text-xl font-black">Rs. <span id="price_lp92">000</span></p>
        </div>
        <div class="bg-white p-4 rounded-xl border border-gray-200">
            <p class="text-[10px] font-bold text-gray-400 uppercase">LP 95</p>
            <p class="text-xl font-black">Rs. <span id="price_lp95">000</span></p>
        </div>
        <div class="bg-white p-4 rounded-xl border border-gray-200">
            <p class="text-[10px] font-bold text-gray-400 uppercase">LAD</p>
            <p class="text-xl font-black">Rs. <span id="price_lad">000</span></p>
        </div>
        <div class="bg-white p-4 rounded-xl border border-gray-200">
            <p class="text-[10px] font-bold text-gray-400 uppercase">LSD</p>
            <p class="text-xl font-black">Rs. <span id="price_lsd">000</span></p>
        </div>
    </div>

    <!-- History Section with Tabs -->
    <div class="max-w-md mx-auto mb-6">
        <h3 id="fuelTitle" class="text-xs font-bold text-gray-500 uppercase mb-3 ml-1">Live 92 Octane Prices</h3>
        
        <!-- මෙතන තමයි Tabs (Buttons) ටික තියෙන්නේ -->
        <div id="fuelTabs" class="flex justify-center gap-2 mb-4">
            <!-- JS වලින් Tabs ටික මෙතනට වැටෙනවා -->
        </div>

        <div id="priceHistoryList" class="space-y-2">
            <!-- පේළි 6 මෙතනට වැටෙනවා -->
        </div>
    </div>

    <!-- Vehicle Section -->
    <div class="max-w-md mx-auto bg-white p-4 rounded-xl shadow-sm mb-4">
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-sm font-bold uppercase">My Vehicles</h3>
            <button onclick="document.getElementById('vehicleModal').classList.remove('hidden')" class="bg-blue-600 text-white text-[10px] px-3 py-1 rounded-md font-bold">ADD</button>
        </div>
        <div id="vehicleList"></div>
    </div>

    <!-- Calculator Section -->
    <div id="calculatorPanel" class="max-w-md mx-auto hidden">
        <div class="bg-blue-600 p-6 rounded-2xl text-white mb-4">
            <p class="text-[10px] font-bold opacity-70 uppercase">Total Adjustment</p>
            <p class="text-3xl font-black">Rs. <span id="totalAdjustmentValue">0.00</span></p>
            <p id="activeVehicleLabel" class="text-[10px] mt-2 font-bold bg-white/20 inline-block px-2 py-1 rounded text-white uppercase"></p>
        </div>
        <div id="dateRangesContainer"></div>
        <button id="addRangeBtn" class="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-400 text-xs font-bold uppercase mb-2">+ Add Fueling Date</button>
        <button id="clearAllRangesBtn" class="w-full text-gray-400 text-[10px] font-bold uppercase py-2">Clear All</button>
    </div>

    <!-- Modal -->
    <div id="vehicleModal" class="hidden fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div class="bg-white p-6 rounded-2xl w-full max-w-sm">
            <h4 class="font-bold mb-4">New Vehicle</h4>
            <input type="text" id="vehPlateInput" placeholder="Plate Number (e.g. CAD-5050)" class="w-full p-3 bg-gray-50 rounded-lg mb-3 text-sm">
            <input type="number" id="vehFixedPriceInput" placeholder="Fixed Price (Rs.)" class="w-full p-3 bg-gray-50 rounded-lg mb-4 text-sm">
            <div class="flex gap-2">
                <button onclick="document.getElementById('vehicleModal').classList.add('hidden')" class="flex-1 py-2 text-gray-500 font-bold">Cancel</button>
                <button onclick="saveVehicle()" class="flex-1 py-2 bg-blue-600 text-white rounded-lg font-bold">Save</button>
            </div>
        </div>
    </div>

    <script src="app.js"></script>
</body>
</html>
